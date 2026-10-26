# 開發紀錄

> 新的紀錄放在最上面。格式：
>
> ```
> ## YYYY-MM-DD｜標題
> **階段**：Phase N
> **做了什麼**：
> **決定**：
> **新增套件**：
> **驗證**：
> **待處理／問題**：
> ```

---

## 2026-10-27｜Phase 5（不需要原生程式的部分）：外觀、首頁照片、刪除帳號、深層連結

**階段**：Phase 5

**做了什麼**：
- 外觀（15）：背景色、選項色各 5 種，選了立刻套用整個 App；色票是雙圈選取樣式。
  - 首頁照片要先預覽，再選「使用這張照片」或取消；可以換照片、移除。
  - 照片會洗白並加一層遮罩，透明度 62%，或依設計稿公式。
  - 帳號登入時，照片上傳到 Supabase Storage 私人 bucket；試用模式只存在這台裝置。網頁版先把照片縮到 1080px。
- 透明度（不透明／半透明／全透明）套用在紀錄泡泡與分帳結餘卡；半透明用 `expo-blur` 霧化。
- 刪除帳號：設定 → 帳號 → 刪除帳號。
  - 伺服器 function `delete_my_account` 先把分帳帳本的成員改成沒有帳號的同名成員，並把帳本交給其他成員，再刪除帳號。
  - App 端接著刪除照片、清掉這台裝置上的資料。
- 深層連結：`/add?type=expense|income|split` 開到金額畫面並標示類型，這是給桌面小工具用的。
  - 設定 → 桌面小工具有預覽畫面（小、中尺寸與「+」按鈕），可以點點看。
- 無障礙：全 App 的選取／勾選／展開狀態改用 `aria-*`。之前在網頁上沒有輸出，螢幕閱讀器讀不到。
- 依新版 claude-rule.md，通知相關程式拆成 `*.native.ts`（手機）與 `.ts`（網頁空實作），畫面不再自己判斷平台。
- app.config.ts 加上 `expo-notifications`（通知顏色）與 `expo-image-picker`（相簿權限說明）的 config plugin。這兩個只影響 development build，Expo Go 不受影響。

**決定**（暫用，已寫進 spec.md）：
- 刪除帳號的處理方式照 todo 的建議。
- 照片放私人 bucket。
- Android 半透明不做模糊。

**新增套件**：
- `expo-image-picker`（~58.0.10）：iOS、Android、網頁、Expo Go 都支援。
- `expo-blur`（~58.0.5）：iOS、網頁有模糊；Android 預設只有半透明。

**驗證**：
- `npm run typecheck`、`npm run lint`（0 個問題）、prettier：通過。
- `npm test`：135 項通過。
- `npm run test:db`：54 項通過（新增 4 項：外觀欄位、照片路徑限制、刪除帳號後結餘不變／帳本交接／只剩自己的帳本被刪）。
- 網頁版瀏覽器實測（試用模式）：
  - Stage 5 共 21 項通過，涵蓋換色、照片預覽／使用／重新整理後還在／移除、半透明霧化、小工具預覽、深層連結、分頁的 `aria-selected`。
  - Stage 1–4 舊流程 83 項重跑通過。
- iOS／Android bundle 匯出成功；`expo-doctor` 20/20。

**沒做／待處理**：
- 桌面小工具（iOS WidgetKit、Android Glance）、遠端推播、當機回報都要原生程式與 development build。這台電腦沒有 Xcode／Android SDK，無法編譯驗證，等開發者決定做法（todo.md）。
- 照片上傳、刪除帳號還沒在真的 Supabase 上測，要先套用新 SQL。
- 還沒在實機上檢查：通知、照片濾鏡、半透明效果、VoiceOver／TalkBack。

---

## 2026-10-27｜Phase 4：定期扣款、銀行對帳、每月檢查

**階段**：Phase 4

**做了什麼**：
- 定期扣款列表（16）、新增／編輯（17：一般＋常見訂閱快速帶入、Afterpay 分期、定期分帳）、扣款修改表單（19）。
- 伺服器自動記入：
  - 新的資料表 `recurring`；`entries` 加上 `recurring_id`／`recurring_seq`。
  - function `record_due_recurring` 每次扣款只記一筆，Afterpay 最後一期後停止。
  - pg_cron 每小時跑；App 每次同步也呼叫 `run_my_recurring` 補記。
  - 扣款日照使用者手機時區算。
