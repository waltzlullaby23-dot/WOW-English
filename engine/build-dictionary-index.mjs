import fs from 'node:fs';

// Build dictionary data server-side; browser only reads the generated static index.
const catalog=JSON.parse(fs.readFileSync('data/catalog.json','utf8'));
const existingPath='data/dictionary-index.json';
let existing={};
try{ existing=JSON.parse(fs.readFileSync(existingPath,'utf8')); }catch{}

const COMMON_ZH={
  a:'一個；任何一個',an:'一個；任何一個',the:'這／那個；該',and:'和；以及',or:'或；或者',but:'但是；不過',
  how:'如何；怎麼',be:'是；存在',it:'它；這件事',on:'在……上；關於',often:'常常；經常',
  in:'在……裡；在……期間',of:'……的；關於',to:'到；向；為了',is:'是',are:'是；存在',was:'是（過去式）',were:'是（過去式）',
  we:'我們',you:'你；你們',he:'他',she:'她',they:'他們；她們；它們',this:'這個；這件事',that:'那個；那件事',
  i:'我',me:'我（受格）',my:'我的',your:'你的；你們的',our:'我們的',their:'他們的；她們的；它們的',
  can:'能；可以',could:'能夠；可以（較委婉）',will:'將；會',would:'會；將（較委婉）',do:'做；執行',does:'做；執行（第三人稱單數）',
  did:'做；執行（過去式）',not:'不；沒有',no:'不；沒有',yes:'是；好的',what:'什麼；所……的',why:'為什麼',
  which:'哪一個；哪一些',who:'誰',where:'哪裡；在哪裡',when:'何時；當……時',there:'那裡；有',here:'這裡',
  if:'如果；若',than:'比；與……相比',from:'從；來自',with:'和；與；用',for:'為了；給；對於',
  about:'關於；大約',as:'如同；作為；當……時',at:'在；於',by:'由；藉由；在……之前',into:'進入；到……裡面',
  out:'向外；出去',up:'向上；完成',down:'向下',over:'在……上方；超過',under:'在……下面',
  very:'非常',just:'只是；剛剛',also:'也；而且',only:'只有；僅僅',more:'更多；更',most:'最多；最',
  then:'然後；那時',so:'所以；如此；這麼',too:'也；太',all:'全部；所有',
  one:'一個；一；某一個',two:'兩個；二',three:'三個；三',first:'第一；首先',other:'其他的；另一個',
  another:'另一個；再一個',some:'一些；某些',any:'任何；一些',each:'每一個',many:'許多',much:'很多',
  few:'少數；一些',both:'兩者都',same:'相同的；同樣的',different:'不同的',right:'正確的；右邊的',
  wrong:'錯誤的',good:'好的',well:'很好地；健康的',important:'重要的',particular:'特定的；特別的',
  key:'關鍵的；關鍵',word:'單字；詞',words:'單字；詞語',th:'（序數字尾，如 4th）',
  easy:'容易的；簡單的',ever:'曾經；在任何時候',someone:'某人；有人',pounds:'英鎊；磅',
  obviously:'顯然地；明顯地',manners:'風度；禮貌；禮儀',retro:'懷舊的；重新流行的',helpful:'有幫助的；有用的',
  responsibility:'責任；職責；任務',linkers:'連接詞；銜接語',conjunction:'連詞；連接詞'
};

