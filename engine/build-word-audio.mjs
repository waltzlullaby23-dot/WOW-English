import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const repoRoot=process.cwd();
const catalog=JSON.parse(fs.readFileSync('data/catalog.json','utf8'));
const indexPath='data/dictionary-index.json';
const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const words=new Set(Object.keys(index.words||{}));
for(const v of (catalog.videos||[])){
  for(const s of (v.transcript||[])){
    for(const m of String(s.en||'').matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)) words.add(m[0].toLowerCase());
  }
}
const safeName=w=>{
  const base=w.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase()||'word';
  return base+'-'+crypto.createHash('sha1').update(w).digest('hex').slice(0,8);
};
const ensure=p=>fs.mkdirSync(p,{recursive:true});
const make= (word, locale, out)=>{
  execFileSync('espeak',['-v',locale,'-s','150','-w',out,word],{stdio:'ignore'});
  return execFileSync('espeak',['-q','--ipa','-v',locale,word],{encoding:'utf8'}).trim().replace(/^\s+|\s+$/g,'');
};
ensure('audio/uk');
ensure('audio/us');
const list=[...words];
let cursor=0;
async function worker(){
  while(true){
    const i=cursor++;
    if(i>=list.length)return;
    const word=list[i];
    const name=safeName(word);
    const ukRel='audio/uk/'+name+'.wav';
    const usRel='audio/us/'+name+'.wav';
    const ukPath=path.resolve(repoRoot,ukRel);
    const usPath=path.resolve(repoRoot,usRel);
    const ipaUk=make(word,'en-gb',ukPath);
    const ipaUs=make(word,'en-us',usPath);
    if(!fs.existsSync(ukPath)||!fs.existsSync(usPath))throw new Error('audio file missing: '+word);
    const old=index.words?.[word]||{word};
    index.words[word]={...old,word,ipa_uk:'/'+ipaUk.replace(/^\/+|\/+$/g,'' )+'/',ipa_us:'/'+ipaUs.replace(/^\/+|\/+$/g,'')+'/',
      phonetic_uk:old.phonetic_uk||'/'+ipaUk.replace(/^\/+|\/+$/g,'')+'/',
      phonetic_us:old.phonetic_us||'/'+ipaUs.replace(/^\/+|\/+$/g,'')+'/',
      audioLocalUk:ukRel,audioLocalUs:usRel};
  }
}
await Promise.all(Array.from({length:8},worker));
index.generatedAt=new Date().toISOString();
fs.writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n','utf8');
const bad=list.filter(w=>!index.words[w].audioLocalUk||!index.words[w].audioLocalUs||!fs.existsSync(path.resolve(repoRoot,index.words[w].audioLocalUk))||!fs.existsSync(path.resolve(repoRoot,index.words[w].audioLocalUs))||!index.words[w].ipa_uk||!index.words[w].ipa_us);
console.log(JSON.stringify({words:list.length,complete:list.length-bad.length,bad:bad.slice(0,30)},null,2));
if(bad.length)process.exit(1);
// Trigger deterministic local asset rebuild after UI pronunciation changes.

// Re-run local audio builder after CI validation fix.

// Force rebuild after WAV validation enhancement.