- 銀行餘額（20）、更新餘額（21）、對帳結果（22）：
  - 差額有抵銷收入。
  - 「補記一筆」會帶入金額與帳本。
  - 新增／編輯／刪除銀行帳戶（設計稿沒畫，照現有風格）。
- 每月檢查（23）：上個完整月份比較再上個月，有各類別長條、固定支出卡、對帳差額卡；可切換個人帳本。
- 首頁：
  - 選單三個項目接上，副標顯示「每月約 $X」「N 個帳戶該更新了」「9 月報告已完成」。
  - 自動記入的紀錄有「自動記入」標籤，點了開扣款修改表單。
  - 分帳帳本的定期分帳有「每週自動分帳」標籤。
- 通知（手機本機通知，Expo Go 可用）：
  - 扣款當天「已扣款」，有「修改金額」「刪除」按鈕。
  - 前一天提醒、銀行提醒。
  - 設定頁「通知」可以開啟。
- 試用模式也會在手機上自動記入到期的扣款。範例資料加了設計稿的 9 筆定期扣款、2 個銀行帳戶、前兩個月的紀錄（每月檢查用）。
- 同步：
  - 伺服器還沒套用新 SQL 時，App 照常同步，只是新功能不上傳。
  - 修正：本機刪除還沒上傳時，下載不會把它救回來（好友、虛擬朋友等也受惠）。
- 共用 UI 新增 `Segmented`、`Toggle`；日曆選擇器可以選未來日期（第一次扣款日用）。

**決定**（暫用，已寫進 spec.md）：
- 新增時已經過去的扣款算已付、不補記。
- 前一天提醒與扣款通知先用本機通知。
- 定期分帳通知其他成員等 Phase 5 遠端推播。

**新增套件**：`expo-notifications`（~58.1.6）。Expo 官方套件，支援 iOS / Android / New Architecture。Expo Go 可用本機通知；遠端推播要 development build。

**驗證**：
- `npm run typecheck`、`npm run lint`：通過。
- `npm test`：132 項通過（新增定期扣款、分期、月合計、對帳、每月比較、提醒排程、同步、Supabase 對接測試）。
- `npm run test:db`：50 項通過（新增 13 項：自動記入、不重複、分期停止、時區、權限、銀行帳戶）。
- 網頁版瀏覽器實測（試用模式）：
  - Stage 4 共 40 項通過，涵蓋新增、編輯、刪除定期扣款，Afterpay 餘數，定期分帳當天記入並均分，扣款修改，對帳 $80.00、補記一筆，每月檢查金額，中文，以及重新整理後資料還在。
  - Stage 1–3 舊流程 43 項重跑通過。
- iOS／Android bundle 匯出成功；`expo-doctor` 20/20。

**待處理／問題**：
- 👤 要在 Supabase 執行新的 SQL，並開啟 Cron（見 todo.md）。做完後我用真的專案跑端到端測試。
- 通知還沒在實機上確認過（網頁版沒有通知）。

---

## 2026-10-27｜接上真的 Supabase 並實測

**做了什麼**：
- 檢查開發者建立的 Supabase 專案（`Cyy ChipIn`，ap-southeast-2 Sydney）。以下都正確：
  - `.env.local` 有填好，也在 `.gitignore` 裡。
  - 可以註冊、不需要確認信。
  - 9 張資料表都在，未登入時一律拒絕（42501）。
  - 4 個伺服器 function 都在，未登入不能呼叫。
- 用 `.env.local` 打包網頁版，headless Chrome 開三個瀏覽器分身（A、B、C 三個測試帳號）做端到端測試。

