# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is **no build step**. The app is plain ES modules served as static files; Firebase SDKs are loaded directly from `https://www.gstatic.com/firebasejs/10.12.0/`. Open `index.html` through any static server:

```powershell
python -m http.server 8000   # or:  npx http-server
```

There are no tests, linters, or package scripts. There is no `package.json`.

## Deployment

The app is served by **GitHub Pages** (deploy-from-branch; there is no workflow file). Pushing to `main` triggers a Pages build automatically. Pages builds occasionally get stuck — the fix used historically is an empty commit (`git commit --allow-empty`) to retrigger. Note that `firebase.js` (including the Firebase keys) is committed and public; access control relies entirely on the `ALLOWED_EMAILS` allowlist and `firestore.rules`, not on config secrecy.

## Configuration that must exist before the app works

- `firebase.js` exports `firebaseConfig` (Firebase project keys) and `ALLOWED_EMAILS` (the only two Google accounts allowed to log in). The auth check is enforced both client-side (`js/auth.js`) and server-side (`firestore.rules`). When changing the allowlist, update **both** files — they are not derived from each other.
- `firestore.rules` must be pasted into the Firebase console; it is not deployed by anything in this repo.

## Architecture

Single-page app with one global mutable `state` object and a single `renderAll()` re-render function. There is no framework, no reactivity layer, and no router.

### Module layout and data flow

```
firebase.js              ← Firebase init + ALLOWED_EMAILS allowlist
js/state.js              ← single shared mutable state (currentYear/Month/View, transactions[], fixedItems[], currentUser)
js/constants.js          ← CATEGORIES (expense×12, income×4) + getCategoryInfo()
js/utils.js              ← fmtMoney, escapeHtml, todayStr, showToast, emptyStateHTML
js/db.js                 ← all Firestore reads/writes; mutates state.transactions / state.fixedItems
js/auth.js               ← Google sign-in; on success calls initApp()
js/app.js                ← initApp(), loadAllData(), renderAll(), month nav, view switch
js/views/{calendar,list,stats,fixed,plan}.js     ← each exports render<Name>View() that fills its #view-<name> div
js/modals/{txModal,fixedModal,csvModal,budgetModal}.js  ← setup<Name>Modal() wires DOM events; open<Name>Modal() opens it
```

Bootstrapping happens at the bottom of `js/app.js`: `setupAuth()`, the four modal `setup*` calls, and `setupCategoryDetailModal()` (exported from `js/views/stats.js`, not a `js/modals/` file) run on module load. `auth.js` then calls `initApp()` once a permitted user signs in. Because `onAuthStateChanged` re-fires on every re-login, `initApp()` guards its one-time listener registration behind a `listenersBound` flag — new global listeners belong inside that guard (or must follow the rebind-per-render pattern), or they will fire once per past login on each click.

### The render cycle

All views read from `state` and write to their fixed `#view-<name>` div. Any mutation (add/edit/delete transaction, change fixed item, switch month) follows the same pattern:

1. mutate Firestore through a `db.js` function
2. `await fetchTransactions()` (and/or `fetchFixedItems()`) to refresh `state`
3. call `renderAll()` from `js/app.js`

`renderAll()` always rebuilds the summary bar plus the currently active view only. Views are not memoized — they `innerHTML =` their container each call and rebind listeners.

### Aggregation caches

`db.js` keeps two module-level `Map` caches — `balanceCache` (for `calcAccumulatedBalance()`) and `monthlySummaryCache` (for `fetchMonthlySummary()`, used by the stats view). Both are cleared only through `invalidateBalanceCache()`. **Any code that writes to the `transactions` collection must call `invalidateBalanceCache()` afterwards** — the `db.js` mutation helpers already do, but code writing directly to Firestore (e.g. `csvModal.js`) must call it explicitly, or the summary bar / stats will show stale numbers until reload.

### Transaction names and category propagation

The tx modal has no name input: a transaction's `name` is the trimmed memo, falling back to the category label (`txModal.js` save handler). `name` drives the tx modal's recent-history suggestions (`fetchRecentTransactionsByName()`) and category propagation: when an edit changes a transaction's category, `updateCategoryByName()` batch-applies the new category to **every** transaction with the same `name`+`type` across all months. This app-wide side effect is intentional (a merchant's category correction should apply everywhere) — keep it in mind when touching the edit flow.

### Month scoping

`state.currentYear` / `state.currentMonth` define the active month. `fetchTransactions()` queries Firestore filtered by `year` and `month` fields, so transactions written elsewhere **must** include both fields or they will be invisible to the month view. Only three `db.js` functions look beyond the current month: `calcAccumulatedBalance()` (scans all transactions), `fetchMonthlySummary()` (last N months, stats view), and `fetchRecentTransactionsByName()` (last N months, tx modal suggestions).

### Fixed items → transactions materialization

