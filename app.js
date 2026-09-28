const $=(s)=>document.querySelector(s);
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(n)=>Math.round((Number(n)||0)*100)+'%';
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const state={route:'learning',selectedVideo:null,selectedLesson:null,search:'',category:'all',subcategory:'all',level:'all',caption:'all',transcriptTab:'bilingual',subtitleSize:100,speed:1,subtitleOffset:0,subtitleRate:1,word:null,sidebarCollapsed:false,quizBand:'400-600',quizIndex:0,quizAnswers:{}};
let catalog={videos:[]},taxonomy={categories:[]},lessons={chapters:[],microLessons:[]},toeic={bands:{}},wordBank={words:{}},learningUnits={units:{}};
let ytPlayer=null,ytTimer=null,categoryModalOpen=false;

async function boot(){
  try{
    const names=['catalog','taxonomy','lessons','toeic','word-bank','learning-units'];
    const files=await Promise.all(names.map(async x=>{
      const r=await fetch('data/'+x+'.json',{cache:'no-store'});
      if(!r.ok)throw new Error(x+' data HTTP '+r.status);
      return r.json();
    }));
    [catalog,taxonomy,lessons,toeic,wordBank,learningUnits]=files;
    state.sidebarCollapsed=load('evl-sidebar-collapsed',false);
    state.subtitleOffset=Number(load('sanmu-subtitle-offset',0))||0;
    state.subtitleRate=Number(load('sanmu-subtitle-rate',1))||1;
    parseHash();
  }catch(err){
    console.error('[三木Eng] boot failed',err);
    // Never leave a completely blank page when a secondary data file fails.
    catalog=catalog&&Array.isArray(catalog.videos)?catalog:{videos:[]};
    taxonomy=taxonomy&&Array.isArray(taxonomy.categories)?taxonomy:{categories:[]};
    lessons=lessons&&Array.isArray(lessons.chapters)?lessons:{chapters:[],microLessons:[]};
    toeic=toeic&&toeic.bands?toeic:{bands:{}};
    wordBank=wordBank&&wordBank.words?wordBank:{words:{}};
    learningUnits=learningUnits&&learningUnits.units?learningUnits:{units:{}};
    try{parseHash();}catch(renderErr){
      console.error('[三木Eng] fallback render failed',renderErr);
      const app=document.querySelector('#app');
      if(app)app.innerHTML='<main style="padding:48px;font:16px system-ui;color:#173f36"><h1>三木Eng</h1><p>網站正在修復載入問題，請重新整理。</p></main>';
    }
  }
}
function parseHash(){const p=location.hash.slice(1).split('/');state.route=p[0]||'learning';state.selectedVideo=state.route==='watch'?decodeURIComponent(p[1]||''):null;state.selectedLesson=state.route==='lesson'?decodeURIComponent(p[1]||''):null;if(state.route==='watch'&&!['english','bilingual','chinese'].includes(state.transcriptTab))state.transcriptTab='bilingual';if(history.scrollRestoration)history.scrollRestoration='manual';requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));render();}
function go(route,id=''){location.hash=id?route+'/'+encodeURIComponent(id):route;}
window.__sanmuTestSync=(t)=>syncSubtitle(Number(t)||0);
window.__sanmuDiagnostics=()=>({
  route:state.route,
  videoId:state.selectedVideo,
  transcriptCount:Array.isArray(selectedVideo()?.transcript)?selectedVideo().transcript.length:0,
  translatedCount:Array.isArray(selectedVideo()?.transcript)?selectedVideo().transcript.filter(x=>String(x.zh||'').trim()).length:0,
  activeIndex:[...document.querySelectorAll('.segment')].findIndex(x=>x.classList.contains('active')),
  audio:window.__sanmuAudioLast||null
});
window.addEventListener('hashchange',parseHash);
function favs(){return load('sanmu-favs',[])} function vocab(){return load('sanmu-vocab',{})} function history(){return load('sanmu-history',[])} function prog(){return load('sanmu-lessons',{})}
function updateSearch(v){state.search=v;renderMain();}
function openCategoryModal(){categoryModalOpen=true;render();}
function closeCategoryModal(){categoryModalOpen=false;render();}
function chooseCategory(id){state.category=id;state.subcategory='all';categoryModalOpen=false;go('explore');}
function toggleSidebar(){state.sidebarCollapsed=!state.sidebarCollapsed;save('evl-sidebar-collapsed',state.sidebarCollapsed);render();}
function daily(){return load('sanmu-daily',{date:new Date().toISOString().slice(0,10),minutes:0,sessions:0});}
const DIFFICULTY_LABELS={A1:'初級',A2:'初中級',B1:'中級',B2:'中高級',C1:'高級',C2:'特高級'};
function difficultyLabel(cefr){return DIFFICULTY_LABELS[String(cefr||'').toUpperCase()]||'未分級';}
function latestVideos(){
  return catalog.videos.map((v,i)=>({v,i})).sort((a,b)=>{
    const at=Date.parse(a.v.addedAt||a.v.acceptedAt||a.v.discoveredAt||'')||0;
    const bt=Date.parse(b.v.addedAt||b.v.acceptedAt||b.v.discoveredAt||'')||0;
    if(at!==bt)return bt-at;
    const ap=Date.parse(a.v.published||'')||0,bp=Date.parse(b.v.published||'')||0;
    if(ap!==bp)return bp-ap;
    return a.i-b.i;
  }).map(x=>x.v);
}
function taipeiDate(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(d);}catch{return d.toISOString().slice(0,10);}
}
function isNewlyAdded(v){
  const t=v?.addedAt||v?.acceptedAt||v?.discoveredAt;
  return !!t && taipeiDate(t)===taipeiDate(Date.now());
}
function filteredVideos(){
  const q=state.search.trim().toLowerCase();
  return latestVideos().filter(v=>{
    // Only expose release-ready videos. Review/incomplete records stay in the
    // backend review queue and can never be opened as a "learning" video.
    if((v.status!=='accepted' || v.captionQuality!=='verified') && !(Array.isArray(v.transcript)&&v.transcript.length)) return false;
    const txt=[v.title,v.channel,v.category,v.subcategory,...(v.tags||[])].join(' ').toLowerCase();
    const difficulty=String(v.cefr||'').toUpperCase();
    return (!q||txt.includes(q))
      && (state.category==='all'||v.category===state.category)
      && (state.level==='all'||difficulty===state.level)
      && (state.caption==='all'||(state.caption==='ready'?v.captions==='available':v.captions!=='available'));
  });
}
function categoryCount(id){return catalog.videos.filter(v=>v.category===id).length}
function shell(main){const d=daily(), collapsed=state.sidebarCollapsed;return `<div class="app ${collapsed?'sidebar-collapsed':''}">
<header class="topbar"><a class="brand" href="#learning"><img src="assets/logo.png" alt="三木Eng"></a><div class="search"><input value="${esc(state.search)}" oninput="updateSearch(this.value)" onkeydown="handleGlobalSearchKey(event,this.value)" placeholder="搜尋影片、主題、單字、頻道…"></div><div class="top-actions"><button onclick="go('learning')">影片學習</button></div></header>
<div class="layout"><aside class="sidebar">
<div class="brand-mini"><span>三木</span><button class="sidebar-toggle" onclick="toggleSidebar()">${collapsed?'»':'«'}</button></div>
<button class="side-main ${['learning','watch'].includes(state.route)?'active':''}" onclick="go('learning')"><span class="side-icon">▶</span><span><b>影片學習</b><small>影片・字幕・單字</small></span></button>
<button class="side-main ${['grammar','lesson'].includes(state.route)?'active':''}" onclick="go('grammar')"><span class="side-icon">文</span><span><b>英文文法</b><small>30 章 · 150 微課</small></span></button>
<button class="side-main ${state.route==='quiz'?'active':''}" onclick="go('quiz')"><span class="side-icon">測</span><span><b>多益練習</b><small>4 級距 · 20 題</small></span></button>
<div class="side-label">影片工具</div>
<button class="side-tool" onclick="go('history')"><span>▤</span><span><b>觀看紀錄</b><small>${history().length} 部</small></span></button>
<button class="side-tool" onclick="go('favorites')"><span>♡</span><span><b>收藏影片</b><small>${favs().length} 部</small></span></button>
<button class="side-tool" onclick="go('vocabulary')"><span>Aa</span><span><b>我的單字庫</b><small>${Object.keys(vocab()).length} 字</small></span></button>
<div class="side-label">分類</div><button class="category-launch" onclick="openCategoryModal()"><span>▦</span><span><b>選擇分類</b><small>${state.category==='all'?'全部 13 大類':esc((taxonomy.categories.find(c=>c.id===state.category)||{}).name||'')}</small></span></button>
<div class="side-bottom"><div class="progress-card"><small>文法微課進度</small><strong>${Object.values(prog()).filter(Boolean).length} / 150 課</strong><div><i style="width:${Object.values(prog()).filter(Boolean).length/1.5}%"></i></div></div><div class="daily">今日學習 <b>${d.minutes}</b> 分鐘・<b>${d.sessions}</b> 次</div></div>
</aside><main>${main}</main></div>
${categoryModalOpen?categoryModal():''}${state.word?wordModal():''}</div>`;}
function categoryModal(){return `<div class="modal-backdrop" onclick="closeCategoryModal()"><div class="category-modal" onclick="event.stopPropagation()"><div class="modal-head"><div><h2>選擇內容分類</h2><p>分類不常駐側欄；點選後只看你要的內容。</p></div><button onclick="closeCategoryModal()">×</button></div><div class="category-grid">${taxonomy.categories.map(c=>`<button class="category-card ${state.category===c.id?'active':''}" onclick="chooseCategory('${c.id}')"><strong>${esc(c.name)}</strong><small>${c.subs.length} 個子類 ・ ${categoryCount(c.id)} 部</small><p>${c.subs.join(' · ')}</p></button>`).join('')}</div></div></div>`;}
function content(){
  if(['learning','home','explore'].includes(state.route))return explore();
  if(state.route==='watch')return watch();
  if(state.route==='grammar')return grammar();
  if(state.route==='lesson')return lesson();
  if(state.route==='quiz')return quiz();
  if(state.route==='history')return listPage('觀看紀錄',history());
  if(state.route==='favorites')return listPage('收藏影片',favs().map(id=>catalog.videos.find(v=>v.id===id)).filter(Boolean));
  if(state.route==='vocabulary')return vocabularyPage();
  return explore();
}
function render(){destroyPlayer();document.querySelector('#app').innerHTML=shell(content());if(state.route==='watch')setTimeout(initPlayer,80);}
function renderMain(){const m=$('main');if(m){destroyPlayer();m.innerHTML=content();if(state.route==='watch')setTimeout(initPlayer,80);}}
function home(){return explore();}
function videoCard(v){
  const isNew=isNewlyAdded(v);
  return `<article class="video-card ${isNew?'is-new':''}" onclick="go('watch','${v.id}')">
    <div class="thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt=""><span class="grade">${esc(difficultyLabel(v.cefr))}</span><span class="duration">${esc(v.duration||'')}</span>${isNew?'<span class="new-badge">新增</span>':''}</div>
    <div class="video-info"><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p><div class="chips"><span>EN ${pct(v.englishScore)}</span><span>${esc(v.subcategory||v.category||'')}</span><span>${v.translation==='available'?'中譯已備妥':'中譯待補'}</span></div></div>
  </article>`;
}
function explore(){
  const vs=filteredVideos();
  const newVideos=vs.filter(isNewlyAdded);
  const otherVideos=vs.filter(v=>!isNewlyAdded(v));
  const difficultyOptions=[['all','全部難易度'],['A1','初級'],['A2','初中級'],['B1','中級'],['B2','中高級'],['C1','高級'],['C2','特高級']];
  return `<section class="latest-page">
    <div class="latest-banner">
      <div><span class="latest-kicker">VIDEO LEARNING</span><h1>最新影片</h1><p>依「加入學習庫」時間排列；每日新增內容固定置頂。</p></div>
      <span class="count-pill">${vs.length} 部</span>
    </div>
    <div class="filters">
      <select aria-label="分類" onchange="state.category=this.value;renderMain()"><option value="all">全部分類</option>${taxonomy.categories.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
      <select aria-label="難易度" onchange="state.level=this.value;renderMain()">${difficultyOptions.map(x=>`<option value="${x[0]}" ${state.level===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>
      <select aria-label="字幕" onchange="state.caption=this.value;renderMain()"><option value="all">全部字幕狀態</option><option value="ready" ${state.caption==='ready'?'selected':''}>英文字幕已驗證</option><option value="pending" ${state.caption==='pending'?'selected':''}>字幕待補</option></select>
    </div>
    <div class="results-meta">英文語言驗證 ・ 字幕驗證 ・ 難易度 ・ 13 大類分類 ・ 去重</div>
    ${newVideos.length?`<section class="video-section new-video-section"><div class="video-section-head"><div><div class="new-video-label">新增影片</div><small>今日加入學習庫的內容</small></div><span class="count-pill">${newVideos.length} 部</span></div><div class="video-grid">${newVideos.map(videoCard).join('')}</div></section>`:''}
    <section class="video-section">
      <div class="video-section-head"><div><h2>全部影片</h2><small>${otherVideos.length?'依加入時間由新到舊排列':'今天的新增影片已全部顯示在上方。'}</small></div><span class="count-pill">${otherVideos.length} 部</span></div>
      <div class="video-grid">${otherVideos.map(videoCard).join('')||'<div class="empty">目前沒有其他符合條件的影片。</div>'}</div>
    </section>
  </section>`;
}
const TITLE_ZH={
  '0Nv-zlhdb7Y':'如何用英語表達禮貌',
  '3NM72kTE2oQ':'如何用英語表達禮貌：BBC Learning English 問答',
  '4C4wlOAscvY':'聊聊食物——Real Easy English',
  'SMIgI-qDNCA':'什麼是被動語態？BBC Learning English 問答',
  'uz2C3bQot6o':'同義詞：我怎麼知道該選哪一個？',
  'x6Pdp8GBwTM':'「th」音要怎麼發音？',
  'x72gP4HrU58':'聊聊家庭：Real Easy English',
  'z5V0d1nBCX8':'10 個簡單英文單字：浴室篇',
  'O43nLSRMqHU':'倫敦到愛丁堡挑戰——第 1 集',
  '-XcALxwXJVY':'App 能教你學語言嗎？——6 Minute English',
  'KFajmtdj-J0':'姊妹之間的情感連結——6 Minute English'
};
function titleZh(v){return v?.titleZh||TITLE_ZH[v?.id]||'中文標題翻譯待補';}
function setSubtitleOffset(sec){state.subtitleOffset=Number(sec)||0;save('sanmu-subtitle-offset',state.subtitleOffset);document.querySelectorAll('.subtitle-offset-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.offset)===state.subtitleOffset));}
function setSubtitleRate(rate){state.subtitleRate=Number(rate)||1;save('sanmu-subtitle-rate',state.subtitleRate);document.querySelectorAll('.subtitle-rate-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===state.subtitleRate));}
function ytEmbed(id){return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&rel=0&playsinline=1&hl=zh-TW&modestbranding=1`;}
function fmt(s){s=Number(s)||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');}
function clickableSentence(text,videoId){
  return esc(text).replace(/[A-Za-z]+(?:['’][A-Za-z]+)?/g,w=>{
    const k=w.toLowerCase();
    const info=wordBank.words?.[k];
    return `<button class="word-token ${info?'known':''}" title="中文解釋＋英式／美式發音" onclick='event.stopPropagation();openWord(${JSON.stringify(k)},${JSON.stringify(videoId)},${JSON.stringify(text)})'>${w}</button>`;
  });
}

function markHistory(v){let h=history(),i=h.findIndex(x=>x.id===v.id);const item={id:v.id,title:v.title,updatedAt:new Date().toISOString()};if(i>=0)h[i]={...h[i],...item};else h.unshift(item);save('sanmu-history',h.slice(0,200));let d=daily();d.minutes+=1;d.sessions+=1;save('sanmu-daily',d);}
function toggleFav(id){let f=favs();f=f.includes(id)?f.filter(x=>x!==id):[...f,id];save('sanmu-favs',f);render();}
async function enrichWord(word){
  const key=String(word||'').trim().toLowerCase();if(!key)return;
  const cacheKey='sanmu-word-cache-v4-'+key;
  const current=()=>state.word&&String(state.word.word).toLowerCase()===key;
  const setWord=(patch)=>{if(!current())return;state.word={...state.word,...patch};updateWordModal();};
  let cached={};
  try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')||{};}catch{}
  if(Object.keys(cached).length){setWord(cached);}

  // Fast path: only retrieve Chinese translation first. Do not wait for pronunciation/dictionary APIs.
  if(!cached.definition_zh){
    try{
      const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(key);
      const res=await fetch(url,{cache:'force-cache',headers:{'Accept':'application/json'}});
      if(res.ok){
        const data=await res.json();
        const zh=(data?.[0]||[]).map(x=>Array.isArray(x)?(x[0]||''):'').join('').trim();
        if(zh){setWord({definition_zh:zh});cached={...cached,definition_zh:zh};try{localStorage.setItem(cacheKey,JSON.stringify(cached));}catch{}}
      }
    }catch{}
  }

  // Background enrichment: pronunciation metadata + example. This never blocks the Chinese result.
  if(cached.phonetic_uk&&cached.phonetic_us&&cached.audio_uk&&cached.audio_us)return;
  try{
    const res=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(key),{cache:'force-cache'});
    if(!res.ok)return;
    const entry=(await res.json())?.[0]||{};const meanings=entry.meanings||[];const phs=(entry.phonetics||[]).filter(p=>p?.text||p?.audio);
    const us=phs.find(p=>/us/i.test(String(p.audio||'')))||{};const uk=phs.find(p=>/uk|gb/i.test(String(p.audio||'')))||{};
    const patch={
      pos:meanings.map(m=>m?.partOfSpeech||'').find(Boolean)||'',
      phonetic_us:us.text||phs.find(p=>/us/i.test(String(p.text||'')))?.text||phs.find(p=>p?.text)?.text||'',
      phonetic_uk:uk.text||phs.find(p=>/uk|gb/i.test(String(p.text||'')))?.text||phs.find(p=>p?.text)?.text||'',
      audio_us:us.audio||phs.find(p=>/us/i.test(String(p.audio||'')))?.audio||'',
      audio_uk:uk.audio||phs.find(p=>/uk|gb/i.test(String(p.audio||'')))?.audio||'',
      example:meanings.flatMap(m=>m.definitions||[]).map(d=>d.example).find(Boolean)||''
    };
    setWord(patch);cached={...cached,...patch};try{localStorage.setItem(cacheKey,JSON.stringify(cached));}catch{}
  }catch{}
}
function updateWordModal(){
  const w=state.word;if(!w)return;
  const ids={zh:'word-definition-zh',uk:'word-phonetic-uk',us:'word-phonetic-us',pos:'word-pos',ex:'word-example'};
  const map={zh:w.definition_zh||'正在取得中文翻譯…',uk:w.phonetic_uk||'—',us:w.phonetic_us||'—',pos:w.pos||'查詢中…',ex:w.example||w.sourceSentence||'—'};
  Object.entries(ids).forEach(([k,id])=>{const el=document.getElementById(id);if(el)el.textContent=map[k];});
}
function openWord(word,sourceVideoId='',sourceSentence=''){
  const raw=String(word||'').trim();
  if(!raw)return;
  const normalized=raw.replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g,'').toLowerCase();
  if(!normalized)return;
  const info=wordBank.words?.[normalized]||{};
  let cached={};
  try{cached=JSON.parse(localStorage.getItem('sanmu-word-cache-v2-'+normalized)||'null')||{};}catch{}
  state.word={word:normalized,sourceVideoId,sourceSentence,...cached,...info};
  render();
  if(!state.word.definition_zh||!state.word.phonetic_uk||!state.word.phonetic_us)enrichWord(normalized);
}
function closeWord(){state.word=null;render();}
let speechAudio=null;
let speechVoices=[];
function refreshSpeechVoices(){try{speechVoices=window.speechSynthesis?window.speechSynthesis.getVoices():[];}catch{speechVoices=[];}}
try{if(window.speechSynthesis){refreshSpeechVoices();window.speechSynthesis.onvoiceschanged=refreshSpeechVoices;}}catch{}
function accentVoice(locale){
  const target=String(locale||'en-US').toLowerCase().indexOf('en-gb')===0?'en-GB':'en-US';
  const voices=speechVoices.length?speechVoices:(window.speechSynthesis?window.speechSynthesis.getVoices():[]);
  if(target==='en-GB')return voices.find(v=>/^en-GB/i.test(v.lang||''))||voices.find(v=>/british|uk|hazel|george|daniel/i.test(v.name||''))||voices.find(v=>/^en/i.test(v.lang||''))||null;
  return voices.find(v=>/^en-US/i.test(v.lang||''))||voices.find(v=>/american|us|david|mark|zira|samantha|alex/i.test(v.name||''))||voices.find(v=>/^en/i.test(v.lang||''))||null;
}
function youdaoPronunciationUrl(word,locale){const type=String(locale||'en-US').toLowerCase().indexOf('en-gb')===0?'1':'2';return 'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(String(word||''))+'&type='+type;}
function speak(text,locale){
  const value=String(text||'').trim();if(!value)return false;
  const target=String(locale||'en-US').toLowerCase().indexOf('en-gb')===0?'en-GB':'en-US';
  try{
    const synth=window.speechSynthesis;if(!synth||!window.SpeechSynthesisUtterance)return false;
    synth.cancel();refreshSpeechVoices();
    const u=new SpeechSynthesisUtterance(value);u.lang=target;u.voice=accentVoice(target)||null;u.rate=.88;u.pitch=1;u.volume=1;
    synth.resume();synth.speak(u);
    window.__sanmuAudioLast={word:value,locale:target,status:'speech-queued',url:''};
    return true;
  }catch{return false;}
}
function pronunciationCandidates(word,locale){
  const value=String(word||'').trim();
  const target=String(locale||'en-US').toLowerCase().indexOf('en-gb')===0?'en-GB':'en-US';
  const w=state.word||{};
  const primary=target==='en-GB'?w.audio_uk:w.audio_us;
  const secondary=target==='en-GB'?w.audio_us:w.audio_uk;
  const type=target==='en-GB'?'1':'2';
  return [primary,secondary,`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(value)}&type=${type}`,`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(value)}`].filter(Boolean);
}
function playRemotePronunciation(urls,index=0,word='',locale='en-US'){
  if(index>=urls.length){
    const ok=speak(word,locale);
    if(!ok)window.__sanmuAudioLast={word,locale,status:'no-audio-source',url:''};
    return;
  }
  try{
    if(speechAudio){try{speechAudio.pause();}catch{}speechAudio=null;}
    const audio=new Audio();audio.preload='auto';audio.volume=1;audio.src=urls[index];speechAudio=audio;
    window.__sanmuAudioLast={word,locale,status:'loading',url:audio.src};
    audio.onended=()=>{window.__sanmuAudioLast.status='ended';if(speechAudio===audio)speechAudio=null;};
    audio.onerror=()=>{if(speechAudio===audio)speechAudio=null;playRemotePronunciation(urls,index+1,word,locale);};
    const p=audio.play();
    if(p&&p.catch)p.catch(()=>{if(speechAudio===audio)speechAudio=null;playRemotePronunciation(urls,index+1,word,locale);});
  }catch{playRemotePronunciation(urls,index+1,word,locale);}
}
function playPronunciation(word,locale){
  const value=String(word||'').trim();if(!value)return;
  const target=String(locale||'en-US').toLowerCase().indexOf('en-gb')===0?'en-GB':'en-US';
  // The click handler starts an actual audio file first, which is more reliable than speech synthesis.
  const urls=pronunciationCandidates(value,target);
  playRemotePronunciation(urls,0,value,target);
}
async function playAudioUrl(url,fallbackText,target){playPronunciation(fallbackText,target);return true;}
async function playGoogleTTS(value,target){playPronunciation(value,target);return true;}
function addWord(){const w=state.word;if(!w)return;const v=vocab();v[String(w.word).toLowerCase()]={...w,addedAt:new Date().toISOString()};save('sanmu-vocab',v);render();}
function wordModal(){
  const w=state.word||{};
  const fav=Object.keys(vocab()).includes(String(w.word||'').toLowerCase());
  const zh=w.definition_zh||'正在取得中文翻譯…';
  const pos=w.pos||'n.';
  const phonUk=w.phonetic_uk||'—';
  const phonUs=w.phonetic_us||'—';
  const sourceSentence=w.sourceSentence||w.example||'';
  return `<div class="word-popover-layer" onclick="closeWord()">
    <div class="word-popover" role="dialog" aria-label="${esc(w.word||'單字查詢')}" onclick="event.stopPropagation()">
      <div class="word-popover-head">
        <div class="word-main-line"><strong>${esc(w.word||'')}</strong><span class="word-phonetic-inline">${esc(phonUk)}</span><span class="word-phonetic-inline us-inline">${esc(phonUs)}</span><span class="word-pos-pill">${esc(pos)}</span></div>
        <button type="button" class="word-close" onclick="closeWord()" aria-label="關閉">×</button>
      </div>
      <div class="word-meaning"><span class="meaning-pos">${esc(pos)}</span> ${esc(zh)}</div>
      ${sourceSentence?`<div class="word-example-line">${esc(sourceSentence)}</div>`:''}
      <div class="word-actions">
        <button type="button" class="word-audio-btn" onclick="playPronunciation(${JSON.stringify(w.word)},'en-GB')"><span class="speaker">🔊</span> UK</button>
        <button type="button" class="word-audio-btn" onclick="playPronunciation(${JSON.stringify(w.word)},'en-US')"><span class="speaker">🔊</span> US</button>
        <button type="button" class="word-save-btn ${fav?'saved':''}" onclick="addWord()">${fav?'♥ 已收藏':'♡ 收藏單字'}</button>
      </div>
    </div>
  </div>`;
}function grammar(){const done=Object.values(prog()).filter(Boolean).length;return `<div class="section-head"><div><h2>英文文法 · 30 章 / 150 微課</h2><p>Form → Meaning → Use → Contrast → Error；每課都有說明、句型、例句、常見錯誤與練習。</p></div><span class="count-pill">${done}/150</span></div><div class="overview-progress"><strong>${done} / 150 課</strong><div><i style="width:${done/1.5}%"></i></div></div><div class="chapter-grid">${lessons.chapters.map(c=>{const ms=lessons.microLessons.filter(m=>m.chapter_id===c[0]);return `<article class="chapter"><div class="chapter-head"><h3>${c[0]}. ${esc(c[1])}</h3><span>${esc(c[3]||'')}</span></div><p>${esc(c[2])}</p><div class="micro-list">${ms.map(m=>`<button class="micro-btn ${prog()[m.lesson_id]?'done':''}" onclick="go('lesson','${m.lesson_id}')"><span>${m.lesson_id.split('-')[1]}</span>${esc(m.title_zh)}<i>→</i></button>`).join('')}</div></article>`}).join('')}</div>`;}
function lesson(){const l=lessons.microLessons.find(x=>x.lesson_id===state.selectedLesson);if(!l)return '<div class="empty">找不到微課。</div>';const done=!!prog()[l.lesson_id];return `<div class="lesson-page"><div class="section-head"><div><div class="eyebrow">MICRO LESSON ${l.lesson_id}</div><h2>${esc(l.title_zh)}</h2><p>${esc(l.cefr)} ・ ${esc(l.title_en)}</p></div><span class="count-pill">${done?'已完成':'未完成'}</span></div><div class="lesson-grid"><div class="panel big-copy"><h3>① 觀念</h3><p>${esc(l.explanation)}</p></div><div class="panel big-copy"><h3>② 句型</h3><div class="formula">${esc(l.pattern)}</div></div><div class="panel big-copy"><h3>③ 例句</h3>${l.examples.map(e=>`<p class="example">${esc(e)} <button onclick="speak(${JSON.stringify(e)},'en-US')">🔊</button></p>`).join('')}</div><div class="panel big-copy"><h3>④ 常見錯誤</h3>${l.common_errors.map(e=>`<p>⚠ ${esc(e)}</p>`).join('')}</div><div class="panel big-copy"><h3>⑤ Contrast</h3>${l.contrast.map(e=>`<p>${esc(e)}</p>`).join('')}</div><div class="panel big-copy"><h3>⑥ 微練習</h3>${l.practice.map((e,i)=>`<p>${i+1}. ${esc(e)}</p>`).join('')}<div class="tip">Mastery tip：${esc(l.mastery_tip)}</div></div></div><div class="lesson-actions"><button onclick="go('grammar')">← 回到 30 章</button><button class="primary" onclick="toggleLesson('${l.lesson_id}')">${done?'取消完成':'完成本微課'}</button><button onclick="go('quiz')">做分級測驗 →</button></div></div>`;}
function toggleLesson(id){const p=prog();p[id]=!p[id];save('sanmu-lessons',p);render();}
function quiz(){const bands=Object.keys(toeic.bands||{}),band=toeic.bands[state.quizBand]||toeic.bands['400-600'],q=(band.questions||[])[state.quizIndex]||band.questions[0],answered=state.quizAnswers[state.quizBand]?.[state.quizIndex]!==undefined;return `<div class="quiz-page"><div class="section-head"><div><h2>多益分級練習 · 20 題</h2><p>依目標分數帶選題：400分以下、400–600、600–800、800–990。</p></div><span class="count-pill">第 ${state.quizIndex+1} / 20 題</span></div><div class="band-grid">${bands.map(b=>`<button class="band-card ${state.quizBand===b?'active':''}" onclick="state.quizBand='${b}';state.quizIndex=0;state.quizAnswers={};renderMain()"><strong>${esc(toeic.bands[b].label)}</strong><small>${esc(toeic.bands[b].description)}</small></button>`).join('')}</div><div class="quiz-card"><h3>${esc(q.prompt)}</h3><div class="answers">${q.options.map((o,i)=>`<button class="answer ${answered&&i===q.answer?'correct':''} ${answered&&state.quizAnswers[state.quizBand][state.quizIndex]===i&&i!==q.answer?'wrong':''}" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div>${answered?`<div class="quiz-explain"><strong>${state.quizAnswers[state.quizBand][state.quizIndex]===q.answer?'答對了':'再想一次'}</strong><p>${esc(q.explanation)}</p><button class="primary" onclick="nextQuiz()">${state.quizIndex===19?'完成':'下一題'}</button></div>`:''}</div></div>`;}
function answerQuiz(i){if(!state.quizAnswers[state.quizBand])state.quizAnswers[state.quizBand]={};state.quizAnswers[state.quizBand][state.quizIndex]=i;renderMain();}
function nextQuiz(){state.quizIndex=state.quizIndex>=19?0:state.quizIndex+1;renderMain();}
function listPage(title,items){return `<div class="section-head"><div><h2>${title}</h2><p>你的個人學習資料儲存在瀏覽器本機。</p></div></div><div class="video-grid">${items.map(videoCard).join('')||'<div class="empty">目前沒有資料。</div>'}</div>`;}
function vocabularyPage(){
  const items=Object.values(vocab());
  return `<div class="section-head"><div><h2>我的單字庫</h2><p>字幕中的每個英文單字都可以直接查詢。</p></div><span class="count-pill">${items.length} 字</span></div>
  <div class="word-lookup panel"><div><strong>單字查詢</strong><small>中文翻譯＋英式／美式發音</small></div><div class="word-lookup-row"><input id="word-lookup-input" type="text" placeholder="輸入英文單字，例如 continuous" onkeydown="handleWordLookupKey(event,this.value)"><button type="button" onclick="lookupWordInput()">查詢</button></div></div>
  <div class="vocab-grid">${items.map(w=>`<div class="vocab-card"><div><strong>${esc(w.word)}</strong><small>${esc(w.pos||'')}</small></div><p>${esc(w.definition_zh||'尚未翻譯')}</p><button type="button" onclick='openWord(${JSON.stringify(w.word)},${JSON.stringify(w.sourceVideoId||'')},${JSON.stringify(w.sourceSentence||'')})'>查看</button></div>`).join('')||'<div class="empty">尚未收藏單字。</div>'}</div>`;
}
function engine(){const s=catalog.stats||{};return `<div class="section-head"><div><h2>影片探索引擎</h2><p>候選搜尋 → 語言辨識 → 字幕 A/B/C → AI CEFR / 分類 → 去重 → 翻譯 → 學習單元。</p></div><span class="count-pill">13 類・${taxonomy.totalSubcategories} 子類</span></div><div class="engine-grid"><div class="panel pipeline"><h3>Continuous Discovery</h3><div>${[['大量搜尋','每次 32 個 query、雙頁候選'],['語言閘門','English / Multilingual / confidence'],['字幕','A → B → C fallback'],['分類','AI 13 大類 / 子類'],['難度','A1–C2 CEFR'],['去重','ID / fingerprint / embedding'],['翻譯','batch → sentence → context'],['學習單元','Vocabulary / Phrases / Grammar / Questions']].map((x,i)=>`<div class="stage"><b>${i+1}. ${x[0]}</b><p>${x[1]}</p></div>`).join('')}</div></div><div class="panel"><h3>目前資料</h3><div class="metric-grid"><div><b>${s.accepted||catalog.videos.length}</b><small>收錄</small></div><div><b>${s.candidates||0}</b><small>候選</small></div><div><b>${s.review||0}</b><small>待審</small></div><div><b>${catalog.translationStats?.translated||0}</b><small>已翻句</small></div></div><p class="engine-note">真正大量增加影片需要 GitHub Actions 取得 YOUTUBE_API_KEY 與 OPENAI_API_KEY 後自動執行。</p></div></div>`;}
window.toggleSidebar=toggleSidebar;window.playPronunciation=playPronunciation;window.handleGlobalSearchKey=handleGlobalSearchKey;window.handleWordLookupKey=handleWordLookupKey;window.lookupWordInput=lookupWordInput;window.playPronunciation=playPronunciation;window.openCategoryModal=openCategoryModal;window.closeCategoryModal=closeCategoryModal;window.chooseCategory=chooseCategory;window.go=go;window.updateSearch=updateSearch;window.renderMain=renderMain;window.setSpeed=setSpeed;window.setSubtitleSize=setSubtitleSize;window.setTab=setTab;window.seek=seek;window.toggleFav=toggleFav;window.openWord=openWord;window.closeWord=closeWord;window.speak=speak;window.addWord=addWord;window.answerQuiz=answerQuiz;window.nextQuiz=nextQuiz;window.toggleLesson=toggleLesson;


/* =========================================================
   三木Eng V5
   - robust page scroll / collapsible sidebar
   - YouTube URL input
   - 75/100/125/150/200% subtitle scale
   - live sentence sync using YouTube IFrame API
   - subtitle workspace below video
   - grammar practice
   - TOEIC band-specific UI
   ========================================================= */

function extractYouTubeId(value){
  const s=String(value||'').trim();
  if(!s) return null;
  const direct=s.match(/^[A-Za-z0-9_-]{11}$/);
  if(direct) return direct[0];
  try{
    const u=new URL(s);
    const host=u.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='youtu.be'){
      const id=u.pathname.split('/').filter(Boolean)[0];
      return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
    }
    if(host==='youtube.com' || host==='m.youtube.com' || host==='music.youtube.com'){
      if(u.pathname==='/watch'){
        const id=u.searchParams.get('v');
        return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
      }
      const m=u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
      return m?m[1]:null;
    }
  }catch{}
  return null;
}

function selectedVideo(){
  const id=decodeURIComponent(state.selectedVideo||'');
  const found=catalog.videos.find(v=>v.id===id);
  if(found) return found;
  const yid=extractYouTubeId(id);
  if(yid) return {
    id:yid,
    title:'YouTube 影片',
    channel:'YouTube',
    duration:'',
    cefr:'—',
    englishScore:0,
    category:'',
    subcategory:'',
    captions:'external',
    translation:'pending',
    transcript:[],
    sourceUrl:`https://www.youtube.com/watch?v=${yid}`,
    external:true
  };
  return null;
}

function handleSearchKey(e,value){
  if(e.key!=='Enter')return;
  const id=extractYouTubeId(value);
  if(id){state.search='';go('watch',id);}
}
function handleGlobalSearchKey(e,value){
  if(e.key!=='Enter')return;
  const q=String(value||'').trim();if(!q)return;
  const id=extractYouTubeId(q);
  if(id){state.search='';go('watch',id);return;}
  if(/^[A-Za-z]+(?:['’][A-Za-z]+)?$/.test(q)){state.search='';openWord(q);}
}
function handleWordLookupKey(e,value){if(e.key==='Enter')openWord(String(value||''));}
function lookupWordInput(){const el=document.getElementById('word-lookup-input');if(el&&el.value.trim())openWord(el.value.trim());}
function setSubtitleScale(scale){
  const n=Number(scale)||1;
  state.subtitleScale=Math.max(.75,Math.min(2,n));
  save('sanmu-subtitle-scale',state.subtitleScale);
  const list=document.querySelector('.subtitle-list');
  if(list) applySubtitleScaleToList(list);
  document.querySelectorAll('.subtitle-scale-btn').forEach(b=>{
    b.classList.toggle('active',Number(b.dataset.scale)===state.subtitleScale);
  });
}
function applySubtitleScaleToList(list){
  const base=20*state.subtitleScale;
  list.style.setProperty('--en-size',base+'px');
  list.style.setProperty('--zh-size',Math.max(14,base*.88)+'px');
}
function setSubtitleSize(s){ setSubtitleScale((Number(s)||100)/100); }
function getPracticeAnswers(id){return load('sanmu-practice-'+id,{});}
function answerMicroPractice(lessonId,index,choice){
  const p=getPracticeAnswers(lessonId);
  p[index]=choice;
  save('sanmu-practice-'+lessonId,p);
  renderMain();
}
function practiceResultHtml(lessonId,index,item){
  const p=getPracticeAnswers(lessonId), a=p[index];
  if(a===undefined) return '';
  const ok=a===item.answer;
  return `<div class="practice-result ${ok?'ok':'bad'}"><b>${ok?'答對':'再檢查一次'}</b><p>${esc(item.explanation||'')}</p></div>`;
}

function initPlayer(){
  if(state.route!=='watch')return;
  const iframe=document.getElementById('yt'); if(!iframe)return;
  const mount=()=>{
    if(!window.YT||!YT.Player)return;
    try{
      if(ytPlayer&&typeof ytPlayer.destroy==='function')ytPlayer.destroy();
      ytPlayer=new YT.Player('yt',{events:{onReady:()=>{setSpeed(state.speed||1);syncSubtitle(0);startSubtitleSync();}}});
    }catch(e){setTimeout(initPlayer,300);}
  };
  if(window.YT&&YT.Player){mount();return;}
  if(window.__ytWaiterFinal)return;
  window.__ytWaiterFinal=true;
  const ready=()=>{window.__ytWaiterFinal=false;mount();};
  window.addEventListener('ytapiready',ready,{once:true});
  const started=Date.now();
  const poll=()=>{if(state.route!=='watch'||Date.now()-started>12000)return;if(window.YT&&YT.Player)mount();else setTimeout(poll,250);};
  poll();
}
function startSubtitleSync(){
  if(ytTimer)clearInterval(ytTimer);
  ytTimer=setInterval(()=>{if(!ytPlayer||typeof ytPlayer.getCurrentTime!=='function')return;let t=0;try{t=Number(ytPlayer.getCurrentTime())||0}catch{return}syncSubtitle(t);},180);
}
function syncSubtitle(t){
  const v=selectedVideo(),seg=v?.transcript||[],list=document.querySelector('.subtitle-list');
  if(!seg.length||!list)return;
  const rate=Number(state.subtitleRate)||1, adjusted=(t-(Number(state.subtitleOffset)||0))*rate;
  let idx=-1;
  for(let i=0;i<seg.length;i++){
    const a=Number(seg[i].start)||0,b=Number(seg[i].end),end=Number.isFinite(b)&&b>a?b:(Number(seg[i+1]?.start)||a+6);
    if(adjusted>=a&&adjusted<end){idx=i;break;}
  }
  if(idx<0&&adjusted>=Number(seg[seg.length-1]?.start||0))idx=seg.length-1;
  if(idx>=0&&idx!==lastSubtitleIndex){lastSubtitleIndex=idx;list.innerHTML=subtitleHTML(v,idx);}
}
function destroyPlayer(){if(ytTimer){clearInterval(ytTimer);ytTimer=null;}try{ytPlayer?.destroy?.();}catch{}ytPlayer=null;lastSubtitleIndex=-1;}
function seek(sec){if(ytPlayer?.seekTo){try{ytPlayer.seekTo(Number(sec),true);ytPlayer.playVideo?.();}catch{}}}
function replaySentence(){
  const v=selectedVideo(), seg=v?.transcript?.[lastSubtitleIndex];
  if(seg) seek(Number(seg.start)||0);
}
let sentenceLoopTimer=null;
function toggleSentenceLoop(){
  if(sentenceLoopTimer){clearInterval(sentenceLoopTimer);sentenceLoopTimer=null;renderMain();return;}
  sentenceLoopTimer=setInterval(()=>{
    const v=selectedVideo(), seg=v?.transcript?.[lastSubtitleIndex];
    if(!seg||!ytPlayer?.getCurrentTime)return;
    const now=Number(ytPlayer.getCurrentTime())||0;
    if(now >= (Number(seg.end)||Number(seg.start)+4)){seek(Number(seg.start)||0);}
  },180);
  renderMain();
}
function setSpeed(s){state.speed=Number(s)||1;if(ytPlayer?.setPlaybackRate){try{ytPlayer.setPlaybackRate(state.speed);}catch{}}syncSubtitle(Number(ytPlayer?.getCurrentTime?.()||0));document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===state.speed));}
function setSubtitleSize(s){const allowed=[75,100,125,150,200];const n=Number(s)||100;state.subtitleSize=allowed.includes(n)?n:100;const list=$('.subtitle-list');if(list)list.dataset.scale=String(state.subtitleSize);document.querySelectorAll('.subtitle-scale-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.scale)===state.subtitleSize));}
function setTab(t){state.transcriptTab=t;const v=selectedVideo();const list=$('.subtitle-list');if(list)list.innerHTML=subtitleHTML(v,lastSubtitleIndex>=0?lastSubtitleIndex:0);document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.textContent.trim()===(t==='english'?'英文':t==='bilingual'?'中英':'中文')));}
const transcriptHydrationJobs={};

function transcriptCacheKey(videoId){return 'sanmu-transcript-v2-'+videoId;}
function loadTranscriptCache(videoId){
  try{const x=JSON.parse(localStorage.getItem(transcriptCacheKey(videoId))||'null');return Array.isArray(x)?x:[];}catch{return [];}
}
function saveTranscriptCache(videoId,rows){try{localStorage.setItem(transcriptCacheKey(videoId),JSON.stringify(rows));}catch{}}
function splitTranscriptSentence(text){
  const clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)return [];
  return (clean.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)||[clean]).map(x=>x.trim()).filter(Boolean);
}
function parseRemoteTranscript(raw){
  const cues=[], re=/^\s*\[(?:(\d+)\:)?(\d{1,2})\:(\d{2})(?:[.,](\d{1,3}))?\]\s*(.+?)\s*$/;
  for(const line of String(raw||'').split(/\r?\n/)){
    const m=line.match(re);if(!m)continue;
    const ms=String(m[4]||'').padEnd(3,'0').slice(0,3);
    const start=Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3])+Number(ms)/1000;
    if(m[5])cues.push({start,text:m[5].trim()});
  }
  const out=[];
  for(let i=0;i<cues.length;i++){
    const cur=cues[i],next=cues[i+1],end=Math.max(cur.start+1,next?next.start:cur.start+Math.max(5,cur.text.length/12));
    const parts=splitTranscriptSentence(cur.text);
    if(parts.length===1){out.push({start:+cur.start.toFixed(3),end:+end.toFixed(3),en:parts[0],zh:''});continue;}
    const total=Math.max(1,parts.reduce((n,x)=>n+x.length,0));let cursor=cur.start;
    for(const part of parts){
      const span=Math.max(.7,(end-cur.start)*(part.length/total)),e=Math.min(end,cursor+span);
      out.push({start:+cursor.toFixed(3),end:+e.toFixed(3),en:part,zh:''});cursor=e;
    }
  }
  return out.filter((x,i)=>x.en&&(!i||x.en.toLowerCase()!==out[i-1].en.toLowerCase())).slice(0,2500);
}
async function fetchRemoteTranscript(videoId){
  // Primary browser-safe source: structured public transcript endpoint.
  try{
    const u='https://api.freetranscriptapi.com/v1/transcript?video_url='+encodeURIComponent(videoId)+'&lang=en';
    const r=await fetch(u,{cache:'no-store',headers:{'Accept':'application/json'}});
    if(r.ok){
      const data=await r.json();
      const raw=Array.isArray(data?.transcript)?data.transcript:[];
      const rows=raw.map(x=>{
        const start=Number(x?.start??x?.offset??x?.startMs/1000??0)||0;
        const duration=Number(x?.duration??x?.durationMs/1000??0)||0;
        return {start,end:start+Math.max(.6,duration),en:String(x?.text??x?.en??'').trim(),zh:''};
      }).filter(x=>x.en);
      if(rows.length>=8&&rows.reduce((n,x)=>n+x.en.length,0)>=180)return rows;
    }
  }catch{}
  // Secondary no-key mirror.
  for(const url of [
    'https://youtube-transcript.ai/transcript/'+encodeURIComponent(videoId)+'.txt?lang=en',
    'https://youtube-transcript.ai/transcript/'+encodeURIComponent(videoId)+'.txt'
  ]){
    try{
      const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;
      const rows=parseRemoteTranscript(await r.text());
      if(rows.length>=8&&rows.reduce((n,x)=>n+x.en.length,0)>=180)return rows;
    }catch{}
  }
  return [];
}
function refreshSubtitleList(index=null){
  const v=selectedVideo(),list=document.querySelector('.subtitle-list');if(!v||!list)return;
  list.innerHTML=subtitleHTML(v,index);
}
async function hydrateTranscript(v){
  if(!v?.id)return;
  const cached=loadTranscriptCache(v.id);
  const current=Array.isArray(v.transcript)?v.transcript:[];
  if(cached.length>=8&&cached.reduce((n,x)=>n+String(x.en||'').length,0)>=180){
    v.transcript=cached;refreshSubtitleList();translateMissingSubtitles(v);return;
  }
  if(current.length>=8&&current.reduce((n,x)=>n+String(x.en||'').length,0)>=180){translateMissingSubtitles(v);return;}
  if(transcriptHydrationJobs[v.id])return transcriptHydrationJobs[v.id];
  transcriptHydrationJobs[v.id]=(async()=>{
    const rows=await fetchRemoteTranscript(v.id);if(!rows.length)return;
    v.transcript=rows;v.captions='available';v.captionLanguage='en';v.captionQuality='runtime-verified';
    saveTranscriptCache(v.id,rows);refreshSubtitleList();await translateMissingSubtitles(v);
  })().finally(()=>{delete transcriptHydrationJobs[v.id];});
  return transcriptHydrationJobs[v.id];
}
const subtitleTranslationJobs={};
function subtitleTranslationCache(videoId){
  try{return JSON.parse(localStorage.getItem('sanmu-zh-subtitles-'+videoId)||'{}')||{};}catch{return {};}
}
function saveSubtitleTranslationCache(videoId,cache){
  try{localStorage.setItem('sanmu-zh-subtitles-'+videoId,JSON.stringify(cache));}catch{}
}
async function translateSubtitleLine(text){
  const q=String(text||'').trim(); if(!q)return '';
  const urls=[
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(q),
    'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-TW&q='+encodeURIComponent(q)
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{cache:'no-store',headers:{'Accept':'application/json'}});
      if(!r.ok)continue;
      const data=await r.json();
      const text1=(data?.[0]||[]).map(x=>Array.isArray(x)?(x[0]||''):'').join('').trim();
      const text2=Array.isArray(data)?String(data?.[0]||'').trim():'';
      const out=text1||text2;
      if(out)return out;
    }catch{}
  }
  return '';
}
async function translateMissingSubtitles(v){
  if(!v?.id||!Array.isArray(v.transcript)||!v.transcript.length)return;
  if(subtitleTranslationJobs[v.id])return subtitleTranslationJobs[v.id];
  subtitleTranslationJobs[v.id]=(async()=>{
    const cache=subtitleTranslationCache(v.id);
    let changed=false;
    // Translate in small batches so the first visible sentences appear quickly.
    for(let start=0;start<v.transcript.length;start+=8){
      const batch=v.transcript.slice(start,start+8);
      await Promise.all(batch.map(async(seg,localIndex)=>{
        const i=start+localIndex,en=String(seg.en||'').trim();
        if(!en)return;
        if(!String(seg.zh||'').trim() && cache[i]){seg.zh=cache[i];changed=true;return;}
        if(String(seg.zh||'').trim())return;
        const zh=await translateSubtitleLine(en);
        if(zh){seg.zh=zh;cache[i]=zh;changed=true;
          const node=document.querySelector('.subtitle-list .segment[data-index="'+i+'"] .zh');
          if(node)node.textContent=zh;
        }
      }));
      if(changed)saveSubtitleTranslationCache(v.id,cache);
      await new Promise(r=>setTimeout(r,120));
    }
    refreshSubtitleList();
  })().finally(()=>{delete subtitleTranslationJobs[v.id];});
  return subtitleTranslationJobs[v.id];
}