**實測結果（19 項全部通過、沒有頁面錯誤）**：
- 註冊、建帳本、產生邀請碼、B 輸入邀請碼成為好友（雙方都看得到）。
- A 建分帳帳本（含 B 和虛擬朋友 Dad），分帳 ¥3,000，B 不重新整理就收到帳本與「你欠 A ¥1,000」。
- B 結清，A 即時看到還款（Realtime）。
- 伺服器 trigger 把 A 分到的部分自動記入 A 的個人日圓帳本，顯示「來自 Osaka」。
- C 用 Dad 的專屬邀請加入，自動變成 Osaka 的成員並繼承 Dad 的 ¥1,000。
- C 看不到 A 的個人帳本。
- B 修改分帳，A 看到「Edited by B」。
- 三人都移除 Osaka 後帳本被刪除，A 刪除個人帳本，回到「還沒有帳本」。

**修掉的問題**：「新增虛擬朋友」對話框畫在可捲動的內容裡，在帳本設定頁會被下面的「自己分到的部分」蓋住，無法使用。改成透過整頁蓋板（`useScreenOverlay`）顯示。

**發現、記入 todo**：直接刪除一個在別人分帳帳本裡的帳號會失敗，因為紀錄的付款人指向他的成員編號。之後做「刪除帳號」時要先把他的成員改成虛擬朋友。

**測試留下的資料**：測試帳號 `gd-test-*@example.com`（共 6 輪，含中途停下的），以及中途停下那幾輪留下的帳本與好友關係。開發者決定先保留給之後的測試用，上線前再刪（已記在 todo.md）。刪除方式：SQL Editor 執行 `delete from auth.users where email like 'gd-test-%@example.com';` 會一次全部刪除（相關資料表都設了 on delete cascade；因為所有測試帳號在同一個指令裡一起刪，不會碰到上面那個限制）。

**驗證**：`npm run typecheck` 通過；`npm test` 102 項通過。

---

## 2026-10-26｜Phase 3 完成：好友與分帳同步（試用模式與網頁驗證）

**階段**：Phase 3

**開發者的決定**：
1. 預設均分，可改每人金額。
2. 結清用最少轉帳次數。
3. 邀請連結先用網頁網址＋QR code＋輸入邀請碼。
4. 通知先做 App 內提示，推播等 Phase 5。
5. 虛擬朋友用專屬邀請連結自動合併。
6. 有欠款也能離開。
7. 計入個人帳本的那筆跟著改。
8. 先用試用模式，Supabase 之後接。
9. 分帳帳本可以刪除。

第 9 點的做法：分帳帳本的「刪除」是**從自己的帳本移除（離開）**，其他成員不受影響，最後一人移除時才真的刪除。這樣不會刪到別人的帳。

**做了什麼**：
- 資料庫（第二個 migration，只新增不改舊檔）：
  - 成員編號、虛擬朋友、離開時間；分帳欄位；修改歷史；好友、虛擬朋友、邀請。
  - 伺服器 function：接受邀請（含合併）、建立分帳帳本、加成員、離開／刪除。
  - trigger：計入個人帳本、記錄修改歷史、檢查分配。
- 計算（`src/lib/balances.ts`）：成員淨額、最少轉帳次數、我分到的部分、自訂金額分配。
- 資料層：
  - 新的同步操作與合併規則。例如還沒上傳就刪掉的帳本，連同裡面的紀錄都不再上傳。
  - 下載時會抓新加入帳本的全部紀錄；接受邀請需要網路，不排進佇列。
  - 試用模式自己模擬「計入個人帳本」。
- 畫面：
  - 分帳（08）、首頁分帳分頁（02：結餘卡、標籤、新紀錄小點）、結清（11）、結束帳本（12）。
  - 新增分帳帳本、帳本設定（改名、成員、自己分到的部分、結束／重新開啟、刪除／移除）。
  - 好友頁（10：分享連結、QR code、輸入邀請碼、虛擬朋友專屬邀請）、邀請連結頁、設定頁可改名字。
- 試用資料加上設計稿的「Japan Trip」「Flat」、好友 Amy／Ben／Chloe、虛擬朋友 Dad。

**新增套件**：`expo-clipboard`、`react-native-qrcode-svg`（純 JS，用 react-native-svg），都能在 Expo Go 用。

