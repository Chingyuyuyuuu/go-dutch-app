# TODO

> 規則：完成就打勾 `[x]`；新增的工作放到對應階段。標 👤 的是**只有你本人能做**的事（帳號、付費、決定、git）。
> 規格見 [spec.md](spec.md)，開發紀錄見 [log.md](log.md)。

---

## 👤 現在要你做的事（照順序）

- [ ] **在手機上用 Expo Go 看**：手機裝 Expo Go → 電腦在專案資料夾跑 `npm install`、`npx expo start` → 掃 QR code（同一個 Wi‑Fi；不同網路用 `npx expo start --tunnel`）。沒設定 Supabase 前是試用模式
- [x] **建立 Supabase 專案**（2026-10-27 完成：專案 `Cyy ChipIn`，Sydney；設定已檢查）：
- [ ] 👤 **上線前**刪除測試帳號（開發期間先保留，自動測試會繼續用）：SQL Editor 執行 `delete from auth.users where email like 'gd-test-%@example.com';`，會連同測試帳本、好友關係一起刪除
- [x] **套用 Phase 4 的資料庫變更**（2026-10-27 完成）：Supabase → SQL Editor → 貼上並執行 `supabase/migrations/20261028000000_recurring_banks.sql` 整個檔案（定期扣款、銀行帳戶）。**要在下次 push 到 main 之前做**，網頁版才會有這些功能；沒套用也不會壞，只是定期扣款、銀行帳戶不會同步到雲端
- [ ] **套用 Phase 6 的資料庫變更**：SQL Editor 執行 `supabase/migrations/20261030000000_fx_categories.sql`（帳本匯率、記帳幣別、類別組、`last_ledger_id`）。沒套用也不會壞：新版 App 照常同步，只是之後的外幣紀錄、類別組等設定不會上傳。建議在外幣畫面上線前做
- [ ] **套用 Phase 6 的第二個資料庫變更**：在上一個 SQL 之後執行 `supabase/migrations/20261031000000_fx_rates.sql`（市場中間價表 `fx_rates`、`mid_rate`、新帳號預設常用幣別 TWD／JPY）。沒套用時建議匯率不會出現，使用者要自己填
- [ ] **套用 Phase 6 的第三個資料庫變更**：在上面兩個 SQL 之後執行 `supabase/migrations/20261101000000_rate_notices_share_links.sql`（改匯率提示、免登入分享頁、從分享頁加入的申請）。沒套用時：分享按鈕會顯示「連不上伺服器」，改匯率提示不會出現，其他功能照常
- [ ] **部署抓匯率的 Edge Function 並排程**（套用上面的 SQL 之後）：
  1. 這台電腦執行 `npx supabase login`，再 `npx supabase functions deploy fetch-fx-rates --project-ref <你的專案 ID>`（或在 Supabase 後台 Edge Functions → Deploy a new function，貼上 `supabase/functions/fetch-fx-rates/index.ts`）
  2. Integrations → Cron → Create job → 類型選「Supabase Edge Function」→ 選 `fetch-fx-rates`，每天一次（例如 `15 0 * * *`）
  3. 手動執行一次，到 Table Editor 看 `fx_rates` 有沒有今天的資料
- [ ] **確認 Cron 有開（每小時自動記入扣款）**：到 Integrations → Cron 看有沒有 `go-dutch-recurring` 這個排程。我從外面查不到 Cron 狀態（SQL 執行時如果出現「pg_cron not set up」就是沒開）。執行上面的 SQL 時如果下方出現「pg_cron not set up」的提示，到 Integrations → Cron 開啟，再到 SQL Editor 執行一行 `select cron.schedule('go-dutch-recurring', '7 * * * *', 'select public.run_all_recurring()');`。沒開的話，App 每次開啟、同步時也會記入到期的扣款，只是手機沒開就不會記
- [x] **套用 Phase 5 的資料庫變更**（2026-10-27 完成）：SQL Editor 再執行 `supabase/migrations/20261029000000_appearance_account.sql`（外觀設定、首頁照片的儲存空間 `home-photos`、刪除帳號）。要在上一個檔案之後執行
- [x] 用你的專案跑定期扣款、銀行對帳、首頁照片上傳、刪除帳號的端到端測試（2026-10-27，23 項通過，見 log.md）
- [ ] **設定自動部署**：GitHub repo → Settings → Secrets and variables → Actions → 新增 Secret `EXPO_TOKEN`（expo.dev → Account settings → Access tokens 產生）。之後 push 到 `main` 就會自動部署（詳見 README）
- [ ] 把網站網址 `https://chipinla.expo.app` 填到 GitHub Variable `EXPO_PUBLIC_WEB_URL` 和 `.env.local` 的 `EXPO_PUBLIC_WEB_URL=`，手機分享的邀請連結才會是網址；沒填的話手機上會分享邀請碼
- [x] **部署網頁預覽**：正式網址 https://chipinla.expo.app（2026-10-27 部署 Phase 1–5）
- [x] **App 名稱**：中文 `Chip In 啦`、英文 `Chiping In`（2026-10-27 決定）
- [ ] **決定 Bundle ID / Package name**：目前暫用 `com.godutch.app`（在 `app.config.ts`），第一次送商店前一定要定案，之後就不能改。要不要改成跟新名稱一致（例如 `com.chipinla.app`）？
- [ ] 確認英文名稱拼法：目前照你寫的 `Chiping In`；英文一般拼成 `Chipping In`（兩個 p）
- [ ] 要不要刪掉重複的 PDF：`docs/design-handoff/design/記帳分帳App_功能與目標客群.pdf` 與 `docs/design-handoff/spec/features-and-audience-zh-TW.pdf` 內容完全相同
- [ ] 確認 `docs/design-handoff/`（約 5.8 MB）要不要進 git；不想放的話加到 `.gitignore`
- [ ] `.claude/settings.json`：Expo 工具自動建立的檔案，會在這個專案啟用 Expo 的 Claude 外掛。要保留就留著，不要就刪掉
- [ ] 自己決定 git 流程（何時 commit、分支怎麼開）。**Claude 不會幫你 commit 或 push**

