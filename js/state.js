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
  // transactions가 어느 달의 조회 결과인지 ("YYYY-MM") — 고정비 적용이 다른 달 목록으로
  // 적용 여부를 잘못 판단하지 않도록 fetchTransactions가 함께 기록한다
  transactionsYM: null,
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
  // 결혼 준비 탭 (settings/wedding + wedding_* 컬렉션) — 월과 무관, 탭 진입 시 로드
  // 예외: events는 메인 화면 배너·달력 마커용으로 로그인 시 1회 미리 로드된다
  wedding: { config: null, items: [], tasks: [], vendors: [], events: [], loadError: false },
};

export default state;
