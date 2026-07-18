// ================================================================
// js/views/list.js — 목록 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, emptyStateHTML, escapeHtml, ownerName } from "../utils.js";
import { getCategoryInfo, CATEGORIES } from "../constants.js";
import { openEditModal } from "../modals/txModal.js";
import { fetchAllTransactions } from "../db.js";

// ── 조회 범위 ─────────────────────────────────────────────────
// "month": 현재 달(state.transactions), "all": 전체 기간(fetchAllTransactions)
let scope = "month";

// ── 정렬 상태 ─────────────────────────────────────────────────
let sortKey = "date";
let sortDir = "desc";

// ── 필터 상태 ─────────────────────────────────────────────────
let filters = { name: "", category: "", minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" };
let filterOpen = false;

export function renderListView() {
  const container = document.getElementById("view-list");

  container.innerHTML = `
    ${renderToolbar()}
    ${renderSortControls()}
    ${renderFilterPanel()}
    <div id="listContent">${
      scope === "all"
        ? `<p class="list-loading">전체 기간 내역을 불러오는 중…</p>`
        : renderContent(applyFilters(state.transactions))
    }</div>`;

  bindScopeEvents(container);
  bindSortEvents(container);
  bindFilterEvents(container);

  if (scope === "month") {
    bindRowEvents(container);
  } else {
    // 전체 기간은 비동기 조회 — 완료 시점에 다른 뷰/범위로 이동했으면 무시
    fetchAllTransactions().then(txs => {
      if (state.currentView !== "list" || scope !== "all") return;
      const content = container.querySelector("#listContent");
      if (!content) return;
      const filtered = applyFilters(txs);
      content.innerHTML = renderContent(filtered);
      bindRowEvents(content, new Map(filtered.map(t => [t.id, t])));
    });
  }
}

// 행 클릭 → 수정 모달. 전체 기간 모드에서는 현재 달 state에 없는 거래일 수
// 있어 거래 객체를 직접 넘긴다.
function bindRowEvents(root, lookup = null) {
  root.querySelectorAll(".tx-item[data-id]").forEach(el => {
    el.addEventListener("click", () =>
      openEditModal(el.dataset.id, lookup?.get(el.dataset.id) ?? null)
    );
  });
}

// ── 상단 툴바 (기간 전환 + 필터 버튼) ─────────────────────────

function renderToolbar() {
  const activeCount = Object.values(filters).filter(v => v !== "").length;
  const badge = activeCount > 0 ? `<span class="filter-badge">${activeCount}</span>` : "";

  return `
    <div class="list-toolbar">
      <div class="scope-toggle">
        <button class="scope-btn ${scope === "month" ? "active" : ""}" data-scope="month">이번 달</button>
        <button class="scope-btn ${scope === "all" ? "active" : ""}" data-scope="all">전체 기간</button>
      </div>
      <button id="filterToggleBtn" class="filter-toggle-btn ${activeCount > 0 ? "has-filter" : ""}">
        필터 ${badge}
      </button>
    </div>`;
}

function bindScopeEvents(container) {
  container.querySelectorAll(".scope-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.scope === scope) return;
      scope = btn.dataset.scope;
      renderListView();
    });
  });
}

// ── 필터 로직 ─────────────────────────────────────────────────

// 검색어를 공백 단위로 쪼개 이름·메모에 하나라도 포함되면 통과 (대소문자 무시).
// 예: "스타벅스 커피" → "스타벅스"만 있어도, "커피"만 있어도 표시.
function matchesName(t, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = `${t.name} ${t.memo ?? ""}`.toLowerCase();
  return tokens.some(tok => hay.includes(tok));
}

function applyFilters(txs) {
  return txs.filter(t => {
    if (filters.name     && !matchesName(t, filters.name))     return false;
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
  if (!filterOpen) return "";

  const catOptions = [
    `<optgroup label="지출">${CATEGORIES.expense.map(c =>
      `<option value="${c.id}" ${filters.category === c.id ? "selected" : ""}>${c.name}</option>`
    ).join("")}</optgroup>`,
    `<optgroup label="수입">${CATEGORIES.income.map(c =>
      `<option value="${c.id}" ${filters.category === c.id ? "selected" : ""}>${c.name}</option>`
    ).join("")}</optgroup>`,
  ].join("");

  return `
    <div class="filter-panel">
      <div class="filter-row">
        <label>이름</label>
        <input type="text" id="f-name" value="${escapeHtml(filters.name)}" placeholder="전체" />
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
    </div>`;
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
    if (sortKey === "amount")   cmp = a.amount - b.amount; // 수입/지출 구분 없이 절대 금액 기준

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
    const [yy, mm, dd] = date.split("-");
    // 전체 기간 모드에서는 연도까지 표기해 어느 달인지 구분되게 한다
    const label = scope === "all"
      ? `${yy}년 ${parseInt(mm)}월 ${parseInt(dd)}일`
      : `${parseInt(mm)}월 ${parseInt(dd)}일`;
    const dayTotal  = items.reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, 0);
    const color     = dayTotal >= 0 ? "var(--income)" : "var(--expense)";
    const sign      = dayTotal > 0 ? "+" : dayTotal < 0 ? "-" : "";
    return `
      <div class="list-group">
        <div class="list-date-header">
          <span>${label}</span>
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
  // 이름이 메모에서 파생되므로(txModal) 동일하면 중복 표시하지 않음
  const memoTag  = t.memo && t.memo !== t.name ? `<span class="tx-memo">${escapeHtml(t.memo)}</span>` : "";
  const ownerTag = t.owner ? `<span class="tx-owner">${escapeHtml(ownerName(t.owner))}</span>` : "";
  // 전체 기간 + 날짜 외 정렬이면 그룹 헤더가 없어 날짜를 행에 표기
  const dateTag  = scope === "all" && sortKey !== "date" ? `<span>${t.date}</span>` : "";

  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-name">${escapeHtml(t.name)}</div>
        <div class="tx-meta">${dateTag}<span>${cat.name}</span>${kindTag}${ownerTag}${memoTag}</div>
      </div>
      <div class="tx-amount ${amtCls}">${sign}${fmtMoney(t.amount)}</div>
    </div>`;
}
