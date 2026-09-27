const $=(s)=>document.querySelector(s);
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(n)=>Math.round((Number(n)||0)*100)+'%';
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const state={route:'learning',selectedVideo:null,selectedLesson:null,search:'',category:'all',subcategory:'all',level:'all',caption:'all',transcriptTab:'bilingual',subtitleSize:20,speed:1,word:null,sidebarCollapsed:false,quizBand:'400-600',quizIndex:0,quizAnswers:{}};
let catalog={videos:[]},taxonomy={categories:[]},lessons={chapters:[],microLessons:[]},toeic={bands:{}},wordBank={words:{}},learningUnits={units:{}};
let ytPlayer=null,ytTimer=null,categoryModalOpen=false;

async function boot(){
  const files=await Promise.all(['catalog','taxonomy','lessons','toeic','word-bank','learning-units'].map(x=>fetch('data/'+x+'.json',{cache:'no-store'}).then(r=>r.json())));
  [catalog,taxonomy,lessons,toeic,wordBank,learningUnits]=files;
  state.sidebarCollapsed=load('evl-sidebar-collapsed',false);
  parseHash();
}
function parseHash(){const p=location.hash.slice(1).split('/');state.route=p[0]||'learning';state.selectedVideo=state.route==='watch'?decodeURIComponent(p[1]||''):null;state.selectedLesson=state.route==='lesson'?decodeURIComponent(p[1]||''):null;if(state.route==='watch'&&!['english','bilingual','chinese'].includes(state.transcriptTab))state.transcriptTab='bilingual';if(history.scrollRestoration)history.scrollRestoration='manual';window.scrollTo(0,0);render();}
function go(route,id=''){location.hash=id?route+'/'+encodeURIComponent(id):route;}
window.addEventListener('hashchange',parseHash);
function favs(){return load('sanmu-favs',[])} function vocab(){return load('sanmu-vocab',{})} function history(){return load('sanmu-history',[])} function prog(){return load('sanmu-lessons',{})}
function updateSearch(v){state.search=v;renderMain();}
function openCategoryModal(){categoryModalOpen=true;render();}
function closeCategoryModal(){categoryModalOpen=false;render();}
function chooseCategory(id){state.category=id;state.subcategory='all';categoryModalOpen=false;go('explore');}
function toggleSidebar(){state.sidebarCollapsed=!state.sidebarCollapsed;save('evl-sidebar-collapsed',state.sidebarCollapsed);render();}
function daily(){return load('sanmu-daily',{date:new Date().toISOString().slice(0,10),minutes:0,sessions:0});}
function filteredVideos(){const q=state.search.trim().toLowerCase();return catalog.videos.filter(v=>{const txt=[v.title,v.channel,v.category,v.subcategory,...(v.tags||[])].join(' ').toLowerCase();return(!q||txt.includes(q))&&(state.category==='all'||v.category===state.category)&&(state.subcategory==='all'||v.subcategory===state.subcategory)&&(state.level==='all'||v.cefr===state.level)&&(state.caption==='all'||(state.caption==='ready'?v.captions==='available':v.captions!=='available'));});}
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
function content(){if(['learning','home'].includes(state.route))return home();if(state.route==='explore')return explore();if(state.route==='watch')return watch();if(state.route==='grammar')return grammar();if(state.route==='lesson')return lesson();if(state.route==='quiz')return quiz();if(state.route==='history')return listPage('觀看紀錄',history());if(state.route==='favorites')return listPage('收藏影片',favs().map(id=>catalog.videos.find(v=>v.id===id)).filter(Boolean));if(state.route==='vocabulary')return vocabularyPage();return home();}
function render(){destroyPlayer();document.querySelector('#app').innerHTML=shell(content());if(state.route==='watch')setTimeout(initPlayer,80);}
function renderMain(){const m=$('main');if(m){destroyPlayer();m.innerHTML=content();if(state.route==='watch')setTimeout(initPlayer,80);}}
function home(){const vids=catalog.videos.slice(0,8);return `<section class="hero"><div><div class="eyebrow">三木ENG · VIDEO LEARNING LAB</div><h1>影片學習，從聽懂一句開始。</h1><p>影片 → 逐句字幕 → 單字 → 片語 → 文法 → 測驗。影片庫會透過探索引擎持續增加，而不是固定幾百部。</p><div class="pills"><span>英文優先</span><span>13 大類</span><span>${taxonomy.totalSubcategories} 子類</span><span>30 章・150 微課</span></div></div><div class="hero-stats"><strong>${catalog.stats.accepted||vids.length}</strong><span>目前已收錄影片・持續更新</span><div class="stat-row"><div><b>${vids.filter(v=>v.captions==='available').length}</b><small>字幕可用</small></div><div><b>80</b><small>TOEIC 分級題</small></div></div></div></section><section><div class="section-head"><div><h2>今日學習</h2><p>看影片 → 雙語字幕 → 單字 → 片語 → 文法 → 測驗</p></div></div><div class="learning-path"><div><b>影片學習</b><p>${catalog.videos.length} 部種子內容；後台探索引擎持續擴充。</p><button onclick="go('explore')">開始看影片</button></div><div><b>字幕學習</b><p>英文 / 中英 / 中文，播放時逐句同步、高亮與自動捲動。</p><button onclick="go('watch',catalog.videos[0]?.id||'')">找有字幕影片</button></div><div><b>我的路徑</b><p>${Object.values(prog()).filter(Boolean).length}/150 微課完成・${Object.keys(vocab()).length} 個單字。</p><button onclick="go('grammar')">繼續文法</button></div></div></section><section><div class="section-head"><div><h2>推薦影片</h2><p>已通過英文與字幕資料檢查的內容。</p></div><button class="text-btn" onclick="go('explore')">探索全部 →</button></div><div class="video-grid">${vids.map(videoCard).join('')}</div></section>`;}
function videoCard(v){return `<article class="video-card" onclick="go('watch','${v.id}')"><div class="thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt=""><span class="grade">${esc(v.cefr)}</span><span class="duration">${esc(v.duration)}</span></div><div class="video-info"><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p><div class="chips"><span>EN ${pct(v.englishScore)}</span><span>${esc(v.subcategory)}</span><span>${v.translation==='available'?'中譯已備妥':'中譯待補'}</span></div></div></article>`;}
function explore(){const vs=filteredVideos(), subs=[...new Set(vs.map(v=>v.subcategory).filter(Boolean))];return `<div class="section-head"><div><h2>影片探索</h2><p>大量 Discovery → 語言檢查 → 字幕 → AI CEFR / 分類 → 去重。</p></div><span class="count-pill">${vs.length} 部</span></div><div class="filters"><select onchange="state.category=this.value;state.subcategory='all';renderMain()"><option value="all">全部分類</option>${taxonomy.categories.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><select onchange="state.subcategory=this.value;renderMain()"><option value="all">全部子類</option>${subs.map(s=>`<option ${state.subcategory===s?'selected':''}>${esc(s)}</option>`).join('')}</select><select onchange="state.level=this.value;renderMain()"><option value="all">全部 CEFR</option>${['A1','A2','B1','B2','C1','C2'].map(x=>`<option ${state.level===x?'selected':''}>${x}</option>`).join('')}</select><select onchange="state.caption=this.value;renderMain()"><option value="all">字幕狀態</option><option value="ready" ${state.caption==='ready'?'selected':''}>英文字幕已驗證</option><option value="pending" ${state.caption==='pending'?'selected':''}>字幕待補</option></select></div><div class="results-meta">Spoken Language ・ Caption Language ・ English Score ・ Multilingual Score ・ CEFR ・ AI Category ・ Fingerprint / Embedding Dedup</div><div class="video-grid">${vs.map(videoCard).join('')||'<div class="empty">沒有符合目前條件的影片。</div>'}</div>`;}
function ytEmbed(id){return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&rel=0&playsinline=1&hl=zh-TW&modestbranding=1`;}
function initPlayer(){if(state.route!=='watch')return;const iframe=$('#yt');if(!iframe)return;if(window.YT&&YT.Player){ytPlayer=new YT.Player('yt',{events:{onReady:()=>startSubtitleSync()}});}else if(!window.__ytWaiter){window.__ytWaiter=true;window.addEventListener('ytapiready',()=>{window.__ytWaiter=false;initPlayer()},{once:true});}}
function startSubtitleSync(){if(ytTimer)clearInterval(ytTimer);ytTimer=setInterval(()=>{if(!ytPlayer||typeof ytPlayer.getCurrentTime!=='function')return;let t=0;try{t=ytPlayer.getCurrentTime()}catch{return}syncSubtitle(t);},180);}
function syncSubtitle(t){
  const v=catalog.videos.find(x=>x.id===state.selectedVideo); if(!v)return;
  const seg=v.transcript||[]; let idx=-1;
  for(let i=0;i<seg.length;i++){const a=Number(seg[i].start)||0,b=Number(seg[i].end)||a+6;if(t>=a&&t<b){idx=i;break}}
  if(idx<0){for(let i=seg.length-1;i>=0;i--){if(t>=Number(seg[i].start)||0){idx=i;break}}}
  document.querySelectorAll('.segment').forEach((el,i)=>el.classList.toggle('active',i===idx));
  const active=document.querySelector('.segment.active');
  if(active && !window.__userScrollingSubtitle) active.scrollIntoView({behavior:'smooth',block:'center'});
}
function destroyPlayer(){if(ytTimer){clearInterval(ytTimer);ytTimer=null}try{ytPlayer?.destroy?.()}catch{}ytPlayer=null;}
function seek(t){if(ytPlayer?.seekTo){ytPlayer.seekTo(Number(t),true);ytPlayer.playVideo?.();}}
function setSpeed(s){state.speed=s;if(ytPlayer?.setPlaybackRate)try{ytPlayer.setPlaybackRate(s)}catch{}document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===s));}
function setSubtitleSize(s){
  const allowed=[75,100,125,150,200]; const n=Number(s)||100;
  const scale=allowed.includes(n)?n:100; state.subtitleSize=scale;
  const list=$('.subtitle-list');
  if(list){list.dataset.scale=String(scale);}
  document.querySelectorAll('.subtitle-scale-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.scale)===scale));
}
function setTab(t){state.transcriptTab=t;const list=$('.subtitle-list');if(list)list.innerHTML=subtitleHTML(catalog.videos.find(v=>v.id===state.selectedVideo));document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.textContent.trim()===(t==='english'?'英文':t==='bilingual'?'中英':'中文')));}
function subtitleHTML(v){return (v?.transcript||[]).map((s,i)=>`<div class="segment" onclick="seek(${Number(s.start)||0})"><div class="time">${fmt(s.start)} · sentence ${i+1}</div>${state.transcriptTab!=='chinese'?`<div class="en">${clickableSentence(s.en,v.id)}</div>`:''}${state.transcriptTab!=='english'?`<div class="zh">${esc(s.zh||'翻譯待補')}</div>`:''}</div>`).join('');}
function fmt(s){s=Number(s)||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');}
function clickableSentence(text,videoId){return esc(text).replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g,w=>{const k=w.toLowerCase();const info=wordBank.words?.[k];if(['a','an','the','and','or','but','if','to','of','in','on','at','for','from','by','with','as','is','are','was','were','be','been','being','am','do','does','did','have','has','had','can','could','will','would','should','may','might','must','this','that','these','those','it','its','they','them','their','we','our','you','your','i','he','she','his','her','what','which','who','when','where','why','how'].includes(k))return w;return `<button class="word-token ${info?'known':''}" onclick='event.stopPropagation();openWord(${JSON.stringify(k)},${JSON.stringify(videoId)},${JSON.stringify(text)})'>${w}</button>`;});}
function watch(){
  const v=catalog.videos.find(x=>x.id===state.selectedVideo)||catalog.videos[0];
  if(!v)return '<div class="empty">尚無影片。</div>';
  markHistory(v);
  const unit=learningUnits.units?.[v.id]||{};
  return `<div class="watch-page">
    <div class="player-card">
      <div class="player"><iframe id="yt" src="${ytEmbed(v.id)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
      <div class="player-tools">
        <button data-speed="0.75" onclick="setSpeed(.75)">0.75×</button><button data-speed="1" class="active" onclick="setSpeed(1)">1×</button><button data-speed="1.25" onclick="setSpeed(1.25)">1.25×</button><button data-speed="1.5" onclick="setSpeed(1.5)">1.5×</button><span></span><button onclick="toggleFav('${v.id}')">${favs().includes(v.id)?'♥ 已收藏':'♡ 收藏'}</button>
      </div>
      <div class="subtitle-control"><label>字幕大小</label>
        <div class="subtitle-scale"><button class="subtitle-scale-btn" data-scale="75" onclick="setSubtitleSize(75)">75%</button><button class="subtitle-scale-btn active" data-scale="100" onclick="setSubtitleSize(100)">100%</button><button class="subtitle-scale-btn" data-scale="125" onclick="setSubtitleSize(125)">125%</button><button class="subtitle-scale-btn" data-scale="150" onclick="setSubtitleSize(150)">150%</button><button class="subtitle-scale-btn" data-scale="200" onclick="setSubtitleSize(200)">200%</button></div>
      </div>
      <h1>${esc(v.title)}</h1><p class="watch-meta">${esc(v.channel)} ・ ${esc(v.duration)} ・ CEFR ${esc(v.cefr)} ・ English ${pct(v.englishScore)}</p>
    </div>
    <div class="panel subtitle-panel">
      <div class="panel-head"><div><h2>字幕工作區</h2><p>字幕會依影片時間逐句高亮；點擊句子可跳轉。頁面只有一個滑鼠滾動區。</p></div><span class="pill green">${v.translation==='available'?'逐句翻譯已備妥':'中文翻譯待補'}</span></div>
      <div class="tabs"><button class="${state.transcriptTab==='english'?'active':''}" onclick="setTab('english')">英文</button><button class="${state.transcriptTab==='bilingual'?'active':''}" onclick="setTab('bilingual')">中英</button><button class="${state.transcriptTab==='chinese'?'active':''}" onclick="setTab('chinese')">中文</button></div>
      <div class="subtitle-list" data-scale="${state.subtitleSize||100}">${subtitleHTML(v)}</div>
    </div>
    <div class="learning-row">
      <div class="panel"><div class="panel-head"><h2>單字</h2><span>${(unit.vocabulary||[]).length}</span></div><div class="unit-list">${(unit.vocabulary||[]).slice(0,10).map(x=>`<button onclick='openWord(${JSON.stringify(x.word||'')},${JSON.stringify(v.id)},${JSON.stringify(x.example||'')})'><b>${esc(x.word||'')}</b>${x.definition_zh?' · '+esc(x.definition_zh):''}</button>`).join('')||'尚未生成'}</div></div>
      <div class="panel"><div class="panel-head"><h2>片語</h2><span>${(unit.phrases||[]).length}</span></div><div class="unit-list">${(unit.phrases||[]).slice(0,8).map(x=>`<div><b>${esc(x.phrase||'')}</b>${x.meaning_zh?' · '+esc(x.meaning_zh):''}</div>`).join('')||'尚未生成'}</div></div>
      <div class="panel"><div class="panel-head"><h2>文法</h2><span>${(unit.grammar||[]).length}</span></div><div class="unit-list">${(unit.grammar||[]).slice(0,6).map(x=>`<div><b>${esc(x.topic||'')}</b>${x.explanation_zh?' · '+esc(x.explanation_zh):''}</div>`).join('')||'尚未生成'}</div></div>
    </div>
  </div>`;
}
function markHistory(v){let h=history(),i=h.findIndex(x=>x.id===v.id);const item={id:v.id,title:v.title,updatedAt:new Date().toISOString()};if(i>=0)h[i]={...h[i],...item};else h.unshift(item);save('sanmu-history',h.slice(0,200));let d=daily();d.minutes+=1;d.sessions+=1;save('sanmu-daily',d);}
function toggleFav(id){let f=favs();f=f.includes(id)?f.filter(x=>x!==id):[...f,id];save('sanmu-favs',f);render();}
function openWord(word,sourceVideoId='',sourceSentence=''){const info=wordBank.words?.[String(word).toLowerCase()]||{};state.word={word,sourceVideoId,sourceSentence,...info};render();}
function closeWord(){state.word=null;render();}
function speak(text,locale){if(!window.speechSynthesis)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=locale;speechSynthesis.speak(u);}
function addWord(){const w=state.word;if(!w)return;const v=vocab();v[String(w.word).toLowerCase()]={...w,addedAt:new Date().toISOString()};save('sanmu-vocab',v);render();}
function wordModal(){const w=state.word,fav=Object.keys(vocab()).includes(String(w.word).toLowerCase());return `<div class="modal-backdrop" onclick="closeWord()"><div class="word-modal" onclick="event.stopPropagation()"><div class="modal-head"><div><div class="word-title">${esc(w.word)}</div><div>${esc(w.pos||'')}</div></div><button onclick="closeWord()">×</button></div><div class="pron-row"><span>英式 ${esc(w.phonetic_uk||'')}</span><button onclick="speak(${JSON.stringify(w.word)},'en-GB')">🔊 英式</button><span>美式 ${esc(w.phonetic_us||'')}</span><button onclick="speak(${JSON.stringify(w.word)},'en-US')">🔊 美式</button></div><section><label>中文解釋</label><p>${esc(w.definition_zh||'目前尚無完整詞條，之後可由 AI 詞典層補充。')}</p></section><section><label>English meaning</label><p>${esc(w.gloss||'—')}</p></section><section><label>例句</label><p>${esc(w.example||w.sourceSentence||'—')}</p></section><button class="primary" onclick="addWord()">${fav?'♥ 已收藏':'♡ 收藏單字'}</button></div></div>`;}
function grammar(){const done=Object.values(prog()).filter(Boolean).length;return `<div class="section-head"><div><h2>英文文法 · 30 章 / 150 微課</h2><p>Form → Meaning → Use → Contrast → Error；每課都有說明、句型、例句、常見錯誤與練習。</p></div><span class="count-pill">${done}/150</span></div><div class="overview-progress"><strong>${done} / 150 課</strong><div><i style="width:${done/1.5}%"></i></div></div><div class="chapter-grid">${lessons.chapters.map(c=>{const ms=lessons.microLessons.filter(m=>m.chapter_id===c[0]);return `<article class="chapter"><div class="chapter-head"><h3>${c[0]}. ${esc(c[1])}</h3><span>${esc(c[3]||'')}</span></div><p>${esc(c[2])}</p><div class="micro-list">${ms.map(m=>`<button class="micro-btn ${prog()[m.lesson_id]?'done':''}" onclick="go('lesson','${m.lesson_id}')"><span>${m.lesson_id.split('-')[1]}</span>${esc(m.title_zh)}<i>→</i></button>`).join('')}</div></article>`}).join('')}</div>`;}
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
  if(state.route!=='watch') return;
  const iframe=document.getElementById('yt');
  if(!iframe) return;
  if(window.YT && window.YT.Player){
    try{
      if(ytPlayer && typeof ytPlayer.destroy==='function') ytPlayer.destroy();
    }catch{}
    ytPlayer=new YT.Player('yt',{
      events:{
        onReady:function(){ startSubtitleSync(); setSpeed(state.speed||1); }
      }
    });
    return;
  }
  if(window.__ytApiReady){
    setTimeout(initPlayer,100);
    return;
  }
  if(!window.__ytWaiterV5){
    window.__ytWaiterV5=true;
    window.addEventListener('ytapiready',function(){
      window.__ytWaiterV5=false;
      setTimeout(initPlayer,50);
    },{once:true});
  }
}
function startSubtitleSync(){
  if(ytTimer) clearInterval(ytTimer);
  ytTimer=setInterval(function(){
    if(!ytPlayer || typeof ytPlayer.getCurrentTime!=='function') return;
    let t=0;
    try{t=Number(ytPlayer.getCurrentTime())||0}catch{return}
    syncSubtitle(t);
  },120);
}
function syncSubtitle(t){
  const v=selectedVideo(); const segs=v?.transcript||[];
  if(!segs.length) return;
  let idx=-1;
  for(let i=0;i<segs.length;i++){
    const a=Number(segs[i].start)||0; const b=Number(segs[i].end);
    const end=Number.isFinite(b)&&b>a?b:a+6;
    if(t>=a&&t<end){idx=i;break;}
  }
  if(idx<0) for(let i=segs.length-1;i>=0;i--){if(t>=(Number(segs[i].start)||0)){idx=i;break;}}
  const list=document.querySelector('.subtitle-list'); if(!list)return;
  list.querySelectorAll('.segment').forEach((el,i)=>el.classList.toggle('active',i===idx));
  const active=list.querySelector('.segment.active');
  if(active&&idx>=0&&!window.__userScrollingSubtitle) active.scrollIntoView({behavior:'smooth',block:'center'});
}
function destroyPlayer(){
  if(ytTimer){clearInterval(ytTimer);ytTimer=null;}
  try{if(ytPlayer&&typeof ytPlayer.destroy==='function')ytPlayer.destroy();}catch{}
  ytPlayer=null;
}
function seek(sec){
  const t=Number(sec)||0;
  if(ytPlayer && typeof ytPlayer.seekTo==='function'){
    try{ytPlayer.seekTo(t,true); if(typeof ytPlayer.playVideo==='function')ytPlayer.playVideo();return;}catch{}
  }
}
function setSpeed(s){
  state.speed=Number(s)||1;
  if(ytPlayer&&typeof ytPlayer.setPlaybackRate==='function'){
    try{ytPlayer.setPlaybackRate(state.speed);}catch{}
  }
  document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===state.speed));
}
function subtitleHTML(v){
  const segs=v?.transcript||[];
  if(!segs.length) return '';
  return segs.map(function(s,i){
    return `<div class="segment" data-index="${i}" onclick="seek(${Number(s.start)||0})">
      <div class="time">${fmt(s.start)} · sentence ${i+1}</div>
      ${state.transcriptTab!=='chinese'?`<div class="en">${clickableSentence(s.en||'',v.id)}</div>`:''}
      ${state.transcriptTab!=='english'?`<div class="zh">${esc(s.zh||'翻譯待補')}</div>`:''}
    </div>`;
  }).join('');
}
function setTab(t){
  state.transcriptTab=t;
  const v=selectedVideo();
  const list=document.querySelector('.subtitle-list');
  if(list){
    list.innerHTML=subtitleHTML(v);
    applySubtitleScaleToList(list);
  }
}
function render(){
  destroyPlayer();
  document.querySelector('#app').innerHTML=shell(content());
  if(state.route==='watch') setTimeout(initPlayer,80);
}
function renderMain(){
  const m=document.querySelector('main');
  if(m){
    destroyPlayer();
    m.innerHTML=content();
    if(state.route==='watch') setTimeout(initPlayer,80);
  }
}

function shell(main){
  const d=daily(), collapsed=state.sidebarCollapsed;
  const done=Object.values(prog()).filter(Boolean).length;
  return `<div class="app ${collapsed?'sidebar-collapsed':''}">
  <header class="topbar">
    <a class="brand" href="#learning"><img src="assets/logo.png" alt="三木Eng"></a>
    <div class="search"><input value="${esc(state.search)}" oninput="updateSearch(this.value)" onkeydown="handleSearchKey(event,this.value)" placeholder="搜尋影片、主題、單字、頻道… 或貼上 YouTube 網址"></div>
    <div class="top-actions"><button onclick="go('learning')">影片學習</button></div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand-mini"><span>三木</span><button class="sidebar-toggle" onclick="toggleSidebar()">${collapsed?'»':'«'}</button></div>
      <button class="side-main ${['learning','watch'].includes(state.route)?'active':''}" onclick="go('learning')"><span class="side-icon">▶</span><span><b>影片學習</b><small>影片・字幕・單字</small></span></button>
      <button class="side-main ${['grammar','lesson'].includes(state.route)?'active':''}" onclick="go('grammar')"><span class="side-icon">文</span><span><b>英文文法</b><small>30 章 · 150 微課</small></span></button>
      <button class="side-main ${state.route==='quiz'?'active':''}" onclick="go('quiz')"><span class="side-icon">測</span><span><b>多益練習</b><small>4 級距 · 20 題</small></span></button>
      <div class="side-label">影片工具</div>
      <button class="side-tool" onclick="go('history')"><span>▤</span><span><b>觀看紀錄</b><small>${history().length} 部</small></span></button>
      <button class="side-tool" onclick="go('favorites')"><span>♡</span><span><b>收藏影片</b><small>${favs().length} 部</small></span></button>
      <button class="side-tool" onclick="go('vocabulary')"><span>Aa</span><span><b>我的單字庫</b><small>${Object.keys(vocab()).length} 字</small></span></button>
      <div class="side-label">分類</div>
      <button class="category-launch" onclick="openCategoryModal()"><span>▦</span><span><b>選擇分類</b><small>${state.category==='all'?'全部 13 大類':esc((taxonomy.categories.find(c=>c.id===state.category)||{}).name||'')}</small></span></button>
      <div class="side-bottom"><div class="progress-card"><small>文法微課進度</small><strong>${done} / 150 課</strong><div><i style="width:${Math.min(100,done/1.5)}%"></i></div></div><div class="daily">今日學習 <b>${d.minutes}</b> 分鐘・<b>${d.sessions}</b> 次</div></div>
    </aside>
    <main>${main}</main>
  </div>
  ${categoryModalOpen?categoryModal():''}${state.word?wordModal():''}</div>`;
}

function watch(){
  const v=selectedVideo();
  if(!v)return '<div class="empty">找不到影片。</div>';
  markHistory(v);
  const unit=learningUnits.units?.[v.id]||{};
  const external=!!v.external;
  const hasTranscript=(v.transcript||[]).length>0;
  const translationReady=hasTranscript && v.transcript.every(s=>String(s.zh||'').trim());
  const scale=state.subtitleScale||1;
  const nativeCc=external ? '&cc_load_policy=1&cc_lang_pref=zh-TW' : '';
  return `<div class="watch-page">
    <div class="player-card">
      <div class="player"><iframe id="yt" src="${ytEmbed(v.id)+nativeCc}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
      <div class="player-tools">
        <button data-speed="0.75" onclick="setSpeed(.75)">0.75×</button>
        <button data-speed="1" onclick="setSpeed(1)">1×</button>
        <button data-speed="1.25" onclick="setSpeed(1.25)">1.25×</button>
        <button data-speed="1.5" onclick="setSpeed(1.5)">1.5×</button>
        <span></span>
        <button onclick="toggleFav('${v.id}')">${favs().includes(v.id)?'♥ 已收藏':'♡ 收藏'}</button>
      </div>
      <div class="subtitle-control scale-control">
        <label>字幕大小</label>
        ${[[.75,'75%'],[1,'100%'],[1.25,'125%'],[1.5,'150%'],[2,'200%']].map(x=>`<button class="subtitle-scale-btn ${scale===x[0]?'active':''}" data-scale="${x[0]}" onclick="setSubtitleScale(${x[0]})">${x[1]}</button>`).join('')}
        <small>英文 ${Math.round(20*scale)}px · 中文字幕 ${Math.round(Math.max(14,17.5*scale))}px</small>
      </div>
      <h1>${esc(v.title)}</h1>
      <p class="watch-meta">${esc(v.channel)} ${v.duration?'・ '+esc(v.duration):''} ${v.cefr&&v.cefr!=='—'?'・ CEFR '+esc(v.cefr):''}</p>
    </div>

    <div class="panel subtitle-panel">
      <div class="panel-head"><div><h2>字幕工作區</h2><p>${external?'這部影片尚未進入三木Eng字幕/翻譯資料庫；播放器保留 YouTube 原生字幕作為 fallback。':'播放時依影片時間自動逐句同步、高亮與自動捲動；點任何一句即可跳轉。'}</p></div><span class="pill ${translationReady?'green':''}">${external?'等待內容引擎處理':translationReady?'逐句翻譯已備妥':'中文翻譯待補'}</span></div>
      <div class="tabs"><button class="${state.transcriptTab==='english'?'active':''}" onclick="setTab('english')">英文</button><button class="${state.transcriptTab==='bilingual'?'active':''}" onclick="setTab('bilingual')">中英</button><button class="${state.transcriptTab==='chinese'?'active':''}" onclick="setTab('chinese')">中文</button></div>
      <div class="subtitle-list" style="--en-size:${20*scale}px;--zh-size:${Math.max(14,17.5*scale)}px">${hasTranscript?subtitleHTML(v):`<div class="empty"><b>尚無三木Eng逐句翻譯資料</b><p>直接貼 YouTube 網址可以播放；要進入三木Eng的逐句英文/中文學習工作區，影片需要先經內容探索引擎取得字幕並完成翻譯。</p><p>若影片本身有 YouTube CC，播放器已開啟原生字幕 fallback。</p></div>`}</div>
    </div>

    ${external?'':`<div class="learning-row">
      <div class="panel"><div class="panel-head"><h2>單字</h2><span>${(unit.vocabulary||[]).length}</span></div><div class="unit-list">${(unit.vocabulary||[]).slice(0,10).map(x=>`<button onclick='openWord(${JSON.stringify(x.word||'')},${JSON.stringify(v.id)},${JSON.stringify(x.example||'')})'><b>${esc(x.word||'')}</b>${x.definition_zh?' · '+esc(x.definition_zh):''}</button>`).join('')||'尚未生成'}</div></div>
      <div class="panel"><div class="panel-head"><h2>片語</h2><span>${(unit.phrases||[]).length}</span></div><div class="unit-list">${(unit.phrases||[]).slice(0,8).map(x=>`<div><b>${esc(x.phrase||'')}</b>${x.meaning_zh?' · '+esc(x.meaning_zh):''}</div>`).join('')||'尚未生成'}</div></div>
      <div class="panel"><div class="panel-head"><h2>文法</h2><span>${(unit.grammar||[]).length}</span></div><div class="unit-list">${(unit.grammar||[]).slice(0,6).map(x=>`<div><b>${esc(x.topic||'')}</b>${x.explanation_zh?' · '+esc(x.explanation_zh):''}</div>`).join('')||'尚未生成'}</div></div>
    </div>`}
  </div>`;
}

function ytEmbed(id){
  const origin=encodeURIComponent(location.origin);
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${origin}&rel=0&playsinline=1&hl=zh-TW&modestbranding=1`;
}

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

boot();
