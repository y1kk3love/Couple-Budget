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

// ── 정렬 상태 (두 카드에 공통 적용) ───────────────────────────
let sortKey = "default"; // "default"(저장 순서) | "name" | "amount"
let sortDir = "asc";

export function renderPlanView() {
  const container = document.getElementById("view-plan");
  const myEmail   = state.currentUser?.email;
  const partner   = ALLOWED_EMAILS.find(e => e !== myEmail);

  container.innerHTML = `
    ${renderSortBar()}
    <div class="plan-grid">
      ${renderCard(myEmail, true)}
      ${partner ? renderCard(partner, false) : ""}
    </div>`;

  bindSortEvents(container);
  bindEvents(container, myEmail);
}

function getPlan(email) {
  return state.budgetPlans.find(p => p.id === email) ?? null;
}

// ── 정렬 ──────────────────────────────────────────────────────

// 색은 저장된 순서 기준으로 먼저 고정한 뒤 정렬한다.
// 정렬 방식을 바꿔도 각 항목의 색(도넛·행)이 따라 바뀌지 않게 하기 위함.
function sortedItems(items) {
  const colored = items.map((it, i) => ({ ...it, color: PLAN_COLORS[i % PLAN_COLORS.length] }));
  if (sortKey === "default") return colored;

  return colored.sort((a, b) => {
    const cmp = sortKey === "name"
      ? a.name.localeCompare(b.name, "ko")
      : a.amount - b.amount;
    return sortDir === "asc" ? cmp : -cmp;
  });
}

function renderSortBar() {
  // 표시할 항목이 하나도 없으면 정렬 바도 숨긴다
  if (!state.budgetPlans.some(p => p.items?.length)) return "";

  const keys = [
    { key: "default", label: "기본" },
    { key: "name",    label: "이름" },
    { key: "amount",  label: "금액" },
  ];
  const keyBtns = keys.map(({ key, label }) => `
    <button class="sort-key-btn ${sortKey === key ? "active" : ""}" data-sort-key="${key}">${label}</button>`
  ).join("");

  // 기본(저장 순서)일 때는 방향 토글이 의미 없으므로 숨김
  const dirBtn = sortKey === "default" ? "" : `
    <button class="sort-dir-btn" id="planSortDirBtn">${sortDir === "asc" ? "↑ 오름차순" : "↓ 내림차순"}</button>`;

  return `
    <div class="sort-bar">
      <div class="sort-keys">${keyBtns}</div>
      ${dirBtn}
    </div>`;
}

function bindSortEvents(container) {
  container.querySelectorAll(".sort-key-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sortKey;
      if (key !== sortKey) {
        sortKey = key;
        // 키 전환 시 자연스러운 기본 방향: 이름은 가나다순, 금액은 큰 순
        sortDir = key === "amount" ? "desc" : "asc";
      }
      renderPlanView();
    });
  });
  container.querySelector("#planSortDirBtn")?.addEventListener("click", () => {
    sortDir = sortDir === "asc" ? "desc" : "asc";
    renderPlanView();
  });
}

// ── 카드 렌더 ─────────────────────────────────────────────────

