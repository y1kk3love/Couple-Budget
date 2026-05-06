# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is **no build step**. The app is plain ES modules served as static files; Firebase SDKs are loaded directly from `https://www.gstatic.com/firebasejs/10.12.0/`. Open `index.html` through any static server:

```powershell
python -m http.server 8000   # or:  npx http-server
```

There are no tests, linters, or package scripts. There is no `package.json`.

## Configuration that must exist before the app works

- `firebase.js` exports `firebaseConfig` (Firebase project keys) and `ALLOWED_EMAILS` (the only two Google accounts allowed to log in). The auth check is enforced both client-side (`js/auth.js`) and server-side (`firestore.rules`). When changing the allowlist, update **both** files — they are not derived from each other.
- `firestore.rules` must be pasted into the Firebase console; it is not deployed by anything in this repo.

## Architecture

Single-page app with one global mutable `state` object and a single `renderAll()` re-render function. There is no framework, no reactivity layer, and no router.

### Module layout and data flow

```
firebase.js              ← Firebase init + ALLOWED_EMAILS allowlist
js/state.js              ← single shared mutable state (currentYear/Month/View, transactions[], fixedItems[], currentUser)
js/constants.js          ← CATEGORIES (expense×10, income×4) + getCategoryInfo()
js/utils.js              ← fmtMoney, todayStr, showToast, emptyStateHTML
js/db.js                 ← all Firestore reads/writes; mutates state.transactions / state.fixedItems
js/auth.js               ← Google sign-in; on success calls initApp()
js/app.js                ← initApp(), loadAllData(), renderAll(), month nav, view switch
js/views/{calendar,list,stats,fixed}.js          ← each exports render<Name>View() that fills its #view-<name> div
js/modals/{txModal,fixedModal,csvModal}.js       ← setup<Name>Modal() wires DOM events; open<Name>Modal() opens it
```

Bootstrapping happens at the bottom of `js/app.js`: `setupAuth()` plus the three modal `setup*` calls run on module load. `auth.js` then calls `initApp()` once a permitted user signs in.

### The render cycle

All views read from `state` and write to their fixed `#view-<name>` div. Any mutation (add/edit/delete transaction, change fixed item, switch month) follows the same pattern:

1. mutate Firestore through a `db.js` function
2. `await fetchTransactions()` (and/or `fetchFixedItems()`) to refresh `state`
3. call `renderAll()` from `js/app.js`

`renderAll()` always rebuilds the summary bar plus the currently active view only. Views are not memoized — they `innerHTML =` their container each call and rebind listeners.

### Month scoping

`state.currentYear` / `state.currentMonth` define the active month. `fetchTransactions()` queries Firestore filtered by `year` and `month` fields, so transactions written elsewhere **must** include both fields or they will be invisible to the month view (the global `calcAccumulatedBalance()` in `db.js` is the only function that scans all transactions across months).

### Fixed items → transactions materialization

`fixed_items` are templates; they are materialized into the `transactions` collection on demand by `applyFixedItemsToCurrentMonth()` (called from `loadAllData()` every time the month changes). Each generated transaction is tagged `fromFixed: true` and `fixedId: <fixed_items.id>` so it is not re-applied. Important consequences:

- Editing a fixed item must call `syncFixedItemTransactions()` to propagate changes to already-materialized transactions.
- The day-of-month is clamped against the target month's last day (e.g. day 31 in February becomes 28/29).
- A fixed item's `startYear`/`startMonth` gates application; earlier months are skipped.

### CSV import

`js/modals/csvModal.js` auto-detects Shinhan Card column headers using regex (`날짜|일자|거래일`, `금액|이용금액`, etc.) and writes directly to the `transactions` collection (bypassing `db.js`). After import, the caller must `fetchTransactions()` + `renderAll()` to refresh.

## Conventions

- Comments and UI strings are Korean. New code should match.
- Currency formatting goes through `fmtMoney()` (uses `toLocaleString("ko-KR")` on the absolute value) — sign is added by the caller.
- Categories live in `js/constants.js`. Always resolve via `getCategoryInfo(id, type)` so `type` (`"income"` vs `"expense"`) is honored — IDs are not unique across types (e.g. both lists could collide).