## 👤 之後才需要的帳號與環境

- [ ] Google／Apple 登入：在 Supabase 開啟 provider 並填 OAuth 資料；Authentication → URL Configuration 加入 `http://localhost:8081` 與網頁預覽網址
- [ ] 申請 Apple Developer Program（US$99/年）：手機 Apple 登入、推播、小工具、App Group、TestFlight 都需要
- [ ] 申請 Google Play Console（US$25 一次）
- [ ] 準備一個網域給邀請連結用（Universal Links / App Links，Phase 3）
- [ ] Phase 5 做小工具與推播時，需要 development build（EAS Build 雲端建置，或安裝 Xcode / Android Studio）

## 👤 Phase 5 剩下的原生功能：需要你決定怎麼做

桌面小工具、遠端推播、當機回報都要原生程式，**Expo Go 跑不了**，要改用 development build（自己的測試版 App）。這台電腦沒有 Xcode 與 Android SDK，我沒辦法在這裡編譯驗證。可以選：
- [ ] A. 用 **EAS Build 雲端建置**（不用裝 Xcode）：需要你 `npx eas-cli login`；iOS 實機需要 Apple Developer 帳號（US$99/年），Android 不用付費帳號就能裝 APK
- [ ] B. 你在這台電腦裝 **Xcode**（App Store 免費，約 15GB）和／或 **Android Studio**，我就能在模擬器上建置與測試
- [ ] C. 先上架不含小工具與推播的版本，之後再加
- [ ] 當機回報要用哪個：建議 **Sentry**（有官方 Expo 套件、免費額度夠用），也需要 development build

## 👤 需要你決定的事（設計稿與規格沒講清楚的地方）

有括號的是我建議的做法，你確認或改掉就好。標「已暫用」的是 Phase 1–2 先照建議做了，你不同意我再改。

- [x] **分帳的分配方式**：功能客群 PDF 寫「也可以依金額或比例分」，產品規格寫「需要時可展開修改」，但設計稿只有均分（展開只能看、不能改）。MVP 要不要做自訂金額／比例？（建議：MVP 做「自訂每人金額」，比例分放第二階段）→ **決定：預設均分，可改每人金額（2026-10-26）**
- [x] **最少轉帳次數的結清建議**：功能客群 PDF 有寫，設計稿與 README 沒有（設計稿是兩兩計算「你欠 Amy」）。MVP 要不要做？（建議：MVP 不做，先兩兩計算）→ **決定：做最少轉帳次數（2026-10-26）**
- [ ] **設計稿沒畫的畫面**要不要先補設計，還是由我照現有風格做：
  - [x] 登入／註冊（已暫用：照現有風格做了，見截圖）
  - [x] 點一筆紀錄後的編輯／刪除（已暫用：照現有風格做了）
  - [ ] 第一次使用引導（目前：沒有帳本時首頁顯示「建立帳本」）
  - [ ] 編輯帳本（改名、加減成員、離開帳本、刪除帳本）
  - [ ] 邀請連結落地頁（對方還沒裝 App 時看到什麼）
  - [x] 新增／編輯銀行帳戶（含連結哪些帳本）（已暫用：照現有風格做了）
  - [ ] 通知設定、帳號頁
- [x] **刪除帳號**：已暫用建議做法：分帳帳本裡變成同名、沒有帳號的成員（算「已離開」），紀錄保留給其他成員；他建立的分帳帳本交給另一位成員；沒有其他有帳號的成員時帳本刪除
- [x] **成員離開／被移出分帳帳本**時，還有未結清的結餘怎麼辦？（建議：有未結清就不能離開）→ **決定：可以離開，欠款留在帳本，其他人可幫他記還款（2026-10-26）**
- [x] **刪除帳本**：個人帳本可以刪嗎？分帳帳本誰可以刪？→ **決定：個人帳本可刪；分帳帳本可「從我的帳本移除」，最後一人移除時才真的刪除（2026-10-26）**
- [x] **時區**：「今天」「本月」以手機目前時區算；定期扣款以使用者手機的時區決定「扣款日」（App 同步時存到伺服器，沒有就用雪梨）
- [ ] **首頁長按分頁**：設計稿說長按分頁可以直接拖曳。（已暫用：長按分頁會打開「排列分頁」畫面在那裡拖曳。直接在首頁分頁列拖曳要做嗎？）
- [ ] **首頁紀錄列表範圍**：設計稿只畫了本月。（已暫用：列表顯示本月，底部「顯示更早的紀錄」每按一次多載入一個月；摘要永遠是本月）
- [ ] **簡體中文手機**：規格說「系統是其他語言時用 en-AU」。（已暫用：繁中＝zh-TW；簡中與其他語言＝en-AU）
- [x] **虛擬朋友合併**：誰來確認「這個新帳號就是虛擬朋友 Dad」？→ **決定：用虛擬朋友的專屬邀請連結加入，就自動合併（2026-10-26）**
- [x] **「每筆計入個人帳本」之後分帳紀錄被別人修改或刪除**，個人帳本那筆要不要跟著改？→ **決定：跟著改或刪，並標示「來自『日本旅行』」（2026-10-26）**
- [x] **對帳的收入抵銷**：已暫用 MVP 就做（差額 = 餘額減少 −（支出 − 收入））
- [ ] **免費或收費**：要不要有付費功能？影響是否需要訂閱機制。（建議：MVP 全免費）
- [ ] 原規格建議的開發順序是「核心記帳 → 小工具 → 好友分帳」。我改成「核心記帳 → 好友分帳 → 定期扣款 → 小工具」，因為主打客群的切入點是 share house 分帳，而小工具是獨立的原生程式，放後面不影響其他功能。你同意嗎？

