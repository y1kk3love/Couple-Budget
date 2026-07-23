// ================================================================
// js/app.js — 진입점 및 앱 초기화
// ================================================================

import state from "./state.js";
import { fmtMoney, showToast, todayStr, downloadCSV } from "./utils.js";
import { getCategoryInfo } from "./constants.js";
import {
  fetchTransactions, fetchFixedItems,
  applyFixedItemsToCurrentMonth, calcAccumulatedBalance, fetchBudget,
  fetchBudgetPlans, fetchAllTransactions
} from "./db.js";
import { setupAuth }      from "./auth.js";
import { setupThemeToggle } from "./theme.js";
import { setupTxModal }   from "./modals/txModal.js";
import { setupFixedModal } from "./modals/fixedModal.js";
import { setupCsvModal }  from "./modals/csvModal.js";
import { setupBudgetModal, openBudgetModal } from "./modals/budgetModal.js";
import { renderCalendarView } from "./views/calendar.js";
import { renderListView }     from "./views/list.js";
import { renderStatsView, setupCategoryDetailModal } from "./views/stats.js";
import { renderFixedView }    from "./views/fixed.js";
import { renderPlanView }     from "./views/plan.js";

// ── 앱 초기화 ─────────────────────────────────────────────────

// 로그아웃 → 재로그인 시 onAuthStateChanged가 initApp을 다시 호출하므로,
// 이벤트 리스너는 최초 1회만 등록한다 (중복 등록 시 클릭당 여러 번 실행됨).
let listenersBound = false;

export async function initApp() {
  updateMonthLabel();
  await loadAllData();
  if (!listenersBound) {
    setupMonthNav();
    setupViewNav();
    setupMobileMenu();
    listenersBound = true;
  }
}

// ── 데이터 로드 ───────────────────────────────────────────────

async function loadAllData() {
  await Promise.all([
    fetchTransactions(),
    fetchFixedItems(),
    fetchBudget(),
    fetchBudgetPlans(),
  ]);
  await applyFixedItemsToCurrentMonth();
  await fetchTransactions(); // 고정비 적용 후 재조회
  renderAll();
}

// ── 전체 렌더 (외부에서도 호출 가능) ─────────────────────────

export function renderAll() {
  renderSummary();
  switch (state.currentView) {
    case "calendar": renderCalendarView(); break;
    case "list":     renderListView();     break;
    case "stats":    renderStatsView();    break;
    case "fixed":    renderFixedView();    break;
    case "plan":     renderPlanView();     break;
  }
}

// ── 요약 카드 ─────────────────────────────────────────────────

