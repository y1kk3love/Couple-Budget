// ================================================================
// js/weddingDb.js — 결혼 준비 탭 Firestore 읽기/쓰기
// 기존 db.js와 분리 — 월 스코프·집계 캐시와 무관한 독립 장부.
// fetch는 rules 미게시 시에도 앱이 죽지 않도록 오류를 삼키고
// state.wedding.loadError로 표시한다 (budget_plans와 같은 전략).
// ================================================================

import { db } from "../firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";
import { WEDDING_PERIODS, WEDDING_CHECKLIST_TEMPLATE } from "./constants.js";

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

// 드래그 정렬 결과 저장 — DOM 순서(orderedIds)대로 order를 다시 매기되,
// 실제로 바뀐 항목만 batch에 담아 커밋한다.
export async function saveWeddingItemOrders(orderedIds) {
  const batch = writeBatch(db);
  let changed = 0;
  orderedIds.forEach((id, i) => {
    const item = state.wedding.items.find(x => x.id === id);
    if (item && (item.order ?? 0) !== i) {
      batch.update(doc(db, "wedding_items", id), { order: i });
      changed++;
    }
  });
  if (changed) await batch.commit();
}

// ── 체크리스트 (wedding_tasks) ────────────────────────────────

const periodOrder = id => WEDDING_PERIODS.findIndex(p => p.id === id);

export async function fetchWeddingTasks() {
  try {
    const snap = await getDocs(collection(db, "wedding_tasks"));
    state.wedding.tasks = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        (periodOrder(a.period) - periodOrder(b.period)) || ((a.order ?? 0) - (b.order ?? 0)));
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingTask(data, id = null) {
  if (id) await updateDoc(doc(db, "wedding_tasks", id), data);
  else    await addDoc(collection(db, "wedding_tasks"), data);
}

export async function deleteWeddingTask(id) {
  await deleteDoc(doc(db, "wedding_tasks", id));
}

export async function toggleWeddingTask(id, done) {
  await updateDoc(doc(db, "wedding_tasks", id), { done });
}

// 표준 템플릿 시딩 — 문서 ID 고정(tpl_n) + setDoc → 두 명이 동시에 눌러도 중복 없음.
// UI에서 빈 목록일 때만 노출되므로 완료 상태를 덮어쓸 일도 없다.
export async function seedWeddingChecklist() {
  await Promise.all(WEDDING_CHECKLIST_TEMPLATE.map((t, i) =>
    setDoc(doc(db, "wedding_tasks", `tpl_${i}`),
      { title: t.title, period: t.period, done: false, memo: "", order: i })
  ));
}

// ── 업체 후보 (wedding_vendors) ───────────────────────────────

export async function fetchWeddingVendors() {
  try {
    const snap = await getDocs(collection(db, "wedding_vendors"));
    state.wedding.vendors = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  } catch { state.wedding.loadError = true; }
}

// 신규 저장 시 생성된 문서 ID를 반환한다 (확정 → 예산 항목 연결에 필요)
export async function saveWeddingVendor(data, id = null) {
  if (id) { await updateDoc(doc(db, "wedding_vendors", id), data); return id; }
  const ref = await addDoc(collection(db, "wedding_vendors"), data);
  return ref.id;
}

export async function deleteWeddingVendor(id) {
  await deleteDoc(doc(db, "wedding_vendors", id));
}

// ── 하객 (wedding_guests) ─────────────────────────────────────

export async function fetchWeddingGuests() {
  try {
    const snap = await getDocs(collection(db, "wedding_guests"));
    state.wedding.guests = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingGuest(data, id = null) {
  if (id) await updateDoc(doc(db, "wedding_guests", id), data);
  else    await addDoc(collection(db, "wedding_guests"), data);
}

export async function deleteWeddingGuest(id) {
  await deleteDoc(doc(db, "wedding_guests", id));
}

// ── 일정 (wedding_events) ─────────────────────────────────────
// 체촌·옷 픽업 같은 날짜 확정 약속. 메인 화면 배너·달력 마커에도 쓰여서
// 다른 결혼 데이터와 달리 로그인 시 1회 미리 로드된다 (app.js initApp).

export async function fetchWeddingEvents() {
  try {
    const snap = await getDocs(collection(db, "wedding_events"));
    state.wedding.events = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingEvent(data, id = null) {
  if (id) await updateDoc(doc(db, "wedding_events", id), data);
  else    await addDoc(collection(db, "wedding_events"), data);
}

export async function deleteWeddingEvent(id) {
  await deleteDoc(doc(db, "wedding_events", id));
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