---

## 👤 Phase 6 需要你決定的事（2026-10-28 新增）

規格已寫進 spec.md §6A、§5.5、§6B。括號是我暫用的做法，你確認或改掉就好。

- [x] **匯率方式**：→ **決定：每個帳本設一個帳本匯率，整個帳本的外幣都用它；建立帳本時預填建議值＝市場中間價 × 1.015，使用者可改；刷卡可在帳單出來後修正單筆，但不強迫、不在每筆標「估算」（2026-10-28）**
- [x] **匯率來源**：→ **決定：中間價用自己的 `fx_rates` 表，伺服器每天從一般匯率 API 抓；不直接用臺灣銀行，不分買價、賣價（2026-10-28）**
- [x] **台幣、日幣不顯示小數**：→ **決定：四捨五入到整數（2026-10-28）**（同日更新：計算過程不取整，見下面「台幣取整規則」）
- [x] **換算資訊圖示**：→ **決定：換算後的台幣旁加 ⓘ，說明匯率、算式，並可修改匯率（2026-10-28）**
- [ ] 👤 **確認匯率 API**：已先用 ExchangeRate-API 免費端點（`open.er-api.com`，每天更新、有 TWD、不用金鑰；條款要求標示來源，建議值旁已放「Rates By Exchange Rate API」）。你可以接受嗎？不行就換一家，只影響 `supabase/functions/fetch-fx-rates`
- [x] **「退稅（日本免稅）」在 4 欄格子裡會換行** → **決定：改叫「免稅退稅」（2026-10-28）**
- [ ] **改帳本匯率**：預設只套用到之後新增的紀錄，另外可選「全部重算」（單筆修正過的不改）。（暫用）
- [ ] **離線建立帳本**：拿不到建議值，要使用者自己填匯率才能建立。（暫用）
- [ ] **改版前的帳本**：類別組設成「澳洲生活」，畫面不變；新帳本預設「日本旅遊」。（暫用）
- [ ] **咖啡類別改名**：`coffee` 在兩組都改叫「咖啡甜點」。（暫用；不想改的話日本旅遊組也叫「咖啡」）
- [ ] **日本旅遊類別清單**（spec §5.5，支出 16、收入 4）：要增減哪些？例如要不要「醫療」「扭蛋」單獨一格
- [x] **分享頁加入**：→ **決定：從分享頁加入（認領沒有帳號的成員、或以新成員加入）一律要帳本建立者同意，同意後通知其他成員（2026-10-28）**
- [x] **計入個人帳本那筆的匯率**：→ **決定：`fx_source` 多一種 `split`，不做重算檢查，「全部重算」也跳過（2026-10-28）**
- [x] **伺服器收到沒填換算欄位的紀錄**：→ **決定：當作同幣別補上，匯率 1、換算後金額 = 原金額（2026-10-28）**
- [x] **分享頁路由**：→ **決定：不經過登入檢查與試用模式；加 `robots.txt` 擋 `/s/`（2026-10-28）**
- [x] **台幣取整規則**：→ **決定：計算到「分」、不四捨五入到元；只在顯示與結清時取整。分帳顯示建立者無條件捨去、其他人無條件進位（1,000 ÷ 3 → 333／334／334，內部仍是 333.34／333.33／333.33）；結清後不到 1 元的差額算已結清；舊的帶「分」台幣紀錄不改、只顯示到元（2026-10-28）**
- [x] **「上次使用的帳本」**：→ **決定：新增 `profiles.last_ledger_id`，舊欄位 `last_used_ledger` 不動、新版不再讀寫（2026-10-28）**
- [x] **中途加入、退出分帳帳本**：→ **決定：維持現狀（帳本設定可加成員、有欠款也能離開），只有從分享頁加入要建立者同意（2026-10-28）**
- [ ] **分享連結有效期限**：（暫用：一直有效，直到停用或重新產生）
- [ ] **定期扣款要不要支援外幣**（例如每月日圓訂閱）：（暫用：Phase 6 不做）

> **每個階段結束都部署一次網頁預覽**，把網址記在 log.md，讓你用瀏覽器檢查畫面與流程。

## 👤 Phase 7 需要你決定的事（2026-10-28 新增）

規劃見下面「Phase 7」與 spec.md §17。括號是我的建議。

- [ ] **Bundle ID / Package name**（上架後永遠不能改）：目前 `com.godutch.app`。（建議：`com.chipinla.app`，或你有網域就用網域倒過來寫）
- [ ] **英文名稱**：`Chiping In` 還是 `Chipping In`？（建議：上架前定案，商店名稱改起來麻煩）
- [ ] **正式環境的 Supabase**：（建議：另開一個**正式專案**，區域選**東京 ap-northeast-1**（使用者在台灣、日本，現在的雪梨離太遠）；現在這個專案留著當開發／測試用。正式專案開 **Pro 方案（US$25/月）**：免費方案一週沒人用會自動暫停、沒有每日備份）
- [ ] **網域**：分享連結、邀請連結、隱私權政策、點連結直接開 App 都需要自己的網域。（建議：買一個，例如 `chipinla.app`，一年約 US$15–20）
- [ ] **1.0 版的登入方式**：Email／Apple／Google。（建議：三種都做。App Store 規定有 Google 登入就必須也有 Apple 登入）
- [ ] **1.0 版要不要有小工具與推播**：（建議：1.0 先做**推播**和**當機回報**；小工具放 1.1，因為要寫 Swift／Kotlin 原生程式、測試成本高）
- [ ] **正式版保留「試用模式」嗎**：（建議：保留登入頁的「先試用」，對審核和新使用者都有幫助；但正式版**一定要連到伺服器**，不能像現在沒設定就自動進試用模式）
- [ ] **Apple 開發者帳號用個人還是公司**：個人名義審核快（1–2 天），商店顯示你的本名；公司要先申請 D-U-N-S 編號（可能要幾週），商店顯示公司名
- [ ] **App 圖示與啟動畫面**：目前是 **Expo 範本的預設圖示**（藍色 A），一定要換。誰來設計？
- [ ] **當機回報**：（建議：Sentry 免費方案）
- [ ] **免費或收費**（Phase 5 就列了）：（建議：1.0 全免費，不做訂閱）

