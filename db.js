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

// ── 고정비 → 이번 달 자동 적용 ────────────────────────────────

export async function applyFixedItemsToCurrentMonth() {
  const appliedIds = new Set(
    state.transactions
      .filter(t => t.fromFixed)
      .map(t => t.fixedId)
  );

  for (const item of state.fixedItems) {
    if (appliedIds.has(item.id)) continue;

    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}-01`;
    await addDoc(collection(db, "transactions"), {
      name:      item.name,
      amount:    item.amount,
      type:      item.type,
      category:  item.category,
      kind:      "fixed",
      memo:      "고정비 자동 적용",
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
  const docRef = doc(db, "budgets", `${state.currentYear}-${state.currentMonth}`);
  const snap   = await getDoc(docRef);
  state.budgets = snap.exists() ? snap.data() : {};
}

export async function saveBudgetCategory(category, amount) {
  const docRef = doc(db, "budgets", `${state.currentYear}-${state.currentMonth}`);
  state.budgets[category] = amount;
  await setDoc(docRef, state.budgets, { merge: true });
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
