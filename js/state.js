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
  // 월 지출 예산 — 현재 달에 적용되는 금액 (월별 전용 예산이 있으면 그 값, 없으면 기본값)
  budget:        null,
  // settings/budget 문서 원본: 기본 예산과 월별 전용 예산 맵 {"YYYY-MM": amount}
  budgetDefault: null,
  budgetMonths:  {},
  // 개인 예산안 (budget_plans 컬렉션, 문서 ID = 이메일)
  budgetPlans:   [],
};

export default state;
