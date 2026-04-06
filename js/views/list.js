// ================================================================
// js/views/list.js — 목록 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, emptyStateHTML } from "../utils.js";
import { getCategoryInfo, CATEGORIES } from "../constants.js";
import { openEditModal } from "../modals/txModal.js";

// ── 정렬 상태 ─────────────────────────────────────────────────
let sortKey = "date";
let sortDir = "desc";

// ── 필터 상태 ─────────────────────────────────────────────────
let filters = { name: "", category: "", minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" };
let filterOpen = false;

export function renderListView() {
  const container = document.getElementById("view-list");
  const filtered  = applyFilters(state.transactions);

  const html = `
    ${renderSortControls()}
    ${renderFilterPanel()}
    ${renderContent(filtered)}`;

  container.innerHTML = html;
  bindSortEvents(container);
  bindFilterEvents(container);
  container.querySelectorAll(".tx-item[data-id]").forEach(el => {
    el.addEventListener("click", () => openEditModal(el.dataset.id));
  });
}

// ── 필터 로직 ─────────────────────────────────────────────────

function applyFilters(txs) {
  return txs.filter(t => {
    if (filters.name     && !t.name.includes(filters.name))   return false;
    if (filters.category && t.category !== filters.category)   return false;
    if (filters.minAmount && t.amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount && t.amount > Number(filters.maxAmount)) return false;
    if (filters.dateFrom  && t.date < filters.dateFrom)        return false;
    if (filters.dateTo    && t.date > filters.dateTo)          return false;
    return true;
  });
}

// ── 필터 패널 UI ──────────────────────────────────────────────

function renderFilterPanel() {
  const catOptions = CATEGORIES.expense.map(c =>
    `<option value="${c.id}" ${filters.category === c.id ? "selected" : ""}>${c.name}</option>`
  ).join("");

  const activeCount = Object.values(filters).filter(v => v !== "").length;
  const badge = activeCount > 0 ? `<span class="filter-badge">${activeCount}</span>` : "";

  const panel = filterOpen ? `
    <div class="filter-panel">
      <div class="filter-row">
        <label>이름</label>
        <input type="text" id="f-name" value="${filters.name}" placeholder="전체" />
      </div>
      <div class="filter-row">
        <label>카테고리</label>
        <select id="f-category">
          <option value="" ${!filters.category ? "selected" : ""}>전체</option>
          ${catOptions}
        </select>
      </div>
      <div class="filter-row">
        <label>금액</label>
        <div class="filter-range">
          <input type="number" id="f-min" value="${filters.minAmount}" placeholder="최소" />
          <span>~</span>
          <input type="number" id="f-max" value="${filters.maxAmount}" placeholder="최대" />
        </div>
      </div>
      <div class="filter-row">
        <label>날짜</label>
        <div class="filter-range">
          <input type="date" id="f-from" value="${filters.dateFrom}" />
          <span>~</span>
          <input type="date" id="f-to" value="${filters.dateTo}" />
        </div>
      </div>
      <div class="filter-actions">
        <button id="filterResetBtn" class="filter-reset-btn">초기화</button>
        <button id="filterApplyBtn" class="filter-apply-btn">적용</button>
      </div>
    </div>` : "";

  return `
    <div class="filter-toggle-row">
      <button id="filterToggleBtn" class="filter-toggle-btn ${activeCount > 0 ? "has-filter" : ""}">
        필터 ${badge}
      </button>
    </div>
    ${panel}`;
}

function bindFilterEvents(container) {
  container.querySelector("#filterToggleBtn")?.addEventListener("click", () => {
    filterOpen = !filterOpen;
    renderListView();
  });
  container.querySelector("#filterApplyBtn")?.addEventListener("click", () => {
    filters.name       = container.querySelector("#f-name").value.trim();
    filters.category   = container.querySelector("#f-category").value;
    filters.minAmount  = container.querySelector("#f-min").value;
    filters.maxAmount  = container.querySelector("#f-max").value;
    filters.dateFrom   = container.querySelector("#f-from").value;
    filters.dateTo     = container.querySelector("#f-to").value;
    renderListView();
  });
  container.querySelector("#filterResetBtn")?.addEventListener("click", () => {
    filters = { name: "", category: "", minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" };
    renderListView();
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
  const keyBtns  = keys.map(({ key, label }) => `
    <button class="sort-key-btn ${sortKey === key ? "active" : ""}" data-sort-key="${key}">${label}</button>`
  ).join("");
  const dirLabel = sortDir === "asc" ? "↑ 오름차순" : "↓ 내림차순";

  return `
    <div class="sort-bar">
      <div class="sort-keys">${keyBtns}</div>
      <button class="sort-dir-btn" id="sortDirBtn">${dirLabel}</button>
    </div>`;
}

function bindSortEvents(container) {
  container.querySelectorAll(".sort-key-btn").forEach(btn => {
    btn.addEventListener("click", () => { sortKey = btn.dataset.sortKey; renderListView(); });
  });
  container.querySelector("#sortDirBtn")?.addEventListener("click", () => {
    sortDir = sortDir === "asc" ? "desc" : "asc";
    renderListView();
  });
}

// ── 콘텐츠 렌더 ──────────────────────────────────────────────

function renderContent(filtered) {
  if (!filtered.length) return emptyStateHTML("조건에 맞는 내역이 없습니다");
  const sorted = sortTransactions([...filtered]);
  return sortKey === "date" ? renderGrouped(sorted) : renderFlat(sorted);
}

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

function renderGrouped(sorted) {
  const grouped = sorted.reduce((acc, t) => {
    if (!acc[t.date]) acc[t.date] = [];
    acc[t.date].push(t);
    return acc;
  }, {});

  return Object.entries(grouped).map(([date, items]) => {
    const [, , dd]  = date.split("-");
    const dayTotal  = items.reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, 0);
    const color     = dayTotal >= 0 ? "var(--income)" : "var(--expense)";
    const sign      = dayTotal >= 0 ? "+" : "";
    return `
      <div class="list-group">
        <div class="list-date-header">
          <span>${state.currentMonth}월 ${parseInt(dd)}일</span>
          <span class="date-total" style="color:${color}">${sign}${fmtMoney(dayTotal)}</span>
        </div>
        ${items.map(renderTxRow).join("")}
      </div>`;
  }).join("");
}

function renderFlat(sorted) {
  return `<div class="list-group">${sorted.map(renderTxRow).join("")}</div>`;
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
        <div class="tx-meta"><span>${cat.name}</span>${kindTag}${memoTag}</div>
      </div>
      <div class="tx-amount ${amtCls}">${sign}${fmtMoney(t.amount)}</div>
    </div>`;
}
