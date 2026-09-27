# 三木Eng V6 Free — 套用方式

1. 下載此 ZIP。
2. 把 ZIP 內所有檔案解壓縮到目前 `WOW-English` Repo 根目錄（與 `app.js`、`styles.css` 同一層）。
3. 執行：

```bash
python apply_v6_free.py
```

4. 把變更後的檔案上傳到 GitHub `main`。
5. 到 Actions 執行 `三木Eng Free Video Discovery`，先手動跑一次確認。
6. 成功後每天 03:30（台灣時間）自動執行。

## 這版不需要
- OPENAI_API_KEY
- YOUTUBE_API_KEY
- 付費 AI
- 本機 AI
- 本機模型

## 驗收條件
正式 `accepted` 影片必須同時具備：
- 完整英文 transcript
- 驗證字幕品質 `captionQuality=verified`
- `subtitleCoverage` 通過門檻
- 每一個英文句都有中文翻譯
- 可切換 英文／中英／中文

注意：這裡的「100% 有字幕」指的是「正式入庫的影片 100% 通過字幕完整性驗證」，不是 YouTube 上任意影片都保證有字幕。