## Phase 1｜基礎建設與設計系統 ✅（程式完成；Supabase 實際連線待你的專案）

目標：專案能在 Expo Go 與網頁預覽跑起來、可以登入、設計系統元件就緒、核心工具函式有測試。

- [x] 用 Expo SDK 58（TypeScript、Expo Router）建立專案，連上 EAS 專案 `godutchapp`
- [x] 只用 Expo Go 內建的原生模組，手機用 Expo Go 就能測（iOS／Android 打包已確認）
- [x] 網頁預覽
  - [x] 開啟 Expo Web（react-native-web），確認能在瀏覽器跑
  - [x] 電腦瀏覽器置中顯示手機寬度外框（390pt）
  - [x] 假資料模式（試用模式）：用設計稿範例資料，不連 Supabase 也能看畫面，資料存在這台裝置
  - [x] 部署指令 `npm run deploy:web`（打包＋`eas deploy`）
  - [ ] 👤 第一次部署並取得網址（需要你的 Expo 帳號）
  - [x] 資料層：網頁與手機共用 `supabase-js`；本機儲存分平台（手機 expo-sqlite、網頁 localStorage）
- [x] 定案並記錄函式庫（見 log.md）
- [x] ESLint、Prettier、TypeScript strict、Jest；`typecheck` / `lint` / `test` / `test:rules` 指令
- [x] 資料夾結構（`src/app`、`src/features/*`、`src/ui/*`、`src/lib/*`、`src/data/*`）；`functions/` 等 Phase 3 才建
- [x] Supabase 資料表、RLS、trigger（`supabase/migrations/`），PGlite 測試 16 項（`npm run test:db`）
- [x] 離線優先同步：本機資料、待上傳佇列（合併／重試／拒絕後修正）、增量下載、Realtime 觸發；單元測試 15 項
- [x] `SupabaseRemote` 的實際 HTTP 請求格式測試 9 項（用假的 fetch 跑 supabase-js）
- [x] 👤 建立 Supabase 專案並套用 migration
- [x] 用真的 Supabase 專案跑端到端測試（2026-10-27，見 log.md）
- [x] 登入：Email（網頁＋手機）、Google 與 Apple（網頁彈出視窗）；登入狀態與登出
- [ ] 手機原生 Apple / Google 登入（需要 Apple Developer 帳號、OAuth client ID）
- [x] 設計系統
  - [x] oklch → sRGB 轉換；依色相產生 accent 色階與背景色組
  - [x] Theme provider（色票 tokens、字體、圓角、陰影）
  - [x] 字體：Caprasimo、Figtree（中文標題退回系統字體）
  - [x] Lucide 圖示（筆畫 2.75）
  - [x] 基本元件：按鈕（主要／sage／外框／ghost／危險）、圖示按鈕、標籤、星號、泡泡列、底部表單、對話框、toast、數字鍵盤
- [x] 多語言：i18next、en-AU 與 zh-TW 字串檔、跟隨系統語言（其他語言用 en-AU）；測試檢查兩種語言的 key 與變數一致
- [x] 核心工具（全部有單元測試）
  - [x] ISO 4217 幣別表（150 種，符號、小數位、英文名、中文名；`npm run gen:currencies` 重新產生）
  - [x] 金額：最小單位 ↔ 顯示字串、千分位、輸入上限
  - [x] 日期格式（zh-TW / en-AU）、今天／昨天／星期、月曆
  - [x] 均分餘數分配
- [x] 資料模型定稿（個人帳本部分），寫回 spec.md §13；分帳的成員鍵在 Phase 3 定
- [x] 平台差異：返回圖示（iOS chevron／Android 箭頭）、安全區域
- [ ] 👤 用 Expo Go 在你的 iPhone／Android 手機上實際跑過

## Phase 2｜個人記帳核心 ✅（網頁驗證完成；手機與 Supabase 實測待你）

目標：只用個人帳本就能完整記帳，兩個平台都能用、離線也能記。

- [x] 首頁 1a：分頁列（星號、共用圖示、名稱、幣別、「＋」）、本月摘要（支出／收入／結餘紅綠）、依日期分組的紀錄泡泡
- [x] 首頁右上選單（01b）：排列分頁、新增帳本、設定可用；其他項目顯示「之後的版本開放」
- [x] 新增帳本（09）：個人帳本、幣別建立後不可改（分帳類型顯示「下一個版本開放」）
- [x] 排列分頁（01c）：星號置頂、拖曳排序（網頁滑鼠拖曳已測）、螢幕閱讀器可用「往上／往下移」；存 `ledgerPrefs`
- [x] 首頁長按分頁 → 打開排列分頁（暫用做法，見「需要你決定的事」）
- [x] 記一筆 · 金額（03）：數字鍵盤、小數位規則、9 位上限、千分位、提示列
- [x] 幣別選單（04）：搜尋（代碼／英文／中文）、常用區、星號
- [x] 類型按鈕與「請先輸入金額」（分帳顯示「下一個版本開放」）
- [x] 帳本路由：0 個（07 對話框→建帳本→回到類別）、1 個（自動）、2 個以上（06，上次使用排第一）、從分頁進入時跳過
- [x] 類別（05）：支出 16、收入 8，存代碼
- [x] 備註與儲存（05b）＋補登日期（05c，含上下月切換、不可選未來）
- [x] 儲存後回到該帳本分頁＋toast
- [x] 編輯／刪除單筆紀錄
- [x] 設定（14）：語言切換、格式說明、常用幣別、帳號（登出）、試用資料重設
- [x] 離線測試（網頁）：斷網記帳立即顯示，恢復連線後上傳（用另一個瀏覽器確認）
- [ ] 離線測試（手機）：飛航模式下記帳，恢復連線後同步
- [ ] 帳本改名／刪除帳本（等「需要你決定的事」）
- [ ] 👤 第一次 TestFlight / Android 內部測試，自己實際用一週

