// ================================================================
// js/weddingDb.js — 결혼 준비 탭 Firestore 읽기/쓰기
// 기존 db.js와 분리 — 월 스코프·집계 캐시와 무관한 독립 장부.
// fetch는 rules 미게시 시에도 앱이 죽지 않도록 오류를 삼키고
// state.wedding.loadError로 표시한다 (budget_plans와 같은 전략).
// ================================================================

import { db } from "../firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";

// ── 설정 (settings/wedding) ───────────────────────────────────

export async function fetchWeddingConfig() {
  try {
    const snap = await getDoc(doc(db, "settings", "wedding"));
    state.wedding.config = snap.exists() ? snap.data() : null;
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingConfig(data) {
  await setDoc(doc(db, "settings", "wedding"), data, { merge: true });
  state.wedding.config = { ...(state.wedding.config ?? {}), ...data };
}

// ── 예산 항목 (wedding_items) ─────────────────────────────────

export async function fetchWeddingItems() {
  try {
    const snap = await getDocs(collection(db, "wedding_items"));
    state.wedding.items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingItem(data, id = null) {
  if (id) await updateDoc(doc(db, "wedding_items", id), data);
  else    await addDoc(collection(db, "wedding_items"), data);
}

export async function deleteWeddingItem(id) {
  await deleteDoc(doc(db, "wedding_items", id));
}

// ── 파생 합계 — payments 배열이 지출의 유일한 원본 ─────────────

export function itemSpent(item) {
  return (item.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
}

export function weddingTotals(items) {
  const totals = { planned: 0, spent: 0, byPayer: {} };
  for (const it of items) {
    const spent = itemSpent(it);
    totals.planned += it.planned || 0;
    totals.spent   += spent;
    const key = it.payer ?? "both";
    totals.byPayer[key] = (totals.byPayer[key] ?? 0) + spent;
  }
  return totals;
}
