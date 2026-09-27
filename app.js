const state = {
  route: 'learning', selectedVideo: null, search: '', category: 'all', subcategory: 'all', level: 'all', caption: 'all',
  speed: 1, transcriptTab: 'bilingual', quizIndex: 0, quizScore: 0, quizAnswered: false
};
let catalog = {videos:[]}, taxonomy = {categories:[]}, lessons = {chapters:[]}, learningUnits = {units:{}};
const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const pct = n => `${Math.round((Number(n)||0)*100)}%`;
const save = (k,v) => localStorage.setItem(k,JSON.stringify(v));
const load = (k,d) => {try{return JSON.parse(localStorage.getItem(k)) ?? d}catch{return d}};
const localDate = () => {const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

async function boot(){
  [catalog,taxonomy,lessons,learningUnits] = await Promise.all([
    fetch('data/catalog.json').then(r=>r.json()),
    fetch('data/taxonomy.json').then(r=>r.json()),
    fetch('data/lessons.json').then(r=>r.json()),
    fetch('data/learning-units.json').then(r=>r.json()).catch(()=>({units:{}}))
  ]);
  window.addEventListener('hashchange', parseHash); parseHash();
}
function parseHash(){
  const h=location.hash.slice(1)||'learning'; const [route,id]=h.split('/'); state.route=route||'learning'; state.selectedVideo=id||null; window.scrollTo({top:0,behavior:'smooth'}); render();
}
function go(route,id=''){ location.hash=id?`${route}/${id}`:route; }
function updateSearch(v){state.search=v; renderMain();}

function sidebarProgress(){
  const mp=load('evl-micro-progress',{}); return Object.values(mp).filter(Boolean).length;
}
function dailyStats(){
  const today=localDate(); const d=load('evl-daily',{}); if(d.date!==today) return {date:today,sessions:0,minutes:0,sentences:0}; return d;
}
function favoriteIds(){return load('evl-favorites',[])}
function historyItems(){return load('evl-history',[])}
function vocabItems(){return load('evl-vocab',{})}

function shell(main){
  const cats=taxonomy.categories, daily=dailyStats(), gDone=sidebarProgress(), fav=favoriteIds().length, hist=historyItems().length, words=Object.keys(vocabItems()).length;
  return `<div class="app">
    <header class="topbar"><a class="brand" href="#learning"><span class="brand-mark">EV</span><span>English Video Lab</span></a>
      <div class="search"><input value="${esc(state.search)}" oninput="updateSearch(this.value)" placeholder="搜尋影片、主題、單字、頻道…" /></div>
      <div class="nav-actions"><button class="nav-btn ${state.route==='engine'?'active':''}" onclick="go('engine')">探索引擎</button><button class="nav-btn" onclick="go('learning')">影片學習</button></div>
    </header>
    <div class="layout"><aside class="sidebar">
      <div class="sidebar-primary">
        <button class="side-hero ${['learning','home','watch'].includes(state.route)?'active':''}" onclick="go('learning')"><span class="side-icon play">▶</span><span><b>影片學習</b><small>每日累加與雙語字幕</small></span></button>
        <button class="side-feature ${state.route==='grammar'?'active':''}" onclick="go('grammar')"><span class="side-icon text">文</span><span><b>英文文法</b><small>30 章 · 150 個微課</small></span></button>
        <button class="side-feature ${state.route==='quiz'?'active':''}" onclick="go('quiz')"><span class="side-icon text">測</span><span><b>多益練習</b><small>20 題完整試卷</small></span></button>
      </div>
      <div class="side-title tools-title">影片工具</div>
      <button class="side-tool ${state.route==='history'?'active':''}" onclick="go('history')"><span class="side-icon mini-icon">▤</span><span><b>觀看紀錄</b><small>${hist} 部影片</small></span></button>
      <button class="side-tool ${state.route==='favorites'?'active':''}" onclick="go('favorites')"><span class="side-icon mini-icon">♡</span><span><b>收藏影片</b><small>${fav} 部收藏</small></span></button>
      <button class="side-tool ${state.route==='vocabulary'?'active':''}" onclick="go('vocabulary')"><span class="side-icon mini-icon aa">Aa</span><span><b>我的單字庫</b><small>${words} 個單字</small></span></button>
      <div class="side-spacer"></div><div class="side-title">CATEGORIES</div>
      ${cats.slice(0,7).map(c=>`<button class="side-item" onclick="state.category='${c.id}';go('explore')"><span>${c.name}</span><span class="count">${catalog.videos.filter(v=>v.category===c.id).length}</span></button>`).join('')}
      <button class="side-item" onclick="go('explore')"><span>全部 12 大類</span><span class="count">${catalog.videos.length}</span></button>
      <div class="grammar-progress-card"><div class="gp-title">文法微課進度</div><div class="gp-count">${gDone} / 150 課</div><div class="gp-bar"><i style="width:${Math.min(100,gDone/1.5)}%"></i></div></div>
      <div class="side-footer">今日學習 <strong>${daily.minutes}</strong> 分鐘 · <strong>${daily.sessions}</strong> 次</div>
    </aside><main>${main}</main></div></div>`;
}

function videoCard(v){
  const thumb=`https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg`;
  return `<article class="video-card" onclick="go('watch','${v.id}')"><div class="thumb"><img src="${thumb}" loading="lazy" alt="" onerror="this.style.display='none'"><span class="grade">${esc(v.cefr)}</span><span class="duration">${esc(v.duration||'')}</span></div><div class="video-info"><div class="video-title">${esc(v.title)}</div><div class="channel">${esc(v.channel)}</div><div class="badges"><span class="mini ok">EN ${pct(v.englishScore)}</span><span class="mini">${esc(v.subcategory||'')}</span><span class="mini">${v.translation==='available'?'中譯':'中譯待補'}</span></div></div></article>`;
}
function filteredVideos(){
  const q=state.search.trim().toLowerCase();
  return catalog.videos.filter(v=>{
    const txt=[v.title,v.channel,v.category,v.subcategory,...(v.tags||[])].join(' ').toLowerCase();
    return (!q||txt.includes(q)) && (state.category==='all'||v.category===state.category) && (state.subcategory==='all'||v.subcategory===state.subcategory) && (state.level==='all'||v.cefr===state.level) && (state.caption==='all'||(state.caption==='ready' ? v.captions==='available' : v.captions!=='available'));
  });
}
function renderMain(){const m=$('main');if(m){m.innerHTML=content();}}
function content(){
  if(['home','learning'].includes(state.route)) return learningHome();
  if(state.route==='explore') return explore();
  if(state.route==='watch') return watch();
  if(state.route==='grammar') return grammar();
  if(state.route==='quiz') return quiz();
  if(state.route==='history') return historyPage();
  if(state.route==='favorites') return favoritesPage();
  if(state.route==='vocabulary') return vocabularyPage();
  if(state.route==='progress') return progress();
  if(state.route==='engine') return engine();
  return learningHome();
}
function render(){document.querySelector('#app').innerHTML=shell(content());}

function registerWatch(v){
  const key=`evl-session-${localDate()}-${v.id}`;
  const history=historyItems(); const idx=history.findIndex(x=>x.id===v.id); const item={id:v.id,title:v.title,channel:v.channel,updatedAt:new Date().toISOString(),progress:Math.min(100,(idx>=0?history[idx].progress:0)+3)};
  if(idx>=0) history[idx]={...history[idx],...item}; else history.unshift(item); save('evl-history',history.slice(0,200));
  if(!sessionStorage.getItem(key)){
    sessionStorage.setItem(key,'1'); const d=dailyStats(); d.sessions+=1; d.minutes+=Math.max(1,Math.round((Number(v.durationSec)||60)/60)); d.sentences+=Array.isArray(v.transcript)?v.transcript.length:0; save('evl-daily',d);
  }
}

function learningHome(){
  const daily=dailyStats(); const videos=filteredVideos().slice(0,8); const gDone=sidebarProgress();
  return `<section class="hero"><div class="hero-main"><div class="eyebrow">ENGLISH VIDEO LEARNING LAB</div><h1>影片學習，從聽懂一句開始。</h1><p>每日累加學習紀錄、雙語字幕、單句播放、單字收藏，再接到文法、TOEIC 與個人化學習路徑。</p><div class="hero-meta"><span class="pill green">今日 ${daily.minutes} 分鐘</span><span class="pill blue">${daily.sessions} 次影片學習</span><span class="pill">${daily.sentences} 句字幕</span><span class="pill">文法 ${gDone}/150 微課</span></div></div><div class="hero-stat"><div><div class="stat-big">${catalog.videos.length}</div><div class="stat-label">目前影片庫 · 持續探索與更新</div></div><div class="stat-row"><div class="stat-box"><b>${catalog.videos.filter(v=>v.captions==='available').length}</b><span>英文字幕可用</span></div><div class="stat-box"><b>20</b><span>TOEIC 完整試卷</span></div></div></div></section>
  <div class="section"><div class="section-head"><div><div class="section-title">今日學習</div><div class="section-sub">看影片 → 雙語字幕 → 單字 → 片語 → 文法 → 測驗</div></div><button class="link-btn" onclick="go('explore')">探索全部 →</button></div><div class="learning-grid">
    <div class="learning-card"><h3>影片學習</h3><p>目前影片庫 ${catalog.videos.length} 部。每次觀看會留下紀錄並累加今日學習。</p><button class="tool" onclick="go('explore')">開始看影片</button></div>
    <div class="learning-card"><h3>雙語字幕</h3><p>英文字幕與中文翻譯獨立處理；翻譯失敗不會讓英文字幕消失。</p><button class="tool" onclick="go('explore')">找有字幕影片</button></div>
    <div class="learning-card"><h3>我的路徑</h3><p>${gDone}/150 微課完成。收藏 ${favoriteIds().length} 部影片，單字庫 ${Object.keys(vocabItems()).length} 個。</p><button class="tool" onclick="go('grammar')">繼續文法</button></div>
  </div></div>
  <div class="section"><div class="section-head"><div><div class="section-title">推薦影片</div><div class="section-sub">以已驗證英文、字幕與 CEFR 資料為優先</div></div></div><div class="video-grid">${videos.map(videoCard).join('')}</div></div>`;
}

function explore(){
  const vs=filteredVideos(); const cats=taxonomy.categories; const subs=[...new Set((state.category==='all'?catalog.videos:catalog.videos.filter(v=>v.category===state.category)).map(v=>v.subcategory).filter(Boolean))];
  return `<div class="section-head"><div><div class="section-title">影片探索</div><div class="section-sub">語言判定不是看標題；每部影片帶有 Spoken / Caption / English / Multilingual signals。</div></div><span class="pill green">${vs.length} results</span></div>
  <div class="filterbar"><select onchange="state.category=this.value;state.subcategory='all';renderMain()"><option value="all">全部大類</option>${cats.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${c.name}</option>`).join('')}</select><select onchange="state.subcategory=this.value;renderMain()"><option value="all">全部子類</option>${subs.map(s=>`<option ${state.subcategory===s?'selected':''}>${esc(s)}</option>`).join('')}</select><select onchange="state.level=this.value;renderMain()"><option value="all">全部 CEFR</option>${['A1','A2','B1','B2','C1','C2'].map(s=>`<option ${state.level===s?'selected':''}>${s}</option>`).join('')}</select><select onchange="state.caption=this.value;renderMain()"><option value="all">字幕狀態</option><option value="ready" ${state.caption==='ready'?'selected':''}>英文字幕已驗證</option><option value="pending" ${state.caption==='pending'?'selected':''}>字幕待處理</option></select></div>
  <div class="results-meta">Engine fields: Spoken Language · Caption Language · English Score · Multilingual Score · CEFR · Category · Dedup Key</div>
  ${vs.length?`<div class="video-grid">${vs.map(videoCard).join('')}</div>`:`<div class="empty">目前沒有符合條件的影片。可以換分類、CEFR 或搜尋字詞。</div>`}
  <div class="section"><div class="section-title">12 大類 / 50+ 子類別</div><div class="section-sub">分類是資料庫欄位，不是人工固定頁面。</div></div><div class="category-grid">${cats.map(c=>`<button class="cat" onclick="state.category='${c.id}';state.subcategory='all';renderMain()"><strong>${c.name}</strong><small>${c.subs.join(' · ')}</small></button>`).join('')}</div>`;
}

function ytEmbed(id){return `https://www.youtube.com/embed/${encodeURIComponent(id)}?enablejsapi=1&rel=0&playsinline=1`}
function seek(sec){const frame=$('#yt');try{frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'seekTo',args:[sec,true]}),'*');frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}),'*');}catch{}}
function setSpeed(s){state.speed=s;const frame=$('#yt');try{frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'setPlaybackRate',args:[s]}),'*')}catch{} document.querySelectorAll('.speed').forEach(x=>x.classList.toggle('active',Number(x.dataset.speed)===s))}
function toggleTab(t){state.transcriptTab=t;renderMain();}
function toggleFavorite(id){let f=favoriteIds();f=f.includes(id)?f.filter(x=>x!==id):[...f,id];save('evl-favorites',f);toast(f.includes(id)?'已加入收藏':'已取消收藏');renderMain()}