## Phase 3｜好友與分帳同步 ✅（試用模式與網頁驗證完成；Supabase 實測待你建專案）

目標：share house 室友可以一起用同一個分帳帳本，即時同步、結清、結束帳本。

已確認的決定（2026-10-26）：預設均分、可改每人金額；結清建議用最少轉帳次數；邀請連結先用網頁預覽網址＋QR code＋輸入邀請碼；通知先做 App 內提示；虛擬朋友用專屬邀請連結自動合併；有欠款也能離開；計入個人帳本的那筆跟著改；分帳帳本可以「從我的帳本移除」，最後一人移除時才真的刪除。

- [x] 好友頁（10）：邀請連結（分享／複製）、QR code、輸入邀請碼、常用好友星號、虛擬朋友（虛線頭像、專屬邀請）
- [x] 邀請連結落地頁 `/invite/<代碼>`：已登入直接接受；未登入先記住，登入後自動接受
- [ ] 邀請連結改成自有網域的 Universal Links / App Links，點了直接開 App（需要網域與 development build）
- [x] 伺服器端 function：接受邀請（雙方成為好友）、虛擬朋友合併（所有帳本裡的成員自動換成新帳號）
- [x] 新增分帳帳本（09 分帳模式）：成員（常用好友在前、可現場新增虛擬朋友）、計入個人帳本方式
- [x] 帳本設定：改名、成員列表與新增成員、自己分到的部分、結束／重新開啟、刪除（個人）／從我的帳本移除（分帳）
- [x] 首頁分帳分頁（02）：結餘卡（最少轉帳次數、其他成員之間）、成員頭像、付款人與我的部分、「X 修改過」與「新」標籤、分頁上的新紀錄小點
- [x] 分帳流程（08）：帳本自動選／選擇、成員、付款人／收款人、均分＋餘數說明、自訂每人金額、類別、備註、補登日期
- [x] 結餘計算（成員淨額＋最少轉帳次數）＋單元測試
- [x] 分帳紀錄編輯（付款人、分配）／刪除＋伺服器端修改歷史
- [x] 每筆計入個人帳本（伺服器 trigger；分帳紀錄改了或刪了，個人那筆跟著改；個人帳本裡顯示「來自『日本旅行』」且不能直接改）
- [x] 結清（11）：選對象、方向、數字鍵盤、結清全額、上限、部分還款、代記
- [x] 結束帳本（12）：計算自己分到的部分、加入個人帳本、唯讀、移到最後、重新開啟
- [x] 權限（RLS）：只有帳本成員能讀寫；已結束帳本唯讀；分配加總必須等於金額；PGlite 測試 21 項
- [x] 用真的 Supabase 專案、三個帳號實測：好友、分帳、即時同步、結清、計入個人帳本、虛擬朋友合併、隱私（19 項通過，2026-10-27）
- [ ] 推播（分帳新增／修改、代記還款）：移到 Phase 5，和 development build 一起做
- [ ] 👤 找一兩個 share house 的室友實際試用

## Phase 4｜定期扣款、銀行對帳、每月檢查

目標：「錢不會不知不覺不見」：訂閱、Afterpay、定期分帳自動記入；銀行餘額抓出沒記到的錢。

- [x] 定期扣款列表（16）：摘要卡（月合計公式）、三個區段、Afterpay 進度點
- [x] 新增／編輯定期扣款（17）：一般（常見訂閱快速帶入）、Afterpay（4 期、每 14 天、餘數加第 1 期，可改期數）、定期分帳；可刪除
- [x] 排程：伺服器 function `record_due_recurring`，pg_cron 每小時跑＋App 同步時也跑；扣款當天自動建立紀錄（標「自動記入」）、Afterpay 最後一期後停止；前一天提醒用手機本機通知
- [x] 扣款通知（18）含動作按鈕「修改金額」「刪除」（手機本機通知，Expo Go 可用）；扣款修改表單（19）
- [ ] 定期分帳記入時通知其他成員：要遠端推播，跟 Phase 5 推播一起做
- [x] 銀行餘額（20）：帳戶卡片、逾期狀態、提醒頻率；新增／編輯／刪除帳戶（設計稿沒畫，照現有風格做）
- [x] 更新餘額（21）→ 對帳結果（22）：差額公式（含收入抵銷）、補記一筆、這次略過
- [x] 銀行提醒（本機通知，到期當天早上 10 點）
- [x] 每月檢查（23）：本月 vs 上月、各類別長條與差額、固定支出卡、對帳差額卡；多個個人帳本可切換
- [x] 首頁選單副標（每月約 $X、N 個需要更新、9 月已完成）
- [x] 所有計算公式的單元測試（定期扣款、分期、月合計、對帳、每月比較、提醒排程）
- [x] 用你的 Supabase 專案跑定期扣款、銀行對帳的端到端測試（2026-10-27 通過）
- [ ] 在手機（Expo Go）確認通知：前一天提醒、今天已扣款（含「修改金額」「刪除」按鈕）、銀行提醒

