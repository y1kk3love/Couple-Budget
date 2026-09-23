// ================================================================
// js/db.js — Firestore 데이터 읽기/쓰기
// ================================================================

import { db } from "../firebase.js";
import {
  collection, doc,
  addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, setDoc, writeBatch,
  query, where, orderBy, deleteField, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";
import { ymKey } from "./utils.js";

// ── 집계 캐시 ──────────────────────────────────────────────────
// calcAccumulatedBalance / fetchMonthlySummary / fetchAllTransactions 모두
// 거래 변경 시 같이 무효화되어야 하므로 같은 invalidate 진입점을 공유한다.

const balanceCache         = new Map();
const monthlySummaryCache  = new Map();
let   allTxCache           = null;

export function invalidateBalanceCache() {
  balanceCache.clear();
  monthlySummaryCache.clear();
  allTxCache = null; // 실시간 사본(liveTx)이 있으면 네트워크 없이 다시 만든다
}

// ── 거래 실시간 사본 ──────────────────────────────────────────
// sync.js가 로그인 동안 transactions 전체에 리스너를 건다. 첫 스냅샷은 예전에 누적 잔액용으로
// 로그인마다 하던 전체 조회와 같은 비용이고, 이후에는 바뀐 문서만 받는다.
// 사본이 준비되면 월 목록·전체 기간·월별 합계를 네트워크 없이 여기서 만든다.
// 리스너가 실패하면 liveTx가 null로 돌아가 예전 조회 방식으로 계속 동작한다.

let liveTx    = null;  // 전체 거래(skip 마커 포함) — 리스너가 채움
let txUnsub   = null;
let liveReady = null;  // 첫 스냅샷 대기 (fetchAllTransactions가 중복 전체 조회를 피하려고 기다림)

// Firestore의 orderBy("date","desc")와 같은 순서 — 같은 날짜는 문서 ID 내림차순.
// 예전 skip 마커에는 date가 없으므로 빈 문자열로 취급한다
const byDateDesc = (a, b) =>
  (b.date ?? "").localeCompare(a.date ?? "") || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

// 실시간 사본에서 (y, m)의 목록을 만들어 state에 넣는다. 사본이 없으면 false.
function deriveMonth(y, m) {
  if (!liveTx) return false;
  const rows = liveTx.filter(t => t.year === y && t.month === m).sort(byDateDesc);
  state.skippedFixedIds = new Set(rows.filter(t => t.skipped).map(t => t.fixedId));
  state.transactions    = rows.filter(t => !t.skipped);
  state.transactionsYM  = ymKey(y, m);
  return true;
}

// onRemoteChange: 상대 기기에서 바뀐 스냅샷일 때만 호출 (내 쓰기의 즉시 반영 이벤트는 제외 —
// 내 저장 흐름이 스스로 재조회·렌더한다)
export function watchTransactions(onRemoteChange) {
  if (txUnsub) return;
  let resolveReady, rejectReady;
  liveReady = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  liveReady.catch(() => {}); // 기다리는 곳이 없을 때 unhandled rejection 방지
  let first = true;
  txUnsub = onSnapshot(collection(db, "transactions"), snap => {
    liveTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    invalidateBalanceCache();
    deriveMonth(state.currentYear, state.currentMonth);
    if (first) { first = false; resolveReady(); return; }
    if (!snap.metadata.hasPendingWrites) onRemoteChange();
  }, err => {
    console.warn("거래 실시간 동기화 중단 — 조회 방식으로 계속합니다:", err.code ?? err);
    txUnsub = null; liveTx = null; liveReady = null;
    rejectReady(err);
  });
}

export function unwatchTransactions() {
  txUnsub?.();
  txUnsub = null; liveTx = null; liveReady = null;
  invalidateBalanceCache();
}

// ── 거래 내역 ──────────────────────────────────────────────────

export async function fetchTransactions() {
  if (deriveMonth(state.currentYear, state.currentMonth)) return; // 실시간 사본이 있으면 조회 불필요
  const y = state.currentYear, m = state.currentMonth;
  const q = query(
    collection(db, "transactions"),
    where("year",  "==", y),
    where("month", "==", m),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);

  // 응답을 기다리는 사이 다른 달로 이동했으면 낡은 결과로 state를 덮지 않는다
  if (y !== state.currentYear || m !== state.currentMonth) return;

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // skip 마커(고정비 자동생성 거래를 사용자가 삭제한 흔적)는 화면에서 제외하고,
  // applyFixedItemsToMonth가 재생성하지 않도록 ID만 따로 보관한다.
  state.skippedFixedIds = new Set(rows.filter(t => t.skipped).map(t => t.fixedId));
  state.transactions    = rows.filter(t => !t.skipped);
  state.transactionsYM  = ymKey(y, m);
}

export async function addTransaction(data) {
  await addDoc(collection(db, "transactions"), data);
  invalidateBalanceCache();
}

export async function updateTransaction(id, data) {
  await updateDoc(doc(db, "transactions", id), data);
  invalidateBalanceCache();
}

// 같은 이름(+같은 수입/지출 타입)의 모든 거래에 카테고리를 일괄 적용.
// 전 기간 대상. excludeId(방금 직접 수정한 거래)와 skip 마커는 제외.
// 반환값: 함께 변경된 건수.
export async function updateCategoryByName(name, type, category, excludeId = null) {
  const q = query(
    collection(db, "transactions"),
    where("name", "==", name),
    where("type", "==", type)
  );
  const snap = await getDocs(q);

  const targets = snap.docs.filter(d => {
    if (d.id === excludeId) return false;
    const t = d.data();
    return !t.skipped && t.category !== category;
  });
  if (!targets.length) return 0;

  const batch = writeBatch(db);
  targets.forEach(d => batch.update(d.ref, { category }));
  await batch.commit();
  invalidateBalanceCache();
  return targets.length;
}

export async function deleteTransaction(id) {
  // 전체 기간 목록에서 삭제하는 경우 state.transactions(현재 달)에 없을 수 있어
  // 문서를 직접 읽어 고정비 자동생성 여부를 확인한다.
  let t = state.transactions.find(x => x.id === id);
  if (!t) {
    const snap = await getDoc(doc(db, "transactions", id));
    t = snap.exists() ? snap.data() : null;
  }

  if (t?.fromFixed && t.fixedId) {
    // 고정비 자동생성 거래는 문서를 지우면 다음 방문 때 결정적 ID로 되살아난다.
    // 대신 같은 ID를 skip 마커로 덮어써 "이 달은 건너뛰기"를 기록한다.
    // date를 꼭 남긴다 — Firestore의 orderBy("date")는 date가 없는 문서를 결과에서 빼므로,
    // 없으면 월 조회(fetchTransactions)에 마커가 잡히지 않는다.
    await setDoc(doc(db, "transactions", id), {
      fixedId:   t.fixedId,
      year:      t.year,
      month:     t.month,
      date:      t.date,
      fromFixed: true,
      skipped:   true,
    });
  } else {
    await deleteDoc(doc(db, "transactions", id));
  }
  invalidateBalanceCache();
}

// 고정비 자동생성 거래를 다른 달로 옮길 때 사용.
// 결정적 ID 문서의 연·월만 바꾸면 원래 달에서 그 고정비가 "미적용"으로 보여
// 다음 방문 때 같은 ID로 다시 생성되며 옮긴 거래를 덮어쓴다. 그래서
//  - 원래 달의 ID는 skip 마커로 덮어 "이 달은 처리됨"을 남기고
//  - 옮긴 내용은 새 ID의 일반 거래로 기록한다 (fromFixed를 떼야 옮긴 달의
//    고정비 자동 적용을 막지 않고, 이후 고정비 수정 동기화에도 휩쓸리지 않는다).
// tx: 수정 전 원본 거래, data: 모달에서 수정한 값
export async function moveFixedTransaction(id, tx, data) {
  const batch = writeBatch(db);
  batch.set(doc(db, "transactions", id), {
    fixedId:   tx.fixedId,
    year:      tx.year,
    month:     tx.month,
    date:      tx.date, // 월 조회(orderBy date)에 잡히도록 — deleteTransaction 참고
    fromFixed: true,
    skipped:   true,
  });
  const moved = { ...data };
  if (tx.owner) moved.owner = tx.owner;
  batch.set(doc(collection(db, "transactions")), moved);
  await batch.commit();
  invalidateBalanceCache();
}

// ── 고정비 ────────────────────────────────────────────────────

// 조회와 실시간 리스너(sync.js)가 같은 변환을 쓰도록 스냅샷 → state 반영을 분리
export function applyFixedItemDocs(docs) {
  state.fixedItems = docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchFixedItems() {
  applyFixedItemDocs((await getDocs(collection(db, "fixed_items"))).docs);
}

export async function saveFixedItem(data, id = null) {
  if (id) {
    await updateDoc(doc(db, "fixed_items", id), data);
  } else {
    await addDoc(collection(db, "fixed_items"), data);
  }
}

// 실제 오늘 기준 이번 달 (YYYY*100+MM) — 고정비 동기화·삭제가 "과거 기록"을 가르는 기준.
// 화면에서 보고 있는 달이 아니다.
function realCurrentYM() {
  const today = new Date();
  return today.getFullYear() * 100 + today.getMonth() + 1;
}

// 고정비 삭제 — 이번 달까지 기록된 자동생성 거래는 실제 기록이라 남기고,
// 다음 달 이후에 미리 만들어진 복사본(미래 달을 한 번 열어 보면 생긴다)과
// 그 달들의 skip 마커는 함께 지운다. 예전에는 템플릿만 지워서, 해지한 고정비가
// 이미 열어 본 미래 달의 예산·잔액에 계속 잡혔다.
export async function deleteFixedItem(id) {
  const snap = await getDocs(query(
    collection(db, "transactions"),
    where("fixedId", "==", id),
    where("fromFixed", "==", true)
  ));
  const currentYM = realCurrentYM();
  const refs = snap.docs
    .filter(d => d.data().year * 100 + d.data().month > currentYM)
    .map(d => d.ref);
  refs.push(doc(db, "fixed_items", id)); // 템플릿은 마지막 청크에서 지운다

  // writeBatch 한도(500) 여유를 두고 450개씩 — 실패해도 템플릿이 남아 다시 시도할 수 있다
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach(r => batch.delete(r));
    await batch.commit();
  }
  invalidateBalanceCache();
}

// 실제 이번 달(오늘 기준) 이상의 자동생성 거래만 갱신.
// 과거 달은 실제 지출 기록이므로 고정비 금액·카테고리 변경 시에도 보존한다.
// ⚠ 화면에서 보고 있는 달(state.currentYear/Month)을 기준으로 삼으면, 과거 달을 보면서
//   고정비를 고쳤을 때 그 달부터 이번 달까지의 기록이 전부 새 금액으로 바뀐다.
export async function syncFixedItemTransactions(id, data) {
  const q    = query(collection(db, "transactions"), where("fixedId", "==", id), where("fromFixed", "==", true));
  const snap = await getDocs(q);

  const currentYM = realCurrentYM();

  await Promise.all(snap.docs.map(d => {
    const t = d.data();
    if (t.skipped) return null; // 삭제(건너뛰기)된 달은 갱신하지 않음
    if ((t.year * 100 + t.month) < currentYM) return null;

    const lastDay    = new Date(t.year, t.month, 0).getDate();
    const clampedDay = Math.min(data.day ?? 1, lastDay);
    const dateStr    = `${t.year}-${String(t.month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;

    return updateDoc(d.ref, {
      name:     data.name,
      amount:   data.amount,
      type:     data.type,
      category: data.category,
      memo:     data.name,
      date:     dateStr,
    });
  }));
  invalidateBalanceCache();
}

// ── 고정비 → 해당 달 자동 적용 ────────────────────────────────
// Deterministic doc ID `fixed_<fixedId>_<YYYY-MM>` → 동시 호출에도 멱등. 두 사용자가
// 같은 달에 동시에 접속해도 같은 문서가 쓰일 뿐 중복 생성되지 않는다.
//
// 대상 달을 인자로 받는다 — 전역의 "보고 있는 달"을 읽으면, 적용 도중 사용자가
// 월을 옮겼을 때 남은 항목이 엉뚱한 달에 기록된다. 적용 여부 판단에 쓰는
// state.transactions도 그 달의 조회 결과일 때만 믿고, 시작 시점에 사본으로 고정한다.

export async function applyFixedItemsToMonth(year, month) {
  const ym = ymKey(year, month);
  // 그 사이 다른 달이 조회됐으면 이 달의 적용 여부를 판단할 수 없다 — 그 달의 로드가 따로 적용한다
  if (state.transactionsYM !== ym) return;

  const txId = item => `fixed_${item.id}_${ym}`;
  // 이 달의 결정적 ID를 가진 문서만 "적용됨"으로 센다
  const appliedIds = new Set(
    state.transactions.filter(t => t.fromFixed && t.id === `fixed_${t.fixedId}_${ym}`).map(t => t.fixedId)
  );
  const skipped   = new Set(state.skippedFixedIds); // 이 달에 사용자가 삭제한 항목
  const targetYM  = year * 100 + month;
  const lastDay   = new Date(year, month, 0).getDate();

  const pending = state.fixedItems.filter(item => {
    if (appliedIds.has(item.id) || skipped.has(item.id)) return false;
    // 시작 연월 이전 달에는 적용하지 않음
    if (item.startYear && item.startMonth && targetYM < item.startYear * 100 + item.startMonth) return false;
    return true;
  });

  let wrote = 0;
  await Promise.all(pending.map(async item => {
    const ref = doc(db, "transactions", txId(item));
    // 이미 문서가 있으면 덮어쓰지 않는다. 이 달 조회에 안 잡혔는데 문서가 있다는 건
    // 예전에 다른 달로 옮겨진 거래라는 뜻 — 덮어쓰면 옮긴 기록이 사라진다.
    if ((await getDoc(ref)).exists()) return;
    await setDoc(ref, {
      name:      item.name,
      amount:    item.amount,
      type:      item.type,
      category:  item.category,
      kind:      "fixed",
      memo:      item.name,
      date:      `${ym}-${String(Math.min(item.day ?? 1, lastDay)).padStart(2, "0")}`,
      year,
      month,
      fromFixed: true,
      fixedId:   item.id,
    });
    wrote++;
  }));
  if (wrote) invalidateBalanceCache();
}

// ── 최근 N개월 이름 유사 거래 조회 ────────────────────────────

export async function fetchRecentTransactionsByName(name, excludeId = null, n = 3) {
  const months = [];
  for (let i = 0; i < n; i++) {
    let m = state.currentMonth - i;
    let y = state.currentYear;
    while (m < 1) { m += 12; y--; }
    months.push({ year: y, month: m });
  }

  const results = await Promise.all(months.map(({ year, month }) =>
    getDocs(query(
      collection(db, "transactions"),
      where("year",  "==", year),
      where("month", "==", month)
    ))
  ));

  const nameLower = name.toLowerCase();
  const txs = [];
  results.forEach(snap => {
    snap.docs.forEach(d => {
      if (d.id === excludeId) return;
      const t = { id: d.id, ...d.data() };
      if (t.skipped) return; // skip 마커는 name이 없음
      const n2 = t.name.toLowerCase();
      if (n2.includes(nameLower) || nameLower.includes(n2)) txs.push(t);
    });
  });

  return txs.sort((a, b) => b.date.localeCompare(a.date));
}

// ── 최근 N개월 수입/지출 합계 ─────────────────────────────────

export async function fetchMonthlySummary(months = 6) {
  const cacheKey = `${state.currentYear}-${state.currentMonth}-${months}`;
  if (monthlySummaryCache.has(cacheKey)) return monthlySummaryCache.get(cacheKey);

  // 현재 달 포함 N개월 (오래된 → 최신 순)
  const monthsList = [];
  for (let i = months - 1; i >= 0; i--) {
    let m = state.currentMonth - i;
    let y = state.currentYear;
    while (m < 1) { m += 12; y--; }
    monthsList.push({ year: y, month: m });
  }

  // 실시간 사본이 있으면 네트워크 없이 계산 (없으면 달마다 조회)
  const results = liveTx
    ? monthsList.map(({ year, month }) => liveTx.filter(t => t.year === year && t.month === month))
    : (await Promise.all(monthsList.map(({ year, month }) =>
        getDocs(query(
          collection(db, "transactions"),
          where("year",  "==", year),
          where("month", "==", month)
        ))
      ))).map(snap => snap.docs.map(d => d.data()));

  const summary = monthsList.map((m, i) => {
    let income = 0, expense = 0;
    const expenseByCategory = {};
    results[i].forEach(t => {
      if (t.type === "income") {
        income += t.amount;
      } else if (t.type === "expense") {
        expense += t.amount;
        expenseByCategory[t.category] = (expenseByCategory[t.category] ?? 0) + t.amount;
      }
    });
    return { ...m, income, expense, expenseByCategory };
  });

  monthlySummaryCache.set(cacheKey, summary);
  return summary;
}

// ── 월 예산 (settings/budget 단일 문서) ───────────────────────
// 문서 형태: { amount: 기본 예산(매달 동일), months: {"YYYY-MM": 그 달 전용 예산} }
// 현재 달 예산(state.budget)은 월별 전용 값이 있으면 그것을, 없으면 기본값을 쓴다.

function currentYM() {
  return `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
}

function resolveBudget() {
  state.budget = state.budgetMonths[currentYM()] ?? state.budgetDefault;
}

// settings/budget 문서 내용 → state (조회·실시간 리스너 공용). 문서가 없으면 {}
export function applyBudgetDoc(data) {
  state.budgetDefault = data?.amount ?? null;
  state.budgetMonths  = data?.months ?? {};
  resolveBudget();
}

export async function fetchBudget() {
  const snap = await getDoc(doc(db, "settings", "budget"));
  applyBudgetDoc(snap.exists() ? snap.data() : {});
}

export async function saveBudget(amount) {
  await setDoc(doc(db, "settings", "budget"), { amount }, { merge: true });
  state.budgetDefault = amount;
  resolveBudget();
}

export async function saveMonthBudget(amount) {
  const ym = currentYM();
  await setDoc(doc(db, "settings", "budget"), { months: { [ym]: amount } }, { merge: true });
  state.budgetMonths[ym] = amount;
  resolveBudget();
}

export async function deleteMonthBudget() {
  const ym = currentYM();
  await updateDoc(doc(db, "settings", "budget"), { [`months.${ym}`]: deleteField() });
  delete state.budgetMonths[ym];
  resolveBudget();
}

export async function deleteBudget() {
  // 다른 달의 월별 전용 예산이 남아 있으면 문서를 통째로 지우지 않고 기본 예산만 제거한다
  if (Object.keys(state.budgetMonths).length > 0) {
    await updateDoc(doc(db, "settings", "budget"), { amount: deleteField() });
  } else {
    await deleteDoc(doc(db, "settings", "budget"));
  }
  state.budgetDefault = null;
  resolveBudget();
}

// ── 개인 예산안 (budget_plans, 문서 ID = 이메일) ───────────────
// 월급에서 항목별 배정을 미리 짜보는 계획표. 월과 무관하게 1인 1문서 유지.

export function applyBudgetPlanDocs(docs) {
  state.budgetPlans = docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchBudgetPlans() {
  try {
    applyBudgetPlanDocs((await getDocs(collection(db, "budget_plans"))).docs);
  } catch {
    // rules에 budget_plans가 아직 게시되지 않은 경우 앱 전체가 죽지 않도록 무시
    state.budgetPlans = [];
  }
}

export async function saveBudgetPlan(email, data) {
  await setDoc(doc(db, "budget_plans", email), data);
}

// ── 전체 기간 거래 조회 (전체 검색·CSV 내보내기) ───────────────
// skip 마커 제외, 최신 날짜순. 거래 변경 시 invalidateBalanceCache로 무효화된다.

export async function fetchAllTransactions() {
  if (allTxCache) return allTxCache;
  // 리스너의 첫 스냅샷이 곧 올 예정이면 같은 전체 조회를 두 번 하지 않도록 잠시 기다린다.
  // 오프라인이면 첫 스냅샷이 오지 않으므로 오래 기다리지 않고 직접 조회로 넘어간다(실패하면 호출부가 처리).
  if (!liveTx && liveReady) {
    try { await Promise.race([liveReady, new Promise(r => setTimeout(r, 4000))]); } catch { /* 직접 조회 */ }
  }
  const rows = liveTx ?? (await getDocs(collection(db, "transactions"))).docs.map(d => ({ id: d.id, ...d.data() }));
  allTxCache = rows.filter(t => !t.skipped).sort(byDateDesc);
  return allTxCache;
}

// ── 누적 잔액 계산 ─────────────────────────────────────────────

export async function calcAccumulatedBalance() {
  const cacheKey = `${state.currentYear}-${state.currentMonth}`;
  if (balanceCache.has(cacheKey)) return balanceCache.get(cacheKey);

  // 전체 거래 캐시(allTxCache)를 재사용해 별도의 전체 스캔을 피한다.
  // fetchAllTransactions가 skip 마커를 이미 걸러준다.
  const txs = await fetchAllTransactions();
  let total = 0;

  for (const t of txs) {
    // 현재 달 이전 데이터만 합산
    if (t.year > state.currentYear) continue;
    if (t.year === state.currentYear && t.month >= state.currentMonth) continue;
    total += t.type === "income" ? t.amount : -t.amount;
  }

  balanceCache.set(cacheKey, total);
  return total;
}
