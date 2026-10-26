# Handoff: Ledger & Split App (記帳分帳 App) — MVP screens

## Overview
A mobile expense tracker for iOS and Android built around "enter the amount first, decide where it goes after". Users keep multiple **ledgers** (each fixed to one currency). Personal ledgers hold personal expenses and income; shared ledgers are split with friends and sync live to every member. The home screen works like spreadsheet sheet-tabs: one tab per ledger, and a large "Add entry" button at the bottom.

The full product spec (zh-TW) is in `spec/product-spec-zh-TW.pdf`. The feature and audience brief is in `spec/features-and-audience-zh-TW.pdf`: primary audience is Taiwanese people living in Australia, starting with share-house flatmates. It covers business rules, the data model and the recommended stack (Flutter + Firebase, native widgets via WidgetKit / Jetpack Glance). **This README covers the UI and also records decisions made during design that change or extend that spec.** Where the two disagree, this README wins.

## About the design files
The files in `design/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Recreate them in the target environment. The spec recommends Flutter with `flutter_localizations` and ARB files. If the codebase already uses another stack, follow its patterns.

- `design/Ledger App Design.dc.html` is a pan/zoom canvas showing every screen. It contains three home-screen directions (1a, 1b, 1c), then the full screen set in English (iOS), Traditional Chinese (zh-TW, iOS) and English (Android).
- `design/Ledger App Prototype.dc.html` is a single clickable phone with working flows.
- `design/Phone.dc.html` is the source of truth for every screen. Its logic class at the bottom of the file holds all copy (EN + zh-TW), sample data and behaviour.

Open these files in a browser served from the `design/` folder; they need `support.js` next to them.

## Fidelity
**High fidelity.** Use these colours, type, radii, spacing, copy and flows. The phone canvas is 390×844 pt (shown inside a 10 px bezel).

**Chosen home direction: 1a, "sheet tabs".** These are folder-style tabs across the top. Directions 1b and 1c only exist for comparison.

---

## Design tokens (Organic design system)
These come from `design/_ds/organic-…/styles.css`. Theme overrides are described in the next section.

**Base colours** (default theme)
- `bg` #f5ead8. At runtime this is overridden by the user's background choice (default "Cream", see below).
- `surface` #ebddc5
- `text` #201e1d
- `divider`: text at 16% alpha
- `accent-2` (sage) #7a8a5e
  - ramp: 100 #f0fae1 · 200 #e1eecc · 300 #ccdbb2 · 600 #728157 · 700 #56633f · 800 #3d472b · 900 #272e1b
- Neutral ramp: 100 #f9f4ed · 200 #eee7db · 300 #dcd3c4 · 400 #c0b6a5 · 500 #a19786 · 600 #82796a · 700 #645c50 · 800 #474238 · 900 #2e2b25
- **Negative balance red:** `oklch(0.52 0.17 27)`. Positive or zero balances use accent-2-700.

**Type**
- Headings and numbers: **Caprasimo** 400 (Google Fonts)
- Body: **Figtree** 400/600/700
- Caprasimo has no CJK glyphs, so zh-TW headings fall back to the system font (PingFang TC / Noto Sans TC).

| Use | Font | Size |
| --- | --- | --- |
| Screen title | Caprasimo | 20 |
| Home title "My ledgers" | Caprasimo | 26 |
| Big amount on the amount screen | Caprasimo | 72 (currency symbol 40, neutral-600) |
| Category / split amount | Caprasimo | 42–44 |
| Summary "Spent" | Caprasimo | 26 |
| Row title | Figtree 600 | 15 |
| Row subtitle | Figtree | 12.5, neutral-700 |
| Section labels | Figtree 700 | 12, uppercase, tracking .08em |
| Keypad digits | Caprasimo | 28 (settle keypad 26) |

All amounts use `font-variant-numeric: tabular-nums`.

**Radius:** pills 999 for buttons, chips, inputs, tabs and entry bubbles. Cards 28. Sheets 34 on the top corners. Folder tabs 18 18 0 0.

**Shadows**
- sm `0 1px 2px #2e2b25/14%`
- md `0 3px 10px /16%`
- lg `0 12px 32px /22%`

**Icons:** Lucide, rendered heavy (the system specifies stroke 2.75). Sizes: 19–20 in 44 px icon buttons, 26 in category circles.

