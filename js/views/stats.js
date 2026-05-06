// ================================================================
// js/views/stats.js — 통계 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, fmtMoneyShort } from "../utils.js";
import { getCategoryInfo, CATEGORIES } from "../constants.js";
import { fetchMonthlySummary } from "../db.js";
import { setMonth } from "../app.js";
import { openEditModal } from "../modals/txModal.js";

const MONTHLY_COMPARE_RANGE = 6;

export function renderStatsView() {
  const container = document.getElementById("view-stats");

  const expTxs = state.transactions.filter(t => t.type === "expense");
  const incTxs = state.transactions.filter(t => t.type === "income");

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stats-card full" id="monthly-compare-card">
        <h4>최근 ${MONTHLY_COMPARE_RANGE}개월 카테고리별 지출</h4>
        <p class="monthly-loading">불러오는 중…</p>
      </div>
      ${renderCategoryBars(expTxs)}
      ${renderFixedVsVariable(expTxs)}
      ${renderIncomeVsExpense(incTxs, expTxs)}
    </div>`;

  // 카테고리 막대 클릭 → 세부 내역 모달
  container.querySelectorAll(".cat-bar-item[data-cat-id]").forEach(el => {
    el.addEventListener("click", () => openCategoryDetail(el.dataset.catId));
  });

  // 월별 비교는 비동기 fetch 후 채움
  fetchMonthlySummary(MONTHLY_COMPARE_RANGE).then(summary => {
    const card = document.getElementById("monthly-compare-card");
    if (!card) return; // 그 사이 다른 뷰로 전환됐다면 무시
    card.innerHTML = `
      <h4>최근 ${MONTHLY_COMPARE_RANGE}개월 카테고리별 지출</h4>
      ${renderMonthlyChart(summary)}`;
    bindMonthlyClicks(card);
  });
}

function renderMonthlyChart(summary) {
  const max = Math.max(...summary.map(s => s.expense), 1);
  // 6개월 동안 한 번이라도 등장한 카테고리만 범례에 노출
  const usedCategoryIds = new Set();
  summary.forEach(s => Object.keys(s.expenseByCategory).forEach(id => usedCategoryIds.add(id)));
  const usedCategories = CATEGORIES.expense.filter(c => usedCategoryIds.has(c.id));

  const cols = summary.map(s => {
    const totalH = (s.expense / max) * 100;
    // 카테고리 정의 순서대로 쌓아 색상 패턴이 6개월 내내 일관됨
    const segments = CATEGORIES.expense
      .filter(c => s.expenseByCategory[c.id])
      .map(c => {
        const amt  = s.expenseByCategory[c.id];
        const segH = (amt / s.expense) * 100;
        return `<div class="mc-segment" style="height:${segH}%;background:${c.color}" title="${c.name} ${fmtMoney(amt)}원"></div>`;
      }).join("");

    const isCurrent = s.year === state.currentYear && s.month === state.currentMonth;
    return `
      <div class="mc-col${isCurrent ? " current" : ""}" data-year="${s.year}" data-month="${s.month}">
        <div class="mc-stack-wrap">
          <div class="mc-stack" style="height:${totalH}%">${segments}</div>
        </div>
        <div class="mc-label">${s.month}월</div>
        <div class="mc-amounts">
          <span class="mc-exp">-${fmtMoneyShort(s.expense)}</span>
        </div>
      </div>`;
  }).join("");

  const legend = usedCategories.map(c =>
    `<span><i class="mc-dot" style="background:${c.color}"></i>${c.name}</span>`
  ).join("");

  return `
    <div class="monthly-chart">
      <div class="mc-grid" style="grid-template-columns:repeat(${summary.length}, 1fr)">${cols}</div>
      <div class="mc-legend">${legend}</div>
    </div>`;
}

function bindMonthlyClicks(card) {
  card.querySelectorAll(".mc-col[data-year]").forEach(col => {
    col.addEventListener("click", () => {
      const y = parseInt(col.dataset.year);
      const m = parseInt(col.dataset.month);
      setMonth(y, m);
    });
  });
}

// ── 카테고리 상세 모달 ────────────────────────────────────────

function openCategoryDetail(catId) {
  const cat = getCategoryInfo(catId, "expense");
  const txs = state.transactions
    .filter(t => t.type === "expense" && t.category === catId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = txs.reduce((s, t) => s + t.amount, 0);

  document.getElementById("categoryDetailTitle").innerHTML = `
    <span class="cd-cat-dot" style="background:${cat.color}"></span>
    <span>${cat.name}</span>
    <span class="cd-total">-${fmtMoney(total)}원</span>`;

  const body = document.getElementById("categoryDetailBody");
  if (!txs.length) {
    body.innerHTML = `<p class="cd-empty">내역이 없습니다</p>`;
  } else {
    body.innerHTML = txs.map(t => {
      const memo = t.memo && t.memo !== t.name ? `<span class="cd-memo">${t.memo}</span>` : "";
      const kind = t.kind === "fixed" ? `<span class="tag fixed">고정</span>` : "";
      return `
        <div class="cd-row" data-tx-id="${t.id}">
          <span class="cd-date">${t.date.slice(5).replace("-", "/")}</span>
          <span class="cd-name">${t.name}${kind}${memo}</span>
          <span class="cd-amt">-${fmtMoney(t.amount)}원</span>
        </div>`;
    }).join("");
    body.querySelectorAll(".cd-row[data-tx-id]").forEach(el => {
      el.addEventListener("click", () => {
        closeCategoryDetail();
        openEditModal(el.dataset.txId);
      });
    });
  }

  document.getElementById("categoryDetailModal").classList.remove("hidden");
}

function closeCategoryDetail() {
  document.getElementById("categoryDetailModal").classList.add("hidden");
}

export function setupCategoryDetailModal() {
  document.getElementById("categoryDetailClose").addEventListener("click", closeCategoryDetail);
  document.getElementById("categoryDetailModal").addEventListener("click", e => {
    if (e.target.id === "categoryDetailModal") closeCategoryDetail();
  });
}

function renderCategoryBars(expTxs) {
  const catMap = expTxs.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + t.amount;
    return acc;
  }, {});

  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0]?.[1] ?? 1;

  const bars = sorted.map(([catId, amt]) => {
    const cat = getCategoryInfo(catId, "expense");
    const pct = Math.round(amt / max * 100);
    return `
      <div class="cat-bar-item clickable" data-cat-id="${catId}">
        <div class="cat-bar-row">
          <span class="cat-bar-label">${cat.name}</span>
          <span class="cat-bar-val">${fmtMoney(amt)}원</span>
        </div>
        <div class="pbar">
          <div class="pfill" style="width:${pct}%;background:${cat.color}"></div>
        </div>
      </div>`;
  }).join("") || `<p style="color:var(--text-3);font-size:0.85rem">지출 내역이 없습니다</p>`;

  return `
    <div class="stats-card full">
      <h4>카테고리별 지출</h4>
      ${bars}
    </div>`;
}

function renderFixedVsVariable(expTxs) {
  const fixedAmt = expTxs.filter(t => t.kind === "fixed").reduce((s, t) => s + t.amount, 0);
  const varAmt   = expTxs.filter(t => t.kind !== "fixed").reduce((s, t) => s + t.amount, 0);
  const total    = fixedAmt + varAmt || 1;
  const fixedPct = Math.round(fixedAmt / total * 100);
  const varPct   = 100 - fixedPct;

  return `
    <div class="stats-card">
      <h4>고정비 vs 변동비</h4>
      <div style="margin-bottom:10px">
        <div class="cat-bar-row" style="margin-bottom:5px">
          <span class="cat-bar-label">고정비</span>
          <span class="cat-bar-val">${fmtMoney(fixedAmt)}원 (${fixedPct}%)</span>
        </div>
        <div class="pbar">
          <div class="pfill" style="width:${fixedPct}%;background:var(--fixed-text)"></div>
        </div>
      </div>
      <div>
        <div class="cat-bar-row" style="margin-bottom:5px">
          <span class="cat-bar-label">변동비</span>
          <span class="cat-bar-val">${fmtMoney(varAmt)}원 (${varPct}%)</span>
        </div>
        <div class="pbar">
          <div class="pfill" style="width:${varPct}%;background:var(--var-text)"></div>
        </div>
      </div>
    </div>`;
}

function renderIncomeVsExpense(incTxs, expTxs) {
  const totalInc = incTxs.reduce((s, t) => s + t.amount, 0);
  const totalExp = expTxs.reduce((s, t) => s + t.amount, 0);
  const expPct   = Math.min(100, Math.round(totalExp / (totalInc || 1) * 100));

  return `
    <div class="stats-card">
      <h4>수입 vs 지출</h4>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <div class="cat-bar-row" style="margin-bottom:5px">
            <span class="cat-bar-label">수입</span>
            <span class="cat-bar-val" style="color:var(--income)">${fmtMoney(totalInc)}원</span>
          </div>
          <div class="pbar">
            <div class="pfill" style="width:100%;background:var(--income)"></div>
          </div>
        </div>
        <div>
          <div class="cat-bar-row" style="margin-bottom:5px">
            <span class="cat-bar-label">지출</span>
            <span class="cat-bar-val" style="color:var(--expense)">${fmtMoney(totalExp)}원</span>
          </div>
          <div class="pbar">
            <div class="pfill" style="width:${expPct}%;background:var(--expense)"></div>
          </div>
        </div>
      </div>
    </div>`;
}