function renderCard(email, isMine) {
  const plan  = getPlan(email);
  // 표시 이름이 설정되어 있으면 "OO의 예산안", 없으면 기본 문구
  const title = plan?.name
    ? `${escapeHtml(plan.name)}의 예산안`
    : (isMine ? "내 예산안" : "상대 예산안");
  const meTag = isMine ? `<span class="plan-me-tag">나</span>` : "";
  const sub   = escapeHtml(email?.split("@")[0] ?? "");

  if (isMine && editing) return renderEditCard(`${title}${meTag}`, sub);
  if (!plan) {
    return `
      <div class="plan-card">
        <div class="plan-head"><span class="plan-title">${title}${meTag}</span><span class="plan-sub">${sub}</span></div>
        <div class="plan-empty">
          <p>아직 예산안이 없어요</p>
          ${isMine ? `<button class="save-btn" id="planCreateBtn">예산안 만들기</button>` : ""}
        </div>
      </div>`;
  }

  const total  = plan.items.reduce((s, i) => s + i.amount, 0);
  const remain = plan.income - total;
  const items  = sortedItems(plan.items);

  const rows = items.map(it => `
    <div class="plan-row">
      <span class="plan-dot" style="background:${it.color}"></span>
      <span class="plan-name">${escapeHtml(it.name)}</span>
      <span class="plan-pct">${plan.income > 0 ? Math.round(it.amount / plan.income * 100) : 0}%</span>
      <span class="plan-amt">${fmtMoney(it.amount)}</span>
    </div>`).join("");

  return `
    <div class="plan-card">
      <div class="plan-head">
        <span class="plan-title">${title}${meTag}</span>
        <span class="plan-sub">${sub} · 월급 ${fmtMoney(plan.income)}원</span>
      </div>
      <div class="plan-donut-wrap">${donutSVG(plan.income, items, remain)}</div>
      <div class="plan-rows">${rows}</div>
      ${isMine ? `<button class="plan-edit-btn" id="planEditBtn">수정</button>` : ""}
    </div>`;
}

// ── 도넛 차트 ─────────────────────────────────────────────────
// items는 sortedItems()를 거친 배열(색 포함) — 세그먼트 순서가 행 순서와 일치한다.

function donutSVG(income, items, remain) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const over  = remain < 0;
  // 초과 시에는 배정 합계를 100%로 놓고 비율만 보여준다
  const base  = over ? total : income;

  let off = 0;
  const segs = items.map(it => {
    const len = base > 0 ? (it.amount / base) * DONUT_C : 0;
    const seg = `<circle cx="70" cy="70" r="54" stroke="${it.color}"
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
      <span class="pe-drag" title="드래그로 순서 변경">⠿</span>
      <input type="text" class="pe-name" placeholder="항목명" value="${escapeHtml(it.name)}" />
      <input type="number" class="pe-amount" placeholder="금액" min="0" value="${it.amount || ""}" />
      <button class="pe-del" title="삭제">&times;</button>
    </div>`).join("");

  return `
    <div class="plan-card">
      <div class="plan-head"><span class="plan-title">${title}</span><span class="plan-sub">${sub}</span></div>
      <div class="plan-edit">
        <label>표시 이름</label>
        <input type="text" id="peName" placeholder="예: 바오랍" maxlength="20" value="${escapeHtml(draft.name ?? "")}" />
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
  draft.name   = container.querySelector("#peName")?.value.trim() ?? "";
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
      ? { name: plan.name ?? "", income: plan.income, items: plan.items.map(i => ({ ...i })) }
      : { name: "", income: "", items: [{ name: "", amount: "" }] };
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

  // 드래그로 항목 순서 변경 (pointer 이벤트라 터치에서도 동작)
  // 주의: 드래그 중 행을 DOM에서 재배치하면(제거+재삽입) 포인터 캡처가 풀리므로,
  // setPointerCapture 대신 document에 리스너를 걸어 이벤트를 계속 받는다.
  container.querySelectorAll(".pe-drag").forEach(handle => {
    handle.addEventListener("pointerdown", e => {
      e.preventDefault(); // 텍스트 선택 방지 (터치 스크롤은 CSS touch-action:none이 차단)
      const row = handle.closest(".plan-edit-row");
      row.classList.add("dragging");

      const onMove = ev => {
        // 포인터 세로 위치가 중간점보다 위인 첫 행 앞에 삽입, 없으면 맨 뒤로
        const others = [...container.querySelectorAll(".plan-edit-row")].filter(r => r !== row);
        const next = others.find(o => {
          const r = o.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        if (next) next.before(row);
        else others[others.length - 1]?.after(row);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        row.classList.remove("dragging");
        syncDraft(container); // DOM 순서 그대로 draft에 회수
        renderPlanView();     // data-idx 재부여를 위해 재렌더
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
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

    await saveBudgetPlan(myEmail, { owner: myEmail, name: draft.name, income, items });
    editing = false;
    draft = null;
    await fetchBudgetPlans();
    showToast("예산안이 저장되었습니다");
    renderAll();
  });
}
