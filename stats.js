// ================================================================
// js/views/stats.js — 통계 뷰
// ================================================================

import state from "../state.js";
import { fmtMoney } from "../utils.js";
import { getCategoryInfo } from "../constants.js";

export function renderStatsView() {
  const container = document.getElementById("view-stats");

  const expTxs = state.transactions.filter(t => t.type === "expense");
  const incTxs = state.transactions.filter(t => t.type === "income");

  container.innerHTML = `
    <div class="stats-grid">
      ${renderCategoryBars(expTxs)}
      ${renderFixedVsVariable(expTxs)}
      ${renderIncomeVsExpense(incTxs, expTxs)}
    </div>`;
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
