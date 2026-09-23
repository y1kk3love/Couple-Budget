# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is **no build step**. The app is plain ES modules served as static files; Firebase SDKs are loaded directly from `https://www.gstatic.com/firebasejs/10.12.0/`. ES modules won't load over `file://`, so `index.html` must be served over HTTP.

**The owner's machine has neither Node nor Python** (verified 2026-09: `node`/`npx` absent from PATH and every usual install location; `python`/`python3`/`py` are the Windows Store stubs). So `npx http-server` and `python -m http.server` (both still mentioned in README) do not work here. Use the dependency-free PowerShell server in the repo:

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8000
```

For the Claude desktop Browser pane, `.claude/launch.json` (gitignored — recreate it if missing) points at the same script:

```json
{ "version": "0.0.1", "configurations": [ { "name": "couple-budget", "runtimeExecutable": "powershell",
  "runtimeArgs": ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools/serve.ps1", "-Port", "8000"], "port": 8000 } ] }
```

There are no tests, linters, or package scripts and no `package.json`. **Verification on this machine is the browser smoke test**: load the app through the local server and confirm zero console errors and that the login screen renders — `js/app.js` imports every module eagerly, so a syntax error anywhere fails the whole load and shows in the console. Signing in needs one of the two allowlisted Google accounts, so anything past the login screen is checked by the owner. Where Node *is* available, add a per-file `node --check` (it parses plain `.js` as CommonJS, hence the `.mjs` copy; Git Bash, from the repo root):

```bash
S=$(mktemp -d); ok=1; for f in js/*.js js/views/*.js js/modals/*.js; do cp "$f" "$S/$(echo $f|tr / _).mjs"; node --check "$S/$(echo $f|tr / _).mjs" || ok=0; done; [ $ok = 1 ] && echo ALL-PASS
```

⚠ **PowerShell scripts in `tools/` must be saved as UTF-8 *with BOM*.** Windows PowerShell 5.1 reads a BOM-less file as CP949, and a Korean comment can then swallow the line after it — `serve.ps1` without a BOM silently skipped its body write and every GET hung. Both scripts carry the BOM; keep it when editing (the Write tool emits no BOM — re-save with `[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding $true))`).

`.claude/` (session settings, `launch.json`) and `excel/` (personal card statements) are gitignored — don't commit either.

Design specs and implementation plans for larger features live in `docs/superpowers/specs/` and `docs/superpowers/plans/` (currently only the 2026-08 wedding tab). They record the *original* design and are not updated afterwards — the wedding spec still describes a stored `totalBudget` and a 하객 segment, both since replaced (see the wedding section below). When a spec and this file disagree, this file wins.

## Deployment

The app is served by **GitHub Pages** (deploy-from-branch; there is no workflow file). Pushing to `main` triggers a Pages build automatically. **Owner's standing request: when a piece of work is finished and verified, merge it into `main` and push so it deploys** — don't leave finished work sitting on a feature branch. Pages builds occasionally get stuck — the fix used historically is an empty commit (`git commit --allow-empty`) to retrigger. Note that `firebase.js` (including the Firebase keys) is committed and public; access control relies entirely on the `ALLOWED_EMAILS` allowlist and `firestore.rules`, not on config secrecy.

## Configuration that must exist before the app works

- `firebase.js` exports `firebaseConfig` (Firebase project keys) and `ALLOWED_EMAILS` (the only two Google accounts allowed to log in). The auth check is enforced both client-side (`js/auth.js`) and server-side (`firestore.rules`). When changing the allowlist, update **both** places — they are not derived from each other.
- `firestore.rules` must be pasted into the Firebase console; it is not deployed by anything in this repo. The committed file deliberately keeps **placeholder emails** (`your_email@gmail.com` / `partner_email@gmail.com`) in `isAllowed()` — the real addresses (the ones in `firebase.js`) are substituted only when pasting into the console. Don't "fix" the placeholders in the repo, and remember that any re-paste needs that substitution or both users get locked out.

## Architecture

Single-page app with one global mutable `state` object and a single `renderAll()` re-render function. There is no framework, no reactivity layer, and no router.

### Module layout and data flow

```
firebase.js              ← Firebase init + ALLOWED_EMAILS allowlist
js/state.js              ← single shared mutable state (currentYear/Month/View, currentUser, transactions[],
                            transactionsYM, fixedItems[], skippedFixedIds:Set, budget/budgetDefault/budgetMonths, budgetPlans[],
                            wedding{config, items, tasks, vendors, events, loadError})
js/constants.js          ← CATEGORIES (expense×12, income×4) + getCategoryInfo(); OWNER_COLORS;
                            WEDDING_CATEGORIES/getWeddingCategory, WEDDING_PERIODS, WEDDING_CHECKLIST_TEMPLATE
js/utils.js              ← fmtMoney, fmtMoneyShort, escapeHtml, ymKey, todayStr, showToast, showConfirm, runWrite, downloadCSV, ownerName, setupAmountPresets, emptyStateHTML
js/db.js                 ← 가계부 Firestore reads/writes; mutates state.transactions / state.fixedItems
js/weddingDb.js          ← 결혼 탭 전용 Firestore reads/writes (wedding_* + settings/wedding); mutates state.wedding
js/auth.js               ← Google sign-in; on success calls initApp()
js/theme.js              ← dark/light toggle (setupThemeToggle); see Design system section
js/app.js                ← initApp(), loadAllData(), renderAll(), month nav, view switch
js/views/{calendar,list,stats,fixed,plan}.js     ← each exports render<Name>View() that fills its #view-<name> div
js/views/wedding.js      ← 결혼 탭 셸 (D-day 헤더 + 세그먼트 전환 + 예산 세그먼트)
js/views/wedding{Events,Checklist,Vendors,Memo}.js  ← 세그먼트 렌더러 — render<Seg>Segment(container)
js/modals/{txModal,fixedModal,csvModal,budgetModal,weddingModal}.js  ← setup<Name>Modal(s)() wires DOM events; open<Name>Modal() opens it
```

Bootstrapping happens at the bottom of `js/app.js`: `setupAuth()`, `setupThemeToggle()`, the 내보내기 button binding, the five modal `setup*` calls (tx/fixed/csv/budget/wedding), and `setupCategoryDetailModal()` (exported from `js/views/stats.js`, not a `js/modals/` file) run on module load. `auth.js` then calls `initApp()` once a permitted user signs in. Because `onAuthStateChanged` re-fires on every re-login, `initApp()` guards its one-time listener registration behind a `listenersBound` flag — new global listeners belong inside that guard (or must follow the rebind-per-render pattern), or they will fire once per past login on each click.

### The render cycle

All views read from `state` and write to their fixed `#view-<name>` div. Any mutation (add/edit/delete transaction, change fixed item, switch month) follows the same pattern:

1. mutate Firestore through a `db.js` function
2. `await fetchTransactions()` (and/or `fetchFixedItems()`) to refresh `state`
3. call `renderAll()` from `js/app.js`

`renderAll()` rebuilds the summary bar plus the currently active view only. Views are not memoized — they `innerHTML =` their container each call and rebind listeners. The 예산안 and 결혼 views are month-independent (`MONTHLESS_VIEWS` in `app.js`). For them, `applyViewChrome()` adds `.monthless` to `.main-content`, which hides the summary bar, month navigator, and wedding banner via CSS and shows a header title (`#viewTitle`) instead. `renderSummary()` is skipped there and runs again when the user returns to a month view.

Race protection: rapid month-nav clicks used to let a stale fetch overwrite a newer one. Guards now exist in three places — `loadAllData()` and `renderSummary()` each carry a sequence counter and abort if a newer call started, and `fetchTransactions()` discards its result if the month changed mid-flight. Keep these intact when touching the load path.

Firestore writes in save/delete handlers go through `runWrite(button, writeFn, action)` in `utils.js`, and the modal closes **only after the write succeeds** (failure keeps the modal open with inputs preserved; `runWrite` logs and shows "<action>에 실패했습니다" itself). `runWrite` also disables the button for the duration of the write — that is the double-submit guard (a double tap used to create duplicate transactions/fixed items). The lock must be taken synchronously on click, so grab `e.currentTarget` and call `runWrite` before any `await` other than a `showConfirm()` (which covers the screen). Follow this pattern for any new write flow. The only exception is CSV import, which needs its own partial-failure message and locks its button manually.

Because re-rendering wipes all DOM state, transient UI state lives in **module-level variables** inside the owning view/modal module: `list.js` keeps its sort key/direction and filter values, `plan.js` keeps its sort state plus the edit-mode `draft` object, `txModal.js` keeps `editingTxId` plus `editingTx` (the original tx object — needed because a tx opened from 전체 기간 or the history panel isn't in `state.transactions`). New UI state that must survive a re-render follows this pattern (note it also survives view switches and logout/login, since modules are never reloaded — reset it explicitly if that's not wanted).

A view that needs async data after its synchronous render (e.g. `stats.js` filling the monthly-compare card from `fetchMonthlySummary()`) renders a loading placeholder, then in the `.then()` re-checks that its target element still exists — the user may have switched views or months before the fetch resolved.

### Aggregation caches

`db.js` keeps three module-level caches — `balanceCache` (for `calcAccumulatedBalance()`), `monthlySummaryCache` (for `fetchMonthlySummary()`, stats view), and `allTxCache` (for `fetchAllTransactions()`, used by the list view's 전체 기간 mode, CSV export, **and** `calcAccumulatedBalance()`, which sums from it instead of running its own full scan). All are cleared only through `invalidateBalanceCache()`. **Any code that writes to the `transactions` collection must call `invalidateBalanceCache()` afterwards** — the `db.js` mutation helpers already do, but code writing directly to Firestore (e.g. `csvModal.js`) must call it explicitly, or the summary bar / stats will show stale numbers until reload.

### Transaction names and category propagation

The tx modal has no name input: a transaction's `name` is the trimmed memo, falling back to the category label (`txModal.js` save handler). `name` drives the tx modal's recent-history suggestions (`fetchRecentTransactionsByName()`) and category propagation: when an edit changes a transaction's category, `updateCategoryByName()` batch-applies the new category to **every** transaction with the same `name`+`type` across all months. This app-wide side effect is intentional (a merchant's category correction should apply everywhere) — keep it in mind when touching the edit flow.

### Firestore document shapes

The field-by-field schemas for `transactions` and `fixed_items` docs are documented in `README.md` (§ Firestore 데이터 구조) — but those tables predate the newer optional fields (`owner` on transactions, `day` on fixed_items, the skip-marker shape), so treat the sections below as the authority on them. `day` is the day-of-month a fixed item materializes on, defaulting to 1 and clamped to 1–31 on save (`fixedModal.js`).

Transactions additionally carry an optional `owner` (email of who entered it), written on manual add (`txModal.js`) and CSV import, but **not** on fixed-item materialization and never overwritten on edit. Legacy docs lack it — always treat missing `owner` as "함께/미지정" (the list view's 작성자 tag and the stats 사람별 지출 card both do). Display names resolve through `ownerName()` in `utils.js` (예산안 표시 이름 → email prefix fallback).

### Month scoping

`state.currentYear` / `state.currentMonth` define the active month. `fetchTransactions()` queries Firestore filtered by `year` and `month` fields (equality + `orderBy date desc` — requires the composite index documented in README § 복합 인덱스; a fresh Firebase project fails with `failed-precondition` until it exists), so transactions written elsewhere **must** include both fields or they will be invisible to the month view. Only four `db.js` functions look beyond the current month: `calcAccumulatedBalance()` (scans all transactions), `fetchAllTransactions()` (full scan; list view 전체 기간 mode + CSV export), `fetchMonthlySummary()` (last N months, stats view), and `fetchRecentTransactionsByName()` (last N months, tx modal suggestions).

The list view has a scope toggle (이번 달/전체 기간). In 전체 기간 mode rows may reference transactions outside `state.transactions`, so `openEditModal(id, tx)` accepts the tx object directly, and `deleteTransaction()` falls back to a `getDoc` read when the id isn't in current-month state (needed to detect materialized fixed transactions and write the skip marker instead of a plain delete).

### Fixed items → transactions materialization

`fixed_items` are templates; they are materialized into the `transactions` collection on demand by `applyFixedItemsToMonth(year, month)` (called from `loadAllData()` every time the month changes, and from `fixedModal.js` right after saving so a new/edited fixed item shows up in the viewed month immediately). Each generated transaction uses the deterministic doc ID `fixed_<fixedId>_<YYYY-MM>`, so concurrent sessions write the same doc instead of duplicating it, and is tagged `fromFixed: true` / `fixedId` so it is skipped on re-apply. Important consequences:

- **The target month is an explicit argument — never read `state.currentYear/Month` inside these functions.** The user can change month while writes are in flight; reading the global mid-loop used to write the remaining items into the wrong month. `applyFixedItemsToMonth` also trusts `state.transactions` only when `state.transactionsYM` (set by `fetchTransactions()`) equals the target month, and snapshots the applied/skipped sets up front. It counts an item as applied only when a doc with *this month's* deterministic ID is present, and it `getDoc`s each pending ID first and never overwrites an existing doc (create-if-absent).
- Editing a fixed item must call `syncFixedItemTransactions()` to propagate changes to already-materialized transactions — but it deliberately only touches the **real** current month (today's date, not the viewed month) and later; past months are preserved as historical record.
- Moving a materialized fixed transaction to a different month in the tx modal goes through `moveFixedTransaction()`: one batch writes a skip marker at the original deterministic ID and a new auto-ID doc *without* `fromFixed`/`fixedId` in the target month. Updating the date in place would leave the doc at the old month's ID, so revisiting the old month re-materialized it and overwrote the moved record. The moved copy is a plain transaction: the target month still gets its own materialized copy (both are real cash flow), and later fixed-item edits don't touch it. Same-month date changes are a normal `updateTransaction()`.
- The day-of-month is clamped against the target month's last day (e.g. day 31 in February becomes 28/29).
- A fixed item's `startYear`/`startMonth` gates application; earlier months are skipped.
- Deleting a materialized fixed transaction does **not** delete the doc — `deleteTransaction()` overwrites it with a skip marker (`{skipped: true, fixedId, year, month, fromFixed: true}`, no amount/name) so the deterministic ID can't resurrect it. `fetchTransactions()` filters skip markers out of `state.transactions` and collects them into `state.skippedFixedIds`; all-collection scans (`calcAccumulatedBalance`, `fetchRecentTransactionsByName`, `syncFixedItemTransactions`) must guard against `t.skipped` docs, which lack `amount`/`name`.

### Monthly budget

The `settings/budget` Firestore doc holds `{amount, months}`: `amount` is the default expense budget applied to every month, `months` is an optional `{"YYYY-MM": amount}` map of per-month overrides (set via the 이번 달에만 적용 checkbox in `budgetModal.js`). `fetchBudget()` loads both into `state.budgetDefault` / `state.budgetMonths` and resolves `state.budget` for the current month (override wins). The summary bar is a 4-card hierarchy (`renderSummary()` in `js/app.js`): 이번달 잔액 hero card (`.sum-card.hero`, enlarged value), a combined 수입/지출 card (`.sum-card.duo`, two rows), 누적 잔액, and the budget card (`renderBudgetCard()`) with a progress bar (blue → orange at ≥80% → red over budget); clicking the budget card opens `js/modals/budgetModal.js`. All summary amounts carry the `원` suffix. The 설정 해제 button removes only the current month's override when one exists, otherwise removes just the default `amount` — `deleteBudget()` deletes the whole doc only when no per-month overrides remain, so other months' overrides survive. Saving with the checkbox **unchecked** while the current month has an override also clears that override (otherwise the override would keep winning and the save would look ignored). The `settings` collection must be allowed in `firestore.rules` (already included — re-paste rules into the console when deploying).

### Personal budget plans (예산안)

The `plan` view is a per-person salary allocation planner, independent of actual transactions and month navigation. Each of the two users has at most one plan in the `budget_plans` collection (doc ID = their email): `{owner, name(표시 이름, optional), income, items: [{name, amount}]}`. Card titles show `<name>의 예산안` when `name` is set, falling back to 내/상대 예산안; the owner's card is marked with a "나" tag. Both users can see both plans; the client only allows editing your own (Firestore rules allow either — enforcement is UI-level only). Item colors are auto-assigned by cycling `CATEGORIES.expense` colors in **saved order** (the view's sort bar reorders rows without reshuffling colors); the donut chart shows allocations plus remaining (or over-allocation in red). Edit-mode rows can be drag-reordered via pointer events — the handlers live on `document`, not `setPointerCapture`, because re-inserting the row mid-drag would release the capture — and the final DOM order is harvested by `syncDraft()`. The partner's card is found by taking the other entry in `ALLOWED_EMAILS`, so the view assumes exactly two allowlisted accounts. Edit mode re-renders the whole view on every row add/remove, so it first calls `syncDraft()` to harvest the live inputs back into `draft` — any new field added to the edit card must also be read there or it is lost on the next re-render. `fetchBudgetPlans()` swallows permission errors so the app still works if `budget_plans` is missing from the deployed rules — but the view will look empty; re-paste `firestore.rules` into the console when deploying this feature.

### 결혼 준비 탭 (wedding)

A fully **separate ledger** from the daily budget — wedding data never touches `transactions`, the aggregation caches, or `loadAllData()`. Four Firestore collections in active use (`wedding_items/tasks/vendors/events`) plus `settings/wedding` (`{date, memo, sheetUrl}` — the header's 총예산 is **derived** as the sum of item `planned` amounts, not stored; `sheetUrl` is an optional external cross-check spreadsheet link kept in Firestore rather than the public repo, rendered as a header chip only when it passes an `https?://` check). `firestore.rules` also still allows `wedding_guests`: the 하객 segment was removed from the UI (2026-08), but the rules block and any existing docs were deliberately left in place so it can be restored. Re-paste rules to console when deploying rule changes. All reads/writes live in `js/weddingDb.js`; fetches swallow permission errors into `state.wedding.loadError` (budget_plans strategy).

`js/views/wedding.js` is the shell: D-day header (`dDayInfo()` exported for testing), segment bar (예산|일정|체크리스트|업체|메모, current segment in a module variable; `setWeddingSegment()` lets the main-view banner deep-link a segment), and the budget segment; the other segments live in `weddingEvents/Checklist/Vendors/Memo.js` as `render<Seg>Segment(container)`. The 메모 segment is a single shared notepad stored as `settings/wedding.memo` (whole text saved at once). Wedding data is independent of month loads. The first tab entry shows a placeholder until `ensureLoaded()` finishes (`loaded` flag). **Every later entry** is marked stale by `switchView()` (`markWeddingStale()`): the view renders from cache immediately and refetches in the background, then re-renders unless an input inside the tab has focus (so typing isn't wiped). Before this, data was read once per page load, and a tab left open for days saved `payments` from a days-old copy. `ensureLoaded()` resets `loadError` each time so a transient failure doesn't block the tab for the session. After a mutation, call the relevant `fetchWedding*()` then `renderWeddingView()`.

**Whole-object saves check for a partner edit first.** The item modal keeps a signature of the item as opened (`baseItemSig`, stable-stringified `ITEM_SIG_FIELDS`, which exclude `order`). On save it re-reads the doc (`readWeddingItem()`). If the partner changed it, the user is asked whether to overwrite; cancelling reloads the modal with the server copy. If the partner deleted the item, the modal closes with a toast instead of recreating it. The memo does the same with `readWeddingMemo()` against `baseMemo`, and cancelling merges both texts into the textarea, unsaved, for the user to reconcile. Any new field saved wholesale needs the same treatment.

**Exception — `wedding_events`** (체촌/픽업 같은 날짜 확정 일정): `initApp()` pre-loads it once per login because the main screen consumes it in two places — `renderWeddingBanner()` in `js/app.js` (shown under the summary bar on month views — hidden on 예산안/결혼 — when the viewed month has events dated today-or-later; click → wedding tab 일정 segment) and 💍 markers on the main calendar's day cells (`calendar.js`). The 일정 segment lays out as a two-column grid — event list on the left with its own scroll (max-height 65vh), mini calendar on the right (320px, sticky; module-level `calYear/calMonth`, day click pre-fills the add modal's date) — stacking calendar-first on mobile.

Key invariants:
- An item's spend is **derived** from its `payments` array (`itemSpent()`); never store a spent total. A payment entry is `{label, amount, date, settledAmount?, settled?}` — `settledAmount` (0…`amount`) is the per-payment partial-settlement amount entered in the item modal (정산 input + 전액 button); `settled` is kept in sync as "fully settled" for readability. Always resolve through `paymentSettled()` in `weddingDb.js`, which clamps and falls back to `settled: true` = full amount for legacy docs without `settledAmount`. `itemSettled()` sums it and feeds the budget row's layered bar (solid = settled, translucent = unsettled) plus a 정산/미정산 amount pair in the row meta (정산 완료 when fully settled; the 정산 part is omitted while nothing is settled yet). `payments` is saved wholesale from the modal's `draftPayments` copy. Truly simultaneous saves are still last-write-wins, but an edit made since the modal opened is caught by the conflict check above.
- `payer` is an email or `"both"`; labels resolve via `ownerName()`.
- Checklist template seeding uses fixed doc IDs `tpl_<n>` + `setDoc` (idempotent, same strategy as fixed-item materialization) and is only offered from the empty state. The local list may be stale, so `seedWeddingChecklist()` first checks the server and writes nothing if any task exists (it returns `false`). Otherwise it would reset the partner's checked tasks to `done: false`.
- Choosing a vendor (`status: "chosen"`) offers to write its price/`vendorId` into the same-category budget item, or create one.
- Budget rows drag-reorder via a `.wd-item-drag` handle using the same document-listener pointer pattern as plan.js; `saveWeddingItemOrders()` batch-writes only the changed `order` values, and the handle's click handler stops propagation so a drag doesn't open the row's edit modal.

### CSV import

`js/modals/csvModal.js` auto-detects Shinhan Card column headers using regex (`날짜|일자|거래일`, `금액|이용금액`, etc.) and writes directly to the `transactions` collection via `writeBatch` in chunks of 450 (bypassing the `db.js` mutation helpers, so it calls `invalidateBalanceCache()` itself). Each row gets a deterministic doc ID `csv_<date>_<amount>_<nameHash>_<occ>`, so re-importing the same CSV overwrites instead of duplicating (`occ` disambiguates genuinely identical rows within one file). After import, the caller must `fetchTransactions()` + `renderAll()` to refresh.

The importer reads the uploaded file as **EUC-KR**, not UTF-8 (`reader.readAsText(file, "euc-kr")`) — a UTF-8 CSV with Korean headers/values will mojibake and fail header detection.

Amounts and dates go through `parseAmount()` / `parseDate()`; `parseCSV()` returns `{rows, badDates, reversed}` and the preview shows both counts (`.csv-warn`), so nothing is changed or dropped silently:
- **Sign is preserved.** `-15,000`, `−15,000`, and `(15,000)` are negative, and decimals are rounded, not concatenated. Junk characters such as 원, ₩, or broken symbols are stripped. A negative row flips direction: a card expense becomes an income row named `<가맹점> 환불`, and a negative 입금 becomes an expense named `<가맹점> 취소`. The old digits-only parser turned refunds into expenses and `12000.00` into 1,200,000.
- **Unreadable dates are skipped and counted.** Accepted forms are `YYYY-MM-DD`, `.`/`/` separators, `2026. 9. 1`, `2026년 9월 1일`, and `YYYYMMDD`, with an optional trailing time. Impossible dates are rejected. The old fallback to today's date piled rows into the current month and duplicated them on re-import, because the date is part of the doc ID.
- The doc ID still hashes the **original merchant name** (`idName`, stripped before saving), not the 환불/취소 label. The ID scheme is therefore unchanged, and re-importing an old file overwrites refunds that were previously mis-imported as expenses.

### Shinhan `.xls` → CSV preprocessing

Raw Shinhan Card statements come as `.xls`, which `csvModal.js` cannot read. `tools/convert-shinhan-xls.ps1` converts them: it opens every `excel/*.xls` via the Excel COM object (so it requires Excel installed on Windows), drops cancelled rows, auto-categorizes each row with an industry+merchant keyword heuristic (`Get-Cat`, unmatched → `기타`), groups by `YYYY-MM`, and writes EUC-KR CSVs to `excel/converted/<YYYY-MM>.csv` with headers `날짜,가맹점,금액,구분,카테고리` — exactly what the importer's regex expects. To improve categorization, extend the keyword lists in `Get-Cat`. The `excel/` directory is gitignored (it holds personal statements).

### CSV export

The header 내보내기 button (`exportAllCsv()` in `js/app.js`) downloads **all** transactions via `fetchAllTransactions()` as a UTF-8 CSV with a BOM (`downloadCSV()` in `utils.js`) so Excel renders Korean correctly. Note the asymmetry: export is UTF-8+BOM, import expects EUC-KR.

## Design system (토스 스타일)

The UI follows a Toss-like look: light-gray page (`--bg`), white borderless cards with `--radius-lg` + `--shadow-card`, Toss-blue `--accent` for primary actions, income **blue** / expense **red** (`--income` / `--expense`), big bold amounts, and a global `button:active { scale }` press effect. All colors are CSS custom properties in `:root` at the top of `style.css`, with a full dark-theme override — **never hardcode colors in JS/HTML templates; use the tokens**, or dark mode breaks. Dark mode follows the system by default, but the header toggle button (`js/theme.js`) can force it via `<html data-theme="light|dark">` + `localStorage("theme")`; an inline script in `index.html` `<head>` re-applies the saved value before first paint. ⚠ The dark tokens exist as **two identical copies** in `style.css` (the `@media (prefers-color-scheme: dark)` block and the `:root[data-theme="dark"]` block) — when changing any dark token, update both. On mobile (≤768px) every `.modal` becomes a bottom sheet automatically; the confirm dialog (`.confirm-overlay`) is exempt and stays centered. The mobile header holds only the hamburger, month navigator (or view title), and theme toggle. 내역 추가 is the bottom-tab + button, and CSV 가져오기/내보내기 move into the hamburger sidebar (`.sidebar-tools`, `#sideImportBtn`/`#sideExportBtn`, hidden on desktop). The header used to overflow to 432px on a 375px phone and clip 가져오기, so check header width at 320–375px before adding anything to it.

## Conventions

- Comments and UI strings are Korean. New code should match.
- Clickable non-`<button>` elements (transaction rows, calendar cells, stat bars, …) carry `role="button" tabindex="0"`; a global keydown handler in `js/app.js` (`setupGlobalKeys`) translates Enter/Space on `[role="button"]` into a click, and Escape closes the topmost open modal by clicking its `.modal-close`. New clickable divs must follow this pattern or they are keyboard-inaccessible.
- The list view's 전체 기간 mode renders at most 300 rows at a time (`LIST_CHUNK` + 더 보기 button in `list.js`) — don't regress it to a full render.
- `.kind-btn` is used by both the tx modal (변동/고정) and the fixed modal (지출/수입) — selectors touching it must stay scoped (`#txModal .kind-btn` / `#fixedTypeToggle .kind-btn`), never document-wide.
- All rendering is via `innerHTML` template strings, so any user-originated string (transaction name, memo, CSV merchant name) must be wrapped in `escapeHtml()` from `js/utils.js` before interpolation.
- Currency formatting goes through `fmtMoney()` (uses `toLocaleString("ko-KR")` on the absolute value) — sign is added by the caller. Compact amounts (calendar cells, chart labels, summaries) use `fmtMoneyShort()`, which abbreviates in Korean units (`1.5만`, `125만`, `1.2억`) — never reintroduce K/M notation.
- Categories live in `js/constants.js`. Always resolve via `getCategoryInfo(id, type)` so `type` (`"income"` vs `"expense"`) is honored — IDs are not unique across types (e.g. both lists could collide).
- Never use native `confirm()`/`alert()` — use `showConfirm()` from `js/utils.js` (returns a Promise<boolean>) and `showToast()`.