**修掉的問題**（測試時發現）：
- 邀請碼取 UUID 前段，隨機性不足 → 改取隨機的尾端 10 碼。
- 結清表單、結束對話框原本只蓋住分頁中間 → `Screen` 加了整頁蓋板（`useScreenOverlay`）。
- QR code 表單在畫面繪製時產生邀請碼 → 改成按下按鈕時才產生。
- 邀請頁失敗時也顯示「已接受」 → 改成顯示實際結果。
- 中文「代記」少了名字變數 → 改成「替 {{name}} 代記」；翻譯測試改成比對變數「種類」而非次數。

**驗證**：
- `npm run typecheck`、`npm run lint` 通過；`npx expo-doctor` 20/20。
- `npm test`：102 項通過（新增最少轉帳、分配、同步合併、試用模式分帳、Supabase 請求格式等）。
- `npm run test:db`：PGlite 上 37 項通過（新增 21 項：邀請、合併、建立分帳帳本、分配檢查、計入個人帳本跟著改、離開與刪除、修改歷史、已結束唯讀）。
- iOS／Android 打包成功（Expo Go 載入的 bundle）。
- 網頁版瀏覽器測試：
  - Phase 3 流程 29 項通過：結餘、部分與全額結清、代記、自訂金額分帳、結束並加入個人帳本、重新開啟、好友與 QR、新建分帳帳本並自動計入、移除帳本、中文。
  - Phase 1–2 回歸 14 項、Supabase 登入頁 3 項也都通過。
- **沒有驗證**：真的 Supabase 專案（多帳號同步、邀請、合併、Realtime）、Expo Go 實機。

**待處理／問題**：Supabase 專案建好後做多帳號實測；Universal Links 與推播在 Phase 5。

---

## 2026-10-26｜push 到 main 自動部署網頁預覽

**階段**：Phase 1（基礎建設）

**做了什麼**：
- 新增 `.github/workflows/deploy.yml`（GitHub Actions）：push 到 `main`（或手動觸發）→ `npm ci` → typecheck → lint → 單元測試 → 資料庫測試 → `expo export --platform web` → `eas deploy --prod --non-interactive`。
- 修正 `npm run deploy:web`：原本直接呼叫沒安裝的 `eas`，改成 `npx eas-cli@latest`；新增 `npm run deploy:web:prod`（固定正式網址）。
- README 加上部署與 GitHub 設定說明。

**決定**：
- 用 GitHub Actions，而不是 EAS Workflows：repo 已經在 GitHub，不需要另外在 expo.dev 連 GitHub。
- 任何一項檢查失敗就不部署。
- 同時只跑一個部署，新的 push 會取消還在跑的舊部署。
- Supabase 網址與 publishable key 用 GitHub Variables 傳進打包步驟；沒設定時網站是試用模式。
- 第一次部署的子網域可用 Variable `EAS_DEV_DOMAIN` 指定（對應 `eas deploy --dev-domain`）。

**驗證**：
- 確認 eas-cli 25.3.0 的 `deploy --help` 有 `--prod`、`--non-interactive`、`--dev-domain`。
- YAML 可正常解析。
- 在沒有 `.expo` 和 `expo-env.d.ts` 的乾淨複本上 `tsc` 通過（CI 環境不會有這些檔案）。
- `npm test -- --ci` 71 項通過。
- lockfile 含 Linux 平台需要的原生套件，`npm ci` 在 ubuntu 上不會缺套件。
- **還沒在 GitHub 上實際跑過**（要等你設定 `EXPO_TOKEN` 並 push）。

---

## 2026-10-26｜後端改成 Supabase、手機改用 Expo Go 測試

**階段**：Phase 1、Phase 2（重做資料層）