const words=new Set();
for(const v of (catalog.videos||[])){
  for(const s of (v.transcript||[])){
    for(const m of String(s.en||'').matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g))words.add(m[0].toLowerCase());
  }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url,ms=8000){
  const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),ms);
  try{const r=await fetch(url,{signal:ctl.signal,headers:{accept:'application/json'}});return r.ok?await r.json():null;}
  catch{return null}finally{clearTimeout(timer);}
}
async function translate(text){
  const key=String(text||'').toLowerCase();if(COMMON_ZH[key])return COMMON_ZH[key];
  const providers=[
    'https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en|zh-TW',
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(text)
  ];
  for(let attempt=0;attempt<3;attempt++){
    for(const url of providers){
      const data=await getJson(url,7000);if(!data)continue;
      let zh='';
      if(Array.isArray(data?.[0]))zh=data[0].map(x=>Array.isArray(x)?(x[0]||''):'').join('').trim();
      if(!zh)zh=String(data?.responseData?.translatedText||'').trim();
      if(/[\u3400-\u9fff]/.test(zh))return zh;
    }
    await sleep(250* (attempt+1));
  }
  return '';
}
function rows(entry){
  return (entry?.meanings||[]).flatMap(m=>(m.definitions||[]).slice(0,6).map(d=>({
    pos:String(m.partOfSpeech||''),definition_en:String(d.definition||'').trim(),definition_zh:'',
    example_en:String(d.example||'').trim(),example_zh:''
  }))).filter(x=>x.definition_en||x.example_en).slice(0,12);
}
function audio(phonetics,re){
  for(const p of (phonetics||[]))if(p?.audio&&re.test(String(p.audio)))return String(p.audio).replace(/^\/\//,'https://');
  return String((phonetics||[]).find(p=>p?.audio)?.audio||'').replace(/^\/\//,'https://');
}
const out={schemaVersion:1,generatedAt:new Date().toISOString(),source:'build-time-dictionary-index',words:{}};
const list=[...words];
let cursor=0;
const workers=Array.from({length:6},async()=>{
  while(true){
    const i=cursor++;
    if(i>=list.length)return;
    const word=list[i];
    const old=existing?.words?.[word];
    if(old?.complete&&old.definition_zh&&(old.audio_uk||old.audio_us||old.audioFallbackUk||old.audioFallbackUs)){out.words[word]=old;continue;}

    const entry=(await getJson('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word),8000))?.[0]||null;
    const data={word,source:entry?'dictionaryapi-build':'fallback',pos:'',phonetic_uk:'',phonetic_us:'',
      audio_uk:'',audio_us:'',
      audioFallbackUk:'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(word)+'&type=1',
      audioFallbackUs:'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(word)+'&type=2',
      definition_zh:COMMON_ZH[word]||'',entries:[]};

    if(entry){
      data.entries=rows(entry);
      data.pos=data.entries[0]?.pos||entry.meanings?.[0]?.partOfSpeech||'';
      data.phonetic_uk=String(entry.phonetics?.find(p=>p?.text)?.text||entry.phonetic||'');
      data.phonetic_us=String(entry.phonetics?.find(p=>p?.text&&/(us|en-us)/i.test(String(p.audio||'')))?.text||entry.phonetic||entry.phonetics?.find(p=>p?.text)?.text||'');
      data.audio_uk=audio(entry.phonetics,/_gb|_uk|gb|uk/i);
      data.audio_us=audio(entry.phonetics,/_us|en-us|us/i)||data.audio_uk;

      // The critical runtime guarantee is a Chinese word meaning + audio.
      // Definitions/examples are enriched opportunistically; failures there must
      // not invalidate an otherwise usable word card.
      // One translation request per word keeps the build reliable under
      // public translation-service rate limits. The UI can still show the
      // English dictionary definitions alongside the Chinese word meaning.
      const wordZh=data.definition_zh||await translate(word);
      data.definition_zh=wordZh;
      for(const row of data.entries.slice(0,3)){
        if(!row.definition_zh)row.definition_zh=wordZh;
      }
    }else{
      data.definition_zh=data.definition_zh||await translate(word);
    }
    data.complete=Boolean(data.definition_zh&&(data.audio_uk||data.audio_us||data.audioFallbackUk||data.audioFallbackUs));
    out.words[word]=data;
    if((i+1)%10===0)console.log('dictionary',i+1,'/',list.length);
  }
});
await Promise.all(workers);
fs.writeFileSync(existingPath,JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify({uniqueWords:list.length,indexed:Object.keys(out.words).length,complete:Object.values(out.words).filter(x=>x.complete).length},null,2));