**Hit targets:** at least 44 px everywhere.
- Primary bottom buttons are 58–60 px high, full width minus 16 px side padding.
- Icon buttons are 44 px circles on `surface`.

## Personalisation (Settings → Appearance)
The user picks a background colour and an accent colour separately, can add a home photo, and can set bubble transparency.

**Background colour** (`bg`, `surface` and neutral 200/300 are derived from one hue)
- `bg` = oklch(0.945 0.03 H)
- `surface` = oklch(0.9 0.038 H)
- neutral-200 = oklch(0.93 0.018 H)
- neutral-300 = oklch(0.86 0.022 H)

| Option | zh-TW | Hue H |
| --- | --- | --- |
| Cream (**default**) | 奶油 | 85 |
| Butter | 奶黃 | 100 |
| Blush | 粉霧 | 35 |
| Mint | 薄荷 | 150 |
| Sky | 天空 | 235 |

**Accent colour** (buttons and highlights, the full accent ramp is regenerated)
- `accent` = oklch(0.66 0.15 H)
- ramp 100→900 lightness: .97 .93 .87 .79 .71 .62 .52 .42 .31
- ramp 100→900 chroma: .02 .045 .08 .12 .15 .14 .12 .09 .06

| Option | zh-TW | Hue H |
| --- | --- | --- |
| **Marigold (default, orange-yellow)** | 金盞橘 | 68 |
| Terracotta | 赤陶 | 42 |
| Rose | 玫瑰 | 12 |
| Plum | 梅紫 | 330 |
| Sea | 海藍 | 230 |

**Home background photo**
- "Choose photo" opens the system picker and shows a *preview* in the settings card.
- The user must tap **"Use this photo"** to apply it, or Cancel to discard.
- On home, the photo is full-bleed behind everything with a "washed" treatment (saturate .6, contrast .85, brightness 1.1), plus a `bg` scrim.
  - The scrim is 62% when bubbles are solid.
  - Otherwise it is `max(30%, transparency × 0.62)`.

**Transparency**: three options, always available (with or without a photo). It applies to entry bubbles and the shared-balance card.

| Option | zh-TW | Fill | Blur | Shadow |
| --- | --- | --- | --- | --- |
| Solid (default) | 不透明 | neutral-100 | none | sm |
| Semi | 半透明 | neutral-100 @ 70% | 12 px backdrop blur | sm |
| Clear | 全透明 | none | none | none |

Every bubble has a 1.5 px white @ 60% border in all three modes.

Persist these per user (`users` doc): `bgTheme`, `accentTheme`, `bubbleOpacity`, `homePhotoUrl`.

---

## Screens
Copy is shown as EN / zh-TW. All strings live in `Phone.dc.html` inside the `L:{…}` object and `T('en','zh')` calls. The en-AU locale uses Australian spelling (colour, categorise).

### 01 Home — personal ledger
- **Header** (padding 6 16 12 22)
  - Left: "October 2026 / 2026 年 10 月" (13, neutral-700), then "My ledgers / 我的帳本" (Caprasimo 26).
  - Right: **one** 44 px menu button (Lucide `menu`) on `surface`. It opens a dropdown (screen 01b).
- **Tab row** (horizontal scroll, gap 4, side padding 12)
  - Folder tabs, height 46, radius 18 18 0 0, padding 0 14.
  - Active tab = `surface`; inactive = surface @ 45%.
  - Tab content: ★ (accent, if starred) · users icon (sage-700, if shared) · name (Figtree 600 14) · currency code (11/700, 65% opacity).
  - The last tab is "+" (new ledger).
  - Order: starred first, then the user's manual drag order. Ended ledgers go last and are muted.
- **Summary** (3 columns 1.3fr/1fr/1fr, padding 20 20 8)
  - Spent (Caprasimo 26).
  - Income (16/700, sage-700).
  - Balance (16/700): **red if negative, green otherwise**.
