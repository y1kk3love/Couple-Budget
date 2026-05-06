// ================================================================
// js/db.js — Firestore 데이터 읽기/쓰기
// ================================================================

import { db } from "../firebase.js";
import {
  collection, doc,
  addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, setDoc,
  query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";

// ── 누적 잔액 캐시 ─────────────────────────────────────────────
// calcAccumulatedBalance는 transactions 컬렉션 전체를 스캔하므로
// 메모리 캐시로 월 이동 시 반복 비용을 줄인다.
// 모든 쓰기 경로에서 invalidate 호출.

const balanceCache = new Map();

export function invalidateBalanceCache() {
  balanceCache.clear();
}

// ── 거래 내역 ──────────────────────────────────────────────────

export async function fetchTransactions() {
  const q = query(
    collection(db, "transactions"),
    where("year",  "==", state.currentYear),
    where("month", "==", state.currentMonth),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  state.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addTransaction(data) {
  await addDoc(collection(db, "transactions"), data);
  invalidateBalanceCache();
}

export async function updateTransaction(id, data) {
  await updateDoc(doc(db, "transactions", id), data);
  invalidateBalanceCache();
}

export async function deleteTransaction(id) {
  await deleteDoc(doc(db, "transactions", id));
  invalidateBalanceCache();
}

// ── 고정비 ────────────────────────────────────────────────────

export async function fetchFixedItems() {
  const snap = await getDocs(collection(db, "fixed_items"));
  state.fixedItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveFixedItem(data, id = null) {
  if (id) {
    await updateDoc(doc(db, "fixed_items", id), data);
  } else {
    await addDoc(collection(db, "fixed_items"), data);
  }
}

export async function deleteFixedItem(id) {
  await deleteDoc(doc(db, "fixed_items", id));
  // 고정비에서 자동 생성된 거래는 그대로 두지만, 향후 보강 시 필요할 수 있어 무효화.
  invalidateBalanceCache();
}

// 현재 달(state.currentYear/Month) 이상의 자동생성 거래만 갱신.
// 과거 달은 실제 지출 기록이므로 고정비 금액·카테고리 변경 시에도 보존한다.
export async function syncFixedItemTransactions(id, data) {
  const q    = query(collection(db, "transactions"), where("fixedId", "==", id), where("fromFixed", "==", true));
  const snap = await getDocs(q);

  const currentYM = state.currentYear * 100 + state.currentMonth;

  await Promise.all(snap.docs.map(d => {
    const t = d.data();
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

// ── 고정비 → 이번 달 자동 적용 ────────────────────────────────
// Deterministic doc ID `fixed_<fixedId>_<YYYY-MM>` + setDoc → 동시 호출에도
// 멱등. 두 사용자가 같은 달에 동시에 접속해도 같은 문서가 덮어써질 뿐
// 중복 생성되지 않는다.

export async function applyFixedItemsToCurrentMonth() {
  const appliedIds = new Set(
    state.transactions
      .filter(t => t.fromFixed)
      .map(t => t.fixedId)
  );

  for (const item of state.fixedItems) {
    if (appliedIds.has(item.id)) continue;

    // 시작 연월 이전 달에는 적용하지 않음
    if (item.startYear && item.startMonth) {
      const itemStart    = item.startYear * 100 + item.startMonth;
      const currentYM   = state.currentYear * 100 + state.currentMonth;
      if (currentYM < itemStart) continue;
    }

    const lastDay    = new Date(state.currentYear, state.currentMonth, 0).getDate();
    const clampedDay = Math.min(item.day ?? 1, lastDay);
    const ym         = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
    const dateStr    = `${ym}-${String(clampedDay).padStart(2, "0")}`;
    const txId       = `fixed_${item.id}_${ym}`;
    await setDoc(doc(db, "transactions", txId), {
      name:      item.name,
      amount:    item.amount,
      type:      item.type,
      category:  item.category,
      kind:      "fixed",
      memo:      item.name,
      date:      dateStr,
      year:      state.currentYear,
      month:     state.currentMonth,
      fromFixed: true,
      fixedId:   item.id,
    });
    invalidateBalanceCache();
  }
}

// ── 예산 ──────────────────────────────────────────────────────

// ── 전체 데이터 초기화 ─────────────────────────────────────────

export async function clearAllData() {
  const cols = ["transactions", "fixed_items"];
  for (const col of cols) {
    const snap = await getDocs(collection(db, col));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }
  state.transactions = [];
  state.fixedItems   = [];
  invalidateBalanceCache();
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
      const n2 = t.name.toLowerCase();
      if (n2.includes(nameLower) || nameLower.includes(n2)) txs.push(t);
    });
  });

  return txs.sort((a, b) => b.date.localeCompare(a.date));
}

// ── 누적 잔액 계산 ─────────────────────────────────────────────

export async function calcAccumulatedBalance() {
  const cacheKey = `${state.currentYear}-${state.currentMonth}`;
  if (balanceCache.has(cacheKey)) return balanceCache.get(cacheKey);

  const snap = await getDocs(collection(db, "transactions"));
  let total = 0;

  for (const d of snap.docs) {
    const t = d.data();
    // 현재 달 이전 데이터만 합산
    if (t.year > state.currentYear) continue;
    if (t.year === state.currentYear && t.month >= state.currentMonth) continue;
    total += t.type === "income" ? t.amount : -t.amount;
  }

  balanceCache.set(cacheKey, total);
  return total;
}