`fixed_items` are templates; they are materialized into the `transactions` collection on demand by `applyFixedItemsToCurrentMonth()` (called from `loadAllData()` every time the month changes). Each generated transaction uses the deterministic doc ID `fixed_<fixedId>_<YYYY-MM>` written with `setDoc`, so concurrent sessions overwrite the same doc instead of duplicating it, and is tagged `fromFixed: true` / `fixedId` so it is skipped on re-apply. Important consequences:

- Editing a fixed item must call `syncFixedItemTransactions()` to propagate changes to already-materialized transactions — but it deliberately only touches the current month and later; past months are preserved as historical record.
- The day-of-month is clamped against the target month's last day (e.g. day 31 in February becomes 28/29).
- A fixed item's `startYear`/`startMonth` gates application; earlier months are skipped.
- Deleting a materialized fixed transaction does **not** delete the doc — `deleteTransaction()` overwrites it with a skip marker (`{skipped: true, fixedId, year, month, fromFixed: true}`, no amount/name) so the deterministic ID can't resurrect it. `fetchTransactions()` filters skip markers out of `state.transactions` and collects them into `state.skippedFixedIds`; all-collection scans (`calcAccumulatedBalance`, `fetchRecentTransactionsByName`, `syncFixedItemTransactions`) must guard against `t.skipped` docs, which lack `amount`/`name`.

### Monthly budget

A single expense budget (same amount every month) lives in the `settings/budget` Firestore doc as `{amount}`, loaded into `state.budget` by `fetchBudget()` on every `loadAllData()`. The summary bar renders a fifth card (`renderBudgetCard()` in `js/app.js`) with a progress bar (green → orange at ≥80% → red over budget); clicking it opens `js/modals/budgetModal.js`. The `settings` collection must be allowed in `firestore.rules` (already included — re-paste rules into the console when deploying).

### Personal budget plans (예산안)

The `plan` view is a per-person salary allocation planner, independent of actual transactions and month navigation. Each of the two users has at most one plan in the `budget_plans` collection (doc ID = their email): `{owner, name(표시 이름, optional), income, items: [{name, amount}]}`. Card titles show `<name>의 예산안` when `name` is set, falling back to 내/상대 예산안; the owner's card is marked with a "나" tag. Both users can see both plans; the client only allows editing your own (Firestore rules allow either — enforcement is UI-level only). Item colors are auto-assigned by cycling `CATEGORIES.expense` colors; the donut chart shows allocations plus remaining (or over-allocation in red). `fetchBudgetPlans()` swallows permission errors so the app still works if `budget_plans` is missing from the deployed rules — but the view will look empty; re-paste `firestore.rules` into the console when deploying this feature.

### CSV import

`js/modals/csvModal.js` auto-detects Shinhan Card column headers using regex (`날짜|일자|거래일`, `금액|이용금액`, etc.) and writes directly to the `transactions` collection via `writeBatch` in chunks of 450 (bypassing the `db.js` mutation helpers, so it calls `invalidateBalanceCache()` itself). Each row gets a deterministic doc ID `csv_<date>_<amount>_<nameHash>_<occ>`, so re-importing the same CSV overwrites instead of duplicating (`occ` disambiguates genuinely identical rows within one file). After import, the caller must `fetchTransactions()` + `renderAll()` to refresh.

The importer reads the uploaded file as **EUC-KR**, not UTF-8 (`reader.readAsText(file, "euc-kr")`) — a UTF-8 CSV with Korean headers/values will mojibake and fail header detection.

### Shinhan `.xls` → CSV preprocessing

Raw Shinhan Card statements come as `.xls`, which `csvModal.js` cannot read. `tools/convert-shinhan-xls.ps1` converts them: it opens every `excel/*.xls` via the Excel COM object (so it requires Excel installed on Windows), drops cancelled rows, auto-categorizes each row with an industry+merchant keyword heuristic (`Get-Cat`, unmatched → `기타`), groups by `YYYY-MM`, and writes EUC-KR CSVs to `excel/converted/<YYYY-MM>.csv` with headers `날짜,가맹점,금액,구분,카테고리` — exactly what the importer's regex expects. To improve categorization, extend the keyword lists in `Get-Cat`. The `excel/` directory is gitignored (it holds personal statements).

## Conventions

- Comments and UI strings are Korean. New code should match.
- All rendering is via `innerHTML` template strings, so any user-originated string (transaction name, memo, CSV merchant name) must be wrapped in `escapeHtml()` from `js/utils.js` before interpolation.
- Currency formatting goes through `fmtMoney()` (uses `toLocaleString("ko-KR")` on the absolute value) — sign is added by the caller.
- Categories live in `js/constants.js`. Always resolve via `getCategoryInfo(id, type)` so `type` (`"income"` vs `"expense"`) is honored — IDs are not unique across types (e.g. both lists could collide).