- **Entry list**
  - Entries are grouped by day.
  - Group header (12/600, neutral-700): day label on the left, the day's spent total on the right.
    - Day labels: "Today / 今天", "Yesterday / 昨天", otherwise "Thu 22/10/2026" (en-AU) or "2026/10/22（四）" (zh-TW).
  - **Each entry is a pill "bubble":**
    - radius 999, min-height 58, padding 8 18 8 8, 8 px gap between bubbles.
    - Fill, border and shadow follow the transparency setting.
    - Left: 42 px category circle. Expenses use accent-200 fill with accent-800 icon; income uses sage-200 fill with sage-800 icon.
    - Title (15/600) = the note, or the category name if there is no note.
    - Subtitle = the category name, shown only when a note exists, so the category never appears twice.
    - Amount on the right (15/700). Income is "+$4,200.00" in sage-700.
- There is **no outer panel**: bubbles float directly on the background or photo.
- **Add entry / 記一筆**
  - Fixed at the bottom; 60 px pill, accent fill, `bg` text, Caprasimo 21, plus icon.
  - Hover/pressed states use accent-600/700.

### 01b Home menu (dropdown over 01)
- 272 px wide, top 108 / right 14, radius 28, `bg` fill, shadow lg, scrim behind.
- Rows 52 high, icon in accent-700, label 15/600, optional sub-line 12:
  1. Recurring payments / 定期扣款: sub "About $1,101 a month"
  2. Bank balances / 銀行餘額: sub "1 due for an update" in accent-700 when an account is overdue
  3. Monthly check / 每月檢查: sub "September is ready"
  4. Arrange tabs / 排列分頁
  5. New ledger / 新增帳本
  6. Friends / 好友
  7. Settings / 設定

### 01c Arrange tabs
- Two sections: "Pinned · always first / 置頂 · 永遠排最前面" and "Other ledgers / 其他帳本". Ended ledgers aren't listed.
- Each row is a 60 px pill bubble: grip handle, shared icon, name, currency code, 44 px star toggle.
- Drag a row to reorder. While dragging, the row lifts (`bg` fill, shadow lg, rotate −1.5°, scale 1.02).
- Long-press a tab on home also starts a drag. Adding entries never changes the order.
- Persist as `ledger_prefs.order` + `ledger_prefs.starred`.

### 02 Home — shared ledger
The same frame as 01, with a different top block and list.
- **Balance card** (radius 28, bubble styling)
  - Kicker "BALANCE / 結餘" in accent-700, with stacked member avatars on the right (30 px, overlap −6).
  - One row per open balance: "You owe Amy / 你欠 Amy" plus "¥2,500" in Caprasimo 28.
    - What you owe is shown in accent-700; what others owe you is shown in sage-700.
- **Buttons**
  - **Settle up / 結清**: sage fill.
  - **End ledger / 結束帳本**: outline.
- **List rows**
  - Subtitle: "Amy paid · your share ¥1,600 / Amy付款 · 你分到 ¥1,600".
  - An entry edited by another member gets a small accent-100 tag: "Edited by Ben / Ben 修改過".
- **Ended ledger**: read-only. The card shows "Ended · read-only / 已結束 · 唯讀" and a **Reopen / 重新開啟** button instead of the actions.

### 03 Add entry — amount
- The top bar has a close button (X) and the title "New entry / 記一筆".
- **Currency pill**: 44 px, `surface`, code + chevron. Next to it is the currency name ("Australian Dollar / 澳幣").
- **Amount**: symbol (40, neutral-600) + value (Caprasimo 72) + a 3×58 accent caret.
- **Hint line** (13):
  - "From your Living tab / 從「生活」分頁開始" when started from a personal tab.
  - "No NZD ledger yet. Change the currency, or pick a type to create one." when that currency has no personal ledger.
- **Type buttons**: 3 columns, 72 high, radius 24. Expense, Income and Split. Split uses the sage-200 fill.
  - With an amount of 0 → toast "Enter an amount first / 請先輸入金額".
- **In-app keypad**: 3×4 grid, keys 56 high, radius 20, transparent with `surface` on hover.
  - Keys: 1–9, `.`, 0, backspace.
  - The decimal key is blank for zero-decimal currencies (JPY, KRW, VND).
  - Decimals are capped at the currency's minor units; the integer part is capped at 9 digits.
  - The display uses grouping ("1,234.5").

### 04 Currency picker (bottom sheet)
- Sheet top at 110, radius 34 top, grab handle, title "Currency / 幣別", **Done / 完成**.
- Search pill: "Search code or name / 搜尋代碼或名稱". It matches the code, the English name or the Chinese name.
- **Sections**
  - Starred / 常用.
  - All currencies / 全部幣別: full ISO 4217 in production; the mock has 16.
