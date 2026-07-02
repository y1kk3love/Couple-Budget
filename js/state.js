// ================================================================
// js/state.js — 전역 상태 관리
// ================================================================

const now = new Date();

const state = {
  currentYear:   now.getFullYear(),
  currentMonth:  now.getMonth() + 1,
  currentView:   "calendar",
  currentUser:   null,
  transactions:  [],
  fixedItems:    [],
  // 이번 달에 사용자가 삭제(건너뛰기)한 고정비 ID 목록 — skip 마커 문서에서 채워짐
  skippedFixedIds: new Set(),
  // 월 지출 예산 (settings/budget 문서, 미설정 시 null)
  budget:        null,
};

export default state;
