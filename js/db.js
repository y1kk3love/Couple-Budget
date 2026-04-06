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
}

export async function updateTransaction(id, data) {
  await updateDoc(doc(db, "transactions", id), data);
}

export async function deleteTransaction(id) {
  await deleteDoc(doc(db, "transactions", id));
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
}

export async function syncFixedItemTransactions(id, data) {
  const q    = query(collection(db, "transactions"), where("fixedId", "==", id), where("fromFixed", "==", true));
  const snap = await getDocs(q);

  await Promise.all(snap.docs.map(d => {
    const t = d.data();
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
}

// ── 고정비 → 이번 달 자동 적용 ────────────────────────────────

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
    const dateStr    = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
    await addDoc(collection(db, "transactions"), {
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
  }
}

// ── 예산 ──────────────────────────────────────────────────────

export async function fetchBudgets() {
  const docRef = doc(db, "budgets", "default");
  const snap   = await getDoc(docRef);
  state.budgets = snap.exists() ? snap.data() : {};
}

export async function saveBudgetCategory(category, amount) {
  const docRef = doc(db, "budgets", "default");
  state.budgets[category] = amount;
  await setDoc(docRef, state.budgets, { merge: true });
}

// ── 전체 데이터 초기화 ─────────────────────────────────────────

export async function clearAllData() {
  const cols = ["transactions", "fixed_items", "budgets"];
  for (const col of cols) {
    const snap = await getDocs(collection(db, col));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }
  state.transactions = [];
  state.fixedItems   = [];
  state.budgets      = {};
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

// ── 최근 N개월 카테고리별 지출 조회 ───────────────────────────

export async function fetchRecentMonthsExpenses(n = 6) {
  // 현재 달 포함 최근 n개월의 year/month 쌍 계산
  const months = [];
  for (let i = 0; i < n; i++) {
    let m = state.currentMonth - i;
    let y = state.currentYear;
    while (m < 1) { m += 12; y--; }
    months.unshift({ year: y, month: m });
  }

  // 각 월별 병렬 조회
  const results = await Promise.all(months.map(({ year, month }) =>
    getDocs(query(
      collection(db, "transactions"),
      where("year",  "==", year),
      where("month", "==", month),
      where("type",  "==", "expense")
    ))
  ));

  // { "YYYY-M": { catId: amount, ... } } 형태로 반환
  const data = {};
  months.forEach(({ year, month }, i) => {
    const key = `${year}-${month}`;
    data[key] = {};
    results[i].docs.forEach(d => {
      const t = d.data();
      data[key][t.category] = (data[key][t.category] ?? 0) + t.amount;
    });
  });
  return { months, data };
}

// ── 누적 잔액 계산 ─────────────────────────────────────────────

export async function calcAccumulatedBalance() {
  const snap = await getDocs(collection(db, "transactions"));
  let total = 0;

  for (const d of snap.docs) {
    const t = d.data();
    // 현재 달 이전 데이터만 합산
    if (t.year > state.currentYear) continue;
    if (t.year === state.currentYear && t.month >= state.currentMonth) continue;
    total += t.type === "income" ? t.amount : -t.amount;
  }
  return total;
}
