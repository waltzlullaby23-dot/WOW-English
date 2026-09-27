# 三木Eng V6.2 — Free / Scroll & Subtitle Fix

這一版針對目前實際網站的三個問題重做：

1. **頁面滾動卡住**：取消 topbar/sidebar sticky 與字幕區內嵌 scroll，watch 頁只保留瀏覽器整頁滾動。
2. **字幕同步**：YouTube IFrame API 改成等待 API ready 後初始化；逐句 active 與手動滾動暫停機制保留。
3. **影片沒有增加 / 翻譯沒有增加**：加入正式 GitHub Actions pipeline；只將完整英文字幕 + 完整中文翻譯通過的影片放入 accepted。

## 零付費架構
- GitHub Pages
- GitHub Actions
- yt-dlp / youtube-transcript-api
- Argos Translate（開源）
- OpenCC / wordfreq
- 不需要 OpenAI API
- 不需要本機 AI

## 安裝
把 ZIP 內容解壓到 `WOW-English` 根目錄並覆蓋同名檔案。

執行：

```bash
python apply_v6_free.py
```

然後把變更上傳 GitHub `main`。最後在 Actions 執行 `三木Eng Free Video Discovery` 的 `workflow_dispatch`。

## 驗收
首次 workflow 必須在 log 顯示：
- `ARGOS_EN_ZH_READY`
- `TEST_FREE_PIPELINE_OK`
- `FREE_RELEASE_OK accepted=...`
- growth report 顯示 `newAccepted`。

若 `newAccepted=0`，log 會保留 candidates / processed / review 數字，方便定位到底是 YouTube 搜尋、字幕完整度、翻譯或去重造成 0 新增。
