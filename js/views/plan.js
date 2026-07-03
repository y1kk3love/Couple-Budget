// ================================================================
// js/views/plan.js — 개인 예산안 뷰 (월급 배정 계획표 + 도넛 차트)
// ================================================================

import state from "../state.js";
import { fmtMoney, escapeHtml, showToast } from "../utils.js";
import { CATEGORIES } from "../constants.js";
import { fetchBudgetPlans, saveBudgetPlan } from "../db.js";
import { renderAll } from "../app.js";
import { ALLOWED_EMAILS } from "../../firebase.js";

// 항목 색은 파스텔 팔레트를 순서대로 자동 배정
const PLAN_COLORS = CATEGORIES.expense.map(c => c.color);

const DONUT_C = 339.292; // 반지름 54 원둘레

let editing = false;   // 내 예산안 수정 모드
let draft   = null;    // 수정 중 임시값 { income, items:[{name, amount}] }

export function renderPlanView() {
  const container = document.getElementById("view-plan");
  const myEmail   = state.currentUser?.email;
  const partner   = ALLOWED_EMAILS.find(e => e !== myEmail);

  container.innerHTML = `
    <div class="plan-grid">
      ${renderCard(myEmail, true)}
      ${partner ? renderCard(partner, false) : ""}
    </div>`;

  bindEvents(container, myEmail);
}

function getPlan(email) {
  return state.budgetPlans.find(p => p.id === email) ?? null;
}

// ── 카드 렌더 ─────────────────────────────────────────────────

function renderCard(email, isMine) {
  const title = isMine ? "내 예산안" : "상대 예산안";
  const sub   = escapeHtml(email?.split("@")[0] ?? "");

  if (isMine && editing) return renderEditCard(title, sub);

  const plan = getPlan(email);
  if (!plan) {
    return `
      <div class="plan-card">
        <div class="plan-head"><span class="plan-title">${title}</span><span class="plan-sub">${sub}</span></div>
        <div class="plan-empty">
          <p>아직 예산안이 없습니다</p>
          ${isMine ? `<button class="save-btn" id="planCreateBtn">예산안 만들기</button>` : ""}
        </div>
      </div>`;
  }

  const total  = plan.items.reduce((s, i) => s + i.amount, 0);
  const remain = plan.income - total;

  const rows = plan.items.map((it, i) => `
    <div class="plan-row">
      <span class="plan-dot" style="background:${PLAN_COLORS[i % PLAN_COLORS.length]}"></span>
      <span class="plan-name">${escapeHtml(it.name)}</span>
      <span class="plan-pct">${plan.income > 0 ? Math.round(it.amount / plan.income * 100) : 0}%</span>
      <span class="plan-amt">${fmtMoney(it.amount)}</span>
    </div>`).join("");

  return `
    <div class="plan-card">
      <div class="plan-head">
        <span class="plan-title">${title}</span>
        <span class="plan-sub">${sub} · 월급 ${fmtMoney(plan.income)}원</span>
      </div>
      <div class="plan-donut-wrap">${donutSVG(plan.income, plan.items, remain)}</div>
      <div class="plan-rows">${rows}</div>
      ${isMine ? `<button class="plan-edit-btn" id="planEditBtn">수정</button>` : ""}
    </div>`;
}

// ── 도넛 차트 ─────────────────────────────────────────────────

