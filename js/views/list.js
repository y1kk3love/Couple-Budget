// ================================================================
// js/views/list.js — 목록 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, emptyStateHTML, escapeHtml, ownerName } from "../utils.js";
import { getCategoryInfo, CATEGORIES } from "../constants.js";
import { openEditModal } from "../modals/txModal.js";
import { fetchAllTransactions } from "../db.js";
import { animateNextRender, captureLayout, playLayout } from "../motion.js";

// ── 조회 범위 ─────────────────────────────────────────────────
// "month": 현재 달(state.transactions), "all": 전체 기간(fetchAllTransactions)
let scope = "month";

// ── 정렬 상태 ─────────────────────────────────────────────────
let sortKey = "date";
let sortDir = "desc";

// ── 필터 상태 ─────────────────────────────────────────────────
let filters = { name: "", category: "", minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" };
let filterOpen = false;

// ── 전체 기간 점진 렌더 ───────────────────────────────────────
// 수천 건을 한 번에 innerHTML로 그리면 모바일에서 버벅여서,
// 전체 기간 모드는 LIST_CHUNK건씩 끊어 보여주고 '더 보기'로 늘린다.
const LIST_CHUNK = 300;
let visibleCount = LIST_CHUNK;

export function renderListView() {
  const container = document.getElementById("view-list");
  // 내 저장·삭제·정렬 직후면 행 위치를 기록해 두었다가 새 자리로 옮긴다 (motion.animateNextRender)
  const layout = captureLayout(container);

  container.innerHTML = `
    ${renderToolbar()}
    ${renderSortControls()}
    ${renderFilterPanel()}
    <div id="listContent">${
      scope === "all"
        ? `<div aria-label="전체 기간 내역을 불러오는 중">${[70, 55, 80].map(w => `<div class="skeleton-card"><span class="skeleton" style="width:30%"></span><span class="skeleton" style="width:${w}%"></span></div>`).join("")}</div>`
        : renderContent(applyFilters(state.transactions))
    }</div>`;

  bindScopeEvents(container);
  bindSortEvents(container);
  bindFilterEvents(container);

  if (scope === "month") {
    bindRowEvents(container);
    container.querySelector("#listEmptyReset")?.addEventListener("click", resetFilters);
    playLayout(container, layout);
  } else {
    // 전체 기간은 비동기 조회 — 완료 시점에 다른 뷰/범위로 이동했으면 무시.
    // 행 자리 이동은 실제 행이 그려진 뒤에 재생한다 (그 전엔 자리표시만 있다)
    fetchAllTransactions().then(txs => {
      if (state.currentView !== "list" || scope !== "all") return;
      const content = container.querySelector("#listContent");
      if (!content) return;
      const filtered = applyFilters(txs);
      content.innerHTML = renderContent(filtered);
      bindRowEvents(content, new Map(filtered.map(t => [t.id, t])));
      bindMoreBtn(content);
      content.querySelector("#listEmptyReset")?.addEventListener("click", resetFilters);
      playLayout(container, layout);
    }).catch(err => {
      // 조회 실패 — 자리표시(스켈레톤)를 영영 남기지 않고 알린다
      console.error("전체 기간 조회 실패:", err);
      const content = container.querySelector("#listContent");
      if (content && state.currentView === "list" && scope === "all") {
        content.innerHTML = emptyStateHTML("전체 기간 내역을 불러오지 못했어요<br><span class=\"empty-hint\">네트워크를 확인한 뒤 다시 열어 주세요</span>", "⚠️");
      }
    });
  }
}

function bindMoreBtn(root) {
  root.querySelector("#listMoreBtn")?.addEventListener("click", () => {
    visibleCount += LIST_CHUNK;
    renderListView(); // fetchAllTransactions는 캐시라 재조회 비용 없음
  });
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
      <div class="scope-toggle" role="group" aria-label="보는 기간">
        <button class="scope-btn ${scope === "month" ? "active" : ""}" data-scope="month" aria-pressed="${scope === "month"}">${state.currentMonth}월</button>
        <button class="scope-btn ${scope === "all" ? "active" : ""}" data-scope="all" aria-pressed="${scope === "all"}">전체 기간</button>
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
      visibleCount = LIST_CHUNK; // 범위 전환 시 점진 렌더 초기화
      renderListView();
    });
  });
}

// ── 필터 로직 ─────────────────────────────────────────────────