- **Rows**: 52 high. Code (700, 44 wide), name, a check if selected (row tinted accent-100), and a 44 px star toggle (★ in accent / ☆ in neutral-500).
- Picking a row returns to the amount screen. Switching to a zero-decimal currency drops the decimals.
- The same picker is reused for "New ledger".

### 05 Category (auto ledger)
- **Top block**
  - Caprasimo 44 amount.
  - A type tag: Expense in accent-200, Income in sage-200.
  - A ledger chip "Saving to **Living · AUD** · [Change]". Change opens screen 06; it is enabled only when 2+ ledgers match.
- **Grid**: 4 columns, 64 px circles, label 13/600.
  - **Australian-context defaults** (16 expense, 4×4): Dining, Groceries, Coffee, Transport, **Rent**, **Opal / Myki**, **Bond**, Bills, **Subscriptions**, Shopping, Health, Fun, Travel, Stays, Gifts, Other.
  - Income (8): Salary, Bonus, **Tax refund**, **Super**, Refund, Interest, Sold, Other. Bond refunds use Refund.
  - zh-TW names: 餐飲 日用品 咖啡 交通 房租 Opal/Myki 押金 帳單 訂閱 購物 醫療 娛樂 旅行 住宿 禮物 其他 / 薪資 獎金 退稅 Super 退休金 退款 利息 賣出 其他.
  - Labels are centred and may wrap to two lines (line-height 1.2).
  - Store category **codes**, not display text.
- Hint: "Pick a category. You can add a note next. / 選一個類別，下一步可以加備註。"

### 05b Category → note & save sheet (**changed from spec**: tapping a category no longer saves straight away)
- **Header row**: 56 px category circle, the category name (Caprasimo 24), the ledger label under it, and the amount on the right (Caprasimo 26).
- **Note input**: 56 px pill with a 2 px accent border, autofocused, placeholder "Note · optional / 備註 · 選填".
- **Chips**
  - Date chip: shows "Today"; tinted accent-200 when another day is chosen.
  - **Change category / 換類別**: closes the sheet.
- **Save / 儲存**: 58 px accent pill. Saving goes back to home on that ledger's tab, with toast "Saved to Living / 已存到「生活」".

### 05c Backdate (date picker inside 05b)
- Tapping the date chip expands a `surface` card containing:
  - Quick chips: **Today / 今天** and **Yesterday / 昨天**.
  - A month label.
  - A 7-column month grid with week header S M T W T F S / 日一二三四五六.
- Today's number is in accent-700; the selected day is an accent circle; future days sit at 30% opacity and can't be tapped.
- Picking a day collapses the calendar.
- The mock only shows October 2026. **Production needs previous/next month navigation.**

### 06 Ledger routing — 2+ ledgers (sheet over 05)
- Title "Which AUD ledger? / 要記到哪個 AUD 帳本？", sub "You have more than one personal ledger in this currency."
- Rows are 62 high on `surface`. The last-used ledger comes first, with a tag "Last used / 上次使用".
- Last row: dashed "+ New AUD ledger".
- **Skip this sheet** when Add entry was pressed on a personal tab of the same currency; use that tab's ledger directly.

### 07 Ledger routing — none (dialog over 03)
- 52 px accent-200 icon circle with book-plus.
- Title: "No NZD ledger yet. Create one? / 還沒有 NZD 帳本，要建立嗎？"
- Body: "You'll come straight back to finish this entry."
- **Not now / 先不要**: closes the dialog and returns to the amount screen. The amount and currency are kept; nothing is saved.
- **Create NZD ledger**: opens New ledger with the currency preset. After creating it, the user goes back to Category with the new ledger selected.

### 08 Split — members & shares
- **Top row**: amount (Caprasimo 42) plus a segmented toggle **Cost / Income** (支出 / 收入). The toggle is `flex:none` and its buttons don't wrap.
- **Ledger row**: auto-selected when that currency has only one shared ledger, tagged "Only one / 唯一". With several shared ledgers, ask the user to pick.
- **Split with / 一起分的人**: member chips, 46 high. Selected = sage-200 fill with a check. At least one member must stay selected.
- **Card**
  - "Paid by / 付款人 — You ▾": tap to cycle through members. For income it reads "Received by / 收款人".
  - "Shares / 分配 — Split equally ▾": expands per-person amounts.
