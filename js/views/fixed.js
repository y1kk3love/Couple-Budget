// ================================================================
// js/views/fixed.js — 고정비 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, escapeHtml } from "../utils.js";
import { getCategoryInfo } from "../constants.js";
import { openFixedEditModal } from "../modals/fixedModal.js";
import { captureLayout, playLayout } from "../motion.js";

export function renderFixedView() {
  const container = document.getElementById("view-fixed");
  const layout = captureLayout(container); // 저장·삭제 직후면 행이 새 자리로 (motion.animateNextRender)

  const rows = state.fixedItems.map(item => renderFixedRow(item)).join("");

  container.innerHTML = `
    <div class="section-header">
      <h3>고정비 관리</h3>
      <span class="section-sub">${renderMonthlyTotals()}</span>
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

  playLayout(container, layout);
}

// 매달 나가고 들어오는 고정 금액 합계 — 고정비 화면의 핵심 숫자인데 예전에는 어디에도 없었다
function renderMonthlyTotals() {
  const exp = state.fixedItems.filter(i => i.type !== "income").reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const inc = state.fixedItems.filter(i => i.type === "income").reduce((s, i) => s + (Number(i.amount) || 0), 0);
  if (!exp && !inc) return "매달 자동으로 기록됩니다";
  return [
    exp ? `매달 지출 <strong class="minus">-${fmtMoney(exp)}원</strong>` : "",
    inc ? `수입 <strong class="plus">+${fmtMoney(inc)}원</strong>` : "",
  ].filter(Boolean).join(" · ");
}

function renderFixedRow(item) {
  const cat       = getCategoryInfo(item.category, item.type);
  const amtCls    = item.type === "income" ? "income" : "";
  const sign      = item.type === "income" ? "+" : "-";

  return `
    <div class="fixed-item" data-id="${escapeHtml(item.id)}" data-flip-key="${escapeHtml(item.id)}" role="button" tabindex="0">
      <div class="fixed-cat-dot" style="background:${cat.color}"></div>
      <div class="fixed-info">
        <div class="fixed-name">${escapeHtml(item.name)} ${renderStatusTag(item)}</div>
        <div class="fixed-meta">${escapeHtml(cat.name)} · ${item.type === "income" ? "수입" : "지출"}${item.startYear ? ` · ${escapeHtml(item.startYear)}년 ${escapeHtml(item.startMonth)}월부터` : ""}</div>
      </div>
      <div class="fixed-amount ${amtCls}">${sign}${fmtMoney(item.amount)}</div>
    </div>`;
}

// 이번 달(현재 보고 있는 달) 기준 적용 상태 표시
function renderStatusTag(item) {
  if (state.skippedFixedIds.has(item.id)) {
    return `<span class="tag skipped">${state.currentMonth}월 건너뜀</span>`;
  }
  if (state.transactions.some(t => t.fromFixed && t.fixedId === item.id)) {
    return `<span class="tag applied">${state.currentMonth}월 반영</span>`;
  }
  const future = item.startYear &&
    item.startYear * 100 + item.startMonth > state.currentYear * 100 + state.currentMonth;
  return future ? `<span class="tag future">적용 전</span>` : "";
}
