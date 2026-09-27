# 三木Eng｜影音・文法・多益

Bright English-learning platform for GitHub Pages.

## Core modules

- 影片探索：13 大類 / 104 子類
- English-first quality gate：Spoken Language / Caption Language / English Score / Multilingual Score
- Subtitle fallback：A → B → C
- Subtitle modes：English / 中英 / 中文
- Subtitle size control
- Clickable vocabulary with Chinese explanation + British/American pronunciation
- Vocabulary favorites
- 30 grammar chapters × 5 micro-lessons = 150 lessons
- Grammar lesson detail: explanation / pattern / examples / common errors / contrast / practice
- TOEIC-style original practice with four score bands:
  - 400 以下
  - 400–600
  - 600–800
  - 800–990
- Watch history / favorites / progress
- GitHub Actions content discovery pipeline

## Video ads

YouTube embedded players can still show YouTube-controlled advertising. This project uses `youtube-nocookie.com`, `rel=0`, and reduced branding, but the site cannot reliably or lawfully remove advertisements from an ordinary YouTube embed. A future fully ad-free mode would require content that we have the rights to host/play ourselves.

## Grammar source

The 30-chapter / 150-micro-lesson architecture follows the existing English grammar teaching specification: Form → Meaning → Use → Contrast → Error, CEFR A1–C2, with lesson fields for objectives, explanation, pattern, examples, common errors, practice and mastery. The source specification is maintained separately in the project library.

## Deployment

For GitHub Pages, use **GitHub Actions** as the Pages source and keep `.github/workflows/pages.yml`.

Content discovery requires GitHub repository secrets for the external APIs used by the engine. Do not put API keys into frontend JavaScript.