function addWord(word, videoId='', meaning=''){
  const key=String(word||'').trim().toLowerCase(); if(!key||key.length<2)return;
  const v=vocabItems(); v[key]={word:key,meaning_zh:meaning||'',sourceVideoId:videoId,addedAt:new Date().toISOString()}; save('evl-vocab',v); toast(`已加入單字庫：${key}`); renderMain();
}
function removeWord(word){const v=vocabItems(); delete v[word]; save('evl-vocab',v); renderMain();}
function highlightWords(s, videoId, candidates=[]){
  if(!candidates.length) return esc(s);
  const safe=candidates.map(x=>String(x.word||x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).filter(Boolean);
  if(!safe.length)return esc(s); const re=new RegExp(`\\b(${safe.join('|')})\\b`,'gi'); let out='',last=0,m;
  while((m=re.exec(s))){out+=esc(s.slice(last,m.index)); const raw=m[0]; const hit=candidates.find(x=>String(x.word||x).toLowerCase()===raw.toLowerCase()); out+=`<button class="inline-word" onclick="event.stopPropagation();addWord('${esc(raw)}','${esc(videoId)}','${esc(hit?.definition_zh||'')}')">${esc(raw)}</button>`; last=m.index+raw.length;} out+=esc(s.slice(last)); return out;
}
function watch(){
  const v=catalog.videos.find(x=>x.id===state.selectedVideo)||catalog.videos[0]; if(!v) return `<div class="empty">尚無影片。</div>`;
  registerWatch(v);
  const history=historyItems().find(x=>x.id===v.id); const segments=v.transcript||[]; const unit=learningUnits.units?.[v.id]||{}; const candidates=(unit.vocabulary||[]).slice(0,12);
  return `<div class="watch-shell"><section><div class="player-card"><div class="player"><iframe id="yt" src="${ytEmbed(v.id)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div><div class="player-tools"><button class="tool" onclick="setSpeed(0.75)">0.75×</button><button class="tool speed active" data-speed="1" onclick="setSpeed(1)">1×</button><button class="tool" onclick="setSpeed(1.25)">1.25×</button><button class="tool" onclick="setSpeed(1.5)">1.5×</button><span style="flex:1"></span><button class="tool" onclick="toast('單句播放：點擊字幕句子即可。')">單句模式</button><button class="tool" onclick="toggleFavorite('${v.id}')">${favoriteIds().includes(v.id)?'♥ 已收藏':'♡ 收藏'}</button></div><h1 class="watch-title">${esc(v.title)}</h1><div class="watch-meta">${esc(v.channel)} · ${esc(v.duration)} · CEFR ${esc(v.cefr)} · English ${pct(v.englishScore)} · ${esc(v.subcategory||'')}</div></div>
  <div class="section"><div class="panel"><div class="panel-header"><strong>影片 → 學習單元</strong><span class="pill green">進度 ${history?.progress||0}%</span></div><div class="panel-body"><div class="learning-grid"><div class="learning-card"><h3>單字 · ${(unit.vocabulary||[]).length}</h3><p>${(unit.vocabulary||[]).slice(0,8).map(x=>`<button class="word-row" onclick="addWord('${esc(x.word||'')}','${esc(v.id)}','${esc(x.definition_zh||'')}')"><b>${esc(x.word||'')}</b>${x.definition_zh?` · ${esc(x.definition_zh)}`:''}</button>`).join('')||'尚未生成'}</p></div><div class="learning-card"><h3>片語 · ${(unit.phrases||[]).length}</h3><p>${(unit.phrases||[]).slice(0,6).map(x=>`<b>${esc(x.phrase||'')}</b>${x.meaning_zh?` · ${esc(x.meaning_zh)}`:''}`).join('<br>')||'尚未生成'}</p></div><div class="learning-card"><h3>文法 · ${(unit.grammar||[]).length}</h3><p>${(unit.grammar||[]).slice(0,4).map(x=>`<b>${esc(x.topic||'')}</b>${x.explanation_zh?` · ${esc(x.explanation_zh)}`:''}`).join('<br>')||'尚未生成'}</p></div></div><div style="margin-top:15px"><strong>Quick questions · ${(unit.questions||[]).length}</strong><div class="badges" style="margin-top:8px">${(unit.questions||[]).slice(0,5).map((x,i)=>`<span class="mini">Q${i+1} · ${esc(x.question||'')}</span>`).join('')||'<span class="mini">尚未生成</span>'}</div></div></div></div></div></section>
  <aside class="panel"><div class="panel-header"><strong>雙語字幕工作區</strong><span class="pill ${v.captions==='available'?'green':''}">${v.captions==='available'?'English ready':'English pending'}</span></div><div class="panel-body"><div class="subtabs"><button class="subtab ${state.transcriptTab==='english'?'active':''}" onclick="toggleTab('english')">英文</button><button class="subtab ${state.transcriptTab==='bilingual'?'active':''}" onclick="toggleTab('bilingual')">中英</button><button class="subtab" onclick="toast('中文翻譯是獨立資料層。翻譯 API 失敗不會刪除英文字幕。')">翻譯狀態</button></div>${v.captions==='available'?segments.map((s,i)=>`<div class="segment" onclick="seek(${s.start})"><div class="time">${formatTime(s.start)} · sentence ${i+1}</div><div class="en">${highlightWords(s.en,v.id,candidates)}</div>${state.transcriptTab==='bilingual'?`<div class="zh">${esc(s.zh||'Translation pending')}</div>`:''}</div>`).join(''):`<div class="empty">英文字幕來源尚未完成，但影片仍可播放。背景引擎會以 A → B → C 多來源策略重試。</div>`}</div></aside></div>`;
}
function formatTime(sec){const m=Math.floor(sec/60),s=Math.floor(sec%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}

function grammar(){
  const mp=load('evl-micro-progress',{}); const done=Object.values(mp).filter(Boolean).length;
  return `<div class="section-head"><div><div class="section-title">英文文法 · 30 章 / 150 微課</div><div class="section-sub">每章 5 個微課；完成狀態直接寫入「文法微課進度」。</div></div><span class="pill blue">${done}/150</span></div><div class="grammar-overview"><div class="progressbar"><i style="width:${Math.min(100,done/1.5)}%"></i></div><b>${done} / 150 課</b></div><div class="chapter-grid">${lessons.chapters.map(c=>{const chapterId=String(c[0]).padStart(2,'0');let buttons='';for(let j=1;j<=5;j++){const id=`G${chapterId}-${String(j).padStart(2,'0')}`;buttons+=`<button class="micro-btn ${mp[id]?'done':''}" onclick="toggleMicro('${id}')"><span>${j}</span>${c[1]} · 微課 ${j}</button>`}return `<article class="chapter"><div class="chapter-head"><h4>${c[0]}. ${esc(c[1])}</h4><span class="mini">${c[3]}</span></div><p>${esc(c[2])}</p><div class="micro-list">${buttons}</div></article>`}).join('')}</div>`;
}
function toggleMicro(id){let mp=load('evl-micro-progress',{});mp[id]=!mp[id];save('evl-micro-progress',mp);toast(mp[id]?'微課完成':'已取消完成');renderMain()}

const questions=[
 {q:'Choose the most natural polite request.',a:['Open the window.','Could you open the window, please?','You open the window.','Open you the window.'],c:1,e:'Could you…? is a common polite request pattern.'},
 {q:'Which sentence uses the passive voice correctly?',a:['The team completed the project.','The project completed the team.','The project was completed by the team.','The team was completing by the project.'],c:2,e:'be + past participle forms the core passive structure.'},
 {q:'Choose the best synonym for “important” in a formal context.',a:['critical','tiny','sleepy','noisy'],c:0,e:'Critical can mean very important in formal contexts.'},
 {q:'Which word best completes: “I ___ go to the gym every morning.”',a:['usually','yesterday','already','tomorrow'],c:0,e:'Usually expresses a regular habit.'},
 {q:'Which question is correctly formed?',a:['Where you do live?','Where do you live?','Where live you?','Where does you live?'],c:1,e:'Wh-word + do/does + subject + base verb.'},
 {q:'She has lived here ___ 2019.',a:['for','since','during','from'],c:1,e:'Since introduces the starting point of an action that continues to the present.'},
 {q:'If I ___ more time, I would learn Spanish.',a:['have','had','will have','having'],c:1,e:'The second conditional uses if + past simple, would + base verb.'},
 {q:'Which sentence is grammatically correct?',a:['He suggested to go home.','He suggested going home.','He suggested go home.','He suggested that going home.'],c:1,e:'Suggest commonly takes a gerund or a that-clause.'},
 {q:'The report was completed ___ Friday.',a:['at','on','in','by'],c:3,e:'By Friday means no later than Friday.'},
 {q:'Choose the best connector: “It was raining; ___, we went out.”',a:['however','because','therefore','unless'],c:0,e:'However signals contrast.'},
 {q:'Which word is a noun?',a:['decision','decide','decisive','decisively'],c:0,e:'Decision is a noun.'},
 {q:'“You must wear a helmet” expresses:',a:['permission','obligation','possibility','past habit'],c:1,e:'Must commonly expresses strong obligation.'},
 {q:'Which sentence correctly uses present perfect?',a:['I have finished my work.','I finished my work tomorrow.','I am finish my work.','I have finish my work.'],c:0,e:'Present perfect = have/has + past participle.'},
 {q:'Choose the correct comparative form.',a:['more easier','easier','easyer','most easy'],c:1,e:'Easy becomes easier in the comparative.'},
 {q:'Which is a natural collocation?',a:['make a decision','do a decision','build a decision','take a decision-making'],c:0,e:'Make a decision is a standard English collocation.'},
 {q:'She asked me ___ I was free.',a:['that','whether','what','where'],c:1,e:'Whether introduces an indirect yes/no question.'},
 {q:'Which sentence avoids a double negative?',a:['I don’t know nothing.','I don’t know anything.','I don’t know nobody.','I never don’t know.'],c:1,e:'Standard English uses anything after a negative verb.'},
 {q:'“Although” is used to show:',a:['contrast','cause','time','condition'],c:0,e:'Although introduces a contrast or concession.'},
 {q:'Choose the correct infinitive pattern.',a:['I want going home.','I want to go home.','I want go home.','I want to going home.'],c:1,e:'Want is followed by to + base verb.'},
 {q:'Which sentence is most appropriate for a formal email?',a:['Send me the file ASAP.','Could you please send me the file at your convenience?','Hey, send it.','Gimme the file.'],c:1,e:'The second sentence uses polite, formal business language.'}
];
function quiz(){
  const total=20;
  if(state.quizIndex>=total) return `<div class="quiz"><div class="section-head"><div><div class="section-title">TOEIC 練習 · 完整 20 題試卷</div><div class="section-sub">本次完成：${state.quizScore} / ${total}。此為原創練習題組，不代表正式 TOEIC 分數。</div></div><span class="pill green">完成</span></div><div class="quiz-card result-card"><div class="result-score">${state.quizScore}/${total}</div><p>正確率 ${Math.round(state.quizScore/total*100)}%。結果可作為文法微課推薦的輸入。</p><button class="tool" onclick="state.quizIndex=0;state.quizScore=0;state.quizAnswered=false;renderMain()">重新測驗</button><button class="tool" onclick="go('grammar')">查看文法課程</button></div></div>`;
  const q=questions[state.quizIndex]; return `<div class="quiz"><div class="section-head"><div><div class="section-title">多益練習 · 20 題完整試卷</div><div class="section-sub">Vocabulary · Grammar · Business English · Reading style</div></div><span class="pill">第 ${state.quizIndex+1} / 20 題</span></div><div class="quiz-card"><div class="question">${esc(q.q)}</div><div class="answers">${q.a.map((a,i)=>`<button class="answer ${state.quizAnswered?(i===q.c?'correct':(i===state.quizSelected?'wrong':'')):''}" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${esc(a)}</button>`).join('')}</div>${state.quizAnswered?`<p style="color:#92a0b5;line-height:1.6;margin-top:17px">${esc(q.e)}</p><button class="tool" onclick="nextQuiz()">${state.quizIndex===19?'完成試卷':'下一題'}</button>`:''}</div></div>`;
}
function answerQuiz(i){if(state.quizAnswered)return;state.quizAnswered=true;state.quizSelected=i;if(i===questions[state.quizIndex].c)state.quizScore++;renderMain()}
function nextQuiz(){state.quizIndex++;state.quizAnswered=false;state.quizSelected=null;renderMain()}

function historyPage(){
  const items=historyItems().map(x=>({...x,video:catalog.videos.find(v=>v.id===x.id)})).filter(x=>x.video);
  return `<div class="section-head"><div><div class="section-title">觀看紀錄</div><div class="section-sub">每次觀看都會留下最近學習時間與影片進度。</div></div><span class="pill">${items.length} 部影片</span></div>${items.length?`<div class="video-grid">${items.map(x=>videoCard(x.video)).join('')}</div>`:`<div class="empty">尚無觀看紀錄。從「影片學習」開始即可自動建立紀錄。</div>`}`;
}
function favoritesPage(){
  const ids=favoriteIds(); const items=catalog.videos.filter(v=>ids.includes(v.id));
  return `<div class="section-head"><div><div class="section-title">收藏影片</div><div class="section-sub">把想反覆練習的影片集中在這裡。</div></div><span class="pill">${items.length} 部收藏</span></div>${items.length?`<div class="video-grid">${items.map(videoCard).join('')}</div>`:`<div class="empty">尚未收藏影片。影片頁右上方可以加入收藏。</div>`}`;
}
function vocabularyPage(){
  const v=vocabItems(); const entries=Object.values(v).sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)));
  return `<div class="section-head"><div><div class="section-title">我的單字庫</div><div class="section-sub">從影片字幕與 AI 學習單元收藏，之後可接間隔複習。</div></div><span class="pill">${entries.length} 個單字</span></div>${entries.length?`<div class="vocab-grid">${entries.map(x=>`<article class="vocab-card"><div><b>${esc(x.word)}</b><p>${esc(x.meaning_zh||'')}</p></div><button class="tool" onclick="removeWord('${esc(x.word)}')">移除</button></article>`).join('')}</div>`:`<div class="empty">尚無單字。進入影片頁後，點擊單字即可加入單字庫。</div>`}`;
}
function progress(){
  const fp=favoriteIds(), vp=historyItems(), mp=load('evl-micro-progress',{}), qp=load('evl-quiz-history',[]); const gCount=Object.values(mp).filter(Boolean).length;
  return `<div class="section-head"><div><div class="section-title">我的學習</div><div class="section-sub">影片、文法、TOEIC、收藏與單字集中在同一個學習狀態頁。</div></div></div><div class="learning-grid"><div class="learning-card"><h3>今日影片學習</h3><b style="font-size:34px">${dailyStats().minutes} 分鐘</b><p>${dailyStats().sessions} 次影片 · ${dailyStats().sentences} 句字幕</p></div><div class="learning-card"><h3>文法微課</h3><b style="font-size:34px">${gCount}/150</b><p>已完成微課</p></div><div class="learning-card"><h3>收藏 / 單字</h3><b style="font-size:34px">${fp.length} / ${Object.keys(vocabItems()).length}</b><p>收藏影片 / 單字庫</p></div></div><div class="section"><div class="section-title">最近影片</div><div class="video-grid">${vp.slice(0,8).map(x=>catalog.videos.find(v=>v.id===x.id)).filter(Boolean).map(videoCard).join('')||'<div class="empty">尚無觀看紀錄。</div>'}</div></div>`;
}