function donutSVG(income, items, remain) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const over  = remain < 0;
  // 초과 시에는 배정 합계를 100%로 놓고 비율만 보여준다
  const base  = over ? total : income;

  let off = 0;
  const segs = items.map((it, i) => {
    const len = base > 0 ? (it.amount / base) * DONUT_C : 0;
    const seg = `<circle cx="70" cy="70" r="54" stroke="${PLAN_COLORS[i % PLAN_COLORS.length]}"
      stroke-dasharray="${len} ${DONUT_C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return seg;
  }).join("");

  const centerColor = over ? "var(--expense)" : remain > 0 ? "var(--income)" : "var(--text)";
  const centerLabel = over ? "초과" : "남음";
  const centerVal   = `${over ? "-" : ""}${fmtMoney(remain)}`;

  return `
    <svg width="160" height="160" viewBox="0 0 140 140">
      <g transform="rotate(-90 70 70)" fill="none" stroke-width="15">
        <circle cx="70" cy="70" r="54" stroke="var(--surface2)"/>
        ${segs}
      </g>
      <text x="70" y="63" text-anchor="middle" class="plan-donut-lbl">${centerLabel}</text>
      <text x="70" y="82" text-anchor="middle" class="plan-donut-val" style="fill:${centerColor}">${centerVal}</text>
    </svg>`;
}

// ── 수정 모드 ─────────────────────────────────────────────────

function renderEditCard(title, sub) {
  const itemRows = draft.items.map((it, i) => `
    <div class="plan-edit-row" data-idx="${i}">
      <input type="text" class="pe-name" placeholder="항목명" value="${escapeHtml(it.name)}" />
      <input type="number" class="pe-amount" placeholder="금액" min="0" value="${it.amount || ""}" />
      <button class="pe-del" title="삭제">&times;</button>
    </div>`).join("");

  return `
    <div class="plan-card">
      <div class="plan-head"><span class="plan-title">${title}</span><span class="plan-sub">${sub}</span></div>
      <div class="plan-edit">
        <label>월급</label>
        <input type="number" id="peIncome" placeholder="0" min="0" value="${draft.income || ""}" />
        <label>배정 항목</label>
        ${itemRows}
        <button class="pe-add" id="peAddBtn">+ 항목 추가</button>
        <div class="plan-edit-actions">
          <button class="filter-reset-btn" id="peCancelBtn">취소</button>
          <button class="save-btn" id="peSaveBtn">저장</button>
        </div>
      </div>
    </div>`;
}

// 입력 중이던 값을 draft로 회수 (행 추가/삭제로 재렌더해도 유지되도록)
function syncDraft(container) {
  draft.income = parseInt(container.querySelector("#peIncome")?.value) || 0;
  draft.items  = [...container.querySelectorAll(".plan-edit-row")].map(row => ({
    name:   row.querySelector(".pe-name").value.trim(),
    amount: parseInt(row.querySelector(".pe-amount").value) || 0,
  }));
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

function bindEvents(container, myEmail) {
  const startEdit = () => {
    const plan = getPlan(myEmail);
    draft = plan
      ? { income: plan.income, items: plan.items.map(i => ({ ...i })) }
      : { income: "", items: [{ name: "", amount: "" }] };
    editing = true;
    renderPlanView();
  };

  container.querySelector("#planCreateBtn")?.addEventListener("click", startEdit);
  container.querySelector("#planEditBtn")?.addEventListener("click", startEdit);

  container.querySelector("#peAddBtn")?.addEventListener("click", () => {
    syncDraft(container);
    draft.items.push({ name: "", amount: "" });
    renderPlanView();
  });

  container.querySelectorAll(".pe-del").forEach(btn => {
    btn.addEventListener("click", e => {
      syncDraft(container);
      draft.items.splice(Number(e.target.closest(".plan-edit-row").dataset.idx), 1);
      renderPlanView();
    });
  });

  container.querySelector("#peCancelBtn")?.addEventListener("click", () => {
    editing = false;
    draft = null;
    renderPlanView();
  });

  container.querySelector("#peSaveBtn")?.addEventListener("click", async () => {
    syncDraft(container);
    const income = draft.income;
    const items  = draft.items.filter(i => i.name && i.amount > 0);
    if (!income || income <= 0) { showToast("월급을 입력하세요"); return; }

    await saveBudgetPlan(myEmail, { owner: myEmail, income, items });
    editing = false;
    draft = null;
    await fetchBudgetPlans();
    showToast("예산안이 저장되었습니다");
    renderAll();
  });
}