## Phase 5｜桌面小工具、外觀個人化與上架

> 2026-10-28：小工具、推播、當機回報等原生功能，等正式接上 iOS／Android 再做；先跳過，往下做 Phase 6。

目標：桌面一點就記帳、可以個人化外觀，送審上架。

- [x] 外觀（15）：背景色 5 種、選項色 5 種、色票雙圈選取樣式；選了馬上套用全 App
- [x] 首頁照片：選照片 → 預覽 → 使用這張照片／取消；上傳 Supabase Storage（私人 bucket，用短期網址顯示）；洗白＋遮罩；網頁版先縮到 1080px
- [x] 透明度：不透明／半透明（背景模糊）／全透明，套用在紀錄泡泡與分帳結餘卡
  - 注意：Android 的半透明沒有模糊效果（只有 70% 透明），iOS 與網頁有；照片的「洗白」濾鏡在 iOS 只有亮度生效
- [ ] iOS 小工具（WidgetKit）：小尺寸、中尺寸、鎖定畫面、控制中心按鈕；App Group 共用本月支出
- [ ] Android 小工具（Jetpack Glance）：小尺寸、中尺寸、快速設定磚塊
- [x] 深層連結：`godutch://add?type=expense|income|split`（網頁 `/add?type=…`）開到金額畫面並標示類型；設定 → 桌面小工具有預覽畫面可以試
- [ ] 推播（從 Phase 3 移過來）：Expo Push 權杖、分帳新增／修改／代記還款通知；需要 development build 與 Apple Developer 帳號
- [ ] 小工具多語言
- [x] 刪除帳號（App Store 規定）：設定 → 帳號 → 刪除帳號；伺服器 function `delete_my_account`
  - [x] 用真的 Supabase 測過（2026-10-27）
  - 已處理：刪除前先把他在分帳帳本的成員改成沒有帳號的同名成員，所以不會再碰到「付款人指向他」的錯誤
- [ ] 當機回報、基本使用分析（等上面「原生功能」的決定；建議 Sentry）
- [ ] 效能與無障礙檢查（點擊範圍 44px、動態字級、螢幕閱讀器標籤）
  - [x] 選取／勾選／展開狀態改用 `aria-*`，iOS、Android、網頁的螢幕閱讀器都讀得到
  - [ ] 實機用 VoiceOver／TalkBack 走一次、最大字級檢查版面
- [ ] 👤 隱私權政策網頁、App Store 隱私標籤、Google Play 資料安全表單
- [ ] 👤 商店截圖、說明文字（zh-TW、en-AU）、圖示
- [ ] 👤 送審 App Store 與 Google Play

---

## Phase 6｜日本旅行：匯率換算、日本旅遊類別、免登入分享頁（2026-10-28 新增，進行中）

目標：台灣人去日本時，同一個旅行帳本可以記日圓和台幣、以台幣結算；預設就是日本旅遊類別；旅伴不用註冊就能看結餘。規格見 spec.md §6A、§5.5、§6B、§13.6。2026-10-28 開發者說往下做 Phase 6（Phase 5 的原生功能先留著）。

匯率換算（§6A）
- [x] 純函式＋單元測試：匯率字串解析與 BigInt 換算（到 ISO 最小單位）、half-up、實用小數位（TWD = 0，只用在輸入與顯示）、最大餘數分配 `shares_settle`（同餘數依成員順序）、分帳與結清的取整（建立者捨去、其他人進位）、從實際金額反推匯率、建議值 4 位有效數字
- [x] migration：`ledgers.entry_currency`、`rates`（帳本匯率）；`entries.currency`、`fx_rate`、`fx_source`（ledger / manual / same / split）、`amount_settle_minor`、`shares_settle`；舊資料補值；漏填換算欄位時伺服器補同幣別；`profiles.last_ledger_id`；`ledger_prefs.share_target_ledger_id`
- [x] `guard_entry_write`（漏填補同幣別、`split` 不檢查）、`sync_personal_copies`／`personal_ledger_for`（計入的那筆 `fx_source = split`）；手機上的結餘計算（`balances.ts`）改用換算後金額；RLS 與 PGlite 測試
- [x] `fx_rates` 資料表＋每天抓市場中間價的 Edge Function（`fetch-fx-rates`）；`mid_rate`（伺服器只給中間價，× 1.015 在手機算）；改帳本匯率改在手機上做（`setLedgerRate`，含全部重算，見 spec §13.6）
  - [ ] 👤 部署 Edge Function、設定每天的 Cron（見最上面「現在要你做的事」）
- [x] 帳本設定 · 匯率頁（26b）：各外幣的帳本匯率、新增幣別、修改時「之後新增／全部重算」
  - [x] 分帳帳本有人改匯率時，其他成員下次打開這個帳本看到「Amy 把日圓匯率改成 0.211」的提示，分頁上有小點（伺服器記錄誰改的，`ledgers.rate_changes`）
- [x] 換算資訊圖示 ⓘ 與匯率表單（24：匯率、來源、算式、輸入實際金額、修改單筆匯率、恢復帳本匯率、修改帳本匯率）、金額畫面換算列、類別畫面與備註表單、編輯紀錄、泡泡雙幣別、分帳畫面每人雙幣別
- [x] 帳本路由改版（不再依幣別，§5.4；上次使用改用 `lastLedgerId`）、新增帳本選結算幣別／常用記帳幣別／帳本匯率（預填建議值、來源標示）／類別組
- [x] 帳本第一次用新外幣時請使用者填匯率（有網路時預填建議值；儲存時沒有匯率也會先問）
- [x] 台幣輸入鍵盤不顯示小數點、顯示到元；分帳顯示取整、結清取整、不到 1 元的差額算已結清
- [x] 每月檢查、銀行對帳、小工具本月支出改用換算後金額
- [x] 第一次使用預設常用幣別 TWD、JPY（新帳號；舊帳號保留自己的設定）
- [x] 帳本設定「計入哪個個人帳本」（同結算幣別有 2 個以上時出現）；結束帳本的「加到個人帳本」也照這個順序選

