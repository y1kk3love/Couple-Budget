// ================================================================
// js/views/budget.js — 예산 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, showToast } from "../utils.js";
import { CATEGORIES } from "../constants.js";
import { saveBudgetCategory } from "../db.js";

export function renderBudgetView() {
  const container = document.getElementById("view-budget");

  // 카테고리별 실제 지출 집계
  const spentMap = state.transactions
    .filter(t => t.type === "expense")
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    }, {});

  const rows = CATEGORIES.expense.map(cat => renderBudgetRow(cat, spentMap)).join("");

  container.innerHTML = `
    <div class="section-header">
      <h3>기준 예산</h3>
      <span class="section-sub">모든 달에 적용되는 기준 예산을 설정하세요</span>
    </div>
    <div class="budget-card">
      <h4>지출 카테고리 예산</h4>
      ${rows}
    </div>`;

  // 저장 버튼 이벤트
  container.querySelectorAll(".budget-save-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const catId  = btn.dataset.cat;
      const amount = parseInt(document.getElementById(`budget-${catId}`).value) || 0;
      await saveBudgetCategory(catId, amount);
      showToast("예산이 저장되었습니다");
      renderBudgetView();
    });
  });
}

function renderBudgetRow(cat, spentMap) {
  const spent  = spentMap[cat.id] ?? 0;
  const budget = state.budgets[cat.id] ?? 0;
  const pct    = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
  const isOver = budget > 0 && spent > budget;

  const progressBar = budget > 0
    ? `<div class="pbar">
         <div class="pfill" style="width:${pct}%;background:${isOver ? "var(--expense)" : cat.color}"></div>
       </div>`
    : "";

  return `
    <div class="budget-item-row">
      <div class="budget-labels">
        <span class="budget-name">${cat.name}</span>
        <span class="budget-nums ${isOver ? "budget-over" : ""}">
          ${fmtMoney(spent)} / ${budget > 0 ? fmtMoney(budget) : "미설정"}원
        </span>
      </div>
      ${progressBar}
      <div class="budget-edit-row">
        <div class="budget-input-wrap">
          <input type="number" id="budget-${cat.id}" value="${budget || ""}" placeholder="0" />
          <span>원</span>
        </div>
        <button class="budget-save-btn" data-cat="${cat.id}">저장</button>
      </div>
    </div>`;
}