**做了什麼**：
- 開發者決定後端用 Supabase、不用 Firebase，手機用 Expo Go 測。移除所有 Firebase 套件、設定檔與規則，也移除 Expo Go 不能用的 `expo-dev-client`、`expo-build-properties`。
- `app.config.ts` 連到 EAS 專案 `godutchapp`（id `dc0dde5e-5d61-4b71-9841-9dd3d84d3e03`），slug 改成 `godutchapp`。
- 資料庫：`supabase/migrations/20261026000000_init.sql` 建立 profiles、ledgers、ledger_members、ledger_prefs、entries，含 RLS、trigger（註冊自動建 profile、建帳本自動加成員、鎖定幣別、設定 created_by／last_edited_by、伺服器端 updated_at、禁止未來日期）、Realtime。
- 離線優先資料層：
  - `LocalStore`：手機上的資料。iOS／Android 用 expo-sqlite kv-store，網頁用 localStorage。
  - `ops.ts`：待上傳佇列，含合併規則。
  - `SyncEngine`：依序上傳、離線重試、伺服器拒絕時丟掉並完整下載修正、增量下載、Realtime 與網路恢復／回到前景時觸發。
  - `SupabaseRemote`：資料表對應。
  - `LocalRepo`：給畫面用，試用模式和雲端模式共用。
- 登入改用 Supabase Auth：Email；網頁 Google／Apple 轉址登入。註冊需要確認信時會提示使用者去收信，連不上伺服器也有對應訊息。
- 設定頁顯示「N 筆變更等待上傳／所有變更都已上傳」。

**決定**：
- 離線先用自己做的同步，不用 PowerSync（PowerSync 需要 development build 且有付費門檻）。
- 主鍵用手機產生的 UUID（`expo-crypto`）；紀錄用 `deleted_at` 軟刪除，讓其他裝置同步得到刪除。
- RLS 測試用 PGlite，因為這台電腦沒有 Docker。
- 想用下載的 PostgREST 執行檔做端到端測試，被權限系統擋下，沒有執行。改用「supabase-js＋假的 fetch」驗證實際送出的 HTTP 請求。

**修掉的問題**：
- 單元測試發現：伺服器拒絕某筆新增後，手機上那筆會一直留著（增量下載不會修正）。改成被拒絕後做一次完整下載，以伺服器為準，只保留還沒上傳的變更。

**新增套件**：`@supabase/supabase-js`、`expo-sqlite`、`expo-crypto`、`@react-native-community/netinfo`、`react-native-url-polyfill`；開發用 `@electric-sql/pglite`。
**移除套件**：`firebase`、`@react-native-firebase/*`、`firebase-tools`、`@firebase/rules-unit-testing`、`expo-dev-client`、`expo-build-properties`。

**驗證**：
- `npm run typecheck` 通過；`npm run lint` 0 錯誤 0 警告。
- `npm test`：8 組 71 項通過（新增：同步引擎與佇列 15 項、SupabaseRemote 請求格式 9 項）。
- `npm run test:db`：PGlite 上 RLS／trigger 16 項通過。
- `npx expo export --platform ios --platform android`：兩個平台都打包成功（Expo Go 載入的就是這個 bundle）。
- 網頁版（headless Chrome）：試用模式完整流程 14 項通過；設定假的 Supabase 網址時，登入頁、「連不上伺服器」訊息、從登入頁進試用模式 3 項通過。
- **沒有驗證**：真的 Supabase 專案（等你建立）、Realtime、Expo Go 實機、Google／Apple 登入。

**待處理／問題**：見 todo.md「現在要你做的事」。

---

## 2026-10-26｜Phase 1 與 Phase 2 完成（網頁驗證）

**階段**：Phase 1 基礎建設與設計系統、Phase 2 個人記帳核心

**做了什麼**：
- 環境：這台電腦原本沒有 Node.js，用 Homebrew 安裝了 Node 26.12.1（`brew install node`）。沒有 Xcode 與 Android Studio，所以這次只在網頁驗證。
- 建立 Expo SDK 58 專案（Expo Router、TypeScript strict、React Compiler），`app.json` 改成 `app.config.ts`：手機用的 Firebase 設定檔存在時才啟用 React Native Firebase，否則原生建置也不會失敗。
- 純函式（`src/lib/`）：金額（最小單位、千分位、鍵盤輸入）、日期、均分、帳本排序與路由、每月摘要、oklch 轉色、ISO 4217 幣別表（150 種，從官方清單產生）。
- 設計系統（`src/ui/`）：色票依色相產生、Caprasimo／Figtree、Lucide 2.75、按鈕、表單、對話框、toast、鍵盤、網頁手機外框。
- 多語言：en-AU／zh-TW 全部字串，文案照設計稿。
- 資料層（`src/data/`）：`DemoRepo`（試用模式）與 `FirestoreRepo`（網頁 JS SDK／手機 RNFirebase 共用一份程式），Email 登入，網頁 Google／Apple 彈窗登入。
- 畫面：首頁（1a 分頁、摘要、紀錄泡泡、顯示更早紀錄）、選單、排列分頁（拖曳＋星號）、新增帳本、記一筆（金額、幣別、類型、帳本路由三種情況、類別、備註、補登日期）、編輯／刪除紀錄、設定、登入。
- Firestore 安全規則與規則測試、`firebase.json` 模擬器設定、`eas.json`、`.env.example`、README。