- **Remainder rule** (amounts in integer minor units): `base = floor(total / n)`; the first `rem` members get +1 minor unit.
  - Shown as a note: "$0.02 left over after splitting, so the first 2 people pay one cent more."
- **Category · optional / 類別 · 可略過**: a horizontal scroll of 50 px circles, plus a note input.
- **Add split / 送出分帳**: toast "Added to Flat · Amy & Chloe can see it".

### 09 New ledger
- **Name** input (pill, 52).
- **Type**: two 64 px cards, Personal ("Only you") / Shared ("With friends"). The selected card is filled with `text`.
- **Currency** row, with the note "Currency can't be changed after the ledger is created."
- **Shared only**
  - **Members** chips. Placeholder friends are labelled "(placeholder)".
  - **Your share** radio, set per member:
    - Add every entry to my personal ledger
    - Don't add
    - Ask me when the ledger ends
- **Create ledger / 建立帳本**: adds a tab and switches to it.

### 10 Friends
- **Sage-200 invite card**: "Invite a friend", body text, **Share link** (sage-800 fill) and **QR code** (outline).
- **Sections**
  - "Starred · shown first when splitting": star toggles move friends in and out.
  - "Friends".
  - "Not on the app yet": placeholder friends with a dashed avatar ring, sub "Placeholder · merges when they join".
- Dashed button "+ Add placeholder friend".

### 11 Settle up (sheet over 02)
- **Person chips**: one per open balance ("Amy · ¥2,500", "Ben · ¥1,200").
- **Direction line**: avatars with an arrow. "You pay Amy / 你付給 Amy" if you owe; "Ben paid you / Ben 已付給你" plus a sage tag "代記 / For Ben" if they owe you.
- **Amount box**: 76 high, `surface`.
  - It **starts empty**: grey "0" with a caret.
  - An **in-app keypad** sits below (keys 50 high).
  - A **Full amount / 結清全額** pill inside the box fills the full balance; it is shown sage-filled when the entered value equals the balance.
  - The entered amount is capped at the balance.
- **Partial payment**: a line "¥500 will still be owed after this. / 記錄後還剩 ¥500 未結清。" in accent-700.
- **Body copy**
  - Full and you owe: brings the balance to ¥0.
  - Partial: neutral wording.
  - On behalf: "…saved as recorded by you on Ben's behalf, and Ben gets a notification."
- **Main button** (sage fill) has three labels:
  - "Enter an amount / 請輸入金額" at 45% opacity when the amount is empty.
  - "Record repayment / 記錄還款" for the full amount.
  - "Record part payment / 記錄部分還款" otherwise.
- **Result**
  - A partial payment reduces the open balance.
  - A full payment removes it; "All settled / 已結清" shows when none remain.
- Settlements are stored as `entries` of type `repayment`, with `recordedBy` ≠ payer when recorded on someone's behalf. Notify the other party.

### 12 End ledger (dialog over 02)
- Title "End Japan Trip?"
- Body: "Your share of this ledger is **¥18,400**. Add it to your personal ledger **Yen Wallet · JPY**?" The target ledger follows the same routing rule as Add entry.
- **Buttons**
  - **Add and end** (accent).
  - **End without adding** (outline).
  - **Cancel** (ghost).
- Footnote: "Ended ledgers become read-only and move to the end of your tabs. You can reopen them anytime."
  - This resolves an open question in the spec as: read-only + moved last + reopenable.

### 13 Home-screen widgets
- **Small widget** (158²): "October · Living", spent (Caprasimo 26), and an accent "+ Add entry" pill.
- **Medium widget** (full width × 158):
  - A large accent "Add entry" tile.
  - Three shortcut pills: Expense / Income / Split. Each opens the amount screen with that type preselected (highlighted).
- The iOS Control Centre button and the Android Quick Settings tile are both a circular "+" control.
- All widgets only open the app at the amount screen; nothing is typed inside the widget.

### 14 Settings
- **Language** radio: Match my phone (sub "Currently English (Australia)") · 繁體中文（台灣） · English (Australia).
  - Note: phones set to other languages use en-AU; ledger names and notes are never translated.
