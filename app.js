const state = {
  route: 'learning',
  selectedVideo: null,
  selectedLesson: null,
  search: '',
  category: 'all',
  subcategory: 'all',
  level: 'all',
  caption: 'all',
  speed: 1,
  transcriptTab: 'bilingual',
  subtitleSize: 17,
  quizBand: '400-600',
  quizSet: [],
  quizIndex: 0,
  quizScore: 0,
  quizAnswered: false,
  quizSelected: null,
  word: null
};

let catalog = {videos:[]},
    taxonomy = {categories:[]},
    lessons = {chapters:[], microLessons:[]},
    learningUnits = {units:{}},
    wordBank = {words:{}},
    toeic = {bands:{}};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = n => `${Math.round((Number(n)||0)*100)}%`;
const save = (k,v) => localStorage.setItem(k,JSON.stringify(v));
const load = (k,d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const localDate = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` };

async function boot(){
  const results = await Promise.allSettled([
    fetch('data/catalog.json').then(r=>r.json()),
    fetch('data/taxonomy.json').then(r=>r.json()),
    fetch('data/lessons.json').then(r=>r.json()),
    fetch('data/learning-units.json').then(r=>r.json()),
    fetch('data/word-bank.json').then(r=>r.json()),
    fetch('data/toeic.json').then(r=>r.json())
  ]);
  catalog = results[0].status==='fulfilled' ? results[0].value : {videos:[]};
  taxonomy = results[1].status==='fulfilled' ? results[1].value : {categories:[]};
  lessons = results[2].status==='fulfilled' ? results[2].value : {chapters:[],microLessons:[]};
  learningUnits = results[3].status==='fulfilled' ? results[3].value : {units:{}};
  wordBank = results[4].status==='fulfilled' ? results[4].value : {words:{}};
  toeic = results[5].status==='fulfilled' ? results[5].value : {bands:{}};
  window.addEventListener('hashchange', parseHash);
  if (speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
  parseHash();
}
function parseHash(){
  const h=location.hash.slice(1)||'learning';
  const parts=h.split('/');
  state.route=parts[0]||'learning';
  state.selectedVideo=state.route==='watch'?parts[1]||null:null;
  state.selectedLesson=state.route==='lesson'?parts[1]||null:null;
  if(state.route==='watch' && !['english','bilingual','chinese'].includes(state.transcriptTab)) state.transcriptTab='bilingual';
  window.scrollTo({top:0,behavior:'smooth'});
  render();
}
function go(route,id=''){ location.hash=id ? `${route}/${encodeURIComponent(id)}` : route; }
function updateSearch(v){state.search=v;renderMain();}
function sidebarProgress(){return Object.values(load('evl-micro-progress',{})).filter(Boolean).length;}
function favoriteIds(){return load('evl-favorites',[]);}
function historyItems(){return load('evl-history',[]);}
function vocabItems(){return load('evl-vocab',{});}
function dailyStats(){const today=localDate(),d=load('evl-daily',{});return d.date===today?d:{date:today,sessions:0,minutes:0,sentences:0};}

function shell(main){
  const cats=taxonomy.categories||[], daily=dailyStats(), gDone=sidebarProgress(), fav=favoriteIds().length, hist=historyItems().length, words=Object.keys(vocabItems()).length;
  return `<div class="app">
    <header class="topbar">
      <a class="brand" href="#learning"><img class="brand-logo" src="assets/logo.png" alt="三木Eng｜影音・文法・多益"></a>
      <div class="search"><input value="${esc(state.search)}" oninput="updateSearch(this.value)" placeholder="搜尋影片、主題、單字、頻道…"></div>
      <div class="nav-actions"><button class="nav-btn ${state.route==='engine'?'active':''}" onclick="go('engine')">探索引擎</button><button class="nav-btn" onclick="go('learning')">影片學習</button></div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-primary">
          <button class="side-hero ${['learning','home','watch'].includes(state.route)?'active':''}" onclick="go('learning')"><span class="side-icon play">▶</span><span><b>影片學習</b><small>每日累加與雙語字幕</small></span></button>
          <button class="side-feature ${state.route==='grammar'||state.route==='lesson'?'active':''}" onclick="go('grammar')"><span class="side-icon text">文</span><span><b>英文文法</b><small>30 章 · 150 個微課</small></span></button>
          <button class="side-feature ${state.route==='quiz'?'active':''}" onclick="go('quiz')"><span class="side-icon text">測</span><span><b>多益練習</b><small>20 題分級試卷</small></span></button>
        </div>
        <div class="side-title tools-title">影片工具</div>
        <button class="side-tool ${state.route==='history'?'active':''}" onclick="go('history')"><span class="side-icon mini-icon">▤</span><span><b>觀看紀錄</b><small>${hist} 部影片</small></span></button>
        <button class="side-tool ${state.route==='favorites'?'active':''}" onclick="go('favorites')"><span class="side-icon mini-icon">♡</span><span><b>收藏影片</b><small>${fav} 部收藏</small></span></button>
        <button class="side-tool ${state.route==='vocabulary'?'active':''}" onclick="go('vocabulary')"><span class="side-icon mini-icon aa">Aa</span><span><b>我的單字庫</b><small>${words} 個單字</small></span></button>
        <div class="side-spacer"></div>
        <div class="side-title">CATEGORIES</div>
        ${cats.map(c=>`<button class="side-item" onclick="state.category='${c.id}';go('explore')"><span>${esc(c.name)}</span><span class="count">${catalog.videos.filter(v=>v.category===c.id).length}</span></button>`).join('')}
        <button class="side-item" onclick="go('explore')"><span>全部 13 大類</span><span class="count">${catalog.videos.length}</span></button>
        <div class="grammar-progress-card"><div class="gp-title">文法微課進度</div><div class="gp-count">${gDone} / 150 課</div><div class="gp-bar"><i style="width:${Math.min(100,gDone/1.5)}%"></i></div></div>
        <div class="side-footer">今日學習 <strong>${daily.minutes}</strong> 分鐘 · <strong>${daily.sessions}</strong> 次</div>
      </aside>
      <main>${main}</main>
    </div>
  </div>${state.word ? wordModal() : ''}`;
}

function videoCard(v){
  const thumb=`https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg`;
  return `<article class="video-card" onclick="go('watch','${v.id}')"><div class="thumb"><img src="${thumb}" loading="lazy" alt="" onerror="this.style.display='none'"><span class="grade">${esc(v.cefr||'B1')}</span><span class="duration">${esc(v.duration||'')}</span></div><div class="video-info"><div class="video-title">${esc(v.title)}</div><div class="channel">${esc(v.channel)}</div><div class="badges"><span class="mini ok">EN ${pct(v.englishScore)}</span><span class="mini">${esc(v.subcategory||'')}</span><span class="mini">${v.translation==='available'?'中譯已備妥':'中譯待補'}</span></div></div></article>`;
}
function filteredVideos(){
  const q=state.search.trim().toLowerCase();
  return catalog.videos.filter(v=>{
    const txt=[v.title,v.channel,v.category,v.subcategory,...(v.tags||[])].join(' ').toLowerCase();
    return (!q||txt.includes(q))&&(state.category==='all'||v.category===state.category)&&(state.subcategory==='all'||v.subcategory===state.subcategory)&&(state.level==='all'||v.cefr===state.level)&&(state.caption==='all'||(state.caption==='ready'?v.captions==='available':v.captions!=='available'));
  });
}
function renderMain(){const m=$('main');if(m)m.innerHTML=content();}
function render(){document.querySelector('#app').innerHTML=shell(content());}

function content(){
  if(['home','learning'].includes(state.route))return learningHome();
  if(state.route==='explore')return explore();
  if(state.route==='watch')return watch();
  if(state.route==='grammar')return grammar();
  if(state.route==='lesson')return lessonPage();
  if(state.route==='quiz')return quiz();
  if(state.route==='history')return historyPage();
  if(state.route==='favorites')return favoritesPage();
  if(state.route==='vocabulary')return vocabularyPage();
  if(state.route==='progress')return progressPage();
  if(state.route==='engine')return engine();
  return learningHome();
}

function learningHome(){
  const daily=dailyStats(),videos=filteredVideos().slice(0,8),gDone=sidebarProgress();
  return `<section class="hero"><div class="hero-main"><div class="eyebrow">三木Eng · 影音 · 文法 · 多益</div><h1>影片學習，從聽懂一句開始。</h1><p>每日累加學習紀錄、逐句雙語字幕、可調字幕大小、單字解釋與發音，再接到 30 章文法、分級 TOEIC 與個人化學習路徑。</p><div class="hero-meta"><span class="pill green">今日 ${daily.minutes} 分鐘</span><span class="pill blue">${daily.sessions} 次影片學習</span><span class="pill">${daily.sentences} 句字幕</span><span class="pill">文法 ${gDone}/150 微課</span></div></div><div class="hero-stat"><div><div class="stat-big">${catalog.videos.length}</div><div class="stat-label">目前影片庫 · 探索引擎持續擴充</div></div><div class="stat-row"><div class="stat-box"><b>${catalog.videos.filter(v=>v.captions==='available').length}</b><span>英文字幕可用</span></div><div class="stat-box"><b>13</b><span>主題大類</span></div></div></div></section>
  <div class="section"><div class="section-head"><div><div class="section-title">今日學習</div><div class="section-sub">影片 → 雙語字幕 → 單字 → 片語 → 文法 → 測驗</div></div><button class="link-btn" onclick="go('explore')">探索全部 →</button></div><div class="learning-grid">
    <div class="learning-card"><h3>影片學習</h3><p>目前影片庫 ${catalog.videos.length} 部；來源由探索引擎持續增加，不再固定 500 部。</p><button class="tool" onclick="go('explore')">開始看影片</button></div>
    <div class="learning-card"><h3>雙語字幕</h3><p>支援英文 / 中英 / 中文三種模式，逐句翻譯獨立儲存，英文字幕不會因翻譯失敗消失。</p><button class="tool" onclick="go('explore')">找有字幕影片</button></div>
    <div class="learning-card"><h3>我的路徑</h3><p>${gDone}/150 微課完成；收藏 ${favoriteIds().length} 部影片，單字庫 ${Object.keys(vocabItems()).length} 個。</p><button class="tool" onclick="go('grammar')">繼續文法</button></div>
  </div></div>
  <div class="section"><div class="section-head"><div><div class="section-title">推薦影片</div><div class="section-sub">已驗證英文、字幕與 CEFR 後才進入推薦區</div></div></div><div class="video-grid">${videos.map(videoCard).join('')}</div></div>`;
}

function explore(){
  const vs=filteredVideos(),cats=taxonomy.categories||[],subs=[...new Set((state.category==='all'?catalog.videos:catalog.videos.filter(v=>v.category===state.category)).map(v=>v.subcategory).filter(Boolean))];
  return `<div class="section-head"><div><div class="section-title">影片探索</div><div class="section-sub">非英語影片先淘汰；分類由 AI + 規則從 transcript 判斷。</div></div><span class="pill green">${vs.length} results</span></div>
  <div class="filterbar"><select onchange="state.category=this.value;state.subcategory='all';renderMain()"><option value="all">全部大類</option>${cats.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><select onchange="state.subcategory=this.value;renderMain()"><option value="all">全部子類</option>${subs.map(s=>`<option ${state.subcategory===s?'selected':''}>${esc(s)}</option>`).join('')}</select><select onchange="state.level=this.value;renderMain()"><option value="all">全部 CEFR</option>${['A1','A2','B1','B2','C1','C2'].map(s=>`<option ${state.level===s?'selected':''}>${s}</option>`).join('')}</select><select onchange="state.caption=this.value;renderMain()"><option value="all">字幕狀態</option><option value="ready" ${state.caption==='ready'?'selected':''}>英文字幕已驗證</option><option value="pending" ${state.caption==='pending'?'selected':''}>字幕待處理</option></select></div>
  <div class="results-meta">Spoken Language · Caption Language · English Score · Multilingual Score · CEFR · AI Category · Fingerprint / Embedding Dedup</div>
  ${vs.length?`<div class="video-grid">${vs.map(videoCard).join('')}</div>`:`<div class="empty">目前沒有符合條件的影片。可以換分類、CEFR 或搜尋字詞。</div>`}
  <div class="section"><div class="section-title">13 大類 / ${taxonomy.totalSubcategories||78} 子類</div><div class="section-sub">你指定的內容面向已全部建立；影片庫會依探索引擎逐步填滿。</div></div><div class="category-grid">${cats.map(c=>`<button class="cat" onclick="state.category='${c.id}';state.subcategory='all';renderMain()"><strong>${esc(c.name)}</strong><small>${c.subs.join(' · ')}</small></button>`).join('')}</div>`;
}

function ytEmbed(id){
  const origin=encodeURIComponent(location.origin);
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${origin}&rel=0&playsinline=1&hl=zh-TW&modestbranding=1`;
}
function seek(sec){
  const frame=$('#yt');
  try{
    frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'seekTo',args:[sec,true]}),'*');
    frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}),'*');
  }catch{}
}
function setSpeed(s){state.speed=s;const frame=$('#yt');try{frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'setPlaybackRate',args:[s]}),'*')}catch{}document.querySelectorAll('.speed').forEach(x=>x.classList.toggle('active',Number(x.dataset.speed)===s));}
function toggleTab(t){state.transcriptTab=t;renderMain();}
function setSubtitleSize(v){state.subtitleSize=Number(v);renderMain();}
function toggleFavorite(id){let f=favoriteIds();f=f.includes(id)?f.filter(x=>x!==id):[...f,id];save('evl-favorites',f);toast(f.includes(id)?'已加入收藏':'已取消收藏');renderMain();}
function addWord(word,videoId='',meaning='',sourceSentence=''){
  const key=String(word||'').trim().toLowerCase();if(!key)return;
  const info=wordBank.words?.[key]||{};
  const v=vocabItems();
  v[key]={word:key,meaning_zh:meaning||info.definition_zh||'',pos:info.pos||'',example:info.example||sourceSentence||'',sourceVideoId:videoId,addedAt:new Date().toISOString()};
  save('evl-vocab',v);toast(`已收藏單字：${key}`);renderMain();
}
function removeWord(word){const v=vocabItems();delete v[word];save('evl-vocab',v);renderMain();}
function lookupWord(word){return wordBank.words?.[word.toLowerCase()]||{word,definition_zh:'目前資料庫尚無完整詞條；待 AI 詞典層補充。',pos:'—',example:'',gloss:''};}
function openWord(word,videoId='',sentence=''){const w=lookupWord(String(word));state.word={...w,sourceVideoId:videoId,sourceSentence:sentence};render();}
function closeWord(){state.word=null;render();}
function speakWord(word,accent){if(!('speechSynthesis' in window))return toast('此瀏覽器不支援語音朗讀');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang=accent==='uk'?'en-GB':'en-US';u.rate=.78;const vs=speechSynthesis.getVoices();u.voice=vs.find(v=>v.lang===u.lang)||vs.find(v=>v.lang.startsWith(accent==='uk'?'en-GB':'en-US'))||null;speechSynthesis.speak(u);}
function renderClickableSentence(text,videoId){
  const stop=new Set(['a','an','the','and','or','but','if','to','of','in','on','at','for','from','by','with','as','is','are','was','were','be','been','being','am','do','does','did','have','has','had','can','could','will','would','should','may','might','must','this','that','these','those','it','its','they','them','their','we','our','you','your','i','he','she','his','her','what','which','who','when','where','why','how']);
  return esc(text).replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g,m=>{
    const word=m.toLowerCase();
    if(stop.has(word))return m;
    const info=wordBank.words?.[word];
    const cls=info?'inline-word known':'inline-word';
    return `<button class="${cls}" onclick='event.stopPropagation();openWord(${JSON.stringify(m)},${JSON.stringify(videoId)},${JSON.stringify(text)})'>${m}</button>`;
  });
}
function wordModal(){
  const w=state.word||{}; const fav=Object.keys(vocabItems()).includes(String(w.word||'').toLowerCase());
  return `<div class="modal-backdrop" onclick="closeWord()"><div class="word-modal" onclick="event.stopPropagation()"><div class="word-modal-head"><div><div class="word-modal-word">${esc(w.word)}</div><div class="word-modal-pos">${esc(w.pos||'')}</div></div><button class="close-btn" onclick="closeWord()">×</button></div><div class="word-phonics"><span>英式 ${esc(w.phonetic_uk||'')}</span><button class="pronounce" onclick="speakWord(${JSON.stringify(w.word)},'uk')">🔊 播放</button><span>美式 ${esc(w.phonetic_us||'')}</span><button class="pronounce" onclick="speakWord(${JSON.stringify(w.word)},'us')">🔊 播放</button></div><div class="word-section"><label>中文解釋</label><p>${esc(w.definition_zh||'—')}</p></div><div class="word-section"><label>English meaning</label><p>${esc(w.gloss||'—')}</p></div><div class="word-section"><label>例句</label><p>${esc(w.example||w.sourceSentence||'—')}</p></div><div class="word-actions"><button class="tool" onclick="addWord(${JSON.stringify(w.word)},${JSON.stringify(w.sourceVideoId||'')},${JSON.stringify(w.definition_zh||'')},${JSON.stringify(w.sourceSentence||'')})">${fav?'♥ 已收藏':'♡ 收藏單字'}</button></div></div></div>`;
}