**決定**：
- 函式庫：見 spec.md §14 的表格。表單、對話框、拖曳都自己寫，畫在畫面裡而不是用原生 Modal，網頁預覽才會留在手機外框內。
- 網頁版關閉 Expo Router 的分檔載入（`asyncRoutes.web: false`）。原因是離線測試時切換畫面整頁變白：分檔要用到才下載，離線時下載不到。
- 時間欄位存用戶端毫秒數；日期存當地日曆日字串。
- 暫用做法（已列在 todo.md「需要你決定的事」）：登入與編輯畫面照現有風格做、長按分頁打開排列分頁、列表一次多載入一個月、簡體中文手機用 en-AU。

**修掉的問題**：
- 新建的帳本還沒寫進伺服器時，監聽紀錄被安全規則拒絕，剛記的帳不會即時出現 → 監聽遇到權限不足時自動重試。
- 補登日期的月份標題太長，把「下個月」箭頭擠出畫面 → 月份導覽改成獨立一列。

**新增套件**：`expo-localization`、`@react-native-async-storage/async-storage`、`react-native-svg`、`lucide-react-native`、`@expo-google-fonts/caprasimo`、`@expo-google-fonts/figtree`、`firebase`、`@react-native-firebase/app|auth|firestore`、`expo-dev-client`、`expo-build-properties`、`i18next`、`react-i18next`、`zustand`；開發用：`jest-expo`、`jest`、`@testing-library/react-native`、`eslint-config-expo`、`prettier`、`@types/node`、`firebase-tools`、`@firebase/rules-unit-testing`。移除範本用不到的 `@expo/ui`、`expo-glass-effect`、`expo-symbols`、`expo-device`、`expo-web-browser`。

**驗證**：
- `npm run typecheck`：通過。`npm run lint`：0 錯誤 0 警告。`npm test`：6 組 48 項通過。`npx expo-doctor`：20/20。
- `npm run test:rules`：Firestore 模擬器上 14 項規則測試通過。
- `npm run export:web`：打包成功。
- 用 headless Chrome（playwright-core）點過完整流程：
  - 試用模式 14 項：帳本路由（2 個以上、沒有→建立→回到類別）、存檔回到分頁、編輯、刪除、拖曳排序、重新整理後資料還在、中英切換、電腦瀏覽器的手機外框。
  - 連 Firebase 模擬器 9 項：註冊、空帳本狀態、建帳本、記帳即時顯示、重新整理仍登入、語言存在帳號、第二個帳號看不到別人的帳本、密碼錯誤訊息。
  - 離線 3 項：斷網記帳立即顯示，恢復連線後用另一個瀏覽器看得到。
- **沒有驗證**：iOS／Android 實機或模擬器（沒有 Xcode／Android Studio）、`sdk.native.ts` 與 `firebaseAuth.native.ts`（只通過型別檢查）、正式 Firebase 專案、EAS Hosting 實際部署（需要你的帳號）。

**網頁預覽網址**：尚未部署（需要你先 `npx eas-cli@latest login`）。

**待處理／問題**：見 todo.md「現在要你做的事」與「需要你決定的事」。

---

## 2026-10-26｜決定測試方式：網頁預覽（EAS Hosting）

**階段**：開始前（尚未寫程式）

