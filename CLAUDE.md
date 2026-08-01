# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is **no build step**. The app is plain ES modules served as static files; Firebase SDKs are loaded directly from `https://www.gstatic.com/firebasejs/10.12.0/`. Open `index.html` through any static server:

```powershell
python -m http.server 8000   # or:  npx http-server
```

There are no tests, linters, or package scripts. There is no `package.json`.

## Deployment

The app is served by **GitHub Pages** (deploy-from-branch; there is no workflow file). Pushing to `main` triggers a Pages build automatically. **Owner's standing request: when a piece of work is finished and verified, merge it into `main` and push so it deploys** — don't leave finished work sitting on a feature branch. Pages builds occasionally get stuck — the fix used historically is an empty commit (`git commit --allow-empty`) to retrigger. Note that `firebase.js` (including the Firebase keys) is committed and public; access control relies entirely on the `ALLOWED_EMAILS` allowlist and `firestore.rules`, not on config secrecy.

## Configuration that must exist before the app works

- `firebase.js` exports `firebaseConfig` (Firebase project keys) and `ALLOWED_EMAILS` (the only two Google accounts allowed to log in). The auth check is enforced both client-side (`js/auth.js`) and server-side (`firestore.rules`). When changing the allowlist, update **both** files — they are not derived from each other.
- `firestore.rules` must be pasted into the Firebase console; it is not deployed by anything in this repo.

## Architecture

Single-page app with one global mutable `state` object and a single `renderAll()` re-render function. There is no framework, no reactivity layer, and no router.

### Module layout and data flow

```
firebase.js              ← Firebase init + ALLOWED_EMAILS allowlist
js/state.js              ← single shared mutable state (currentYear/Month/View, currentUser, transactions[],
                            fixedItems[], skippedFixedIds:Set, budget/budgetDefault/budgetMonths, budgetPlans[])
js/constants.js          ← CATEGORIES (expense×12, income×4) + getCategoryInfo()
js/utils.js              ← fmtMoney, fmtMoneyShort, escapeHtml, todayStr, showToast, showConfirm, downloadCSV, ownerName, setupAmountPresets, emptyStateHTML
js/db.js                 ← 가계부 Firestore reads/writes; mutates state.transactions / state.fixedItems
js/weddingDb.js          ← 결혼 탭 전용 Firestore reads/writes (wedding_* + settings/wedding); mutates state.wedding
js/auth.js               ← Google sign-in; on success calls initApp()
js/theme.js              ← dark/light toggle (setupThemeToggle); see Design system section
js/app.js                ← initApp(), loadAllData(), renderAll(), month nav, view switch
js/views/{calendar,list,stats,fixed,plan}.js     ← each exports render<Name>View() that fills its #view-<name> div
js/views/wedding.js      ← 결혼 탭 셸 (D-day 헤더 + 세그먼트 전환 + 예산 세그먼트)
js/views/wedding{Checklist,Vendors,Guests}.js    ← 세그먼트 렌더러 — render<Seg>Segment(container)
js/modals/{txModal,fixedModal,csvModal,budgetModal,weddingModal}.js  ← setup<Name>Modal(s)() wires DOM events; open<Name>Modal() opens it
```

Bootstrapping happens at the bottom of `js/app.js`: `setupAuth()`, `setupThemeToggle()`, the 내보내기 button binding, the five modal `setup*` calls (tx/fixed/csv/budget/wedding), and `setupCategoryDetailModal()` (exported from `js/views/stats.js`, not a `js/modals/` file) run on module load. `auth.js` then calls `initApp()` once a permitted user signs in. Because `onAuthStateChanged` re-fires on every re-login, `initApp()` guards its one-time listener registration behind a `listenersBound` flag — new global listeners belong inside that guard (or must follow the rebind-per-render pattern), or they will fire once per past login on each click.

### The render cycle

