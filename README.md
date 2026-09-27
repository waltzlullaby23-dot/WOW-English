# 三木Eng V7 — 真正零付費修正版

## 這一版修什麼
1. 移除頂部「探索引擎」按鈕。影片探索引擎只留在 GitHub Actions 後台，不佔網站 UI。
2. 移除左上角重複的漢堡／收合按鈕，只保留側欄內的「« / »」收合控制。
3. watch 頁完全取消 sticky sidebar、sticky topbar、內嵌字幕滾輪，改成單一瀏覽器主滾動。
4. YouTube IFrame API ready 後才建立 player，字幕同步依 currentTime 對應完整 transcript。
5. 字幕模式固定為 英文／中英／中文。
6. 字幕大小固定 75 / 100 / 125 / 150 / 200%。
7. GitHub Actions 改成完全不需要 OPENAI_API_KEY、YOUTUBE_API_KEY。
8. 使用 yt-dlp 搜尋候選影片、youtube-transcript-api 取得英文字幕、Argos Translate 補中文。
9. 既有 11 部影片先做 full-transcript repair，再新增影片。
10. 正式庫只接受 >=20 subtitle segments 且 coverage >=90% 的影片；其餘進 review。

## 套用
把本資料夾放進 WOW-English repo 根目錄，執行：

python APPLY_V7.py

然後把 .github/workflows/content-pipeline.yml 與 engine/ 下四個 free_*.py 上傳到 GitHub。

GitHub Actions 第一次請手動 Run workflow。工作流需要 repository 的 Actions workflow permission 允許 Contents: write，才能把更新後的 catalog.json commit 回 main。


<!-- github-write-test-2026-09-27 -->