function registerWatch(v){
  const key=`evl-session-${localDate()}-${v.id}`;
  const history=historyItems(),idx=history.findIndex(x=>x.id===v.id);
  const item={id:v.id,title:v.title,channel:v.channel,updatedAt:new Date().toISOString(),progress:Math.min(100,(idx>=0?history[idx].progress:0)+3)};
  if(idx>=0)history[idx]={...history[idx],...item};else history.unshift(item);
  save('evl-history',history.slice(0,200));
  if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');const d=dailyStats();d.sessions+=1;d.minutes+=Math.max(1,Math.round((Number(v.durationSec)||60)/60));d.sentences+=Array.isArray(v.transcript)?v.transcript.length:0;save('evl-daily',d);}
}
function watch(){
  const v=catalog.videos.find(x=>x.id===decodeURIComponent(state.selectedVideo||''))||catalog.videos[0];
  if(!v)return `<div class="empty">尚無影片。</div>`;
  registerWatch(v);
  const history=historyItems().find(x=>x.id===v.id),segments=v.transcript||[];
  const translationReady=segments.length>0 && segments.every(s=>String(s.zh||'').trim());
  const unit=learningUnits.units?.[v.id]||{};
  const size=state.subtitleSize;
  return `<div class="watch-shell"><section><div class="player-card"><div class="player"><iframe id="yt" src="${ytEmbed(v.id)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
    <div class="player-tools"><button class="tool" onclick="setSpeed(.75)">0.75×</button><button class="tool speed ${state.speed===1?'active':''}" onclick="setSpeed(1)">1×</button><button class="tool speed ${state.speed===1.25?'active':''}" onclick="setSpeed(1.25)">1.25×</button><button class="tool speed ${state.speed===1.5?'active':''}" onclick="setSpeed(1.5)">1.5×</button><span class="tool-separator"></span><button class="tool" onclick="toast('點擊任一句字幕，即可單句播放與開啟單字工具。')">單句模式</button><button class="tool" onclick="toggleFavorite('${v.id}')">${favoriteIds().includes(v.id)?'♥ 已收藏':'♡ 收藏'}</button></div>
    <div class="subtitle-settings"><label>字幕大小 <b>${size}px</b></label><input type="range" min="14" max="28" step="1" value="${size}" oninput="setSubtitleSize(this.value)"><small>YouTube 廣告/促銷由 YouTube 播放器控制，嵌入頁無法可靠攔截；已改用 no-cookie embed 並降低追蹤。</small></div>
    <h1 class="watch-title">${esc(v.title)}</h1><div class="watch-meta">${esc(v.channel)} · ${esc(v.duration)} · CEFR ${esc(v.cefr)} · English ${pct(v.englishScore)} · ${esc(v.subcategory||'')}</div></div>
    <div class="section"><div class="panel"><div class="panel-header"><strong>影片 → 學習單元</strong><span class="pill green">進度 ${history?.progress||0}%</span></div><div class="panel-body"><div class="learning-grid">
      <div class="learning-card"><h3>單字 · ${(unit.vocabulary||[]).length}</h3><div class="unit-list">${(unit.vocabulary||[]).slice(0,8).map(x=>`<button class="word-row" onclick='openWord(${JSON.stringify(x.word||'')},${JSON.stringify(v.id)},${JSON.stringify(x.example||'')})'><b>${esc(x.word||'')}</b>${x.definition_zh?` · ${esc(x.definition_zh)}`:''}</button>`).join('')||'尚未生成'}</div></div>
      <div class="learning-card"><h3>片語 · ${(unit.phrases||[]).length}</h3><div class="unit-list">${(unit.phrases||[]).slice(0,6).map(x=>`<div class="phrase-row"><b>${esc(x.phrase||'')}</b>${x.meaning_zh?` · ${esc(x.meaning_zh)}`:''}</div>`).join('')||'尚未生成'}</div></div>
      <div class="learning-card"><h3>文法 · ${(unit.grammar||[]).length}</h3><div class="unit-list">${(unit.grammar||[]).slice(0,4).map(x=>`<div class="phrase-row"><b>${esc(x.topic||'')}</b>${x.explanation_zh?` · ${esc(x.explanation_zh)}`:''}</div>`).join('')||'尚未生成'}</div></div>
    </div><div class="quick-row"><strong>Quick questions · ${(unit.questions||[]).length}</strong>${(unit.questions||[]).slice(0,5).map((x,i)=>`<span class="mini">Q${i+1}</span>`).join('')}</div></div></div></div></section>
    <aside class="panel"><div class="panel-header"><strong>字幕工作區</strong><span class="pill ${translationReady?'green':''}">${translationReady?'逐句翻譯已備妥':'中文翻譯待補'}</span></div><div class="panel-body">
      <div class="subtabs"><button class="subtab ${state.transcriptTab==='english'?'active':''}" onclick="toggleTab('english')">英文</button><button class="subtab ${state.transcriptTab==='bilingual'?'active':''}" onclick="toggleTab('bilingual')">中英</button><button class="subtab ${state.transcriptTab==='chinese'?'active':''}" onclick="toggleTab('chinese')">中文</button></div>
      ${v.captions==='available'?segments.map((s,i)=>`<div class="segment" onclick="seek(${s.start})"><div class="time">${formatTime(s.start)} · sentence ${i+1}</div>${state.transcriptTab!=='chinese'?`<div class="en" style="font-size:${size}px">${renderClickableSentence(s.en,v.id)}</div>`:''}${state.transcriptTab!=='english'?`<div class="zh" style="font-size:${Math.max(13,size-2)}px">${esc(s.zh||'翻譯待補')}</div>`:''}</div>`).join(''):`<div class="empty">英文字幕來源尚未完成，但影片仍可播放。背景引擎會以 A → B → C 多來源策略重試。</div>`}
    </div></aside></div>`;
}
function formatTime(sec){const m=Math.floor(sec/60),s=Math.floor(sec%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

function grammar(){
  const mp=load('evl-micro-progress',{}),done=sidebarProgress();
  return `<div class="section-head"><div><div class="section-title">英文文法 · 30 章 / 150 微課</div><div class="section-sub">依你原本教材架構：Form → Meaning → Use → Contrast → Error；每課都有解說、句型、例句、常見錯誤與練習。</div></div><span class="pill blue">${done}/150</span></div>
  <div class="grammar-overview"><div class="progressbar"><i style="width:${Math.min(100,done/1.5)}%"></i></div><b>${done} / 150 課</b></div>
  <div class="chapter-grid">${lessons.chapters.map(c=>{const list=(lessons.microLessons||[]).filter(x=>x.chapter_id===c[0]);return `<article class="chapter"><div class="chapter-head"><h4>${c[0]}. ${esc(c[1])}</h4><span class="mini">${c[3]}</span></div><p>${esc(c[2])}</p><div class="micro-list">${list.map(m=>`<button class="micro-btn ${mp[m.lesson_id]?'done':''}" onclick="go('lesson','${m.lesson_id}')"><span>${m.lesson_id.split('-')[1]}</span>${esc(m.title_zh)}<i>→</i></button>`).join('')}</div></article>`}).join('')}</div>`;
}
function lessonPage(){
  const id=decodeURIComponent(state.selectedLesson||''), l=(lessons.microLessons||[]).find(x=>x.lesson_id===id);
  if(!l)return `<div class="empty">找不到這個微課。</div>`;
  const mp=load('evl-micro-progress',{}),done=!!mp[id];
  return `<div class="lesson-detail"><div class="section-head"><div><div class="eyebrow">MICRO LESSON ${esc(l.lesson_id)}</div><div class="section-title">${esc(l.title_zh)}</div><div class="section-sub">${esc(l.cefr)} · ${esc(l.title_en)}</div></div><span class="pill ${done?'green':''}">${done?'已完成':'未完成'}</span></div>
    <div class="lesson-grid"><article class="panel lesson-panel"><div class="panel-header"><strong>① 觀念</strong></div><div class="panel-body"><p class="lesson-explain">${esc(l.explanation)}</p></div></article>
    <article class="panel lesson-panel"><div class="panel-header"><strong>② 句型公式</strong></div><div class="panel-body"><div class="formula">${esc(l.pattern)}</div></div></article>
    <article class="panel lesson-panel"><div class="panel-header"><strong>③ 例句與朗讀</strong></div><div class="panel-body">${l.examples.map(e=>`<div class="example-row"><span>${esc(e)}</span><button class="pronounce" onclick="speakWord(${JSON.stringify(e)},'us')">🔊</button></div>`).join('')}</div></article>
    <article class="panel lesson-panel"><div class="panel-header"><strong>④ 常見錯誤</strong></div><div class="panel-body">${l.common_errors.map(e=>`<p class="error-note">⚠ ${esc(e)}</p>`).join('')}</div></article>
    <article class="panel lesson-panel"><div class="panel-header"><strong>⑤ Contrast</strong></div><div class="panel-body">${l.contrast.map(e=>`<p>${esc(e)}</p>`).join('')}</div></article>
    <article class="panel lesson-panel"><div class="panel-header"><strong>⑥ 微練習</strong></div><div class="panel-body">${l.practice.map((e,i)=>`<div class="practice-row"><span>${i+1}</span>${esc(e)}</div>`).join('')}<div class="mastery-tip">Mastery tip：${esc(l.mastery_tip)}</div></div></article></div>
    <div class="lesson-actions"><button class="tool" onclick="go('grammar')">← 回到 30 章</button><button class="tool ${done?'active':''}" onclick="toggleMicro('${l.lesson_id}')">${done?'✓ 已完成':'完成本微課'}</button><button class="tool" onclick="go('quiz')">做分級測驗 →</button></div></div>`;
}
function toggleMicro(id){let mp=load('evl-micro-progress',{});mp[id]=!mp[id];save('evl-micro-progress',mp);toast(mp[id]?'微課完成':'已取消完成');render();}

function buildQuizSet(){
  const all=Object.values(toeic.bands||{}).flatMap(b=>b.questions||[]);
  const target=toeic.bands?.[state.quizBand]?.questions||[];
  const others=all.filter(q=>q.band!==state.quizBand);
  const set=[...target,...others];
  state.quizSet=set.slice(0,20);
  while(state.quizSet.length<20 && all.length) state.quizSet.push(all[state.quizSet.length%all.length]);
  state.quizIndex=0;state.quizScore=0;state.quizAnswered=false;state.quizSelected=null;
}
function quiz(){
  const bands=toeic.bands||{};
  if(!state.quizSet.length)buildQuizSet();
  if(state.quizIndex>=20)return `<div class="quiz"><div class="section-head"><div><div class="section-title">多益分級練習完成</div><div class="section-sub">${esc(bands[state.quizBand]?.label||'')} · ${state.quizScore}/20；本系統為原創診斷題，不是官方 TOEIC 換算。</div></div><span class="pill green">完成</span></div><div class="quiz-card result-card"><div class="result-score">${state.quizScore}/20</div><p>正確率 ${Math.round(state.quizScore/20*100)}%。系統會把結果用作文法課程與影片難度推薦的輸入。</p><button class="tool" onclick="state.quizSet=[];renderMain()">再做一次</button><button class="tool" onclick="go('grammar')">查看文法課程</button></div></div>`;
  const q=state.quizSet[state.quizIndex];
  return `<div class="quiz"><div class="section-head"><div><div class="section-title">多益分級練習 · 20 題</div><div class="section-sub">選擇你的目標帶；本輪以該帶題目為主，並搭配相鄰程度題做診斷。</div></div><span class="pill">第 ${state.quizIndex+1} / 20 題</span></div>
    <div class="band-selector">${Object.entries(bands).map(([id,b])=>`<button class="band-card ${state.quizBand===id?'active':''}" onclick="state.quizBand='${id}';state.quizSet=[];renderMain()"><b>${esc(b.label)}</b><small>${esc(b.description)}</small></button>`).join('')}</div>
    <div class="quiz-card"><div class="question">${esc(q.q)}</div><div class="answers">${q.a.map((a,i)=>`<button class="answer ${state.quizAnswered?(i===q.c?'correct':(i===state.quizSelected?'wrong':'')):''}" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${esc(a)}</button>`).join('')}</div>${state.quizAnswered?`<p class="quiz-explain">${esc(q.e)}</p><button class="tool" onclick="nextQuiz()">${state.quizIndex===19?'完成試卷':'下一題'}</button>`:''}</div></div>`;
}
function answerQuiz(i){if(state.quizAnswered)return;state.quizAnswered=true;state.quizSelected=i;if(i===state.quizSet[state.quizIndex].c)state.quizScore++;renderMain();}
function nextQuiz(){state.quizIndex++;state.quizAnswered=false;state.quizSelected=null;renderMain();}

function historyPage(){
  const items=historyItems().map(x=>({...x,video:catalog.videos.find(v=>v.id===x.id)})).filter(x=>x.video);
  return `<div class="section-head"><div><div class="section-title">觀看紀錄</div><div class="section-sub">每次觀看都會留下最近學習時間與影片進度。</div></div><span class="pill">${items.length} 部影片</span></div>${items.length?`<div class="video-grid">${items.map(x=>videoCard(x.video)).join('')}</div>`:`<div class="empty">尚無觀看紀錄。從影片學習開始即可自動建立。</div>`}`;
}
function favoritesPage(){
  const ids=favoriteIds(),items=catalog.videos.filter(v=>ids.includes(v.id));
  return `<div class="section-head"><div><div class="section-title">收藏影片</div><div class="section-sub">反覆練習的影片集中在這裡。</div></div><span class="pill">${items.length} 部收藏</span></div>${items.length?`<div class="video-grid">${items.map(videoCard).join('')}</div>`:`<div class="empty">尚未收藏影片。</div>`}`;
}
function vocabularyPage(){
  const entries=Object.values(vocabItems()).sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)));
  return `<div class="section-head"><div><div class="section-title">我的單字庫</div><div class="section-sub">單字收藏後可重播英式／美式讀音，並保留來源影片。</div></div><span class="pill">${entries.length} 個單字</span></div>${entries.length?`<div class="vocab-grid">${entries.map(x=>`<article class="vocab-card"><div><b>${esc(x.word)}</b><p>${esc(x.meaning_zh||'')}${x.pos?` · ${esc(x.pos)}`:''}</p></div><div class="vocab-actions"><button class="pronounce" onclick="speakWord(${JSON.stringify(x.word)},'uk')">英式 🔊</button><button class="pronounce" onclick="speakWord(${JSON.stringify(x.word)},'us')">美式 🔊</button><button class="tool" onclick="removeWord(${JSON.stringify(x.word)})">移除</button></div></article>`).join('')}</div>`:`<div class="empty">尚無單字。進入影片字幕後點擊單字即可收藏。</div>`}`;
}
function progressPage(){
  const fp=favoriteIds(),vp=historyItems(),mp=load('evl-micro-progress',{});
  return `<div class="section-head"><div><div class="section-title">我的學習</div><div class="section-sub">影片、文法、TOEIC、收藏與單字集中在同一個學習狀態頁。</div></div></div><div class="learning-grid"><div class="learning-card"><h3>今日影片學習</h3><b style="font-size:34px">${dailyStats().minutes} 分鐘</b><p>${dailyStats().sessions} 次影片 · ${dailyStats().sentences} 句字幕</p></div><div class="learning-card"><h3>文法微課</h3><b style="font-size:34px">${Object.values(mp).filter(Boolean).length}/150</b><p>已完成微課</p></div><div class="learning-card"><h3>收藏 / 單字</h3><b style="font-size:34px">${fp.length} / ${Object.keys(vocabItems()).length}</b><p>收藏影片 / 單字庫</p></div></div><div class="section"><div class="section-title">最近影片</div><div class="video-grid">${vp.slice(0,8).map(x=>catalog.videos.find(v=>v.id===x.id)).filter(Boolean).map(videoCard).join('')||'<div class="empty">尚無觀看紀錄。</div>'}</div></div>`;
}
function engine(){
  const s=catalog.stats||{};
  return `<div class="section-head"><div><div class="section-title">影片探索引擎</div><div class="section-sub">13 大類 × ${taxonomy.totalSubcategories||78} 子類，持續探索而不是固定 500 部。</div></div><span class="pill green">${s.processed||catalog.videos.length} processed</span></div><div class="engine"><div class="panel"><div class="panel-header"><strong>Pipeline</strong><span class="mini ok">GitHub Actions</span></div><div class="panel-body"><div class="pipeline">${[['1','大量 Discovery','13 類 × English search terms'],['2','Language Gate','Spoken / caption / multilingual'],['3','Captions','A → B → C fallback'],['4','Normalize','VTT / SRT / JSON'],['5','Translate','batch → sentence retry → context'],['6','Classify','13 categories / 78 subcats'],['7','CEFR','A1–C2'],['8','Dedup','videoId + fingerprint + embedding']].map(x=>`<div class="stage"><span class="dot"></span>${x[0]}<h4>${x[1]}</h4><p>${x[2]}</p></div>`).join('')}</div></div></div><div class="panel"><div class="panel-header"><strong>Catalog signals</strong></div><div class="panel-body"><div class="log">Candidates           → ${s.candidates||0}
Accepted             → ${s.accepted||0}
Review               → ${s.review||0}
Rejected             → ${s.rejected||0}
Learning units       → ${Object.keys(learningUnits.units||{}).length}
Translations         → ${catalog.translationStats?.translated||0} sentences
Subtitle modes       → English / 中英 / 中文
Word tool            → explanation + UK/US speech
Dedup                → lexical + semantic embedding</div></div></div></div></div>`;
}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2200);}

window.go=go;window.updateSearch=updateSearch;window.renderMain=renderMain;window.seek=seek;window.setSpeed=setSpeed;window.toggleTab=toggleTab;window.setSubtitleSize=setSubtitleSize;window.toggleFavorite=toggleFavorite;window.addWord=addWord;window.removeWord=removeWord;window.openWord=openWord;window.closeWord=closeWord;window.speakWord=speakWord;window.toggleMicro=toggleMicro;window.answerQuiz=answerQuiz;window.nextQuiz=nextQuiz;window.toast=toast;
boot();