All views read from `state` and write to their fixed `#view-<name>` div. Any mutation (add/edit/delete transaction, change fixed item, switch month) follows the same pattern:

1. mutate Firestore through a `db.js` function
2. `await fetchTransactions()` (and/or `fetchFixedItems()`) to refresh `state`
3. call `renderAll()` from `js/app.js`

`renderAll()` always rebuilds the summary bar plus the currently active view only. Views are not memoized — they `innerHTML =` their container each call and rebind listeners.

Race protection: rapid month-nav clicks used to let a stale fetch overwrite a newer one. Guards now exist in three places — `loadAllData()` and `renderSummary()` each carry a sequence counter and abort if a newer call started, and `fetchTransactions()` discards its result if the month changed mid-flight. Keep these intact when touching the load path.

Firestore writes in modal save/delete handlers are wrapped in try/catch and the modal closes **only after the write succeeds** (failure keeps the modal open with inputs preserved and shows an error toast). Follow this pattern for any new write flow.

Because re-rendering wipes all DOM state, transient UI state lives in **module-level variables** inside the owning view/modal module: `list.js` keeps its sort key/direction and filter values, `plan.js` keeps its sort state plus the edit-mode `draft` object, `txModal.js` keeps `editingTxId`. New UI state that must survive a re-render follows this pattern (note it also survives view switches and logout/login, since modules are never reloaded — reset it explicitly if that's not wanted).

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

`fixed_items` are templates; they are materialized into the `transactions` collection on demand by `applyFixedItemsToCurrentMonth()` (called from `loadAllData()` every time the month changes, and from `fixedModal.js` right after saving so a new/edited fixed item shows up in the current month immediately). Each generated transaction uses the deterministic doc ID `fixed_<fixedId>_<YYYY-MM>` written with `setDoc`, so concurrent sessions overwrite the same doc instead of duplicating it, and is tagged `fromFixed: true` / `fixedId` so it is skipped on re-apply. Important consequences:

- Editing a fixed item must call `syncFixedItemTransactions()` to propagate changes to already-materialized transactions — but it deliberately only touches the current month and later; past months are preserved as historical record.
- The day-of-month is clamped against the target month's last day (e.g. day 31 in February becomes 28/29).
- A fixed item's `startYear`/`startMonth` gates application; earlier months are skipped.
- Deleting a materialized fixed transaction does **not** delete the doc — `deleteTransaction()` overwrites it with a skip marker (`{skipped: true, fixedId, year, month, fromFixed: true}`, no amount/name) so the deterministic ID can't resurrect it. `fetchTransactions()` filters skip markers out of `state.transactions` and collects them into `state.skippedFixedIds`; all-collection scans (`calcAccumulatedBalance`, `fetchRecentTransactionsByName`, `syncFixedItemTransactions`) must guard against `t.skipped` docs, which lack `amount`/`name`.

### Monthly budget

The `settings/budget` Firestore doc holds `{amount, months}`: `amount` is the default expense budget applied to every month, `months` is an optional `{"YYYY-MM": amount}` map of per-month overrides (set via the 이번 달에만 적용 checkbox in `budgetModal.js`). `fetchBudget()` loads both into `state.budgetDefault` / `state.budgetMonths` and resolves `state.budget` for the current month (override wins). The summary bar is a 4-card hierarchy (`renderSummary()` in `js/app.js`): 이번달 잔액 hero card (`.sum-card.hero`, enlarged value), a combined 수입/지출 card (`.sum-card.duo`, two rows), 누적 잔액, and the budget card (`renderBudgetCard()`) with a progress bar (blue → orange at ≥80% → red over budget); clicking the budget card opens `js/modals/budgetModal.js`. All summary amounts carry the `원` suffix. The 설정 해제 button removes only the current month's override when one exists, otherwise removes just the default `amount` — `deleteBudget()` deletes the whole doc only when no per-month overrides remain, so other months' overrides survive. Saving with the checkbox **unchecked** while the current month has an override also clears that override (otherwise the override would keep winning and the save would look ignored). The `settings` collection must be allowed in `firestore.rules` (already included — re-paste rules into the console when deploying).

### Personal budget plans (예산안)

The `plan` view is a per-person salary allocation planner, independent of actual transactions and month navigation. Each of the two users has at most one plan in the `budget_plans` collection (doc ID = their email): `{owner, name(표시 이름, optional), income, items: [{name, amount}]}`. Card titles show `<name>의 예산안` when `name` is set, falling back to 내/상대 예산안; the owner's card is marked with a "나" tag. Both users can see both plans; the client only allows editing your own (Firestore rules allow either — enforcement is UI-level only). Item colors are auto-assigned by cycling `CATEGORIES.expense` colors in **saved order** (the view's sort bar reorders rows without reshuffling colors); the donut chart shows allocations plus remaining (or over-allocation in red). Edit-mode rows can be drag-reordered via pointer events — the handlers live on `document`, not `setPointerCapture`, because re-inserting the row mid-drag would release the capture — and the final DOM order is harvested by `syncDraft()`. The partner's card is found by taking the other entry in `ALLOWED_EMAILS`, so the view assumes exactly two allowlisted accounts. Edit mode re-renders the whole view on every row add/remove, so it first calls `syncDraft()` to harvest the live inputs back into `draft` — any new field added to the edit card must also be read there or it is lost on the next re-render. `fetchBudgetPlans()` swallows permission errors so the app still works if `budget_plans` is missing from the deployed rules — but the view will look empty; re-paste `firestore.rules` into the console when deploying this feature.

