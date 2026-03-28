// ================================================================
// js/views/fixed.js — 고정비 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney } from "../utils.js";
import { getCategoryInfo } from "../constants.js";
import { openFixedEditModal } from "../modals/fixedModal.js";

export function renderFixedView() {
  const container = document.getElementById("view-fixed");

  const rows = state.fixedItems.map(item => renderFixedRow(item)).join("");

  container.innerHTML = `
    <div class="section-header">
      <h3>고정비 관리</h3>
      <span class="section-sub">매달 자동으로 적용됩니다</span>
    </div>
    <div class="fixed-list">
      ${rows}
      <button class="add-fixed-btn" id="addFixedBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        고정비 추가
      </button>
    </div>`;

  // 항목 클릭 → 수정 모달
  container.querySelectorAll(".fixed-item[data-id]").forEach(el => {
    el.addEventListener("click", () => openFixedEditModal(el.dataset.id));
  });

  // 추가 버튼
  document.getElementById("addFixedBtn").addEventListener("click", () => openFixedEditModal(null));
}

function renderFixedRow(item) {
  const cat       = getCategoryInfo(item.category, item.type);
  const amtCls    = item.type === "income" ? "income" : "";
  const sign      = item.type === "income" ? "+" : "-";

  return `
    <div class="fixed-item" data-id="${item.id}">
      <div class="fixed-cat-dot" style="background:${cat.color}"></div>
      <div class="fixed-info">
        <div class="fixed-name">${item.name}</div>
        <div class="fixed-meta">${cat.name} · ${item.type === "income" ? "수입" : "지출"}${item.startYear ? ` · ${item.startYear}년 ${item.startMonth}월부터` : ""}</div>
      </div>
      <div class="fixed-amount ${amtCls}">${sign}${fmtMoney(item.amount)}</div>
    </div>`;
}