日本旅遊類別（§5.5）
- [x] `categories.ts`：新增 9 個支出代碼、1 個收入代碼；類別組定義（`categoryGrid`：帳本的組＋用過的其他組類別＋「更多類別」）
- [x] i18n：新類別的 zh-TW 與 en-AU 名稱；`coffee` 改名
  - 類別畫面已接上帳本的類別組；`taxfree_refund` 改名「免稅退稅」（4 欄格子不換行）
- [x] `ledgers.category_set`（migration＋同步）
- [x] 新增帳本與帳本設定可選類別組
- [x] 類別畫面依帳本類別組顯示＋「更多類別」，用過的留在格子最後面（分帳、編輯畫面的橫向類別列也有「更多類別」）

免登入分享頁（§6B）
- [x] migration `20261101000000_rate_notices_share_links.sql`：`ledger_share_links`、`ledger_members.claimed_via_share`／`share_joined_at`、`ledger_join_requests`；function `create_share_link`、`revoke_share_link`、`get_shared_ledger`、`request_join`、`answer_join_request`；匿名權限測試（拿不到帳號資料與其他帳本）
- [x] 分帳分頁「分享」表單（28）：複製、分享、QR code、停用、重新產生（試用模式顯示要登入）
- [x] 網頁路由 `/s/[token]`（29，不經過登入檢查與試用模式）：結餘、紀錄、「我是誰？」、只看跟我有關的、重新整理、`noindex`＋`robots.txt`
- [x] 加入帳本流程：送出申請（認領沒有帳號的成員／我不在名單上；沒登入時先登入，登入後自動送出）→ 建立者在帳本設定「加入申請」同意或拒絕（分帳分頁有提示、分頁有小點）；已有帳號的成員直接登入；同意後其他成員看到「從分享連結加入」提示
- [x] 失效連結頁面
- [ ] 👤 手機上分享連結要有網站網址：`.env.local` 與 GitHub Variable 的 `EXPO_PUBLIC_WEB_URL`（見最上面「現在要你做的事」）。網頁版不用設定

收尾
- [ ] typecheck、lint、`npm test`、`npm run test:db`；網頁預覽檢查
- [ ] 👤 用年底大阪行程實測（日圓＋台幣混記、和旅伴用分享頁）
- [ ] 部署網頁預覽（部署前先問開發者）

## Phase 7｜上架準備（2026-10-28 規劃，尚未開始）

目標：iOS 與 Android 正式上架。開發者決定「先把程式寫完，再申請開發者帳號」，所以分成 **7A（不需要帳號，現在就能做）** 與 **7B（帳號申請後）**。React Native 的畫面與商業邏輯不用改；要改的是 App 身分設定、正式環境（後端、網域）、登入、原生功能、法律頁面與商店資料。詳細分析見 log.md 2026-10-28「Phase 7 規劃」。

> ⚠️ 例外：**Google Play 的個人新帳號**，正式上架前必須先找 **12 位測試者連續測試 14 天**。所以 Google Play 帳號建議 7A 做到一半就申請，讓 14 天和寫程式同時進行。

### 7A｜不需要開發者帳號（程式與設定）

App 身分與打包設定
- [ ] 換掉 Bundle ID（等你決定）；版本改 `1.0.0`；英文名稱定案
- [ ] App 圖示、Android 自適應圖示（前景／背景／單色）、啟動畫面、通知小圖示（等設計）
- [ ] `app.config.ts`：
  - iOS `ITSAppUsesNonExemptEncryption: false`（只用 HTTPS，不必每次送審填加密問卷）
  - iOS 隱私清單 `privacyManifests`（AsyncStorage／SQLite 用到的 UserDefaults、檔案時間戳記等「需要說明原因的 API」）
  - Android 封鎖用不到的權限（相簿讀取改用系統選照片，不要 `READ_MEDIA_IMAGES`，避免 Google Play 照片權限審查）
- [ ] `eas.json` 三種打包：`development`（開發版 App）、`preview`（內部測試）、`production`（上架），各自的環境變數（Supabase 網址、網站網址、Sentry）
- [ ] 打包保護：`production` 沒有 Supabase 設定就**打包失敗**，不能像現在自動進試用模式
- [ ] 改用 **development build**（不再用 Expo Go）：claude-rule.md「Phase 1–4 要維持 Expo Go 能跑」改寫
- [ ] **OTA 更新**（`expo-updates`／EAS Update）：上架後小修正不用重新送審；設定 `runtimeVersion`、`preview`／`production` 頻道

登入與帳號
- [ ] **忘記密碼**（目前沒有）：寄重設信 → 點信中連結開 App（或網頁）設定新密碼
- [ ] 註冊確認信的連結要能回到 App（深層連結）；正式環境要開「確認 Email」
- [ ] **手機原生 Apple 登入**（`expo-apple-authentication`）與 **Google 登入**（目前手機上會顯示「之後的版本開放」）；程式可以先寫，實測要等帳號
- [ ] 登入頁的「試用模式」依你的決定保留或拿掉

原生功能（Phase 5 留下來的）
- [ ] **推播**：
  - 手機註冊 Expo Push 權杖，存到新資料表 `push_tokens`（RLS）
  - 伺服器在分帳紀錄新增／修改／代記還款、加入申請、匯率被改時送通知（Edge Function，或資料庫 trigger 排進佇列）
  - 設定頁可以關閉各類通知
