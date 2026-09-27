/* SANMUENG V7 FINAL FRONTEND OVERRIDE
   - remove duplicate top-left menu button
   - remove "探索引擎" navigation
   - single page scroll on watch pages
   - robust YouTube IFrame API sync
   - subtitle modes: English / 中英 / 中文
   - subtitle scale: 75/100/125/150/200%
*/
state.subtitleScale = Number(load('sanmu-subtitle-scale', 1)) || 1;
let sanmuFollowPauseUntil = 0;
let sanmuLastSubtitleIndex = -1;

(function installUserScrollPause(){
  if(window.__sanmuV7ScrollPauseInstalled) return;
  window.__sanmuV7ScrollPauseInstalled = true;
  ['wheel','touchstart','pointerdown','keydown'].forEach(type=>{
    document.addEventListener(type, ()=>{ sanmuFollowPauseUntil = Date.now()+3500; }, {passive:true});
  });
})();

function ensureYouTubeApi(){
  if(window.YT && typeof window.YT.Player==='function') return Promise.resolve(true);
  if(window.__sanmuYtPromise) return window.__sanmuYtPromise;
  window.__sanmuYtPromise = new Promise(resolve=>{
    let done=false;
    const finish=()=>{
      if(done) return;
      done=true;
      window.removeEventListener('ytapiready',finish);
      resolve(!!(window.YT && typeof window.YT.Player==='function'));
    };
    window.addEventListener('ytapiready',finish,{once:true});
    setTimeout(finish,7000);
  });
  return window.__sanmuYtPromise;
}

async function initPlayer(){
  if(state.route!=='watch') return;
  const iframe=document.getElementById('yt');
  if(!iframe) return;
  const status=document.getElementById('player-status');
  if(status) status.textContent='播放器連線中…';
  const ready=await ensureYouTubeApi();
  if(!ready){ if(status) status.textContent='YouTube 播放器 API 尚未就緒，請重新整理頁面。'; return; }
  try{ytPlayer?.destroy?.();}catch{}
  ytPlayer=new YT.Player('yt',{
    events:{
      onReady:()=>{
        if(status) status.textContent='播放與字幕同步已啟用';
        startSubtitleSync();
        setSpeed(state.speed||1);
      },
      onError:()=>{ if(status) status.textContent='YouTube 播放器載入失敗。'; }
    }
  });
}

function startSubtitleSync(){
  if(ytTimer) clearInterval(ytTimer);
  ytTimer=setInterval(()=>{
    if(!ytPlayer || typeof ytPlayer.getCurrentTime!=='function') return;
    let t=0;
    try{ t=Number(ytPlayer.getCurrentTime())||0; }catch{return}
    syncSubtitle(t);
  },180);
}

function syncSubtitle(t){
  const v=selectedVideo();
  const segs=v?.transcript||[];
  const list=document.querySelector('.subtitle-list');
  if(!list || !segs.length) return;
  let idx=-1;
  for(let i=0;i<segs.length;i++){
    const a=Math.max(0,Number(segs[i].start)||0);
    const b0=Number(segs[i].end);
    const b=Number.isFinite(b0)&&b0>a?b0:a+8;
    if(t>=a && t<b){ idx=i; break; }
  }
  if(idx<0){
    for(let i=segs.length-1;i>=0;i--){
      if(t >= (Number(segs[i].start)||0)){ idx=i; break; }
    }
  }
  list.querySelectorAll('.segment').forEach((el,i)=>el.classList.toggle('active',i===idx));
  if(idx>=0 && idx!==sanmuLastSubtitleIndex){
    sanmuLastSubtitleIndex=idx;
    if(Date.now()>=sanmuFollowPauseUntil){
      const active=list.querySelector('.segment[data-index="'+idx+'"]');
      if(active){
        const r=active.getBoundingClientRect();
        const topBand=90;
        const bottomBand=window.innerHeight-90;
        if(r.top<topBand || r.bottom>bottomBand){
          active.scrollIntoView({behavior:'smooth',block:'center'});
        }
      }
    }
  }
}

