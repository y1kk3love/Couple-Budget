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

// apply*: 스냅샷 → state 반영. 조회(fetch*)와 실시간 리스너(sync.js)가 같은 정렬·변환을 쓰도록 분리
export function applyWeddingConfig(data) {
  state.wedding.config = data ?? null;
}

export async function fetchWeddingConfig() {
  try {
    const snap = await getDoc(doc(db, "settings", "wedding"));
    applyWeddingConfig(snap.exists() ? snap.data() : null);
  } catch { state.wedding.loadError = true; }
}

// 메모 최신본 — 저장 직전 상대의 수정 여부 확인용 (오류는 호출부로 던진다)
export async function readWeddingMemo() {
  const snap = await getDoc(doc(db, "settings", "wedding"));
  return snap.exists() ? (snap.data().memo ?? "") : "";
}

export async function saveWeddingConfig(data) {
  await setDoc(doc(db, "settings", "wedding"), data, { merge: true });
  state.wedding.config = { ...(state.wedding.config ?? {}), ...data };
}

// ── 예산 항목 (wedding_items) ─────────────────────────────────

export function applyWeddingItemDocs(docs) {
  state.wedding.items = docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function fetchWeddingItems() {
  try {
    applyWeddingItemDocs((await getDocs(collection(db, "wedding_items"))).docs);
  } catch { state.wedding.loadError = true; }
}

// 항목 하나의 최신본 — 저장 직전 상대의 수정 여부 확인용 (없으면 null, 오류는 호출부로)
export async function readWeddingItem(id) {
  const snap = await getDoc(doc(db, "wedding_items", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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

export function applyWeddingTaskDocs(docs) {
  state.wedding.tasks = docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (periodOrder(a.period) - periodOrder(b.period)) || ((a.order ?? 0) - (b.order ?? 0)));
}

export async function fetchWeddingTasks() {
  try {
    applyWeddingTaskDocs((await getDocs(collection(db, "wedding_tasks"))).docs);
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
// 버튼은 빈 목록일 때만 보이지만 화면의 목록이 오래됐을 수 있다 — 그 사이 상대가 불러와
// 체크해 둔 항목을 done:false로 되돌리지 않도록, 서버에 할 일이 하나라도 있으면 쓰지 않는다.
// 반환: 실제로 불러왔으면 true, 이미 있어서 건너뛰었으면 false
export async function seedWeddingChecklist() {
  const existing = await getDocs(collection(db, "wedding_tasks"));
  if (!existing.empty) return false;
  await Promise.all(WEDDING_CHECKLIST_TEMPLATE.map((t, i) =>
    setDoc(doc(db, "wedding_tasks", `tpl_${i}`),
      { title: t.title, period: t.period, done: false, memo: "", order: i })
  ));
  return true;
}

// ── 업체 후보 (wedding_vendors) ───────────────────────────────

export function applyWeddingVendorDocs(docs) {
  state.wedding.vendors = docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || (a.name ?? "").localeCompare(b.name ?? "", "ko"));
}

export async function fetchWeddingVendors() {
  try {
    applyWeddingVendorDocs((await getDocs(collection(db, "wedding_vendors"))).docs);
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

// ── 일정 (wedding_events) ─────────────────────────────────────
// 체촌·옷 픽업 같은 날짜 확정 약속. 메인 화면 배너·달력 마커에도 쓰여서
// 다른 결혼 데이터와 달리 로그인 시 1회 미리 로드된다 (app.js initApp).

export function applyWeddingEventDocs(docs) {
  state.wedding.events = docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
}

export async function fetchWeddingEvents() {
  try {
    applyWeddingEventDocs((await getDocs(collection(db, "wedding_events"))).docs);
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

// 결제 한 건의 정산된 금액 — settledAmount(부분 정산)가 원본이며,
// 그 필드가 없는 과거 기록은 settled 체크(true = 전액)로 해석. 결제 금액을 넘지 않게 클램프.
export function paymentSettled(p) {
  const amount = p.amount || 0;
  const raw = p.settledAmount ?? (p.settled ? amount : 0);
  return Math.max(0, Math.min(amount, raw || 0));
}

// 정산된 결제 금액 합 — 항목 모달에서 결제별로 입력한 정산 금액
export function itemSettled(item) {
  return (item.payments ?? []).reduce((s, p) => s + paymentSettled(p), 0);
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
