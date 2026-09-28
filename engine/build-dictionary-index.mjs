import fs from 'node:fs';

// Build dictionary data server-side; browser only reads the generated static index.
const catalog=JSON.parse(fs.readFileSync('data/catalog.json','utf8'));
const wordBank=JSON.parse(fs.readFileSync('data/word-bank.json','utf8'));
const existingPath='data/dictionary-index.json';
const forceRebuild=true;
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
  responsibility:'責任；職責；任務',linkers:'連接詞；銜接語',conjunction:'連詞；連接詞',passive:'被動的；消極的',"let's":'讓我們',"we'll":'我們將；我們會',start:'開始；啟動'
};

const CONTEXT_ZH={
  order:'訂單；訂購；順序',request:'請求；要求',questions:'問題；疑問',politer:'更有禮貌的',imperatives:'祈使句；命令語氣',
  politeness:'禮貌',polite:'有禮貌的',english:'英語；英文',ways:'方法；方式',expressing:'表達；表示',depending:'取決於；依賴',
  want:'想要；需要',welcome:'歡迎',real:'真實的；真正的',bbc:'英國廣播公司',learning:'學習；學習過程',today:'今天',
  talking:'談話；交談',food:'食物',talk:'談話；說話',favourite:'最喜愛的；最喜歡的人或事物',foods:'食物（複數）',
  eat:'吃',them:'他們；她們；它們（受格）',"what's":'什麼是；是什麼',"we'll":'我們將；我們會',"let's":'讓我們',
  voice:'聲音；嗓音',look:'看；外觀',changes:'改變；變化',focus:'焦點；重點',sentence:'句子',lots:'很多；大量',
  synonyms:'同義詞',foods:'食物；食品（複數）',look:'看；查看；外觀',choose:'選擇',use:'使用；用途',context:'語境；上下文',choosing:'選擇；挑選',think:'想；認為',
  sound:'聲音；聽起來',learn:'學習；學會',pronounce:'發音；讀音',properly:'正確地；恰當地',"we're":'我們是；我們正在',
  families:'家庭；家人',compare:'比較',things:'事情；事物',bathroom:'浴室；洗手間',have:'有；擁有',
  used:'使用過的；習慣於',language:'語言',app:'應用程式',looking:'看；尋找；看起來',bond:'連結；關係',
  between:'在……之間',sisters:'姊妹',start:'開始；啟動',challenge:'挑戰',london:'倫敦',edinburgh:'愛丁堡'
};const CONTEXT_ENTRIES={
  linkers:[{pos:'noun',definition_en:'words or phrases used to connect ideas, clauses, or sentences',definition_zh:'用來連接思想、子句或句子的詞語',example_en:'Linkers connect ideas and make writing easier to follow.',example_zh:'連接詞可以連結想法，讓文章更容易理解。'}],
  "we'll":[{pos:'contraction',definition_en:"a short form of 'we will' or 'we shall'",definition_zh:'we will／we shall 的縮寫',example_en:"We'll see you tomorrow.",example_zh:'我們明天會見到你。'}],
  "what's":[{pos:'contraction',definition_en:"a short form of 'what is' or 'what has'",definition_zh:'what is／what has 的縮寫',example_en:"What's your name?",example_zh:'你叫什麼名字？'}],
  "let's":[{pos:'contraction',definition_en:"a short form of 'let us', used to suggest doing something together",definition_zh:'let us 的縮寫，用來提議一起做某事',example_en:"Let's go.",example_zh:'我們走吧。'}],
  politer:[{pos:'adjective',definition_en:'more polite',definition_zh:'更有禮貌的',example_en:'This phrase is politer than the first one.',example_zh:'這個說法比第一個更有禮貌。'}],
  imperatives:[{pos:'noun',definition_en:'verb forms or sentences used to give an order or instruction',definition_zh:'用來下命令或給指示的動詞形式或句子；祈使句',example_en:'Imperatives are often used for instructions.',example_zh:'祈使句常用來給予指示。'}],
  real:[{pos:'adjective',definition_en:'actually existing or true; not imagined or artificial',definition_zh:'真實存在或確實為真的；不是想像或虛假的',example_en:'This is a real example.',example_zh:'這是一個真實的例子。'}],
  order:[{pos:'noun/verb',definition_en:'a request to buy or supply something; or to arrange things in sequence',definition_zh:'訂購、訂單；或依順序排列',example_en:'I placed an order for food.',example_zh:'我下單買了食物。'}],
  request:[{pos:'noun/verb',definition_en:'an act of asking for something politely or formally',definition_zh:'禮貌或正式地要求某事的行為；請求',example_en:'She made a request for more information.',example_zh:'她提出了索取更多資訊的請求。'}],
  questions:[{pos:'noun',definition_en:'sentences or phrases used to ask for information',definition_zh:'用來詢問資訊的句子或片語；問題',example_en:'The teacher asked three questions.',example_zh:'老師問了三個問題。'}],
  favourite:[{pos:'adjective/noun',definition_en:'liked more than others; the person or thing liked most',definition_zh:'最喜愛的；最喜愛的人或事物',example_en:'This is my favourite food.',example_zh:'這是我最喜歡的食物。'}],
  today:[{pos:'adverb/noun',definition_en:'on or during this present day',definition_zh:'今天；在今天',example_en:'I am busy today.',example_zh:'我今天很忙。'}],
  them:[{pos:'pronoun',definition_en:'used as the object of a verb or preposition to refer to people or things already mentioned',definition_zh:'指已提及的人或事物，作動詞或介系詞的受詞；他們／她們／它們',example_en:'I saw them yesterday.',example_zh:'我昨天看到他們。'}],
  bathroom:[{pos:'noun',definition_en:'a room with a toilet and usually a sink or bath',definition_zh:'設有馬桶，通常還有洗手台或浴缸的房間；浴室、洗手間',example_en:'The bathroom is upstairs.',example_zh:'浴室在樓上。'}],
  bond:[{pos:'noun',definition_en:'a strong connection or relationship between people or things',definition_zh:'人與人或事物之間的緊密連結或關係',example_en:'The sisters have a strong bond.',example_zh:'這對姊妹有很深的感情連結。'}]
};

