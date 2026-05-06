// ================================================================
// js/views/stats.js — 통계 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney, fmtMoneyShort } from "../utils.js";
import { getCategoryInfo } from "../constants.js";
import { fetchMonthlySummary } from "../db.js";
import { setMonth } from "../app.js";

const MONTHLY_COMPARE_RANGE = 6;

export function renderStatsView() {
  const container = document.getElementById("view-stats");

  const expTxs = state.transactions.filter(t => t.type === "expense");
  const incTxs = state.transactions.filter(t => t.type === "income");

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stats-card full" id="monthly-compare-card">
        <h4>최근 ${MONTHLY_COMPARE_RANGE}개월 비교</h4>
        <p class="monthly-loading">불러오는 중…</p>
      </div>
      ${renderCategoryBars(expTxs)}
      ${renderFixedVsVariable(expTxs)}
      ${renderIncomeVsExpense(incTxs, expTxs)}
    </div>`;

  // 월별 비교는 비동기 fetch 후 채움
  fetchMonthlySummary(MONTHLY_COMPARE_RANGE).then(summary => {
    const card = document.getElementById("monthly-compare-card");
    if (!card) return; // 그 사이 다른 뷰로 전환됐다면 무시
    card.innerHTML = `
      <h4>최근 ${MONTHLY_COMPARE_RANGE}개월 비교</h4>
      ${renderMonthlyChart(summary)}`;
    bindMonthlyClicks(card);
  });
}

function renderMonthlyChart(summary) {
  const max = Math.max(...summary.flatMap(s => [s.income, s.expense]), 1);

  const cols = summary.map(s => {
    const incH = (s.income  / max) * 100;
    const expH = (s.expense / max) * 100;
    const isCurrent = s.year === state.currentYear && s.month === state.currentMonth;
    return `
      <div class="mc-col${isCurrent ? " current" : ""}" data-year="${s.year}" data-month="${s.month}">
        <div class="mc-bars">
          <div class="mc-bar mc-bar-inc" style="height:${incH}%" title="수입 ${fmtMoney(s.income)}원"></div>
          <div class="mc-bar mc-bar-exp" style="height:${expH}%" title="지출 ${fmtMoney(s.expense)}원"></div>
        </div>
        <div class="mc-label">${s.month}월</div>
        <div class="mc-amounts">
          <span class="mc-inc">+${fmtMoneyShort(s.income)}</span>
          <span class="mc-exp">-${fmtMoneyShort(s.expense)}</span>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="monthly-chart">
      <div class="mc-grid" style="grid-template-columns:repeat(${summary.length}, 1fr)">${cols}</div>
      <div class="mc-legend">
        <span><i class="mc-dot mc-dot-inc"></i>수입</span>
        <span><i class="mc-dot mc-dot-exp"></i>지출</span>
      </div>
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
      <div class="cat-bar-item">
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
