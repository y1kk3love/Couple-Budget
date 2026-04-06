// ================================================================
// js/views/list.js — 목록 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, emptyStateHTML } from "../utils.js";
import { getCategoryInfo, CATEGORIES } from "../constants.js";
import { openEditModal } from "../modals/txModal.js";

// ── 정렬 상태 ─────────────────────────────────────────────────
let sortKey = "date";   // date | amount | category | name
let sortDir = "desc";  // asc | desc

export function renderListView() {
  const container = document.getElementById("view-list");

  const sortControls = renderSortControls();

  if (!state.transactions.length) {
    container.innerHTML = sortControls + emptyStateHTML("이번 달 내역이 없습니다");
    bindSortEvents(container);
    return;
  }

  const sorted = sortTransactions([...state.transactions]);
  const html   = sortKey === "date"
    ? renderGrouped(sorted)
    : renderFlat(sorted);

  container.innerHTML = sortControls + html;

  bindSortEvents(container);
  container.querySelectorAll(".tx-item[data-id]").forEach(el => {
    el.addEventListener("click", () => openEditModal(el.dataset.id));
  });
}

// ── 정렬 컨트롤 UI ────────────────────────────────────────────

function renderSortControls() {
  const keys = [
    { key: "date",     label: "날짜" },
    { key: "amount",   label: "금액" },
    { key: "category", label: "카테고리" },
    { key: "name",     label: "이름" },
  ];

  const keyBtns = keys.map(({ key, label }) => `
    <button class="sort-key-btn ${sortKey === key ? "active" : ""}" data-sort-key="${key}">
      ${label}
    </button>`).join("");

  const dirLabel = sortDir === "asc" ? "↑ 오름차순" : "↓ 내림차순";

  return `
    <div class="sort-bar">
      <div class="sort-keys">${keyBtns}</div>
      <button class="sort-dir-btn" id="sortDirBtn">${dirLabel}</button>
    </div>`;
}

function bindSortEvents(container) {
  container.querySelectorAll(".sort-key-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      sortKey = btn.dataset.sortKey;
      renderListView();
    });
  });
  container.querySelector("#sortDirBtn")?.addEventListener("click", () => {
    sortDir = sortDir === "asc" ? "desc" : "asc";
    renderListView();
  });
}

// ── 정렬 로직 ─────────────────────────────────────────────────

function sortTransactions(txs) {
  return txs.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date")     cmp = a.date.localeCompare(b.date);
    if (sortKey === "amount")   cmp = a.amount - b.amount;
    if (sortKey === "category") cmp = a.category.localeCompare(b.category);
    if (sortKey === "name")     cmp = a.name.localeCompare(b.name);
    return sortDir === "asc" ? cmp : -cmp;
  });
}

// ── 렌더: 날짜 그룹 ──────────────────────────────────────────

function renderGrouped(sorted) {
  const grouped = groupByDate(sorted);
  return Object.entries(grouped).map(([date, items]) => {
    const [, , dd]   = date.split("-");
    const dayTotal   = items.reduce((sum, t) => t.type === "income" ? sum + t.amount : sum - t.amount, 0);
    const totalColor = dayTotal >= 0 ? "var(--income)" : "var(--expense)";
    const totalSign  = dayTotal >= 0 ? "+" : "";
    return `
      <div class="list-group">
        <div class="list-date-header">
          <span>${state.currentMonth}월 ${parseInt(dd)}일</span>
          <span class="date-total" style="color:${totalColor}">${totalSign}${fmtMoney(dayTotal)}</span>
        </div>
        ${items.map(renderTxRow).join("")}
      </div>`;
  }).join("");
}

// ── 렌더: 플랫 리스트 ────────────────────────────────────────

function renderFlat(sorted) {
  return `<div class="list-group">${sorted.map(renderTxRow).join("")}</div>`;
}

// ── 공통 행 렌더 ─────────────────────────────────────────────

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