// 검색어를 공백 단위로 쪼개 이름·메모에 모두 들어 있으면 통과 (대소문자 무시).
// 예: "스타벅스 강남" → 둘 다 들어간 내역만. 예전에는 하나만 맞아도 통과해서, 단어를 더할수록
// 결과가 줄지 않고 늘었다.
function matchesName(t, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = `${t.name} ${t.memo ?? ""}`.toLowerCase();
  return tokens.every(tok => hay.includes(tok));
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
        <input type="search" id="f-name" value="${escapeHtml(filters.name)}" placeholder="이름·내용 (여러 단어는 모두 포함)" enterkeyhint="search" />
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
          <input type="number" inputmode="numeric" id="f-min" value="${escapeHtml(filters.minAmount)}" placeholder="최소" />
          <span>~</span>
          <input type="number" inputmode="numeric" id="f-max" value="${escapeHtml(filters.maxAmount)}" placeholder="최대" />
        </div>
      </div>
      <div class="filter-row">
        <label>날짜</label>
        <div class="filter-range">
          <input type="date" id="f-from" value="${escapeHtml(filters.dateFrom)}" />
          <span>~</span>
          <input type="date" id="f-to" value="${escapeHtml(filters.dateTo)}" />
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
  const applyFilterInputs = () => {
    filters.name       = container.querySelector("#f-name").value.trim();
    filters.category   = container.querySelector("#f-category").value;
    filters.minAmount  = container.querySelector("#f-min").value;
    filters.maxAmount  = container.querySelector("#f-max").value;
    filters.dateFrom   = container.querySelector("#f-from").value;
    filters.dateTo     = container.querySelector("#f-to").value;
    visibleCount = LIST_CHUNK;
    animateNextRender(); // 걸러진 행은 흐려지며 빠지고, 남은 행은 제자리로 모인다
    renderListView();
  };
  container.querySelector("#filterApplyBtn")?.addEventListener("click", applyFilterInputs);
  // 입력칸에서 Enter(키보드의 "검색")로도 적용 — 예전에는 "적용" 버튼을 눌러야만 했다
  container.querySelectorAll(".filter-panel input").forEach(inp => inp.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    applyFilterInputs();
  }));
  container.querySelector("#filterResetBtn")?.addEventListener("click", resetFilters);
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
    <button class="sort-key-btn ${sortKey === key ? "active" : ""}" data-sort-key="${key}" aria-pressed="${sortKey === key}">${label}</button>`
  ).join("");
  const dirLabel = sortDir === "asc" ? "↑ 오름차순" : "↓ 내림차순";

  return `
    <div class="sort-bar">
      <div class="sort-keys" role="group" aria-label="정렬 기준">${keyBtns}</div>
      <button class="sort-dir-btn" id="sortDirBtn">${dirLabel}</button>
    </div>`;
}

function bindSortEvents(container) {
  container.querySelectorAll(".sort-key-btn").forEach(btn => {
    // 정렬을 바꾸면 행이 새 순서의 자리로 미끄러진다
    btn.addEventListener("click", () => { sortKey = btn.dataset.sortKey; animateNextRender(); renderListView(); });
  });
  container.querySelector("#sortDirBtn")?.addEventListener("click", () => {
    sortDir = sortDir === "asc" ? "desc" : "asc";
    animateNextRender();
    renderListView();
  });
}

// ── 콘텐츠 렌더 ──────────────────────────────────────────────

const hasFilters = () => Object.values(filters).some(v => v !== "");

// 빈 목록 — 필터 때문인지, 정말 내역이 없는지 구분해 알린다.
// 예전에는 항상 "조건에 맞는 내역이 없어요"라, 새 달 첫날에도 조건이 걸린 것처럼 보였다
function renderEmpty() {
  if (hasFilters()) {
    return `
      <div class="empty-state">
        <span class="empty-emoji">🔍</span>
        <p>조건에 맞는 내역이 없어요</p>
        <button class="filter-reset-btn empty-action" id="listEmptyReset">필터 지우기</button>
      </div>`;
  }
  return scope === "all"
    ? emptyStateHTML("아직 내역이 없어요")
    : emptyStateHTML(`${state.currentMonth}월 내역이 아직 없어요<br><span class="empty-hint">＋ 버튼으로 추가해 보세요</span>`);
}

function resetFilters() {
  filters = { name: "", category: "", minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" };
  visibleCount = LIST_CHUNK;
  animateNextRender();
  renderListView();
}

// 걸러 본 결과의 건수와 합계 — "카페에 총 얼마 썼지?"의 답. 필터가 걸렸거나 전체 기간일 때만 보인다
// (이번 달 전체는 위 요약 카드가 이미 보여 준다)
function renderResultSummary(filtered) {
  if (!hasFilters() && scope !== "all") return "";
  const exp = filtered.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const inc = filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  return `
    <div class="list-result" role="status">
      <span><strong>${filtered.length.toLocaleString("ko-KR")}건</strong>${hasFilters() ? " 찾음" : ""}</span>
      <span class="list-result-sum">
        ${exp > 0 ? `<span class="minus">-${fmtMoney(exp)}원</span>` : ""}
        ${inc > 0 ? `<span class="plus">+${fmtMoney(inc)}원</span>` : ""}
      </span>
    </div>`;
}

function renderContent(filtered) {
  if (!filtered.length) return renderEmpty();
  const sorted  = sortTransactions([...filtered]);
  const limited = scope === "all" ? sorted.slice(0, visibleCount) : sorted;
  const rest    = sorted.length - limited.length;
  const moreBtn = rest > 0
    ? `<button id="listMoreBtn" class="list-more-btn">더 보기 (${rest.toLocaleString("ko-KR")}건 남음)</button>`
    : "";
  return renderResultSummary(filtered) + (sortKey === "date" ? renderGrouped(limited) : renderFlat(limited)) + moreBtn;
}

// 카테고리 정렬 순서 — 입력 창의 칩과 같은 정의 순서(지출 → 수입). 예전에는 영문 ID 순이라 한글 이름으로는 뒤죽박죽이었다
function categoryOrder(t) {
  const i = CATEGORIES[t.type]?.findIndex(c => c.id === t.category) ?? -1;
  return (t.type === "income" ? 100 : 0) + (i === -1 ? 99 : i);
}

function sortTransactions(txs) {
  return txs.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date")     cmp = a.date.localeCompare(b.date);
    if (sortKey === "amount")   cmp = a.amount - b.amount; // 수입/지출 구분 없이 절대 금액 기준

    if (sortKey === "category") cmp = categoryOrder(a) - categoryOrder(b);
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
    // 묶음 키 — 날짜 카드가 안의 행과 한 덩어리로 움직인다 (motion.playLayout 중첩 FLIP)
    return `
      <div class="list-group" data-flip-key="date/${escapeHtml(date)}">
        <div class="list-date-header">
          <span>${escapeHtml(label)}</span>
          ${items.length > 1 ? `<span class="date-total" style="color:${color}">${sign}${fmtMoney(dayTotal)}</span>` : ""}
        </div>
        ${items.map(t => renderTxRow(t)).join("")}
      </div>`;
  }).join("");
}

function renderFlat(sorted) {
  return `<div class="list-group" data-flip-key="list/flat">${sorted.map(t => renderTxRow(t)).join("")}</div>`;
}

// 내역 한 줄. 달력의 "그날 내역"도 같은 모양을 쓴다 (calendar.js).
// showDate: 날짜를 행에 적을지 — 기본은 전체 기간 + 날짜 외 정렬일 때(묶음 머리글이 없어서)
export function renderTxRow(t, { showDate = scope === "all" && sortKey !== "date" } = {}) {
  const cat     = getCategoryInfo(t.category, t.type);
  const sign    = t.type === "income" ? "+" : "-";
  const amtCls  = t.type === "income" ? "plus" : "minus";
  // 고정비만 꼬리표 — 예전에는 나머지 모든 행에 "변동"이 붙어 정보 없이 자리만 차지했다
  const kindTag = t.kind === "fixed" ? `<span class="tag fixed">고정</span>` : "";
  // 이름이 메모에서 파생되므로(txModal) 동일하면 중복 표시하지 않음
  const memoTag  = t.memo && t.memo !== t.name ? `<span class="tx-memo">${escapeHtml(t.memo)}</span>` : "";
  const ownerTag = t.owner ? `<span class="tx-owner">${escapeHtml(ownerName(t.owner))}</span>` : "";
  const dateTag  = showDate ? `<span>${escapeHtml(t.date)}</span>` : "";

  return `
    <div class="tx-item" data-id="${escapeHtml(t.id)}" data-flip-key="${escapeHtml(t.id)}" role="button" tabindex="0">
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-name">${escapeHtml(t.name)}</div>
        <div class="tx-meta">${dateTag}<span>${escapeHtml(cat.name)}</span>${kindTag}${ownerTag}${memoTag}</div>
      </div>
      <div class="tx-amount ${amtCls}">${sign}${fmtMoney(t.amount)}</div>
    </div>`;
}
