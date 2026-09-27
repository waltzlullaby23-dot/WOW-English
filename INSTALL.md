# 三木Eng V6.2 安裝

1. 把本 ZIP 解壓到 `WOW-English` 根目錄。
2. 覆蓋同名檔案；新增 `engine/translation_argos.py`、`engine/setup_translation_model.py`、`.github/workflows/content-pipeline.yml`。
3. 執行 `python apply_v6_free.py`，讓前端 override 寫入既有 `app.js` 與 `styles.css`。
4. 將所有變更上傳 GitHub `main`。
5. GitHub → Actions → `三木Eng Free Video Discovery` → Run workflow。
6. 必須等 workflow 完成後，確認 `data/catalog.json` 的 `stats.newAccepted` 大於 0（若首次沒有可接受影片，至少確認 candidates > 0 且 review 原因合理）。
7. static.yml 會在內容 commit 後重新部署 Pages。

### 注意
「字幕 100% 有」的工程定義是：**進入 accepted 的影片必須通過完整英文字幕驗證，且每一句均有中文翻譯**。不是承諾 YouTube 上任意影片都一定有字幕。
