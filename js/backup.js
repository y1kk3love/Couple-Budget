// ================================================================
// js/backup.js — 전체 백업 내려받기
// 가계부·결혼 준비의 모든 문서를 JSON 파일 하나로 내려받는다. 읽기만 한다 — 아무것도 쓰지 않는다.
// CSV 내보내기는 거래만 담고 다시 가져올 수도 없어서, 실수나 버그로 데이터가 망가지면 되돌릴
// 원본이 없었다. 복원은 앱에 넣지 않았다(잘못 누르면 전부 덮어쓰는 기능이라) — 필요하면 이 파일을
// 보고 Firebase 콘솔이나 스크립트로 되돌린다. 문서 ID와 필드를 그대로 담아 그대로 되쓸 수 있다.
// ================================================================

import { db } from "../firebase.js";
import { collection, doc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";
import { showToast, todayStr, downloadFile } from "./utils.js";

// 건너뜀 표시(고정비 삭제 흔적)까지 포함한 원본 그대로 — 화면용으로 가공한 state가 아니라 문서를 직접 읽는다
const COLLECTIONS = [
  "transactions", "fixed_items", "budget_plans",
  "wedding_items", "wedding_tasks", "wedding_vendors", "wedding_events", "wedding_guests",
];
const SETTINGS_DOCS = ["budget", "wedding"];

export async function buildBackup() {
  const backup = {
    app: "couple-budget",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: state.currentUser?.email ?? null,
    collections: {},
    settings: {},
    skipped: [], // 읽지 못한 컬렉션 (규칙에 없는 등) — 나머지는 그대로 담는다
  };
  await Promise.all(COLLECTIONS.map(async name => {
    try {
      const snap = await getDocs(collection(db, name));
      backup.collections[name] = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    } catch (err) {
      console.warn(`백업: ${name} 컬렉션을 읽지 못했습니다`, err.code ?? err);
      backup.skipped.push(name);
    }
  }));
  await Promise.all(SETTINGS_DOCS.map(async id => {
    try {
      const snap = await getDoc(doc(db, "settings", id));
      if (snap.exists()) backup.settings[id] = snap.data();
    } catch (err) {
      console.warn(`백업: settings/${id} 문서를 읽지 못했습니다`, err.code ?? err);
      backup.skipped.push(`settings/${id}`);
    }
  }));
  return backup;
}

export async function downloadBackup(button) {
  if (!state.currentUser || button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const backup = await buildBackup();
    // 거래를 읽지 못했으면 백업이라 부를 수 없다 — 빈 파일을 "백업했다"고 믿게 하지 않는다
    if (!backup.collections.transactions) {
      showToast("백업하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요");
      return;
    }
    const count = Object.values(backup.collections).reduce((n, docs) => n + Object.keys(docs).length, 0)
      + Object.keys(backup.settings).length;
    downloadFile(`우리가계부_전체백업_${todayStr()}.json`, JSON.stringify(backup, null, 1), "application/json;charset=utf-8");
    const missing = backup.skipped.filter(n => n !== "wedding_guests"); // 쓰지 않는 컬렉션은 없어도 알리지 않는다
    showToast(missing.length
      ? `문서 ${count.toLocaleString("ko-KR")}개를 백업했어요 (읽지 못한 곳: ${missing.join(", ")})`
      : `문서 ${count.toLocaleString("ko-KR")}개를 백업 파일로 저장했어요`);
  } catch (err) {
    console.error("백업 실패:", err);
    showToast("백업하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요");
  } finally {
    if (button) button.disabled = false;
  }
}

export function setupBackup() {
  document.getElementById("backupBtn").addEventListener("click", e => downloadBackup(e.currentTarget));
}
