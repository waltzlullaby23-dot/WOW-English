# 三木Eng｜影音・文法・多益

本版本是 GitHub Pages 靜態前端 + GitHub Actions 內容引擎。

## 已落地

- 左側可收合/展開
- 分類改為點擊後選擇
- 13 大類 / 78+ 子類探索架構
- 文法 30 章 / 150 微課
- TOEIC 400以下 / 400–600 / 600–800 / 800–990 四級距，每級 20 題
- 影片下方字幕工作區：英文 / 中英 / 中文
- 字幕大小 14–32px
- YouTube IFrame API 播放時間同步：逐句高亮、自動捲動、點字幕跳轉
- 單字點選：中文解釋、English meaning、英式/美式朗讀、收藏
- A/B/C 字幕 fallback
- AI 分類 + CEFR
- 批次翻譯 + 逐句重試 + contextual retry
- 自動 learning units
- GitHub Actions 每小時影片探索

## Secrets

在 Repository → Settings → Secrets and variables → Actions 建立：

- `YOUTUBE_API_KEY`
- `OPENAI_API_KEY`

## Pages

Settings → Pages → Source = GitHub Actions。

## 注意

YouTube 嵌入播放器的廣告由 YouTube 控制，網站不能可靠保證所有 YouTube embed 無廣告。若產品最終需要完全無廣告，需改用有授權的自有/託管影片來源。


## V5 content quality policy

- TOEIC practice uses original questions aligned to the public TOEIC Listening & Reading format and ETS score-descriptor capability themes; it does not reproduce ETS copyrighted sample questions.
- Grammar progression is newly written, informed by the topic sequence used in mainstream references such as Cambridge's *English Grammar in Use* / *Essential Grammar in Use*, without copying their exercises or wording.
- Pasted YouTube URLs play immediately. Custom three-mode bilingual subtitles require the video to be processed by the content pipeline; YouTube native captions are the fallback for unprocessed external URLs.