- **Formats card**: Date 25/10/2026 (en-AU) or 2026/10/25 (zh-TW); Amounts 1,234.50 in both languages.
- **Rows**: Appearance (shows the current background · accent names) · Starred currencies · Friends · Home screen widgets · Notifications · Account (Apple on iOS / Google on Android).

### 15 Appearance (+ 15b photo confirm)
See the Personalisation section above. Swatches are 52 px circles in a 5-column grid. The selected swatch has a check plus a double ring (`0 0 0 3px surface, 0 0 0 5px text`).

### 16 Recurring payments / 定期扣款
For charges that happen without the user doing anything: Apple ID subscriptions, direct debits, Afterpay.
- Header has a 44 px accent "+" on the right (opens 17).
- **Summary card** (sage-200, radius 30): "FIXED COSTS / 固定支出", "About $1,101 a month / 每月約 $1,101" (Caprasimo 36), sub line.
  - Monthly total = Σ(amount × factor), where weekly 52/12, fortnightly 26/12, monthly 1, yearly 1/12. Split items count only your share.
- **Sections** of pill bubbles (same style as home entries):
  - Subscriptions & bills / 訂閱與帳單. Apple ID items carry a small "Apple ID" tag.
  - Instalments / 分期付款. Afterpay rows show "Payment 2 of 4 · next 06/11" and four 8 px progress dots.
  - Shared · split automatically / 定期分帳. Sage icon circle, sub "Weekly · Flat · your share $210.00".
- Tapping a row opens 17 in edit mode.

### 17 New recurring / 新增定期扣款
- Segmented: **Regular / 一般 · Afterpay · Split / 定期分帳**.
- **Regular**
  - "Common subscriptions / 常見訂閱" chips (Apple iCloud+, Apple Music, Netflix, Spotify, Phone plan) fill in name, amount and category in one tap.
  - Name, Amount, Repeats (Weekly / Fortnightly / Monthly / Yearly), Category, Ledger, First charge.
- **Afterpay**
  - Enter the **total** and the first payment date. It auto-splits into 4 payments, one every 14 days. The remainder goes on payment 1. It stops after the last payment.
  - A schedule card lists the 4 dates and amounts. Other instalment plans can set their own count.
- **Split (recurring split, new vs spec)**
  - The shared ledger is shown at the top (Flat · AUD with avatars). Fields: Name, Amount, Repeats, Category, Starts, Paid by, plus equal shares using the remainder rule.
  - Every occurrence is added to the shared ledger, and members get a notification. On home it shows the tag "Weekly · auto-split / 每週自動分帳".
- **Remind me the day before / 前一天提醒我**: toggle, **off by default; on by default for Afterpay** so an instalment never surprises the user.
- On the day of each charge, an entry is auto-created (tag "Auto-recorded / 自動記入") and a push is sent (18).

### 18 Charge notification (lock screen)
- "Netflix charged today / Netflix 今天已扣款": "22.99 AUD was added to Living · Subscriptions." Actions: **Edit amount** and **Delete** (red).
- Day-before reminder: "Afterpay due tomorrow / 明天 Afterpay 要扣款".
- Bank reminder: "Time to update CommBank / 該更新 CommBank 餘額了". Tapping it opens 21.

### 19 Charge edit (sheet over home)
- Amount field (76 high, 2 px accent border), note "Only this charge changes…", **Save**, **Delete** (red outline), **Edit recurring**.

### 20 Bank balances / 銀行餘額
- No bank connection: an account is just a name + currency (CommBank · AUD, 台新銀行 · TWD).
- Each account is a radius-32 bubble card: name, currency tag, balance (Caprasimo 34), "Updated 18/10/2026 · 7 days ago", and an **Update** pill. The pill is accent-filled when overdue, `surface` otherwise.
- After a check, the card shows "$80.00 wasn't recorded" in accent-700.
- "Remind me to update / 提醒我更新": **Every week / Every month** (default weekly).

### 21 Update balance (sheet) → 22 Reconcile (dialog)
- 21: one number on the in-app keypad (same as settle up). Button "Check my entries / 對帳".
- 22: rows: Balance went down −$500.00; Recorded since 18/10/2026 −$420.00; **Not recorded $80.00** (20/800, accent-700).
  - gap = (previous balance − new balance) − expenses recorded in linked ledgers since the previous update. Income recorded should be netted in production.
  - **Add missing entry / 補記一筆** opens the amount screen with $80.00 and the Living ledger preset. **Skip this time / 這次略過** just saves the balance.
  - When gap ≤ 0: "Everything is recorded / 全部都有記到" + Done.

