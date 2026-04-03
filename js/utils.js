// ================================================================
// js/utils.js — 공통 유틸리티 함수
// ================================================================

import { CATEGORIES } from "./constants.js";

/** 숫자를 한국 원화 형식으로 포맷 (예: 1,234,000) */
export function fmtMoney(n) {
  return Math.abs(n).toLocaleString("ko-KR");
}

/** 숫자를 축약 형식으로 포맷 (예: 1.2M, 500K) */
export function fmtMoneyShort(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return (abs / 1_000).toFixed(0) + "K";
  return abs.toLocaleString();
}

/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
export function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 토스트 알림 표시 */
export function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

/** 예산 페이스 초과 카테고리 토스트 경고
 *  조건: 이번달 예산 / 이번달 총 일수 * 오늘 < 이번달 누적 사용 금액
 */
export function checkBudgetWarnings(transactions, budgets, year, month) {
  const now = new Date();
  if (now.getFullYear() !== year || (now.getMonth() + 1) !== month) return;

  const todayDate = now.getDate();
  const totalDays = new Date(year, month, 0).getDate();
  const overCategories = [];

  for (const [catId, budget] of Object.entries(budgets)) {
    if (!budget || budget <= 0) continue;

    const pace  = (budget / totalDays) * todayDate;
    const spent = transactions
      .filter(t => t.type === "expense" && t.category === catId)
      .reduce((s, t) => s + t.amount, 0);

    if (spent > pace) {
      const cat = CATEGORIES.expense.find(c => c.id === catId);
      if (cat) overCategories.push(cat.name);
    }
  }

  if (overCategories.length > 0) {
    showToast(`⚠️ ${overCategories.join(", ")} 예산 페이스 초과`);
  }
}

/** 빈 상태 HTML 반환 */
export function emptyStateHTML(msg) {
  return `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>${msg}</p>
    </div>`;
}
