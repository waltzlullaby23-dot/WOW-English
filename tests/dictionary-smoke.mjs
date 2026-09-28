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

const list=[...words];
const failures=[];
let done=0;
const workers=Array.from({length:6},async()=>{
  while(true){
    const idx=done++;
    if(idx>=list.length)return;
    const w=list[idx];
    const entry=(await fetchJson('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(w)))?.[0]||null;
    const translated=entry
      ? await translate(entry.meanings?.[0]?.definitions?.[0]?.definition||w)
      : await translate(w);
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