function destroyPlayer(){
  if(ytTimer){clearInterval(ytTimer);ytTimer=null;}
  try{ytPlayer?.destroy?.();}catch{}
  ytPlayer=null;
  sanmuLastSubtitleIndex=-1;
}

function seek(sec){
  const t=Math.max(0,Number(sec)||0);
  if(ytPlayer?.seekTo){
    try{ytPlayer.seekTo(t,true);ytPlayer.playVideo?.();}catch{}
  }
}

function setSpeed(s){
  state.speed=Number(s)||1;
  if(ytPlayer?.setPlaybackRate){try{ytPlayer.setPlaybackRate(state.speed);}catch{}}
  document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===state.speed));
}

function setSubtitleScale(scale){
  const n=Number(scale)||1;
  state.subtitleScale=Math.max(.75,Math.min(2,n));
  save('sanmu-subtitle-scale',state.subtitleScale);
  const list=document.querySelector('.subtitle-list');
  if(list) applySubtitleScaleToList(list);
  document.querySelectorAll('.subtitle-scale-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.scale)===state.subtitleScale));
}
function applySubtitleScaleToList(list){
  const base=20*state.subtitleScale;
  list.style.setProperty('--en-size',base+'px');
  list.style.setProperty('--zh-size',Math.max(15,base*.88)+'px');
}
function setSubtitleSize(s){setSubtitleScale((Number(s)||100)/100);}

function subtitleHTML(v){
  const segs=v?.transcript||[];
  if(!segs.length) return '<div class="subtitle-empty">這部影片目前沒有通過字幕完整性驗證。</div>';
  return segs.map((s,i)=>{
    const en=String(s.en||s.text||'').trim();
    const zh=String(s.zh||s.zh_tw||s.translation||'').trim();
    return '<div class="segment" data-index="'+i+'" onclick="seek('+(Number(s.start)||0)+')">'+
      '<div class="time">'+fmt(s.start)+' · sentence '+(i+1)+'</div>'+
      (state.transcriptTab!=='chinese'?'<div class="en">'+clickableSentence(en,v.id)+'</div>':'')+
      (state.transcriptTab!=='english'?'<div class="zh">'+esc(zh||'中文翻譯待補')+'</div>':'')+
      '</div>';
  }).join('');
}

function setTab(t){
  if(!['english','bilingual','chinese'].includes(t)) t='bilingual';
  state.transcriptTab=t;
  const list=document.querySelector('.subtitle-list');
  if(list){
    list.innerHTML=subtitleHTML(selectedVideo());
    applySubtitleScaleToList(list);
    sanmuLastSubtitleIndex=-1;
  }
  document.querySelectorAll('.tabs button').forEach(b=>{
    const txt=b.textContent.trim();
    b.classList.toggle('active',(txt==='英文'&&t==='english')||(txt==='中英'&&t==='bilingual')||(txt==='中文'&&t==='chinese'));
  });
}

function content(){
  if(['learning','home'].includes(state.route)) return home();
  if(state.route==='explore') return explore();
  if(state.route==='watch') return watch();
  if(state.route==='grammar') return grammar();
  if(state.route==='lesson') return lesson();
  if(state.route==='quiz') return quiz();
  if(state.route==='history') return listPage('觀看紀錄',history());
  if(state.route==='favorites') return listPage('收藏影片',favs().map(id=>catalog.videos.find(v=>v.id===id)).filter(Boolean));
  if(state.route==='vocabulary') return vocabularyPage();
  if(state.route==='engine') return home();
  return home();
}

function shell(main){
  const d=daily(), collapsed=state.sidebarCollapsed;
  const done=Object.values(prog()).filter(Boolean).length;
  return '<div class="app '+(collapsed?'sidebar-collapsed':'')+'">'+
    '<header class="topbar">'+
      '<a class="brand" href="#learning"><img src="assets/logo.png" alt="三木Eng"></a>'+
      '<div class="search"><input value="'+esc(state.search)+'" oninput="updateSearch(this.value)" onkeydown="handleSearchKey(event,this.value)" placeholder="搜尋影片、主題、單字、頻道… 或貼上 YouTube 網址"></div>'+
      '<div class="top-actions"><button onclick="go(\'learning\')">影片學習</button></div>'+
    '</header>'+ 
    '<div class="layout">'+
      '<aside class="sidebar">'+
        '<div class="brand-mini"><span>三木</span><button onclick="toggleSidebar()">'+(collapsed?'»':'«')+'</button></div>'+
        '<button class="side-main '+(['learning','watch'].includes(state.route)?'active':'')+'" onclick="go(\'learning\')"><span class="side-icon">▶</span><span><b>影片學習</b><small>影片・字幕・單字</small></span></button>'+
        '<button class="side-main '+(['grammar','lesson'].includes(state.route)?'active':'')+'" onclick="go(\'grammar\')"><span class="side-icon">文</span><span><b>英文文法</b><small>30 章 · 150 微課</small></span></button>'+
        '<button class="side-main '+(state.route==='quiz'?'active':'')+'" onclick="go(\'quiz\')"><span class="side-icon">測</span><span><b>多益練習</b><small>4 級距 · 20 題</small></span></button>'+
        '<div class="side-label">影片工具</div>'+
        '<button class="side-tool" onclick="go(\'history\')"><span>▤</span><span><b>觀看紀錄</b><small>'+history().length+' 部</small></span></button>'+
        '<button class="side-tool" onclick="go(\'favorites\')"><span>♡</span><span><b>收藏影片</b><small>'+favs().length+' 部</small></span></button>'+
        '<button class="side-tool" onclick="go(\'vocabulary\')"><span>Aa</span><span><b>我的單字庫</b><small>'+Object.keys(vocab()).length+' 字</small></span></button>'+
        '<div class="side-label">分類</div>'+ 
        '<button class="category-launch" onclick="openCategoryModal()"><span>▦</span><span><b>選擇分類</b><small>'+(state.category==='all'?'全部 13 大類':esc((taxonomy.categories.find(c=>c.id===state.category)||{}).name||''))+'</small></span></button>'+
        '<div class="side-bottom"><div class="progress-card"><small>文法微課進度</small><strong>'+done+' / 150 課</strong><div><i style="width:'+Math.min(100,done/1.5)+'%"></i></div></div><div class="daily">今日學習 <b>'+d.minutes+'</b> 分鐘・<b>'+d.sessions+'</b> 次</div></div>'+ 
      '</aside>'+ 
      '<main>'+main+'</main>'+ 
    '</div>'+ 
    (categoryModalOpen?categoryModal():'')+(state.word?wordModal():'')+ 
    '</div>';
}

function watch(){
  const v=selectedVideo();
  if(!v) return '<div class="empty">找不到影片。</div>';
  markHistory(v);
  const unit=learningUnits.units?.[v.id]||{};
  const segs=v.transcript||[];
  const translationReady=segs.length>0 && segs.every(s=>String(s.zh||s.zh_tw||s.translation||'').trim());
  const captionVerified=v.captionQuality==='verified' || (segs.length>=20);
  const scale=state.subtitleScale||1;
  return '<div class="watch-page">'+
    '<div class="player-card">'+
      '<div class="player"><iframe id="yt" src="'+ytEmbed(v.id)+'" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>'+
      '<div class="player-status" id="player-status">播放器載入中…</div>'+
      '<div class="player-tools">'+
        '<button data-speed="0.75" onclick="setSpeed(.75)">0.75×</button>'+
        '<button data-speed="1" class="active" onclick="setSpeed(1)">1×</button>'+ 
        '<button data-speed="1.25" onclick="setSpeed(1.25)">1.25×</button>'+ 
        '<button data-speed="1.5" onclick="setSpeed(1.5)">1.5×</button>'+ 
        '<span></span>'+ 
        '<button onclick="toggleFav(\''+esc(v.id)+'\')">'+(favs().includes(v.id)?'♥ 已收藏':'♡ 收藏')+'</button>'+ 
      '</div>'+ 
      '<div class="scale-control"><label>字幕大小</label>'+ 
        ['.75','1','1.25','1.5','2'].map(s=>{const n=Number(s);return '<button class="subtitle-scale-btn '+(Math.abs(scale-n)<.001?'active':'')+'" data-scale="'+n+'" onclick="setSubtitleScale('+n+')">'+Math.round(n*100)+'%</button>';}).join('')+ 
        '<small>目前 '+Math.round(scale*100)+'%</small>'+ 
      '</div>'+ 
      '<h1>'+esc(v.title)+'</h1>'+ 
      '<p class="watch-meta">'+esc(v.channel)+' ・ '+esc(v.duration)+' ・ CEFR '+esc(v.cefr)+' ・ English '+pct(v.englishScore)+'</p>'+ 
    '</div>'+ 
    '<div class="panel subtitle-panel">'+ 
      '<div class="panel-head"><div><h2>字幕工作區</h2><p>英文／中英／中文；播放時間會逐句同步高亮。頁面使用單一主滾動，不再用內嵌字幕滾輪。</p></div>'+ 
      '<span class="pill green">'+(captionVerified?'字幕已驗證':'字幕待驗證')+' ・ '+(translationReady?'中文翻譯已完成':'中文翻譯待完成')+'</span></div>'+ 
      '<div class="tabs"><button class="'+(state.transcriptTab==='english'?'active':'')+'" onclick="setTab(\'english\')">英文</button><button class="'+(state.transcriptTab==='bilingual'?'active':'')+'" onclick="setTab(\'bilingual\')">中英</button><button class="'+(state.transcriptTab==='chinese'?'active':'')+'" onclick="setTab(\'chinese\')">中文</button></div>'+ 
      '<div class="subtitle-list" style="--en-size:'+20*scale+'px;--zh-size:'+Math.max(15,20*scale*.88)+'px">'+subtitleHTML(v)+'</div>'+ 
    '</div>'+ 
    '<div class="learning-row">'+ 
      '<div class="panel"><div class="panel-head"><h2>單字</h2><span>'+((unit.vocabulary||[]).length)+'</span></div><div class="unit-list">'+(((unit.vocabulary||[]).slice(0,10).map(x=>'<button onclick=\'openWord('+JSON.stringify(x.word||'')+','+JSON.stringify(v.id)+','+JSON.stringify(x.example||'')+')\'><b>'+esc(x.word||'')+'</b>'+(x.definition_zh?' · '+esc(x.definition_zh):'')+'</button>').join(''))||'尚未生成')+'</div></div>'+ 
      '<div class="panel"><div class="panel-head"><h2>片語</h2><span>'+((unit.phrases||[]).length)+'</span></div><div class="unit-list">'+(((unit.phrases||[]).slice(0,8).map(x=>'<div><b>'+esc(x.phrase||'')+'</b>'+(x.meaning_zh?' · '+esc(x.meaning_zh):'')+'</div>').join(''))||'尚未生成')+'</div></div>'+ 
      '<div class="panel"><div class="panel-head"><h2>文法</h2><span>'+((unit.grammar||[]).length)+'</span></div><div class="unit-list">'+(((unit.grammar||[]).slice(0,6).map(x=>'<div><b>'+esc(x.topic||'')+'</b>'+(x.explanation_zh?' · '+esc(x.explanation_zh):'')+'</div>').join(''))||'尚未生成')+'</div></div>'+ 
    '</div>'+ 
  '</div>';
}

function render(){
  destroyPlayer();
  document.querySelector('#app').innerHTML=shell(content());
  if(state.route==='watch') setTimeout(initPlayer,60);
}
function renderMain(){
  const m=document.querySelector('main');
  if(m){destroyPlayer();m.innerHTML=content();if(state.route==='watch')setTimeout(initPlayer,60);}
}

window.setSubtitleScale=setSubtitleScale;
window.setSubtitleSize=setSubtitleSize;
window.setTab=setTab;
window.seek=seek;
window.setSpeed=setSpeed;