### 결혼 준비 탭 (wedding)

A fully **separate ledger** from the daily budget — wedding data never touches `transactions`, the aggregation caches, or `loadAllData()`. Four Firestore collections (`wedding_items/tasks/vendors/guests`, all in `firestore.rules` — re-paste to console when deploying) plus `settings/wedding` (`{date, totalBudget}`). All reads/writes live in `js/weddingDb.js`; fetches swallow permission errors into `state.wedding.loadError` (budget_plans strategy).

`js/views/wedding.js` is the shell: D-day header (`dDayInfo()` exported for testing), segment bar (예산|체크리스트|업체|하객, current segment in a module variable), and the budget segment; the other three segments live in `weddingChecklist/Vendors/Guests.js` as `render<Seg>Segment(container)`. Data loads **once on first tab entry** (`loaded` flag + `ensureLoaded()`), not per month — after a mutation, call the relevant `fetchWedding*()` then `renderWeddingView()`.

Key invariants:
- An item's spend is **derived** from its `payments` array (`itemSpent()`); never store a spent total. `payments` is saved wholesale from the modal's `draftPayments` copy — concurrent edits to one item are last-write-wins (accepted trade-off).
- `payer` is an email or `"both"`; guest `side` is an email (absolute — whose side the guest belongs to). Labels resolve via `ownerName()`.
- Checklist template seeding uses fixed doc IDs `tpl_<n>` + `setDoc` (idempotent, same strategy as fixed-item materialization) and is only offered from the empty state.
- Choosing a vendor (`status: "chosen"`) offers to write its price/`vendorId` into the same-category budget item, or create one.

### CSV import

`js/modals/csvModal.js` auto-detects Shinhan Card column headers using regex (`날짜|일자|거래일`, `금액|이용금액`, etc.) and writes directly to the `transactions` collection via `writeBatch` in chunks of 450 (bypassing the `db.js` mutation helpers, so it calls `invalidateBalanceCache()` itself). Each row gets a deterministic doc ID `csv_<date>_<amount>_<nameHash>_<occ>`, so re-importing the same CSV overwrites instead of duplicating (`occ` disambiguates genuinely identical rows within one file). After import, the caller must `fetchTransactions()` + `renderAll()` to refresh.