function engine(){
  return `<div class="section-head"><div><div class="section-title">影片探索引擎</div><div class="section-sub">這裡展示真正的資料處理管線；網站本身不把影片清單寫死在 UI。</div></div><span class="pill green">${catalog.stats?.processed||catalog.videos.length} processed</span></div><div class="engine"><div class="panel"><div class="panel-header"><strong>Pipeline</strong><span class="mini ok">scheduled via GitHub Actions</span></div><div class="panel-body"><div class="pipeline">${[['1','Discovery','YouTube queries + sources'],['2','Language','Spoken / caption / multilingual'],['3','Captions','A → B → C fallback'],['4','Normalize','VTT / SRT / JSON'],['5','Translate','batch → retry → contextual'],['6','Classify','12 categories / 72 subcats'],['7','Level','A1–C2'],['8','Dedup','videoId + fingerprint']].map(x=>`<div class="stage"><span class="dot"></span>${x[0]}<h4>${x[1]}</h4><p>${x[2]}</p></div>`).join('')}</div></div></div><div class="panel"><div class="panel-header"><strong>Current catalog signals</strong></div><div class="panel-body"><div class="log">Candidates           → ${catalog.stats?.candidates||0}
Accepted             → ${catalog.stats?.accepted||0}
Review               → ${catalog.stats?.review||0}
Rejected             → ${catalog.stats?.rejected||0}
Caption fallback A   → ${catalog.stats?.captionFallbacks?.A||0}
Caption fallback B   → ${catalog.stats?.captionFallbacks?.B||0}
Caption fallback C   → ${catalog.stats?.captionFallbacks?.C||0}
Learning units       → ${Object.keys(learningUnits.units||{}).length}
Embeddings / dedup   → semantic fingerprint index
Translation          → batch → sentence → contextual</div></div></div></div><div class="section"><div class="section-title">語言淘汰邏輯</div><div class="learning-grid"><div class="learning-card"><h3>English 96%</h3><p>accepted · Spoken 與字幕均達標時收錄。</p></div><div class="learning-card"><h3>English 81%</h3><p>accepted · 進入一般收錄門檻。</p></div><div class="learning-card"><h3>English 43% / Japanese 92%</h3><p>rejected · 非英語主導影片直接排除。</p></div></div></div>`;
}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
window.go=go;window.updateSearch=updateSearch;window.renderMain=renderMain;window.seek=seek;window.setSpeed=setSpeed;window.toggleTab=toggleTab;window.toggleFavorite=toggleFavorite;window.addWord=addWord;window.removeWord=removeWord;window.toggleMicro=toggleMicro;window.answerQuiz=answerQuiz;window.nextQuiz=nextQuiz;window.toast=toast;
boot();
