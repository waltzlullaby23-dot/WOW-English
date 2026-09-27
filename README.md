# English Video Learning Lab

A GitHub Pages learning platform built around a continuous video-ingestion pipeline rather than a fixed video list.

## Product architecture

`YouTube discovery → subtitle A/B/C fallback → audio spoken-language verification → language gate → normalization → translation → AI CEFR/classification → fingerprint + embedding dedup → learning-unit generation → catalog`

English captions are an independent data layer. Translation is optional and cannot remove English subtitles when a translation request fails.

## Frontend modules

- Video exploration with 12 categories / 72 subcategories
- Spoken Language / Caption Language / English Score / Multilingual Score signals
- CEFR A1–C2 filtering
- Video watch workspace with sentence seek, slow playback and bilingual subtitles
- Vocabulary, phrase and grammar learning entry points
- 30 grammar chapters / 150 micro-lessons structure
- TOEIC / Grammar quick diagnostic
- Local learning progress, favorites and watched history
- Discovery engine status and pipeline visibility

## GitHub Actions

Set repository secrets:

- `YOUTUBE_API_KEY`
- `OPENAI_API_KEY`

The scheduled workflow runs daily and can also be triggered manually. The OpenAI audio transcription stage is optional; without the secret the pipeline uses caption/metadata evidence and records that limitation rather than pretending it has audio verification.

## Static hosting

This is a no-build static site, so it can be served directly by GitHub Pages.


## The six production pipeline upgrades

1. **High-volume discovery** rotates a query pack across the 12 major categories and uses YouTube search pagination rather than a fixed list.
2. **Subtitle fallback** tries preferred/manual English tracks, then auto-generated English tracks, then `youtube-transcript-api`; all inputs are normalized into one segment format.
3. **Spoken-language verification** uses a short audio sample and OpenAI transcription/classification when `OPENAI_API_KEY` is present. Subtitle-only evidence is review-only and is not treated as spoken-language proof.
4. **Deduplication** combines exact video IDs, normalized title/transcript fingerprints, and optional semantic embeddings stored in `data/embedding-index.json`.
5. **AI content intelligence** assigns one of 12 categories, 72 subcategories and CEFR A1–C2 from transcript evidence.
6. **Learning-unit generation** turns each accepted transcript into vocabulary, phrases, grammar links and five quick questions; AI generation is used when available and a deterministic fallback keeps the pipeline testable.

## Required GitHub secrets

- `YOUTUBE_API_KEY` — YouTube Data API v3 discovery.
- `OPENAI_API_KEY` — spoken-language verification, semantic embeddings, AI classification, translation and learning-unit generation.

Without the OpenAI key, the site does not pretend it has completed audio verification; new candidates remain in review instead of being silently promoted into the accepted catalog.

## Front-end learning suite

The front-end now includes the complete learning utility set requested from the reference layout:

- 影片學習：daily accumulation, bilingual subtitles, single-sentence playback, speed controls.
- 英文文法：30 chapters × 5 micro-lessons = 150 micro-lessons, with per-lesson completion state.
- 多益練習：20-question complete original practice paper with score and explanations.
- 觀看紀錄：watched video history with recent progress.
- 收藏影片：personal saved-video collection.
- 我的單字庫：click vocabulary from video learning units/subtitles to save, review, or remove.
- 文法微課進度：0/150-style progress is calculated from actual micro-lesson completion state rather than chapter percentages.

All of these are stored locally first with `localStorage` / `sessionStorage`, so the UI remains usable without a backend. They can later be moved to account-backed cloud sync without changing the feature model.

## 播放器與廣告說明
網站已改用 YouTube Privacy-Enhanced Mode (`youtube-nocookie.com`)、`rel=0`、`hl=zh-TW`，並保留標準 YouTube 播放器。YouTube 官方規定第三方嵌入網站不能直接關閉嵌入影片廣告；廣告由 YouTube / 影片所有者的營利設定控制。因此「完全無廣告」若要保證，必須改用有授權的自有/第三方影片檔案與非 YouTube 播放來源，不能透過嵌入參數繞過 YouTube 廣告。