const words=new Set();
for(const w of ['someone','pounds','retro','obviously','manners','helpful','responsibility','linkers'])words.add(w);
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
  const key=String(text||'').toLowerCase().trim();
  if(CONTEXT_ZH[key])return CONTEXT_ZH[key];
  if(COMMON_ZH[key])return COMMON_ZH[key];
  const providers=[
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(text),
    'https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en|zh-TW'
  ];
  for(let attempt=0;attempt<3;attempt++){
    for(const url of providers){
      const data=await getJson(url,7000);if(!data)continue;
      let zh='';
      if(Array.isArray(data?.[0]))zh=data[0].map(x=>Array.isArray(x)?(x[0]||''):'').join('').trim();
      if(!zh)zh=String(data?.responseData?.translatedText||'').trim();
      if(/[\u3400-\u9fff]/.test(zh))return zh;
    }
    await sleep(250*(attempt+1));
  }
  return '';
}
async function dictionaryApi(word){
  for(let attempt=0;attempt<3;attempt++){
    const data=await getJson('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word),8000);
    if(Array.isArray(data)&&data[0])return data[0];
    await sleep(300*(attempt+1));
  }
  return null;
}
async function datamuse(word){
  const data=await getJson('https://api.datamuse.com/words?sp='+encodeURIComponent(word)+'&md=dps&max=8',7000);
  if(!Array.isArray(data))return null;
  const rows=[];
  for(const item of data){
    for(const d of (item.defs||[])){
      const parts=String(d).split('\t');
      const pos=parts[0]||'';const def=parts.slice(1).join('\t').trim();
      if(def)rows.push({pos:pos.replace(/^./,''),definition_en:def,definition_zh:'',example_en:'',example_zh:''});
    }
  }
  return {pos:rows[0]?.pos||'',entries:rows.slice(0,8)};
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
    if(old?.complete&&old.definition_zh&&!COMMON_ZH[word]&&(old.audio_uk||old.audio_us||old.audioFallbackUk||old.audioFallbackUs)){out.words[word]=old;continue;}

    const entry=await dictionaryApi(word);
    const data={word,source:entry?'dictionaryapi-build':'fallback',pos:'',phonetic_uk:'',phonetic_us:'',
      audio_uk:'',audio_us:'',
      audioFallbackUk:'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(word)+'&type=1',
      audioFallbackUs:'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(word)+'&type=2',
      definition_zh:CONTEXT_ZH[word]||COMMON_ZH[word]||'',entries:CONTEXT_ENTRIES[word]?[...CONTEXT_ENTRIES[word]]:[]};

    if(entry){
      data.entries=rows(entry);
      data.pos=data.entries[0]?.pos||entry.meanings?.[0]?.partOfSpeech||'';
      data.phonetic_uk=String(entry.phonetics?.find(p=>p?.text)?.text||entry.phonetic||'');
      data.phonetic_us=String(entry.phonetics?.find(p=>p?.text&&/(us|en-us)/i.test(String(p.audio||'')))?.text||entry.phonetic||entry.phonetics?.find(p=>p?.text)?.text||'');
      data.audio_uk=audio(entry.phonetics,/_gb|_uk|gb|uk/i);
      data.audio_us=audio(entry.phonetics,/_us|en-us|us/i)||data.audio_uk;
    }else{
      const wb=wordBank.words?.[word];
      if(wb){
        data.source='word-bank';data.pos=wb.pos||'';data.phonetic_uk=wb.phonetic_uk||'';data.phonetic_us=wb.phonetic_us||'';
        data.definition_zh=wb.definition_zh||data.definition_zh;
        data.entries=[{pos:wb.pos||'',definition_en:wb.gloss||'',definition_zh:wb.definition_zh||'',example_en:wb.example||'',example_zh:''}];
      }else{
        const dm=await datamuse(word);
        if(dm?.entries?.length){data.source='datamuse-build';data.pos=dm.pos;data.entries=dm.entries;}
      }
    }

    // Always guarantee a word-level Traditional Chinese meaning.
    data.definition_zh=data.definition_zh||CONTEXT_ZH[word]||await translate(word);
    // Translate up to three English definitions so the card can display real dictionary detail.
    if(CONTEXT_ENTRIES[word])data.entries=[...CONTEXT_ENTRIES[word]];
    for(const row of data.entries.slice(0,3)){
      if(!row.definition_zh&&row.definition_en)row.definition_zh=await translate(row.definition_en)||data.definition_zh;
      if(!row.example_zh&&row.example_en)row.example_zh=await translate(row.example_en);
    }
    if(!data.phonetic_us)data.phonetic_us=data.phonetic_uk;
    if(!data.audio_us)data.audio_us=data.audio_uk;
    data.complete=Boolean(data.definition_zh&&(data.audio_uk||data.audio_us||data.audioFallbackUk||data.audioFallbackUs));
    out.words[word]=data;
    if((i+1)%10===0)console.log('dictionary',i+1,'/',list.length);
  }
});
await Promise.all(workers);
fs.writeFileSync(existingPath,JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify({uniqueWords:list.length,indexed:Object.keys(out.words).length,complete:Object.values(out.words).filter(x=>x.complete).length},null,2));
