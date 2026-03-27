// ================================================================
// js/views/list.js — 목록 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, emptyStateHTML } from "../utils.js";
import { getCategoryInfo } from "../constants.js";
import { openEditModal } from "../modals/txModal.js";

export function renderListView() {
  const container = document.getElementById("view-list");

  if (!state.transactions.length) {
    container.innerHTML = emptyStateHTML("이번 달 내역이 없습니다");
    return;
  }

  // 날짜 내림차순 정렬 후 날짜별 그룹핑
  const grouped = groupByDate([...state.transactions].sort((a, b) => b.date.localeCompare(a.date)));

  const html = Object.entries(grouped).map(([date, items]) => {
    const [, , dd]   = date.split("-");
    const dayTotal   = items.reduce((sum, t) => t.type === "income" ? sum + t.amount : sum - t.amount, 0);
    const totalColor = dayTotal >= 0 ? "var(--income)" : "var(--expense)";
    const totalSign  = dayTotal >= 0 ? "+" : "";

    const txRows = items.map(t => renderTxRow(t)).join("");

    return `
      <div class="list-group">
        <div class="list-date-header">
          <span>${state.currentMonth}월 ${parseInt(dd)}일</span>
          <span class="date-total" style="color:${totalColor}">
            ${totalSign}${fmtMoney(dayTotal)}
          </span>
        </div>
        ${txRows}
      </div>`;
  }).join("");

  container.innerHTML = html;

  // 내역 클릭 → 수정 모달
  container.querySelectorAll(".tx-item[data-id]").forEach(el => {
    el.addEventListener("click", () => openEditModal(el.dataset.id));
  });
}

function renderTxRow(t) {
  const cat     = getCategoryInfo(t.category, t.type);
  const sign    = t.type === "income" ? "+" : "-";
  const amtCls  = t.type === "income" ? "plus" : "minus";
  const kindTag = t.kind === "fixed"
    ? `<span class="tag fixed">고정</span>`
    : `<span class="tag variable">변동</span>`;
  const memoTag = t.memo ? `<span class="tx-memo">${t.memo}</span>` : "";

  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-name">${t.name}</div>
        <div class="tx-meta">
          <span>${cat.name}</span>
          ${kindTag}
          ${memoTag}
        </div>
      </div>
      <div class="tx-amount ${amtCls}">${sign}${fmtMoney(t.amount)}</div>
    </div>`;
}

function groupByDate(transactions) {
  return transactions.reduce((acc, t) => {
    if (!acc[t.date]) acc[t.date] = [];
    acc[t.date].push(t);
    return acc;
  }, {});
}