**做了什麼**：把測試方式寫進 spec.md（§14、§14.1、§15）、todo.md（Phase 1 新增網頁預覽工作）、claude-rule.md（套件要支援網頁、平台檔案分開、每階段部署預覽）。

**決定**：
- 用 Expo Web（react-native-web）部署到 EAS Hosting，產生網址，用瀏覽器看 App 畫面。這是開發者之前在其他專案用過的方式。
- 因為 `@react-native-firebase` 不能在網頁跑，資料層分平台：手機用原生 SDK（保留離線記帳），網頁用 `firebase` JS SDK。
- 加一個假資料模式（設計稿範例資料），Phase 1–2 早期不連 Firebase 也能給網址看畫面。
- 網頁預覽看不到小工具、推播、原生登入；上架前仍要用 development build 在手機上測。

**新增套件**：無

**驗證**：不適用（只有文件）

**待處理／問題**：無

---

## 2026-10-26｜設計稿搬進 repo、加入 CLAUDE.md

**階段**：開始前（尚未寫程式）

**做了什麼**：
- 把 `~/Desktop/design_handoff_ledger_app/` 複製到 `docs/design-handoff/`（排除 `.DS_Store`，用 `diff -rq` 確認內容與原資料夾一致）。原資料夾沒動。
- 新增 `CLAUDE.md`，內容只有一行 `@claude-rule.md`，讓 Claude Code 每次都自動載入規則。
- spec.md、claude-rule.md、todo.md 裡的設計稿路徑改成 repo 內路徑。
- claude-rule.md 加上「`docs/design-handoff/` 只讀不改」。

**決定**：設計原稿放在 `docs/design-handoff/`。

**新增套件**：無

**驗證**：`diff -rq` 無差異。

**待處理／問題**：重複的 PDF 要不要刪、設計稿要不要進 git（見 todo.md）。

---

## 2026-10-26｜專案分析與文件建立

**階段**：開始前（分析，尚未寫程式）

**做了什麼**：
- 讀完設計交接資料夾 `~/Desktop/design_handoff_ledger_app/`：README、`Phone.dc.html`（畫面、文案、範例資料、行為）、`Ledger App Design.dc.html`（35 張畫面總覽）、`Ledger App Prototype.dc.html`（可點擊原型）、兩份 PDF 規格。
- 把兩份 PDF 與 README 整合成 `spec.md`。
- 建立 `todo.md`（五個階段＋需要開發者處理與決定的事）、`claude-rule.md`（開發規則）、`log.md`（本檔）。

**決定**：
- 技術改用 **React Native（Expo + TypeScript）＋ Firebase**，不用原規格建議的 Flutter。
- Firebase 用 `@react-native-firebase`（原生 SDK），因為要 Firestore 的離線儲存；不用 JS 版 `firebase` SDK。
- 使用 Expo development build（不用 Expo Go），因為小工具與原生 Firebase 都需要原生程式。
- 邀請連結用自有網域的 Universal Links / App Links，因為 Firebase Dynamic Links 已停止服務。
- 階段順序改成：基礎建設 → 個人記帳 → 好友分帳 → 定期扣款／對帳 → 小工具／外觀／上架（原規格是「核心 → 小工具 → 好友分帳」）。理由寫在 todo.md，等開發者確認。

**分析時發現的問題**：
- React Native 不支援 `oklch()` 顏色，設計系統的色階要在執行時轉成 hex。
- 功能客群 PDF 提到「依金額或比例分」與「最少轉帳次數結清」，但設計稿只有均分、兩兩結算 → 列入待決定。
- 設計稿缺少登入、編輯單筆紀錄、編輯帳本、刪除帳號等畫面 → 列入待決定。
- App Store 要求 App 內可刪除帳號，規格沒寫 → 加入 Phase 5 與待決定。
- 虛擬朋友合併若直接用 uid 當 `payer`／`shares` 的鍵，合併時要改寫所有紀錄 → 建議帳本內用穩定的成員鍵。
- 兩份「功能與目標客群」PDF 是同一個檔案。

**新增套件**：無（尚未建立專案）

**驗證**：不適用（只有文件）

**待處理／問題**：見 todo.md「開始寫程式前你要先處理的事」與「需要你決定的事」。