async function renderSummary() {
  const totalIncome  = state.transactions
    .filter(t => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = state.transactions
    .filter(t => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const accum   = await calcAccumulatedBalance();
  const accumTotal = accum + balance;

  const balanceClass = balance > 0 ? "income" : balance < 0 ? "expense" : "neutral";
  const accumClass   = accumTotal > 0 ? "income" : accumTotal < 0 ? "expense" : "neutral";
  const balanceSign  = balance > 0 ? "+" : balance < 0 ? "-" : "";
  const accumSign    = accumTotal > 0 ? "+" : accumTotal < 0 ? "-" : "";

  // 토스식 위계: 이번달 잔액을 주인공으로 크게, 수입·지출은 한 카드에 2줄로
  document.getElementById("summaryBar").innerHTML = `
    <div class="sum-card hero">
      <div class="lbl">이번달 잔액</div>
      <div class="val ${balanceClass}">${balanceSign}${fmtMoney(balance)}원</div>
      <div class="sub">${state.currentMonth}월 수입 − 지출</div>
    </div>
    <div class="sum-card duo">
      <div class="duo-row"><span class="lbl">수입</span><span class="duo-val income">${totalIncome > 0 ? "+" : ""}${fmtMoney(totalIncome)}원</span></div>
      <div class="duo-row"><span class="lbl">지출</span><span class="duo-val expense">${totalExpense > 0 ? "-" : ""}${fmtMoney(totalExpense)}원</span></div>
    </div>
    <div class="sum-card">
      <div class="lbl">누적 잔액</div>
      <div class="val ${accumClass}">${accumSign}${fmtMoney(accumTotal)}원</div>
      <div class="sub">${accum !== 0 ? "이전 달 포함" : "첫 달"}</div>
    </div>
    ${renderBudgetCard(totalExpense)}`;

  // 예산 카드 클릭 → 설정 모달 (innerHTML 재생성이므로 매번 다시 바인딩)
  document.getElementById("budgetCard").addEventListener("click", openBudgetModal);
}

// ── 예산 카드 ─────────────────────────────────────────────────

function renderBudgetCard(totalExpense) {
  if (state.budget == null) {
    return `
      <div class="sum-card budget-card unset" id="budgetCard" title="클릭해서 월 예산 설정">
        <div class="lbl">예산</div>
        <div class="val neutral budget-unset-val">설정하기</div>
        <div class="sub">클릭해서 월 예산 설정</div>
      </div>`;
  }

  const pct       = Math.round(totalExpense / state.budget * 100);
  const barPct    = Math.min(100, pct);
  const remaining = state.budget - totalExpense;
  const over      = remaining < 0;
  const warn      = !over && pct >= 80;
  const barColor  = over ? "var(--expense)" : warn ? "var(--warn)" : "var(--income)";
  const valClass  = over ? "expense" : warn ? "warn" : "income";

  const ym         = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
  const isOverride = state.budgetMonths?.[ym] != null;
  const subText    = (over
    ? `예산 초과! (${pct}%)`
    : `예산 ${fmtMoney(state.budget)}원 중 ${pct}% 사용`)
    + (isOverride ? " · 이번 달 전용" : "");

  return `
    <div class="sum-card budget-card" id="budgetCard" title="클릭해서 월 예산 수정">
      <div class="lbl">예산 ${over ? "초과" : "남음"}</div>
      <div class="val ${valClass}">${over ? "-" : ""}${fmtMoney(remaining)}원</div>
      <div class="pbar budget-pbar"><div class="pfill" style="width:${barPct}%;background:${barColor}"></div></div>
      <div class="sub">${subText}</div>
    </div>`;
}

// ── 월 이동 ───────────────────────────────────────────────────

function setupMonthNav() {
  document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => changeMonth(+1));
}

async function changeMonth(delta) {
  state.currentMonth += delta;
  if (state.currentMonth < 1)  { state.currentMonth = 12; state.currentYear--; }
  if (state.currentMonth > 12) { state.currentMonth = 1;  state.currentYear++; }
  updateMonthLabel();
  await loadAllData();
}

export async function setMonth(year, month) {
  if (year === state.currentYear && month === state.currentMonth) return;
  state.currentYear  = year;
  state.currentMonth = month;
  updateMonthLabel();
  await loadAllData();
}

function updateMonthLabel() {
  document.getElementById("currentMonthLabel").textContent =
    `${state.currentYear}년 ${state.currentMonth}월`;
}

// ── 뷰 전환 ───────────────────────────────────────────────────

function setupViewNav() {
  const allNavBtns = document.querySelectorAll("[data-view]");

  allNavBtns.forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  state.currentView = view;

  // 뷰 컨테이너 전환
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");

  // 사이드바 / 모바일 탭 활성화 상태
  document.querySelectorAll("[data-view]").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view)
  );

  renderAll();
}

// ── 모바일 사이드바 토글 ──────────────────────────────────────

function setupMobileMenu() {
  const sidebar = document.querySelector(".sidebar");

  document.getElementById("mobileMenuBtn").addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  // 사이드바 외부 클릭 시 닫기
  sidebar.addEventListener("click", () => {
    if (window.innerWidth <= 768) sidebar.classList.remove("open");
  });
}

// ── CSV 내보내기 ──────────────────────────────────────────────
// 전체 기간 거래를 CSV로 다운로드 (엑셀 호환 UTF-8 BOM).

async function exportAllCsv() {
  if (!state.currentUser) return;
  const txs = await fetchAllTransactions();
  if (!txs.length) { showToast("내보낼 내역이 없습니다"); return; }

  const rows = [["날짜", "이름", "금액", "구분", "카테고리", "고정/변동", "메모", "작성자"]];
  txs.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([
    t.date,
    t.name,
    t.amount,
    t.type === "income" ? "수입" : "지출",
    getCategoryInfo(t.category, t.type).name,
    t.kind === "fixed" ? "고정" : "변동",
    t.memo ?? "",
    t.owner ?? "",
  ]));

  downloadCSV(`우리가계부_${todayStr()}.csv`, rows);
  showToast(`${txs.length}건을 내보냈습니다`);
}

// ── 앱 부트스트랩 ─────────────────────────────────────────────

setupAuth();
setupThemeToggle();
document.getElementById("csvExportBtn").addEventListener("click", exportAllCsv);
setupTxModal();
setupFixedModal();
setupCsvModal();
setupBudgetModal();
setupCategoryDetailModal();
