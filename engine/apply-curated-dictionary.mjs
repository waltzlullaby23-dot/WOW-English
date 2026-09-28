import fs from 'node:fs';

const path='data/dictionary-index.json';
const d=JSON.parse(fs.readFileSync(path,'utf8'));
const CURATED = {
  "order": {
    "pos": "noun/verb",
    "definition_zh": "訂單；訂購；順序",
    "entries": [
      {
        "pos": "noun/verb",
        "definition_en": "a request to buy or supply something; or to arrange things in sequence",
        "definition_zh": "訂購、訂單；或依順序排列",
        "example_en": "I placed an order for food.",
        "example_zh": "我下單買了食物。"
      }
    ]
  },
  "request": {
    "pos": "noun/verb",
    "definition_zh": "請求；要求",
    "entries": [
      {
        "pos": "noun/verb",
        "definition_en": "an act of asking for something politely or formally",
        "definition_zh": "禮貌或正式地要求某事的行為；請求",
        "example_en": "She made a request for more information.",
        "example_zh": "她提出了索取更多資訊的請求。"
      }
    ]
  },
  "questions": {
    "pos": "noun",
    "definition_zh": "問題；疑問",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "sentences or phrases used to ask for information",
        "definition_zh": "用來詢問資訊的句子或片語；問題",
        "example_en": "The teacher asked three questions.",
        "example_zh": "老師問了三個問題。"
      }
    ]
  },
  "politer": {
    "pos": "adjective",
    "definition_zh": "更有禮貌的",
    "entries": [
      {
        "pos": "adjective",
        "definition_en": "more polite",
        "definition_zh": "更有禮貌的",
        "example_en": "This phrase is politer than the first one.",
        "example_zh": "這個說法比第一個更有禮貌。"
      }
    ]
  },
  "imperatives": {
    "pos": "noun",
    "definition_zh": "祈使句；命令語氣",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "verb forms or sentences used to give an order or instruction",
        "definition_zh": "用來下命令或給指示的動詞形式或句子；祈使句",
        "example_en": "Imperatives are often used for instructions.",
        "example_zh": "祈使句常用來給予指示。"
      }
    ]
  },
  "real": {
    "pos": "adjective",
    "definition_zh": "真實的；真正的",
    "entries": [
      {
        "pos": "adjective",
        "definition_en": "actually existing or true; not imagined or artificial",
        "definition_zh": "真實存在或確實為真的；不是想像或虛假的",
        "example_en": "This is a real example.",
        "example_zh": "這是一個真實的例子。"
      }
    ]
  },
  "today": {
    "pos": "adverb/noun",
    "definition_zh": "今天；在今天",
    "entries": [
      {
        "pos": "adverb/noun",
        "definition_en": "on or during this present day",
        "definition_zh": "今天；在今天",
        "example_en": "I am busy today.",
        "example_zh": "我今天很忙。"
      }
    ]
  },
  "favourite": {
    "pos": "adjective/noun",
    "definition_zh": "最喜愛的；最喜愛的人或事物",
    "entries": [
      {
        "pos": "adjective/noun",
        "definition_en": "liked more than others; the person or thing liked most",
        "definition_zh": "最喜愛的；最喜愛的人或事物",
        "example_en": "This is my favourite food.",
        "example_zh": "這是我最喜歡的食物。"
      }
    ]
  },
  "them": {
    "pos": "pronoun",
    "definition_zh": "他們；她們；它們（受格）",
    "entries": [
      {
        "pos": "pronoun",
        "definition_en": "used as the object of a verb or preposition to refer to people or things already mentioned",
        "definition_zh": "指已提及的人或事物，作動詞或介系詞的受詞；他們／她們／它們",
        "example_en": "I saw them yesterday.",
        "example_zh": "我昨天看到他們。"
      }
    ]
  },
  "bathroom": {
    "pos": "noun",
    "definition_zh": "浴室；洗手間",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "a room with a toilet and usually a sink or bath",
        "definition_zh": "設有馬桶，通常還有洗手台或浴缸的房間；浴室、洗手間",
        "example_en": "The bathroom is upstairs.",
        "example_zh": "浴室在樓上。"
      }
    ]
  },
  "bond": {
    "pos": "noun",
    "definition_zh": "連結；關係",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "a strong connection or relationship between people or things",
        "definition_zh": "人與人或事物之間的緊密連結或關係",
        "example_en": "The sisters have a strong bond.",
        "example_zh": "這對姊妹有很深的感情連結。"
      }
    ]
  },
  "we'll": {
    "pos": "contraction",
    "definition_zh": "we will／we shall 的縮寫",
    "entries": [
      {
        "pos": "contraction",
        "definition_en": "a short form of 'we will' or 'we shall'",
        "definition_zh": "we will／we shall 的縮寫",
        "example_en": "We'll see you tomorrow.",
        "example_zh": "我們明天會見到你。"
      }
    ]
  },
  "what's": {
    "pos": "contraction",
    "definition_zh": "what is／what has 的縮寫",
    "entries": [
      {
        "pos": "contraction",
        "definition_en": "a short form of 'what is' or 'what has'",
        "definition_zh": "what is／what has 的縮寫",
        "example_en": "What's your name?",
        "example_zh": "你叫什麼名字？"
      }
    ]
  },
  "let's": {
    "pos": "contraction",
    "definition_zh": "let us 的縮寫；讓我們",
    "entries": [
      {
        "pos": "contraction",
        "definition_en": "a short form of 'let us', used to suggest doing something together",
        "definition_zh": "let us 的縮寫，用來提議一起做某事",
        "example_en": "Let's go.",
        "example_zh": "我們走吧。"
      }
    ]
  },
  "linkers": {
    "pos": "noun",
    "definition_zh": "連接詞；銜接語",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "words or phrases used to connect ideas, clauses, or sentences",
        "definition_zh": "用來連接思想、子句或句子的詞語",
        "example_en": "Linkers connect ideas and make writing easier to follow.",
        "example_zh": "連接詞可以連結想法，讓文章更容易理解。"
      }
    ]
  },
  "someone": {
    "pos": "pronoun",
    "definition_zh": "某人；有人",
    "entries": [
      {
        "pos": "pronoun",
        "definition_en": "an unspecified person; somebody",
        "definition_zh": "不特定的人；某人；有人",
        "example_en": "Someone is waiting outside.",
        "example_zh": "有人正在外面等候。"
      }
    ]
  },
  "pounds": {
    "pos": "noun",
    "definition_zh": "英鎊；磅",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "the currency unit used in the United Kingdom; also a unit of weight",
        "definition_zh": "英國使用的貨幣單位；也指重量單位「磅」",
        "example_en": "You have one hundred pounds.",
        "example_zh": "你有一百英鎊。"
      }
    ]
  },
  "retro": {
    "pos": "adjective",
    "definition_zh": "懷舊的；重新流行的；模仿過去式樣的",
    "entries": [
      {
        "pos": "adjective",
        "definition_en": "similar to styles, fashions, etc. from the past",
        "definition_zh": "懷舊的；重新流行的；模仿過去式樣的",
        "example_en": "retro clothes/music",
        "example_zh": "懷舊服裝／音樂"
      },
      {
        "pos": "adjective",
        "definition_en": "a retro style",
        "definition_zh": "重新流行的款式",
        "example_en": "Inside, the decor is very retro.",
        "example_zh": "室內的裝修格調具有非常濃厚的復古韻味。"
      }
    ]
  },
  "obviously": {
    "pos": "adverb",
    "definition_zh": "顯然地；明顯地",
    "entries": [
      {
        "pos": "adverb",
        "definition_en": "in a way that is easy to see or understand; clearly",
        "definition_zh": "以容易看見或理解的方式；顯然地；明顯地",
        "example_en": "Obviously, he was tired.",
        "example_zh": "顯然地，他累了。"
      }
    ]
  },
  "manners": {
    "pos": "noun",
    "definition_zh": "風度；禮貌；禮儀",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "polite ways of behaving with other people",
        "definition_zh": "與他人相處時有禮貌的行為方式",
        "example_en": "He needs to learn some manners.",
        "example_zh": "他需要學習一些禮貌。"
      }
    ]
  },
  "helpful": {
    "pos": "adjective",
    "definition_zh": "有幫助的；有用的；願意幫忙的",
    "entries": [
      {
        "pos": "adjective",
        "definition_en": "willing to help, or useful",
        "definition_zh": "願意幫忙的；有幫助的；有用的",
        "example_en": "I'm trying to be helpful.",
        "example_zh": "我只是想幫忙。"
      }
    ]
  },
  "responsibility": {
    "pos": "noun",
    "definition_zh": "責任；職責；任務",
    "entries": [
      {
        "pos": "noun",
        "definition_en": "a duty to deal with or take care of someone or something",
        "definition_zh": "對某人或某事負責或照料的義務",
        "example_en": "It is your responsibility to look after the children.",
        "example_zh": "照顧孩子是你的責任。"
      }
    ]
  }
};
for (const [word, patch] of Object.entries(CURATED)) {
  const old=d.words?.[word]||{word};
  const type1="https://dict.youdao.com/dictvoice?audio="+encodeURIComponent(word)+"&type=1";
  const type2="https://dict.youdao.com/dictvoice?audio="+encodeURIComponent(word)+"&type=2";
  d.words[word]={...old,...patch,source:'curated',complete:true,audioFallbackUk:old.audioFallbackUk||type1,audioFallbackUs:old.audioFallbackUs||type2};
}
d.generatedAt=new Date().toISOString();
fs.writeFileSync(path,JSON.stringify(d,null,2)+'\\n','utf8');
console.log('curated='+Object.keys(CURATED).length,'words='+Object.keys(d.words||{}).length);
