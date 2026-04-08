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
};

export default state;
