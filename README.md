# Go Dutch（記帳分帳 App）

先輸入金額、再決定去哪裡的記帳 App：個人記帳和朋友分帳放在同一個地方。iOS、Android，以及網頁預覽。

- 規格：[spec.md](spec.md)
- 待辦與五個階段：[todo.md](todo.md)
- 開發紀錄：[log.md](log.md)
- 開發規則（給 Claude）：[claude-rule.md](claude-rule.md)
- 設計原稿（只讀）：[docs/design-handoff/](docs/design-handoff/)

## 技術

React Native（Expo SDK 58、TypeScript、Expo Router）＋ Supabase（Auth、PostgreSQL、Realtime）。

資料「離線優先」：畫面讀寫的是手機上的資料（iOS／Android 用 expo-sqlite，網頁用 localStorage），
變更先排進待上傳佇列，有網路時再自動和 Supabase 同步。所以沒網路也能記帳。

## 快速開始

需要 Node.js 20 以上。

```bash
npm install
npm run web          # 瀏覽器
npx expo start       # 手機：用 Expo Go 掃終端機上的 QR code
```

沒有填 Supabase 設定時，App 會自動進入「試用模式」，範例資料只存在這台裝置。

### 用 Expo Go 在手機上測

1. 手機安裝 **Expo Go**（App Store／Google Play）。
2. 電腦跑 `npx expo start`。
3. iPhone 用相機、Android 用 Expo Go 掃 QR code。手機和電腦要在同一個 Wi‑Fi；不同網路就用 `npx expo start --tunnel`。

## 常用指令

| 指令 | 說明 |
| --- | --- |
| `npm run web` | 網頁開發伺服器 |
| `npx expo start` | 手機開發伺服器（Expo Go 掃 QR code） |
| `npm run typecheck` | TypeScript 檢查 |
| `npm run lint` | ESLint |
| `npm test` | 單元測試（金額、日期、帳本路由、離線同步、Supabase 請求格式、翻譯完整性…） |
| `npm run test:db` | 資料庫權限（RLS）與 trigger 測試，用 PGlite 跑真的 PostgreSQL，不需要 Docker |
| `npm run export:web` | 打包網頁版到 `dist/` |
| `npm run deploy:web` | 打包並部署到 EAS Hosting（預覽網址） |
| `npm run deploy:web:prod` | 打包並部署到固定的正式網址 `https://<子網域>.expo.app` |
| `npm run gen:currencies` | 從 ISO 4217 官方清單重新產生幣別表 |

## 設定 Supabase

1. 到 [supabase.com](https://supabase.com) 建立專案。使用者在澳洲，區域選 **Sydney（ap-southeast-2）**。
2. 建立資料表：Dashboard → **SQL Editor**，**依檔名順序**各貼一次、各按一次 Run：
   1. `supabase/migrations/20261026000000_init.sql`（個人帳本）
   2. `supabase/migrations/20261027000000_shared_ledgers.sql`（好友、邀請、分帳帳本）
   3. `supabase/migrations/20261028000000_recurring_banks.sql`（定期扣款、銀行帳戶；有提示時到 Integrations → Cron 開啟排程）
   4. `supabase/migrations/20261029000000_appearance_account.sql`（外觀設定、首頁照片、刪除帳號）
3. 專案首頁上方的 **Connect**（或 **Project Settings → API Keys**）：把 Project URL 和 publishable key（`sb_publishable_…`）填進 `.env.local`（照 `.env.example`）。
4. Dashboard → **Authentication → Sign In / Providers → Email**：開發期間可以先關掉「Confirm email」，註冊後就能直接登入。
5. 之後要用 Google／Apple 登入時：在 Providers 開啟並填 OAuth 資料；在 **Authentication → URL Configuration** 加入
   `http://localhost:8081` 和網頁預覽網址（`https://*.expo.app`）。

## 部署網頁預覽（EAS Hosting）

`app.config.ts` 已經連到 EAS 專案 `godutchapp`。

```bash
npx eas-cli@latest login
npm run deploy:web        # 預覽網址：https://<子網域>--<部署id>.expo.app（每次部署都不同）
npm run deploy:web:prod   # 正式網址：https://<子網域>.expo.app（固定不變，指向最新一次 --prod 部署）
```

子網域在第一次部署時選，全球唯一、選了就不能再拿回舊名稱。

打包時會讀取 `.env.local` 的 Supabase 設定。

### 自動部署（GitHub Actions）

`.github/workflows/deploy.yml`：每次 push 到 `main`，GitHub 會先跑型別檢查、lint、單元測試、資料庫測試，**全部通過才部署**到正式網址。也可以在 GitHub → Actions → Deploy web → **Run workflow** 手動觸發。

一次性設定（GitHub repo → **Settings → Secrets and variables → Actions**）：

| 類型 | 名稱 | 值 |
| --- | --- | --- |
| Secret | `EXPO_TOKEN` | expo.dev → 右上頭像 → **Account settings → Access tokens** → Create token |
| Variable | `EXPO_PUBLIC_SUPABASE_URL` | 選填。不填的話網站是試用模式 |
| Variable | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 選填。publishable key 本來就是公開的，放 Variable 即可 |
| Variable | `EAS_DEV_DOMAIN` | 選填。只有「還沒部署過」時用來指定子網域，例如 `godutch` |
| Variable | `EXPO_PUBLIC_WEB_URL` | 選填。網站網址，例如 `https://godutch.expo.app`；手機分享的邀請連結會用它 |

## 資料夾結構

```
src/
  app/          Expo Router 路由（每個檔案是一個畫面，只做轉出）
  features/     各功能的畫面與邏輯：home、entry、ledgers、friends、shared、settings、auth
  data/
    local/      手機上的資料（LocalStore）、待上傳佇列（ops）、LocalRepo
    sync/       同步引擎（上傳佇列、下載變更、重試）
    supabase/   Supabase 連線與資料表對應（SupabaseRemote）
    auth/       登入
    demo/       試用模式的範例資料
  lib/          純函式（金額、日期、均分、帳本路由、顏色、幣別表），都有單元測試
  ui/           共用元件與設計系統（色票、字體、按鈕、表單、鍵盤…）
  i18n/         en-AU、zh-TW 字串
supabase/
  migrations/   資料表、權限（RLS）、trigger
  tests/        權限測試（PGlite）
scripts/        產生幣別表的腳本
docs/design-handoff/   設計原稿（只讀）
```
