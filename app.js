const $=(s)=>document.querySelector(s);
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(n)=>Math.round((Number(n)||0)*100)+'%';
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const state={route:'learning',selectedVideo:null,selectedLesson:null,search:'',category:'all',subcategory:'all',level:'all',caption:'all',transcriptTab:'bilingual',subtitleSize:100,speed:1,subtitleOffset:0,subtitleRate:1,word:null,sidebarCollapsed:false,quizBand:'400-600',quizIndex:0,quizAnswers:{}};
let catalog={videos:[]},taxonomy={categories:[]},lessons={chapters:[],microLessons:[]},toeic={bands:{}},wordBank={words:{}},learningUnits={units:{}};
let ytPlayer=null,ytTimer=null,categoryModalOpen=false;

async function boot(){
  const files=await Promise.all(['catalog','taxonomy','lessons','toeic','word-bank','learning-units'].map(x=>fetch('data/'+x+'.json',{cache:'no-store'}).then(r=>r.json())));
  [catalog,taxonomy,lessons,toeic,wordBank,learningUnits]=files;
  state.sidebarCollapsed=load('evl-sidebar-collapsed',false);state.subtitleOffset=Number(load('sanmu-subtitle-offset',0))||0;state.subtitleRate=Number(load('sanmu-subtitle-rate',1))||1;
  parseHash();
}
function parseHash(){const p=location.hash.slice(1).split('/');state.route=p[0]||'learning';state.selectedVideo=state.route==='watch'?decodeURIComponent(p[1]||''):null;state.selectedLesson=state.route==='lesson'?decodeURIComponent(p[1]||''):null;if(state.route==='watch'&&!['english','bilingual','chinese'].includes(state.transcriptTab))state.transcriptTab='bilingual';if(history.scrollRestoration)history.scrollRestoration='manual';requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));render();}
function go(route,id=''){location.hash=id?route+'/'+encodeURIComponent(id):route;}
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
    const ad=Date.parse(a.v.published||'')||0,bd=Date.parse(b.v.published||'')||0;
    if(ad!==bd)return bd-ad;
    const an=Date.parse(a.v.discoveredAt||a.v.addedAt||'')||0,bn=Date.parse(b.v.discoveredAt||b.v.addedAt||'')||0;
    if(an!==bn)return bn-an;
    return a.i-b.i;
  }).map(x=>x.v);
}
function filteredVideos(){
  const q=state.search.trim().toLowerCase();
  return latestVideos().filter(v=>{
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
<header class="topbar"><a class="brand" href="#learning"><img src="assets/logo.png" alt="三木Eng"></a><div class="search"><input value="${esc(state.search)}" oninput="updateSearch(this.value)" placeholder="搜尋影片、主題、單字、頻道…"></div><div class="top-actions"><button onclick="go('learning')">影片學習</button></div></header>
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
  return `<article class="video-card" onclick="go('watch','${v.id}')">
    <div class="thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt=""><span class="grade">${esc(difficultyLabel(v.cefr))}</span><span class="duration">${esc(v.duration||'')}</span></div>
    <div class="video-info"><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p><div class="chips"><span>EN ${pct(v.englishScore)}</span><span>${esc(v.subcategory||v.category||'')}</span><span>${v.translation==='available'?'中譯已備妥':'中譯待補'}</span></div></div>
  </article>`;
}
function explore(){
  const vs=filteredVideos();
  const difficultyOptions=[['all','全部難易度'],['A1','初級'],['A2','初中級'],['B1','中級'],['B2','中高級'],['C1','高級'],['C2','特高級']];
  return `<section class="latest-page">
    <div class="latest-banner">
      <div><span class="latest-kicker">VIDEO LEARNING</span><h1>最新影片</h1><p>依更新時間排列，直接進入影片學習。</p></div>
      <span class="count-pill">${vs.length} 部</span>
    </div>
    <div class="filters">
      <select aria-label="分類" onchange="state.category=this.value;renderMain()"><option value="all">全部分類</option>${taxonomy.categories.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
      <select aria-label="難易度" onchange="state.level=this.value;renderMain()">${difficultyOptions.map(x=>`<option value="${x[0]}" ${state.level===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>
      <select aria-label="字幕" onchange="state.caption=this.value;renderMain()"><option value="all">全部字幕狀態</option><option value="ready" ${state.caption==='ready'?'selected':''}>英文字幕已驗證</option><option value="pending" ${state.caption==='pending'?'selected':''}>字幕待補</option></select>
    </div>
    <div class="results-meta">英文語言驗證 ・ 字幕驗證 ・ 難易度 ・ 13 大類分類 ・ 去重</div>
    <div class="video-grid">${vs.map(videoCard).join('')||'<div class="empty">目前沒有符合條件的影片。</div>'}</div>
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
  const key=String(word||'').trim().toLowerCase();
  if(!key)return;
  let zh='',gloss='',phoneticUk='',phoneticUs='',audioUk='',audioUs='',pos='';
  try{
    const tr=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(key));
    if(tr.ok){
      const data=await tr.json();
      zh=(data?.[0]||[]).map(x=>x?.[0]||'').join('').trim();
    }
  }catch{}
  try{
    const dr=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(key));
    if(dr.ok){
      const data=await dr.json();
      const entries=Array.isArray(data)?data:[];
      const e=entries[0]||{};
      pos=e?.meanings?.[0]?.partOfSpeech||'';
      gloss=(e?.meanings||[]).flatMap(m=>m.definitions||[]).slice(0,3).map(d=>d.definition).filter(Boolean).join('；');
      const phs=(e?.phonetics||[]).filter(p=>p?.text||p?.audio);
      const us=phs.find(p=>/us/i.test(String(p.audio||'')))||{};
      const uk=phs.find(p=>/uk|gb/i.test(String(p.audio||'')))||{};
      phoneticUs=us.text||phs[0]?.text||'';
      phoneticUk=uk.text||phs.find(p=>p?.text)?.text||'';
      audioUs=us.audio||phs.find(p=>p?.audio)?.audio||'';
      audioUk=uk.audio||phs.find(p=>p?.audio)?.audio||'';
    }
  }catch{}
  if(state.word&&String(state.word.word).toLowerCase()===key){
    state.word={...state.word,
      definition_zh:zh||state.word.definition_zh||'目前暫無中文解釋',
      gloss:gloss||state.word.gloss||'暫無英文定義',
      phonetic_uk:phoneticUk||state.word.phonetic_uk||'',
      phonetic_us:phoneticUs||state.word.phonetic_us||'',
      audio_uk:audioUk||state.word.audio_uk||'',
      audio_us:audioUs||state.word.audio_us||'',
      pos:pos||state.word.pos||''
    };
    render();
  }
}
function openWord(word,sourceVideoId='',sourceSentence=''){
  const info=wordBank.words?.[String(word).toLowerCase()]||{};
  state.word={word,sourceVideoId,sourceSentence,...info};
  render();
  if(!info.definition_zh||!info.gloss) enrichWord(word);
}
function closeWord(){state.word=null;render();}
let speechAudio=null;
let speechVoices=[];
function refreshSpeechVoices(){try{speechVoices=window.speechSynthesis?.getVoices?.()||[];}catch{speechVoices=[];}}
try{if(window.speechSynthesis){refreshSpeechVoices();window.speechSynthesis.onvoiceschanged=refreshSpeechVoices;}}catch{}
function accentVoice(locale){
  const target=String(locale||'en-US').toLowerCase().startsWith('en-gb')?'en-GB':'en-US';
  const voices=speechVoices.length?speechVoices:(window.speechSynthesis?.getVoices?.()||[]);
  if(target==='en-GB')return voices.find(v=>/^en-GB/i.test(v.lang||''))||voices.find(v=>/hazel|george|daniel|serena|kate|british|uk/i.test(v.name||''))||voices.find(v=>/^en/i.test(v.lang||''))||null;
  return voices.find(v=>/^en-US/i.test(v.lang||''))||voices.find(v=>/david|mark|zira|samantha|alex|aria|jenny|american|us/i.test(v.name||''))||voices.find(v=>/^en/i.test(v.lang||''))||null;
}
function stopSpeechAudio(){
  try{window.speechSynthesis?.cancel?.();}catch{}
  try{if(speechAudio){speechAudio.pause();speechAudio.removeAttribute('src');speechAudio.load();}}catch{}
  speechAudio=null;
}
function youdaoPronunciationUrl(word,locale){
  const type=String(locale||'en-US').toLowerCase().startsWith('en-gb')?'1':'2';
  return 'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(String(word||''))+'&type='+type;
}
function speak(text,locale){
  const value=String(text||'').trim();if(!value)return false;
  const target=String(locale||'en-US').toLowerCase().startsWith('en-gb')?'en-GB':'en-US';
  try{
    const synth=window.speechSynthesis;if(!synth)return false;
    synth.cancel();refreshSpeechVoices();
    const u=new SpeechSynthesisUtterance(value);u.lang=target;u.voice=accentVoice(target);u.rate=.88;u.pitch=1;u.volume=1;
    synth.speak(u);return true;
  }catch{return false;}
}
function playPronunciation(word,locale){
  const value=String(word||'').trim();if(!value)return;
  const target=String(locale||'en-US').toLowerCase().startsWith('en-gb')?'en-GB':'en-US';
  stopSpeechAudio();
  const url=youdaoPronunciationUrl(value,target);
  try{
    const audio=new Audio();speechAudio=audio;audio.preload='auto';audio.volume=1;
    audio.onended=()=>{if(speechAudio===audio)speechAudio=null;};
    audio.onerror=()=>{if(speechAudio!==audio)return;speechAudio=null;if(!speak(value,target))playGoogleTTS(value,target);};
    audio.src=url;
    const p=audio.play();
    if(p&&typeof p.catch==='function')p.catch(()=>{if(speechAudio===audio){speechAudio=null;if(!speak(value,target))playGoogleTTS(value,target);}});
  }catch{if(!speak(value,target))playGoogleTTS(value,target);}
}
async function playAudioUrl(url,fallbackText,target){playPronunciation(fallbackText,target);}
async function playGoogleTTS(value,target){
  const text=String(value||'').trim();if(!text)return false;
  try{
    stopSpeechAudio();
    const url='https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl='+encodeURIComponent(target)+'&q='+encodeURIComponent(text);
    const audio=new Audio(url);speechAudio=audio;audio.preload='auto';audio.volume=1;
    audio.onended=()=>{if(speechAudio===audio)speechAudio=null;};
    await audio.play();return true;
  }catch{return false;}
}


function addWord(){const w=state.word;if(!w)return;const v=vocab();v[String(w.word).toLowerCase()]={...w,addedAt:new Date().toISOString()};save('sanmu-vocab',v);render();}
function wordModal(){
  const w=state.word,fav=Object.keys(vocab()).includes(String(w.word).toLowerCase());
  return `<div class="modal-backdrop" onclick="closeWord()"><div class="word-modal" onclick="event.stopPropagation()">
    <div class="modal-head"><div><div class="word-title">${esc(w.word)}</div><div>${esc(w.pos||'')}</div></div><button onclick="closeWord()">×</button></div>
    <div class="pron-row">
      <span>英式 ${esc(w.phonetic_uk||'')}</span>
      <button onclick="playPronunciation(${JSON.stringify(w.word)},'en-GB')">🔊 英式發音</button>
      <span>美式 ${esc(w.phonetic_us||'')}</span>
      <button onclick="playPronunciation(${JSON.stringify(w.word)},'en-US')">🔊 美式發音</button>
    </div>
    <section><label>中文解釋</label><p>${esc(w.definition_zh||'正在取得中文解釋…')}</p></section>
    <section><label>English meaning</label><p>${esc(w.gloss||'正在取得英文解釋…')}</p></section>
    <section><label>例句</label><p>${esc(w.example||w.sourceSentence||'—')}</p><button class="secondary" onclick="speak(${JSON.stringify(w.example||w.sourceSentence||w.word)},'en-US')">🔊 例句</button></section>
    <button class="primary" onclick="addWord()">${fav?'♥ 已收藏':'♡ 收藏單字'}</button>
  </div></div>`;
}function grammar(){const done=Object.values(prog()).filter(Boolean).length;return `<div class="section-head"><div><h2>英文文法 · 30 章 / 150 微課</h2><p>Form → Meaning → Use → Contrast → Error；每課都有說明、句型、例句、常見錯誤與練習。</p></div><span class="count-pill">${done}/150</span></div><div class="overview-progress"><strong>${done} / 150 課</strong><div><i style="width:${done/1.5}%"></i></div></div><div class="chapter-grid">${lessons.chapters.map(c=>{const ms=lessons.microLessons.filter(m=>m.chapter_id===c[0]);return `<article class="chapter"><div class="chapter-head"><h3>${c[0]}. ${esc(c[1])}</h3><span>${esc(c[3]||'')}</span></div><p>${esc(c[2])}</p><div class="micro-list">${ms.map(m=>`<button class="micro-btn ${prog()[m.lesson_id]?'done':''}" onclick="go('lesson','${m.lesson_id}')"><span>${m.lesson_id.split('-')[1]}</span>${esc(m.title_zh)}<i>→</i></button>`).join('')}</div></article>`}).join('')}</div>`;}
function lesson(){const l=lessons.microLessons.find(x=>x.lesson_id===state.selectedLesson);if(!l)return '<div class="empty">找不到微課。</div>';const done=!!prog()[l.lesson_id];return `<div class="lesson-page"><div class="section-head"><div><div class="eyebrow">MICRO LESSON ${l.lesson_id}</div><h2>${esc(l.title_zh)}</h2><p>${esc(l.cefr)} ・ ${esc(l.title_en)}</p></div><span class="count-pill">${done?'已完成':'未完成'}</span></div><div class="lesson-grid"><div class="panel big-copy"><h3>① 觀念</h3><p>${esc(l.explanation)}</p></div><div class="panel big-copy"><h3>② 句型</h3><div class="formula">${esc(l.pattern)}</div></div><div class="panel big-copy"><h3>③ 例句</h3>${l.examples.map(e=>`<p class="example">${esc(e)} <button onclick="speak(${JSON.stringify(e)},'en-US')">🔊</button></p>`).join('')}</div><div class="panel big-copy"><h3>④ 常見錯誤</h3>${l.common_errors.map(e=>`<p>⚠ ${esc(e)}</p>`).join('')}</div><div class="panel big-copy"><h3>⑤ Contrast</h3>${l.contrast.map(e=>`<p>${esc(e)}</p>`).join('')}</div><div class="panel big-copy"><h3>⑥ 微練習</h3>${l.practice.map((e,i)=>`<p>${i+1}. ${esc(e)}</p>`).join('')}<div class="tip">Mastery tip：${esc(l.mastery_tip)}</div></div></div><div class="lesson-actions"><button onclick="go('grammar')">← 回到 30 章</button><button class="primary" onclick="toggleLesson('${l.lesson_id}')">${done?'取消完成':'完成本微課'}</button><button onclick="go('quiz')">做分級測驗 →</button></div></div>`;}
function toggleLesson(id){const p=prog();p[id]=!p[id];save('sanmu-lessons',p);render();}
function quiz(){const bands=Object.keys(toeic.bands||{}),band=toeic.bands[state.quizBand]||toeic.bands['400-600'],q=(band.questions||[])[state.quizIndex]||band.questions[0],answered=state.quizAnswers[state.quizBand]?.[state.quizIndex]!==undefined;return `<div class="quiz-page"><div class="section-head"><div><h2>多益分級練習 · 20 題</h2><p>依目標分數帶選題：400分以下、400–600、600–800、800–990。</p></div><span class="count-pill">第 ${state.quizIndex+1} / 20 題</span></div><div class="band-grid">${bands.map(b=>`<button class="band-card ${state.quizBand===b?'active':''}" onclick="state.quizBand='${b}';state.quizIndex=0;state.quizAnswers={};renderMain()"><strong>${esc(toeic.bands[b].label)}</strong><small>${esc(toeic.bands[b].description)}</small></button>`).join('')}</div><div class="quiz-card"><h3>${esc(q.prompt)}</h3><div class="answers">${q.options.map((o,i)=>`<button class="answer ${answered&&i===q.answer?'correct':''} ${answered&&state.quizAnswers[state.quizBand][state.quizIndex]===i&&i!==q.answer?'wrong':''}" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div>${answered?`<div class="quiz-explain"><strong>${state.quizAnswers[state.quizBand][state.quizIndex]===q.answer?'答對了':'再想一次'}</strong><p>${esc(q.explanation)}</p><button class="primary" onclick="nextQuiz()">${state.quizIndex===19?'完成':'下一題'}</button></div>`:''}</div></div>`;}
function answerQuiz(i){if(!state.quizAnswers[state.quizBand])state.quizAnswers[state.quizBand]={};state.quizAnswers[state.quizBand][state.quizIndex]=i;renderMain();}
function nextQuiz(){state.quizIndex=state.quizIndex>=19?0:state.quizIndex+1;renderMain();}
function listPage(title,items){return `<div class="section-head"><div><h2>${title}</h2><p>你的個人學習資料儲存在瀏覽器本機。</p></div></div><div class="video-grid">${items.map(videoCard).join('')||'<div class="empty">目前沒有資料。</div>'}</div>`;}
function vocabularyPage(){const items=Object.values(vocab());return `<div class="section-head"><div><h2>我的單字庫</h2><p>從字幕點擊單字後可收藏；支援英式 / 美式發音。</p></div><span class="count-pill">${items.length} 字</span></div><div class="vocab-grid">${items.map(w=>`<div class="vocab-card"><div><strong>${esc(w.word)}</strong><small>${esc(w.pos||'')}</small></div><p>${esc(w.definition_zh||'')}</p><button onclick='openWord(${JSON.stringify(w.word)},${JSON.stringify(w.sourceVideoId||'')},${JSON.stringify(w.sourceSentence||'')})'>查看</button></div>`).join('')||'<div class="empty">尚未收藏單字。</div>'}</div>`;}
function engine(){const s=catalog.stats||{};return `<div class="section-head"><div><h2>影片探索引擎</h2><p>候選搜尋 → 語言辨識 → 字幕 A/B/C → AI CEFR / 分類 → 去重 → 翻譯 → 學習單元。</p></div><span class="count-pill">13 類・${taxonomy.totalSubcategories} 子類</span></div><div class="engine-grid"><div class="panel pipeline"><h3>Continuous Discovery</h3><div>${[['大量搜尋','每次 32 個 query、雙頁候選'],['語言閘門','English / Multilingual / confidence'],['字幕','A → B → C fallback'],['分類','AI 13 大類 / 子類'],['難度','A1–C2 CEFR'],['去重','ID / fingerprint / embedding'],['翻譯','batch → sentence → context'],['學習單元','Vocabulary / Phrases / Grammar / Questions']].map((x,i)=>`<div class="stage"><b>${i+1}. ${x[0]}</b><p>${x[1]}</p></div>`).join('')}</div></div><div class="panel"><h3>目前資料</h3><div class="metric-grid"><div><b>${s.accepted||catalog.videos.length}</b><small>收錄</small></div><div><b>${s.candidates||0}</b><small>候選</small></div><div><b>${s.review||0}</b><small>待審</small></div><div><b>${catalog.translationStats?.translated||0}</b><small>已翻句</small></div></div><p class="engine-note">真正大量增加影片需要 GitHub Actions 取得 YOUTUBE_API_KEY 與 OPENAI_API_KEY 後自動執行。</p></div></div>`;}
window.toggleSidebar=toggleSidebar;window.openCategoryModal=openCategoryModal;window.closeCategoryModal=closeCategoryModal;window.chooseCategory=chooseCategory;window.go=go;window.updateSearch=updateSearch;window.renderMain=renderMain;window.setSpeed=setSpeed;window.setSubtitleSize=setSubtitleSize;window.setTab=setTab;window.seek=seek;window.toggleFav=toggleFav;window.openWord=openWord;window.closeWord=closeWord;window.speak=speak;window.addWord=addWord;window.answerQuiz=answerQuiz;window.nextQuiz=nextQuiz;window.toggleLesson=toggleLesson;


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
  if(e.key!=='Enter') return;
  const id=extractYouTubeId(value);
  if(id){
    state.search='';
    go('watch',id);
  }
}

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
  const v=selectedVideo(); const seg=v?.transcript||[]; const nodes=document.querySelectorAll('.segment');
  if(!seg.length||!nodes.length)return;
  // Apply a constant user-controlled caption offset. Positive means captions are delayed.
  const adjusted=t-(Number(state.subtitleOffset)||0);
  let idx=-1;
  for(let i=0;i<seg.length;i++){
    const a=Number(seg[i].start)||0;
    const b=Number(seg[i].end);
    const end=Number.isFinite(b)&&b>a?b:(Number(seg[i+1]?.start)||a+6);
    if(adjusted>=a&&adjusted<end){idx=i;break;}
  }
  if(idx<0&&adjusted>=Number(seg[seg.length-1]?.start||0))idx=seg.length-1;
  nodes.forEach((el,i)=>el.classList.toggle('active',i===idx));
  if(idx!==lastSubtitleIndex && idx>=0){
    const active=nodes[idx];
    active?.scrollIntoView?.({behavior:'smooth',block:'center'});
    lastSubtitleIndex=idx;
  }
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
function setTab(t){state.transcriptTab=t;const v=selectedVideo();const list=$('.subtitle-list');if(list)list.innerHTML=subtitleHTML(v);document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.textContent.trim()===(t==='english'?'英文':t==='bilingual'?'中英':'中文')));}
const subtitleTranslationJobs={};
function subtitleTranslationCache(videoId){
  try{return JSON.parse(localStorage.getItem('sanmu-zh-subtitles-'+videoId)||'{}')||{};}catch{return {};}
}
function saveSubtitleTranslationCache(videoId,cache){
  try{localStorage.setItem('sanmu-zh-subtitles-'+videoId,JSON.stringify(cache));}catch{}
}
async function translateSubtitleLine(text){
  const q=String(text||'').trim(); if(!q)return '';
  try{
    const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(q));
    if(r.ok){
      const data=await r.json();
      return (data?.[0]||[]).map(x=>x?.[0]||'').join('').trim();
    }
  }catch{}
  return '';
}
async function translateMissingSubtitles(v){
  if(!v?.id||!Array.isArray(v.transcript)||!v.transcript.length)return;
  if(subtitleTranslationJobs[v.id])return subtitleTranslationJobs[v.id];
  subtitleTranslationJobs[v.id]=(async()=>{
    const cache=subtitleTranslationCache(v.id);
    let changed=false;
    for(let i=0;i<v.transcript.length;i++){
      const seg=v.transcript[i], en=String(seg.en||'').trim();
      if(!en)continue;
      if(!String(seg.zh||'').trim() && cache[i]){seg.zh=cache[i];changed=true;continue;}
      if(String(seg.zh||'').trim())continue;
      const zh=await translateSubtitleLine(en);
      if(zh){seg.zh=zh;cache[i]=zh;changed=true;
        const node=document.querySelector('.subtitle-list .segment[data-index="'+i+'"] .zh');
        if(node)node.textContent=zh;
      }
    }
    if(changed)saveSubtitleTranslationCache(v.id,cache);
  })().finally(()=>{delete subtitleTranslationJobs[v.id];});
  return subtitleTranslationJobs[v.id];
}

function subtitleHTML(v){
  const segs=v?.transcript||[];
  if(!segs.length)return '<div class="empty"><b>這部影片的完整字幕正在整理中</b><p>系統會先取得完整英文字幕，再逐句建立中文翻譯；沒有完整字幕的影片不列入正式學習庫。</p></div>';
  return segs.map((x,i)=>{const zh=String(x.zh||'').trim();const en=String(x.en||'').trim();return `<div class="segment" data-index="${i}" onclick="seek(${Number(x.start)||0})"><div class="time">${fmt(x.start)} · sentence ${i+1}</div>${state.transcriptTab!=='english'?`<div class="zh">${esc(zh||'翻譯整理中…')}</div>`:''}${state.transcriptTab!=='chinese'?`<div class="en">${clickableSentence(en,v.id)}</div>`:''}</div>`}).join('');
}
function watch(){
  const v=selectedVideo();
  if(!v)return '<div class="empty">找不到影片。</div>';
  markHistory(v);
  setTimeout(()=>translateMissingSubtitles(v),60);
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
boot();
