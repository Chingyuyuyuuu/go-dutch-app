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