function subtitleHTML(v,index=null){
  const segs=v?.transcript||[];
  if(!segs.length)return '<div class="empty"><b>這部影片的完整字幕正在整理中</b><p>系統會先取得完整英文字幕，再逐句建立中文翻譯；沒有完整字幕的影片不列入正式學習庫。</p></div>';
  const i=index===null?Math.max(0,lastSubtitleIndex>=0?lastSubtitleIndex:0):Math.max(0,Math.min(Number(index)||0,segs.length-1));
  const x=segs[i]||{}, zh=String(x.zh||'').trim(), en=String(x.en||'').trim();
  const zhHtml=state.transcriptTab!=='english'?'<div class="zh">'+esc(zh||'翻譯整理中…')+'</div>':'';
  const enHtml=state.transcriptTab!=='chinese'?'<div class="en">'+clickableSentence(en,v.id)+'</div>':'';
  return '<div class="segment active live-segment" data-index="'+i+'" onclick="seek('+(Number(x.start)||0)+')"><div class="time">'+fmt(x.start)+' · sentence '+(i+1)+'</div>'+zhHtml+enHtml+'</div>';
}
function watch(){
  const v=selectedVideo();
  if(!v)return '<div class="empty">找不到影片。</div>';
  markHistory(v);
  setTimeout(()=>hydrateTranscript(v),80);
  const scale=state.subtitleSize||100;
  const offset=Number(state.subtitleOffset)||0;
  const rate=Number(state.subtitleRate)||1;
  const loopOn=!!sentenceLoopTimer;
  return `<div class="watch-page">
    <div class="player-card">
      <div class="player"><iframe id="yt" src="${ytEmbed(v.id)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>

      <div class="watch-toolbar watch-toolbar-main">
        <div class="toolbar-segment speed-group">
          <span class="tool-label">速度</span>
          <button data-speed="0.25" onclick="setSpeed(.25)">0.25×</button>
          <button data-speed="0.5" onclick="setSpeed(.5)">0.5×</button>
          <button data-speed="0.75" onclick="setSpeed(.75)">0.75×</button>
          <button data-speed="1" class="active" onclick="setSpeed(1)">原速 1.0×</button>
          <button data-speed="1.25" onclick="setSpeed(1.25)">1.25×</button>
          <button data-speed="1.5" onclick="setSpeed(1.5)">1.5×</button>
          <span class="current-speed">目前 ${state.speed||1}×</span>
        </div>
        <button class="watch-action" onclick="replaySentence()">↶ 單句重播</button>
        <button class="watch-action ${loopOn?'active':''}" onclick="toggleSentenceLoop()">↻ ${loopOn?'循環播放中':'循環播放'}</button>
        <button class="toolbar-favorite" onclick="toggleFav('${v.id}')">♡ 收藏影片</button>
      </div>

      <div class="video-title-strip">
        <h1>${esc(v.title)}</h1>
        <p class="title-zh">${esc(titleZh(v))}</p>
        <p class="watch-meta">${esc(v.channel)} ・ ${esc(v.duration||'')} ・ 難易度 ${esc(difficultyLabel(v.cefr))}</p>
      </div>

      <div class="watch-toolbar watch-toolbar-subtitle">
        <div class="toolbar-segment">
          <span class="tool-label">字幕顯示</span>
          <button class="${state.transcriptTab==='bilingual'?'active':''}" onclick="setTab('bilingual')">中英</button>
          <button class="${state.transcriptTab==='english'?'active':''}" onclick="setTab('english')">英文</button>
          <button class="${state.transcriptTab==='chinese'?'active':''}" onclick="setTab('chinese')">中文</button>
        </div>
        <div class="toolbar-segment">
          <span class="tool-label">字幕同步</span>
          <button class="subtitle-offset-btn ${offset===-2?'active':''}" onclick="setSubtitleOffset(-2)">提前</button>
          <button class="subtitle-offset-btn ${offset===-1?'active':''}" onclick="setSubtitleOffset(-1)">提前1秒</button>
          <button class="subtitle-offset-btn ${offset===0?'active':''}" onclick="setSubtitleOffset(0)">預設</button>
          <button class="subtitle-offset-btn ${offset===1?'active':''}" onclick="setSubtitleOffset(1)">延後1秒</button>
          <button class="subtitle-offset-btn ${offset===2?'active':''}" onclick="setSubtitleOffset(2)">延後</button>
        </div>
        <div class="toolbar-segment">
          <span class="tool-label">字幕速度</span>
          <button class="subtitle-rate-btn ${rate===0.9?'active':''}" onclick="setSubtitleRate(.9)">0.9×</button>
          <button class="subtitle-rate-btn ${rate===0.95?'active':''}" onclick="setSubtitleRate(.95)">0.95×</button>
          <button class="subtitle-rate-btn ${rate===1?'active':''}" onclick="setSubtitleRate(1)">1×</button>
          <button class="subtitle-rate-btn ${rate===1.05?'active':''}" onclick="setSubtitleRate(1.05)">1.05×</button>
          <button class="subtitle-rate-btn ${rate===1.1?'active':''}" onclick="setSubtitleRate(1.1)">1.1×</button>
        </div>
        <div class="toolbar-segment">
          <span class="tool-label">字幕大小</span>
          <button class="subtitle-scale-btn ${scale===75?'active':''}" onclick="setSubtitleSize(75)">75%</button>
          <button class="subtitle-scale-btn ${scale===100?'active':''}" onclick="setSubtitleSize(100)">100%</button>
          <button class="subtitle-scale-btn ${scale===125?'active':''}" onclick="setSubtitleSize(125)">125%</button>
          <button class="subtitle-scale-btn ${scale===150?'active':''}" onclick="setSubtitleSize(150)">150%</button>
          <button class="subtitle-scale-btn ${scale===200?'active':''}" onclick="setSubtitleSize(200)">200%</button>
        </div>
      </div>

      <div class="subtitle-workarea">
        <div class="subtitle-list" data-scale="${scale}">${subtitleHTML(v)}</div>
      </div>
    </div>
  </div>`;
}
function ytEmbed(id){return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&rel=0&playsinline=1&hl=zh-TW&cc_load_policy=1&cc_lang_pref=en&modestbranding=1`}

function grammar(){
  const done=Object.values(prog()).filter(Boolean).length;
  return `<div class="section-head"><div><h2>英文文法 · 30 章 / 150 微課</h2><p>以主流英文文法教材常見的由基礎到進階 progression 重組：句型 → 時態 → 冠詞 → 從句 → 高階文法。每課都有示範句型、例句與練習。</p></div><span class="count-pill">${done}/150</span></div>
  <div class="overview-progress"><strong>${done} / 150 課</strong><div><i style="width:${Math.min(100,done/1.5)}%"></i></div></div>
  <div class="chapter-grid">${lessons.chapters.map(c=>{
    const ms=lessons.microLessons.filter(m=>m.chapter_id===c.id);
    return `<article class="chapter"><div class="chapter-head"><h3>${c.id}. ${esc(c.title_zh)}</h3><span>${esc(c.cefr)}</span></div><p>${esc(c.title_en)} · ${esc(c.chapter_note||'')}</p><div class="micro-list">${ms.map(m=>`<button class="micro-btn ${prog()[m.lesson_id]?'done':''}" onclick="go('lesson','${m.lesson_id}')"><span>${m.lesson_id.split('-')[1]}</span>${esc(m.title_zh)}<i>→</i></button>`).join('')}</div><div class="chapter-practice-note">${esc(c.chapter_practice||'')}</div></article>`;
  }).join('')}</div>`;
}

function lesson(){
  const l=lessons.microLessons.find(x=>x.lesson_id===state.selectedLesson);
  if(!l)return '<div class="empty">找不到微課。</div>';
  const done=!!prog()[l.lesson_id];
  const answers=getPracticeAnswers(l.lesson_id);
  return `<div class="lesson-page">
    <div class="section-head"><div><div class="eyebrow">MICRO LESSON ${esc(l.lesson_id)}</div><h2>${esc(l.title_zh)}</h2><p>${esc(l.cefr)} ・ ${esc(l.title_en)}</p></div><span class="count-pill">${done?'已完成':'未完成'}</span></div>
    <div class="lesson-grid">
      <div class="panel big-copy"><h3>① 觀念</h3><p>${esc(l.explanation)}</p></div>
      <div class="panel big-copy"><h3>② 示範句型</h3><div class="formula">${esc(l.pattern)}</div><div class="example-set">${l.examples.map(e=>`<p class="example">${esc(e)} <button onclick="speak(${JSON.stringify(e)},'en-US')">🔊</button></p>`).join('')}</div></div>
      <div class="panel big-copy"><h3>③ 常見錯誤</h3>${l.common_errors.map(e=>`<p>⚠ ${esc(e)}</p>`).join('')}</div>
      <div class="panel big-copy"><h3>④ Contrast</h3>${l.contrast.map(e=>`<p>${esc(e)}</p>`).join('')}</div>
      <div class="panel big-copy"><h3>⑤ 微練習</h3>${l.practice.map((e,i)=>`<p>${i+1}. ${esc(e)}</p>`).join('')}</div>
      <div class="panel big-copy"><h3>⑥ 互動題</h3>${(l.practice_items||[]).map((item,i)=>`<div class="micro-practice"><b>${i+1}. ${esc(item.prompt)}</b><div class="practice-options">${item.options.map((o,j)=>`<button class="${answers[i]!==undefined?(j===item.answer?'correct':answers[i]===j?'wrong':'') : ''}" onclick="answerMicroPractice('${l.lesson_id}',${i},${j})">${String.fromCharCode(65+j)}. ${esc(o)}</button>`).join('')}</div>${practiceResultHtml(l.lesson_id,i,item)}</div>`).join('')}</div>
    </div>
    <div class="lesson-actions"><button onclick="go('grammar')">← 回到 30 章</button><button class="primary" onclick="toggleLesson('${l.lesson_id}')">${done?'取消完成':'完成本微課'}</button><button onclick="go('quiz')">做分級測驗 →</button></div>
    </div>`;
}

function quiz(){
  const bands=Object.keys(toeic.bands||{});
  const band=toeic.bands[state.quizBand]||toeic.bands['400-600'];
  const questions=band.questions||[];
  const idx=Math.min(state.quizIndex,Math.max(0,questions.length-1));
  const q=questions[idx]||{};
  const answered=state.quizAnswers[state.quizBand]?.[idx]!==undefined;
  const score=Object.values(state.quizAnswers[state.quizBand]||{}).filter((a,i)=>a===questions[i]?.answer).length;
  return `<div class="quiz-page">
    <div class="section-head"><div><h2>多益分級練習 · 20 題</h2><p>題目為三木Eng原創練習，依 ETS 公開 TOEIC 題型與能力描述設計；這些級距是訓練分級，不是官方分數換算。</p></div><span class="count-pill">${idx+1} / ${questions.length} ・ ${score} 分</span></div>
    <div class="band-grid">${bands.map(b=>`<button class="band-card ${state.quizBand===b?'active':''}" onclick="state.quizBand='${b}';state.quizIndex=0;renderMain()"><strong>${esc(toeic.bands[b].label)}</strong><small>${esc(toeic.bands[b].description)}</small></button>`).join('')}</div>
    <div class="quiz-card">
      <div class="quiz-meta"><span>${esc(q.part||'Part 5')}</span><span>${esc(q.skill||'')}</span><span>${esc(q.difficulty||'')}</span></div>
      <h3>${esc(q.prompt||'')}</h3>
      <div class="answers">${(q.options||[]).map((o,i)=>`<button class="answer ${answered&&i===q.answer?'correct':''} ${answered&&state.quizAnswers[state.quizBand][idx]===i&&i!==q.answer?'wrong':''}" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div>
      ${answered?`<div class="quiz-explain"><strong>${state.quizAnswers[state.quizBand][idx]===q.answer?'答對':'需要訂正'}</strong><p>${esc(q.explanation||'')}</p><button class="primary" onclick="nextQuiz()">${idx===questions.length-1?'重新開始':'下一題'}</button></div>`:''}
    </div>
  </div>`;
}

function practiceReleaseCheck(){
  const errors=[];
  if((lessons.chapters||[]).length!==30) errors.push('grammar chapters');
  if((lessons.microLessons||[]).length!==150) errors.push('micro lessons');
  for(const [id,b] of Object.entries(toeic.bands||{})) if((b.questions||[]).length!==20) errors.push(`TOEIC ${id}`);
  return errors;
}

/* override URL-aware shell and the input handlers */
window.handleSearchKey=handleSearchKey;
window.setSubtitleScale=setSubtitleScale;
window.answerMicroPractice=answerMicroPractice;

if(window.speechSynthesis){ window.speechSynthesis.addEventListener('voiceschanged',()=>window.speechSynthesis.getVoices()); setTimeout(()=>window.speechSynthesis.getVoices(),300); }
boot().catch(err=>console.error('[三木Eng] startup error',err));
