# 三木Eng V6 Free Patch

這個補丁把影片探索/字幕/翻譯流程改成「零 API 費用」版本：不需要 OpenAI API，也不需要 YouTube Data API key。

## 內容
- `apply_v6_free.py`：放進現有 WOW-English 專案根目錄執行，會自動把前端 V6 修正、免費影片引擎、GitHub Actions 工作流程套上去。
- `.github/workflows/content-pipeline.yml`：每天自動找新影片、驗證完整英文字幕、取得 YouTube 免費逐句中文翻譯、分類、CEFR、去重並寫回 `data/catalog.json`。
- `engine/discover.py`：改成免費引擎 wrapper，不再呼叫 OpenAI。
- `engine/translate.py`：改成 YouTube transcript translation wrapper，不再呼叫 OpenAI。
- `engine/free_pipeline.py`：主要免費影片探索/字幕/翻譯/分類/CEFR/去重引擎。
- `engine/verify_free.py`：發版前檢查，正式影片必須具有完整英文字幕與完整中文逐句翻譯。
- `requirements.txt`：移除 OpenAI 套件依賴。

## 重要
目前 ChatGPT 對該 GitHub Repo 的讀取正常，但寫入權限仍回傳 403，因此這一版尚未直接推回你的 Repo；補丁是針對目前 `WOW-English` 結構製作的。

套用後，不需要建立任何 API Secret。GitHub Actions 只使用自己的免費 runner 與公開 YouTube 資料。
