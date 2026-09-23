// ================================================================
// js/sync.js — 실시간 동기화 (상대가 다른 기기에서 바꾼 내용을 새로고침 없이 반영)
// 로그인 동안 Firestore 리스너를 걸어 state를 최신으로 유지하고, 상대의 변경이면
// 화면을 다시 그린다. 내 쓰기의 즉시 반영 이벤트(hasPendingWrites)는 다시 그리지 않는다 —
// 내 저장 흐름이 스스로 재조회·렌더하기 때문.
// 리스너가 실패해도(rules 미게시 등) 그 데이터만 실시간 반영이 멈추고 조회 방식은 그대로 동작한다.
// ================================================================

import { db } from "../firebase.js";
import { onSnapshot, collection, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";
import {
  watchTransactions, unwatchTransactions,
  applyFixedItemDocs, applyBudgetDoc, applyBudgetPlanDocs,
  applyFixedItemsToMonth, fetchTransactions
} from "./db.js";
import {
  applyWeddingConfig, applyWeddingItemDocs, applyWeddingTaskDocs,
  applyWeddingVendorDocs, applyWeddingEventDocs
} from "./weddingDb.js";
import { renderRemoteChange } from "./app.js";

let unsubs = [];
let renderTimer = null;

// 여러 리스너가 한꺼번에 알려도 한 번만 그리도록 잠깐 모았다가 렌더
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderRemoteChange, 120);
}

// ref를 구독해 apply로 state에 반영. 첫 스냅샷(이미 조회한 내용)과 내 쓰기는 다시 그리지 않는다.
// afterRemote: 상대의 변경을 반영한 뒤 렌더 전에 할 추가 작업
function listen(ref, apply, afterRemote = null) {
  let first = true;
  const unsub = onSnapshot(ref, snap => {
    apply(snap);
    if (first) { first = false; return; }
    if (snap.metadata.hasPendingWrites) return;
    if (afterRemote) afterRemote().catch(err => console.warn("실시간 반영 후처리 실패:", err)).finally(scheduleRender);
    else scheduleRender();
  }, err => {
    console.warn("실시간 동기화 중단:", ref.path ?? ref.id ?? "", err.code ?? err);
  });
  unsubs.push(unsub);
}

// 로그인 시 1회 (initApp). 이미 동작 중이면 무시
export function startSync() {
  if (unsubs.length) return;

  watchTransactions(scheduleRender);
  unsubs.push(unwatchTransactions);

  // 상대가 고정비를 추가·수정하면 보고 있는 달에도 바로 반영되도록 적용 후 목록 갱신
  listen(collection(db, "fixed_items"), snap => applyFixedItemDocs(snap.docs), async () => {
    await applyFixedItemsToMonth(state.currentYear, state.currentMonth);
    await fetchTransactions();
  });
  listen(doc(db, "settings", "budget"), snap => applyBudgetDoc(snap.exists() ? snap.data() : {}));
  listen(collection(db, "budget_plans"), snap => applyBudgetPlanDocs(snap.docs));

  listen(doc(db, "settings", "wedding"), snap => applyWeddingConfig(snap.exists() ? snap.data() : null));
  listen(collection(db, "wedding_items"),   snap => applyWeddingItemDocs(snap.docs));
  listen(collection(db, "wedding_tasks"),   snap => applyWeddingTaskDocs(snap.docs));
  listen(collection(db, "wedding_vendors"), snap => applyWeddingVendorDocs(snap.docs));
  listen(collection(db, "wedding_events"),  snap => applyWeddingEventDocs(snap.docs));
}

// 로그아웃 시 (auth.js) — 다음 로그인 때 다시 건다
export function stopSync() {
  unsubs.forEach(u => u());
  unsubs = [];
  clearTimeout(renderTimer);
}
