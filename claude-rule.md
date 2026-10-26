# Claude 開發規則

> 給 Claude（AI 助手）在這個 repo 工作時遵守的規則。你可以隨時修改這份文件。

## 0. 絕對規則

1. **不要 commit、push，也不要做任何改動 git 歷史或遠端的操作**（`git commit`、`git push`、`git rebase`、`git reset --hard`、`git tag`、開 PR 等）。git 全部由開發者本人處理。可以用 `git status`、`git diff`、`git log` 查看狀態。
2. **技術使用 React Native（Expo + TypeScript），不使用 Flutter。** 後端使用 **Supabase**（Auth、PostgreSQL、Realtime、Storage、Edge Functions），不使用 Firebase。
3. **開發者沒說開始寫程式就不寫程式。** 分析、規劃、更新文件可以做。
4. 一次只做一個階段（見 [todo.md](todo.md)）。要進下一階段前先問開發者。

## 1. 每次工作的流程

1. 開始前先讀 [spec.md](spec.md)、[todo.md](todo.md)，以及 [log.md](log.md) 最近幾筆紀錄。
2. 規格有不清楚或互相矛盾的地方 → 先問，或加到 todo.md 的「需要你決定的事」，不要自己假設後直接寫程式。
3. 工作結束時：
   - 在 todo.md 打勾完成的項目，加上新發現的工作
   - 在 log.md **最上面**新增一筆紀錄（格式見 log.md）
   - 有新的決定 → 寫進 spec.md 的「已確認的決定」
4. 回報時說清楚：做了什麼、驗證了什麼（跑了哪些指令、結果）、沒做或失敗的部分。

## 2. 文件與規格

- 規格優先順序：設計交接 README ＞ 產品規格 PDF ＞ 功能客群 PDF。spec.md 已整合三者。
- 畫面的依據是設計稿 [docs/design-handoff/design/Phone.dc.html](docs/design-handoff/design/Phone.dc.html)（所有文案、範例資料、行為）。設計交接說明在 [docs/design-handoff/README.md](docs/design-handoff/README.md)。
- `docs/design-handoff/` 是設計原稿，**只讀不改**。
- 文件用**繁體中文**寫。程式碼的識別名稱與註解用英文。
- 和開發者對話用繁體中文。

## 3. 程式碼規範

- Expo SDK 58：Expo 每個版本都有破壞性變更，寫 Expo / React Native API 前先查 `https://docs.expo.dev/versions/v58.0.0/` 或 `https://docs.expo.dev/llms.txt`，不要憑記憶。安裝套件用 `npx expo install <pkg>`（會挑相容版本）。
- 不要手動建立或修改 `ios/`、`android/`（由 `app.config.ts` 與 config plugin 產生）。
- TypeScript `strict`，不用 `any`（真的需要時加註解說明原因）。
- 依功能分資料夾：`src/features/<feature>/`（畫面），資料層放 `src/data/`，共用 UI 放 `src/ui/`，純函式放 `src/lib/`，資料庫結構與權限放 `supabase/migrations/`（新增變更就加一個新的 migration 檔，不改已經套用的舊檔），Edge Functions 放 `supabase/functions/`。
- 純邏輯（金額、均分、結餘、定期扣款係數、對帳差額、日期）寫成純函式放 `src/lib/`，和 UI 分開，**一定要有單元測試**。
- 畫面只透過資料層（`useAppData`、`useRepo`、`useLedgerEntries`）讀寫資料，不在畫面裡直接呼叫 Supabase。
- 資料是**離線優先**：寫入先改手機上的資料（`LocalStore`）再排進待上傳佇列，畫面不能等網路回應。新的寫入類型要同時加：`Op`、`enqueueOp` 的合併規則、`SupabaseRemote.push`、對應的測試。
- 新增套件前先確認：是否支援 iOS 與 Android、是否支援 Expo development build 與 New Architecture、**是否支援網頁（react-native-web）**、是否還在維護。不支援網頁的套件要有網頁替代或在網頁上停用。新增後記在 log.md。
- 只有手機才有的功能（小工具、推播、原生登入、本機儲存）用平台檔案（`*.native.ts` 與一般 `.ts`）分開，畫面程式碼不直接判斷平台。
- Phase 1–4 要維持 **Expo Go 能直接跑**：新增套件前確認它在 Expo Go 裡（或是純 JS）。真的需要原生模組時先問開發者。
- 不要把金鑰、`.env`、私人憑證寫進程式碼。Supabase 網址與 publishable key 放 `.env.local`（`EXPO_PUBLIC_SUPABASE_*`）；**絕對不要**在 App 裡使用 secret / service_role key。

## 4. 業務規則（不能違反）

- **金額一律用整數最小單位（integer minor units）＋ ISO 4217 幣別代碼。** 計算過程不能出現浮點數金額。小數位數從 ISO 4217 表查。
- 金額格式兩種語言都是 `1,234.50`；**幣別符號跟帳本幣別，不跟語言**。
- 均分用餘數規則：`base = floor(total / n)`，前 `rem` 位各 +1 最小單位。
- 類別存**代碼**，不存顯示文字。
- 日期存當地日曆日 `YYYY-MM-DD`；可以補登過去，不能選未來。
- 帳本幣別建立後不可改。
- 首頁分頁順序只由使用者決定：星號 → 手動順序 → 已結束的排最後。新增紀錄不改變順序。
- 已結束的分帳帳本唯讀，可以重新開啟。
- 寫入別人的資料（計入其他成員的個人帳本、合併虛擬朋友、定期扣款自動記入、推播）**一律在伺服器做**（PostgreSQL function／trigger、pg_cron、Edge Functions），不從前端直接寫。
- 每張資料表都要開 RLS。改了資料結構就要同步改 RLS 與 `supabase/tests/` 的測試。只有帳本成員能讀寫該帳本。
- 紀錄用 `deleted_at` 軟刪除，`updated_at` 由伺服器 trigger 設定（增量同步靠它）。

## 5. UI 規範

- 照設計稿高保真實作：顏色、字體、圓角、間距、文案、流程。
- **顏色只能用 theme tokens**，不要寫死色碼（React Native 不支援 oklch，色階由 theme 依色相算出）。
- 所有可點擊元素至少 44×44。
- 金額用等寬數字（`fontVariant: ['tabular-nums']`）。
- 圖示用 Lucide，筆畫 2.75。
- **所有介面文字都要走 i18n**，每個新字串同時提供 en-AU 與 zh-TW；en-AU 用澳式拼法（colour、categorise）。帳本名稱與備註不翻譯。
- 平台差異只有：返回圖示（iOS chevron-left / Android arrow-left）、狀態列與底部安全區、登入方式。其餘版面相同。

## 6. 驗證

- 宣告完成前必須跑 `npm run typecheck`、`npm run lint`、`npm test`，並在回報中附上結果。失敗就照實說。
- 動到 `supabase/` 要跑 `npm run test:db`（PGlite，不需要 Docker）。
- 動到手機專用檔案（`*.native.ts`）要跑 `npx expo export --platform ios --platform android` 確認能打包。
- UI 改動盡量在 iOS 與 Android 模擬器都確認；沒辦法確認時要說明。
- UI 改動也要確認網頁預覽（Expo Web）能正常顯示。
- 每個階段結束部署一次網頁預覽（EAS Hosting），把網址寫進 log.md。部署前先問開發者。
