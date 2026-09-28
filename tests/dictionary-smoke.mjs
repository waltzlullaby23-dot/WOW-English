import fs from 'node:fs';

const catalog=JSON.parse(fs.readFileSync('data/catalog.json','utf8'));
const words=new Set();
for(const v of (catalog.videos||[])){
  for(const s of (v.transcript||[])){
    for(const m of String(s.en||'').matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)) words.add(m[0].toLowerCase());
  }
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url,ms=7000){
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),ms);
  try{const r=await fetch(url,{signal:ctl.signal,headers:{'accept':'application/json'}});if(!r.ok)return null;return await r.json();}
  catch{return null}finally{clearTimeout(t)}
}
async function hasAudio(word,entry){
  const ph=(entry?.phonetics||[]).map(x=>x?.audio).filter(Boolean);
  if(ph.length)return true;
  const url='https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(word)+'&type=2';
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),5000);
  try{const r=await fetch(url,{signal:ctl.signal});const b=await r.arrayBuffer();return r.ok&&b.byteLength>1000;}
  catch{return false}finally{clearTimeout(t)}
}
async function translate(text){
  const g='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(text);
  const gd=await fetchJson(g);
  let zh='';
  if(Array.isArray(gd?.[0]))zh=gd[0].map(x=>Array.isArray(x)?(x[0]||''):'').join('').trim();
  if(/[\u3400-\u9fff]/.test(zh))return zh;
  const m='https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en|zh-TW';
  const md=await fetchJson(m);
  const mz=String(md?.responseData?.translatedText||'').trim();
  return /[\u3400-\u9fff]/.test(mz)?mz:'';
}

const COMMON_ZH={a:'一個；任何一個',an:'一個；任何一個',the:'這／那個；該',and:'和；以及',or:'或；或者',but:'但是；不過',how:'如何；怎麼',be:'是；存在',it:'它；這件事',on:'在……上；關於',often:'常常；經常',in:'在……裡；在……期間',of:'……的；關於',to:'到；向；為了',is:'是',are:'是；存在',was:'是（過去式）',were:'是（過去式）',we:'我們',you:'你；你們',he:'他',she:'她',they:'他們；她們；它們',this:'這個；這件事',that:'那個；那件事',i:'我',me:'我（受格）',my:'我的',your:'你的；你們的',our:'我們的',their:'他們的；她們的；它們的',can:'能；可以',could:'能夠；可以（較委婉）',will:'將；會',would:'會；將（較委婉）',do:'做；執行',does:'做；執行（第三人稱單數）',did:'做；執行（過去式）',not:'不；沒有',no:'不；沒有',yes:'是；好的',what:'什麼；所……的',why:'為什麼',which:'哪一個；哪一些',who:'誰',where:'哪裡；在哪裡',when:'何時；當……時',there:'那裡；有',here:'這裡',if:'如果；若',than:'比；與……相比',from:'從；來自',with:'和；與；用',for:'為了；給；對於',about:'關於；大約',as:'如同；作為；當……時',at:'在；於',by:'由；藉由；在……之前',into:'進入；到……裡面',out:'向外；出去',up:'向上；完成',down:'向下',over:'在……上方；超過',under:'在……下面',very:'非常',just:'只是；剛剛',also:'也；而且',only:'只有；僅僅',more:'更多；更',most:'最多；最',then:'然後；那時',so:'所以；如此；這麼',too:'也；太',all:'全部；所有',one:'一個；一；某一個',two:'兩個；二',three:'三個；三',first:'第一；首先',other:'其他的；另一個',another:'另一個；再一個',some:'一些；某些',any:'任何；一些',each:'每一個',many:'許多',much:'很多',few:'少數；一些',both:'兩者都',same:'相同的；同樣的',different:'不同的',right:'正確的；右邊的',wrong:'錯誤的',good:'好的',well:'很好地；健康的',important:'重要的',particular:'特定的；特別的',key:'關鍵的；關鍵',word:'單字；詞',words:'單字；詞語',th:'（序數字尾，如 4th）'};
const list=[...words];
const failures=[];
let done=0;
const workers=Array.from({length:6},async()=>{
  while(true){
    const idx=done++;
    if(idx>=list.length)return;
    const w=list[idx];
    const entry=(await fetchJson('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(w)))?.[0]||null;
    const translated=COMMON_ZH[w] || (entry
      ? await translate(entry.meanings?.[0]?.definitions?.[0]?.definition||w)
      : await translate(w));
    const audio=await hasAudio(w,entry);
    if(!translated||!audio)failures.push({word:w,translation:!!translated,audio,api:!!entry});
    await sleep(80);
  }
});
await Promise.all(workers);
console.log(JSON.stringify({
  videos:catalog.videos?.length||0,
  uniqueWords:list.length,
  passed:list.length-failures.length,
  failed:failures.length,
  failures:failures.slice(0,100)
},null,2));
if(failures.length)process.exit(1);