- [ ] **當機回報**（Sentry）：手機與網頁；不送帳本金額與備註
- [ ] 小工具（建議放 1.1）：iOS WidgetKit、Android Glance；App Group 共用本月支出
- [ ] **點連結直接開 App**（Universal Links／App Links）：`/s/…` 分享頁、`/invite/…` 邀請。需要自己的網域，網站放 `apple-app-site-association` 與 `assetlinks.json`（iOS 的檔案要 Apple Team ID，帳號申請後才填）

測試期間暫用、正式版要整理的
- [ ] 設定 → 桌面小工具：目前是**預覽畫面**（假的小工具），正式版改成「如何加入小工具」說明，或在小工具做好前隱藏
- [ ] 試用模式的範例資料是**澳洲生活**（澳幣、Opal、房租）：改成台灣人去日本的情境（也可以直接拿來拍商店截圖）
- [ ] 程式裡找不到幣別時的預設值 `AUD`（約 10 處）改成 `TWD`
- [ ] 試用模式的範例匯率（`src/data/demo/rates.ts`）只在試用模式出現，維持標示「範例匯率」即可
- [ ] 網頁版的手機外框（`WebFrame`）只在電腦瀏覽器出現，手機版不受影響，保留
- [ ] `docs/design-handoff/` 重複的 PDF、`.claude/settings.json`（之前列過）

網站（同一個 Expo 網頁版）
- [ ] 隱私權政策 `/privacy`、使用條款 `/terms`（zh-TW、en-AU）
- [ ] **刪除帳號說明頁** `/delete-account`（Google Play 規定要有網頁版的刪除方式或說明）
- [ ] 客服聯絡方式（Email）
- [ ] 網頁版定位：正式網站 = 分享頁＋法律頁＋（可選）網頁版 App

品質
- [ ] 實機：VoiceOver／TalkBack、最大字級、離線（飛航模式）記帳後同步、大量紀錄（一年份）的速度
- [ ] 錯誤畫面：整個 App 當掉時顯示「重新開啟」而不是白畫面（Error Boundary）
- [ ] 確認所有 `console.warn` 不會記錄金額、備註等個人資料

後端（正式環境）
- [ ] 正式 Supabase 專案（區域、方案等你決定）
- [ ] migration 改用 **Supabase CLI**（`supabase db push`）套用，資料庫會記錄套過哪些；不再手動貼到 SQL Editor
- [ ] Edge Function（`fetch-fx-rates`、推播）用 CLI 部署；Cron：每小時定期扣款、每天匯率
- [ ] Email：開「確認 Email」、自訂寄信服務（SMTP，例如 Resend；Supabase 內建的每小時只能寄幾封，只適合開發）、中英文信件範本
- [ ] Auth 網址設定：Site URL 改成正式網域，Redirect URLs 加 App 的深層連結
- [ ] 安全：跑 Supabase 的 Security Advisor／Performance Advisor；Pro 方案開「洩漏密碼檢查」；考慮登入頁加 CAPTCHA
- [ ] 備份與監控：每日備份（Pro）、錯誤通知
- [ ] 開發用專案的測試帳號 `gd-test-*`：正式專案是新的就不用刪；留在開發專案

CI
- [ ] GitHub Actions 加：`main` 上跑 EAS Build（preview）、打 tag 時 production build＋送審（EAS Submit）
- [ ] migration 自動套用到開發專案（需要 Supabase access token 當 Secret）

### 7B｜開發者帳號申請後

帳號（申請順序建議：Google Play 先、Apple 後）
- [ ] 👤 Google Play Console（US$25 一次）：申請後**先開封閉測試**，找 12 位測試者測 14 天
- [ ] 👤 Apple Developer Program（US$99／年）
- [ ] 👤 Expo：EAS 免費方案每月打包次數有限、要排隊；上架前後可能需要 Starter 方案

打包與測試
- [ ] Android：EAS Build → 內部測試 → 封閉測試（14 天）→ 正式版
- [ ] iOS：EAS Build → TestFlight（自己＋朋友）→ 送審
- [ ] Apple／Google 登入的正式設定（Apple Service ID 與金鑰、Google OAuth client ID：iOS、Android、網頁各一個），填到 Supabase
- [ ] 推播憑證：iOS APNs 金鑰、Android FCM（`google-services.json`）
- [ ] Universal Links 的 Team ID、Android 簽章指紋寫進網站
- [ ] 實機跑完整流程：註冊、記帳、分帳（兩支手機）、分享頁、加入申請、推播、刪除帳號

商店資料
- [ ] 截圖：iPhone 6.9 吋（必要）、Android 手機；zh-TW 與 en-AU 各一套
- [ ] 名稱、副標題、說明、關鍵字、類別（財經）、支援網址、隱私權政策網址
- [ ] App Store 隱私標籤：會收集 Email、使用者內容（帳本、備註、照片）、識別碼（帳號 id）；不追蹤、不廣告
- [ ] Google Play 資料安全表單、內容分級問卷、**金融功能聲明**（選「不提供金融服務」）、目標年齡
- [ ] 審核備註：測試帳號與密碼（App 要登入才能用完整功能）、分享頁與分帳要兩個帳號怎麼測
- [ ] 👤 送審、上架

## 第二階段（MVP 之後，先記著）

- [x] 旅行帳本混用幣別＋匯率換算（優先）→ 移到 Phase 6（2026-10-28）
- [ ] 支出圖表、預算提醒、提醒朋友還錢、收據照片、CSV 匯出
- [ ] 分帳依比例分（如果 MVP 沒做）
- [ ] 最少轉帳次數結清建議（如果 MVP 沒做）
- [ ] 台灣常見類別（回台後繼續用）