The importer reads the uploaded file as **EUC-KR**, not UTF-8 (`reader.readAsText(file, "euc-kr")`) — a UTF-8 CSV with Korean headers/values will mojibake and fail header detection.

### Shinhan `.xls` → CSV preprocessing

Raw Shinhan Card statements come as `.xls`, which `csvModal.js` cannot read. `tools/convert-shinhan-xls.ps1` converts them: it opens every `excel/*.xls` via the Excel COM object (so it requires Excel installed on Windows), drops cancelled rows, auto-categorizes each row with an industry+merchant keyword heuristic (`Get-Cat`, unmatched → `기타`), groups by `YYYY-MM`, and writes EUC-KR CSVs to `excel/converted/<YYYY-MM>.csv` with headers `날짜,가맹점,금액,구분,카테고리` — exactly what the importer's regex expects. To improve categorization, extend the keyword lists in `Get-Cat`. The `excel/` directory is gitignored (it holds personal statements).

### CSV export

The header 내보내기 button (`exportAllCsv()` in `js/app.js`) downloads **all** transactions via `fetchAllTransactions()` as a UTF-8 CSV with a BOM (`downloadCSV()` in `utils.js`) so Excel renders Korean correctly. Note the asymmetry: export is UTF-8+BOM, import expects EUC-KR.

## Design system (토스 스타일)

The UI follows a Toss-like look: light-gray page (`--bg`), white borderless cards with `--radius-lg` + `--shadow-card`, Toss-blue `--accent` for primary actions, income **blue** / expense **red** (`--income` / `--expense`), big bold amounts, and a global `button:active { scale }` press effect. All colors are CSS custom properties in `:root` at the top of `style.css`, with a full dark-theme override — **never hardcode colors in JS/HTML templates; use the tokens**, or dark mode breaks. Dark mode follows the system by default, but the header toggle button (`js/theme.js`) can force it via `<html data-theme="light|dark">` + `localStorage("theme")`; an inline script in `index.html` `<head>` re-applies the saved value before first paint. ⚠ The dark tokens exist as **two identical copies** in `style.css` (the `@media (prefers-color-scheme: dark)` block and the `:root[data-theme="dark"]` block) — when changing any dark token, update both. On mobile (≤768px) every `.modal` becomes a bottom sheet automatically; the confirm dialog (`.confirm-overlay`) is exempt and stays centered.

## Conventions

- Comments and UI strings are Korean. New code should match.
- Clickable non-`<button>` elements (transaction rows, calendar cells, stat bars, …) carry `role="button" tabindex="0"`; a global keydown handler in `js/app.js` (`setupGlobalKeys`) translates Enter/Space on `[role="button"]` into a click, and Escape closes the topmost open modal by clicking its `.modal-close`. New clickable divs must follow this pattern or they are keyboard-inaccessible.
- The list view's 전체 기간 mode renders at most 300 rows at a time (`LIST_CHUNK` + 더 보기 button in `list.js`) — don't regress it to a full render.
- `.kind-btn` is used by both the tx modal (변동/고정) and the fixed modal (지출/수입) — selectors touching it must stay scoped (`#txModal .kind-btn` / `#fixedTypeToggle .kind-btn`), never document-wide.
- All rendering is via `innerHTML` template strings, so any user-originated string (transaction name, memo, CSV merchant name) must be wrapped in `escapeHtml()` from `js/utils.js` before interpolation.
- Currency formatting goes through `fmtMoney()` (uses `toLocaleString("ko-KR")` on the absolute value) — sign is added by the caller.
- Categories live in `js/constants.js`. Always resolve via `getCategoryInfo(id, type)` so `type` (`"income"` vs `"expense"`) is honored — IDs are not unique across types (e.g. both lists could collide).
- Never use native `confirm()`/`alert()` — use `showConfirm()` from `js/utils.js` (returns a Promise<boolean>) and `showToast()`.
