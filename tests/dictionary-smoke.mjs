import fs from 'node:fs';

const d=JSON.parse(fs.readFileSync('data/dictionary-index.json','utf8'));
const entries=Object.values(d.words||{});
const required=['someone','pounds','retro','obviously','manners','helpful','responsibility','linkers','order','request','foods','look'];

const missing=entries.filter(x=>!x.word||!x.definition_zh||!(x.audio_uk||x.audio_us||x.audioFallbackUk||x.audioFallbackUs));
const badRequired=required.filter(w=>!d.words[w]||!d.words[w].definition_zh||!d.words[w].phonetic_uk||!d.words[w].phonetic_us||!(d.words[w].audio_uk||d.words[w].audio_us||d.words[w].audioFallbackUk||d.words[w].audioFallbackUs));

const urlish=entries.filter(x=>[x.audio_uk,x.audio_us,x.audioFallbackUk,x.audioFallbackUs].filter(Boolean).some(u=>!/^https?:\/\//.test(u)));

console.log(JSON.stringify({
  indexedWords:entries.length,
  translationComplete:entries.length-missing.length,
  audioComplete:entries.filter(x=>x.audio_uk||x.audio_us||x.audioFallbackUk||x.audioFallbackUs).length,
  requiredTestWords:required.length-badRequired.length,
  missing:missing.slice(0,30).map(x=>x.word),
  badRequired,
  invalidAudioUrls:urlish.slice(0,30).map(x=>x.word)
},null,2));

if(missing.length||badRequired.length||urlish.length)process.exit(1);