### 23 Monthly check / 每月檢查
- Completed month (September) vs the previous one (August), per personal ledger.
- Top: spent total (Caprasimo 50) and a delta pill. More spending uses accent-100/800; less uses sage-100/800.
- Two tappable cards: fixed costs a month (→ 16) and the last bank-check gap (→ 20).
- By category: label + amount, two 8 px bars (this month accent, last month neutral-400, scaled to the largest value), delta line (more = accent-700, less = sage-700).

---

## Platform differences
- **iOS**
  - 50 pt status bar with a centred Dynamic Island pill.
  - Back icon is a chevron-left.
  - 134×5 home indicator.
  - Account sign-in is Apple.
- **Android**
  - 44 dp status bar with a centred punch-hole.
  - Back icon is arrow-left.
  - 108×4 gesture bar.
  - Account sign-in is Google.
- Layouts are otherwise identical.

## Interactions & behaviour summary
- **Add entry pre-fill**
  - On a personal tab: preset that tab's currency and ledger, so routing is skipped.
  - On a shared tab: preset only the currency.
- **Flows**
  - Personal: amount → type → (routing if needed) → category → note/date sheet → Save.
  - Split: amount → Split → members/shares → Add split.
- **Toasts**: dark pill (neutral-900 fill, neutral-100 text), 118 px from the bottom, about 2.4 s.
- **Sheets and dialogs**: scrim of neutral-900 @ 45%. Tapping the scrim closes the overlay and returns to the screen underneath.
- **Tabs**: tap to switch. Long-press and drag to reorder; star to pin (screen 01c; drag works in the prototype).

## State and data notes
- Store amounts as integer minor units plus an ISO currency code. Formatting:
  - Minor-unit digits come from ISO 4217.
  - Use en-AU grouping in both languages.
  - The symbol follows the ledger currency, not the UI language: $ ¥ NT$ NZ$ US$ € £ …
- `ledger_prefs` per user: star, order, share-handling, plus the appearance settings above.
- Entries: `type` (expense / income / repayment), `isSplit`, `amountMinor`, `categoryCode`, `date` (backdating allowed, future dates not), `note`, `createdBy`, `lastEditedBy`, `payer`, `shares{uid: minor}`, `recordedOnBehalfOf?`.
- `recurring`: name, amountMinor, currency, ledgerId, categoryCode, frequency (weekly / fortnightly / monthly / yearly), startDate, remindDayBefore, kind (regular / instalment / split), instalments {count, paid}, shares (split), source (appleId?).
- `bank_accounts`: name, currency, linkedLedgerIds, balances[{date, amountMinor, gapMinor}], reminder (weekly / monthly).
- Keep an edit history for shared entries, shown as "Edited by X" (resolves the spec's open question as "yes").
- **Offline**: entries are queued and synced later (Firestore offline persistence).

## Sample data (mock only)
- **Ledgers**
  - Personal: Living AUD ★, Travel AUD, Yen Wallet JPY.
  - Shared: Japan Trip JPY ★ (You, Amy, Ben), Flat AUD (You, Amy, Chloe).
- **Balances**
  - Japan Trip: you owe Amy ¥2,500; Ben owes you ¥1,200.
- **Friends**: Amy (starred), Ben, Chloe; placeholder friend Dad (爸爸).
- **Mock "today"**: Sunday 25 October 2026.

## Assets
- Icons: Lucide (https://lucide.dev). The mock uses the `lucide-static@0.460.0` icon font; in production use the SVG/Flutter package at stroke 2.75.
- Fonts: Caprasimo and Figtree (Google Fonts).
- `design/assets/sample-photo.jpg`: a sample home background only, not a product asset.

## Files
- `design/Phone.dc.html`: all screens, copy (EN/zh-TW), tokens and behaviour. **Start here.**
- `design/Ledger App Design.dc.html`: overview canvas of every screen.
- `design/Ledger App Prototype.dc.html`: clickable prototype (use Tweaks for platform / language / direction).
- `design/_ds/…/styles.css`: Organic design system tokens.
- `spec/product-spec-zh-TW.pdf`: the original product and tech spec.
