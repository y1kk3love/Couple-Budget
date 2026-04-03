// ================================================================
// js/app.js — 진입점 및 앱 초기화
// ================================================================

import state from "./state.js";
import { fmtMoney, showToast, checkBudgetWarnings } from "./utils.js";
import {
  fetchTransactions, fetchFixedItems, fetchBudgets,
  applyFixedItemsToCurrentMonth, calcAccumulatedBalance, clearAllData
} from "./db.js";
import { setupAuth }      from "./auth.js";
import { setupTxModal }   from "./modals/txModal.js";
import { setupFixedModal } from "./modals/fixedModal.js";
import { setupCsvModal }  from "./modals/csvModal.js";
import { renderCalendarView } from "./views/calendar.js";
import { renderListView }     from "./views/list.js";
import { renderStatsView }    from "./views/stats.js";
import { renderBudgetView }   from "./views/budget.js";
import { renderFixedView }    from "./views/fixed.js";

// ── 앱 초기화 ─────────────────────────────────────────────────

export async function initApp() {
  updateMonthLabel();
  await loadAllData();
  setupMonthNav();
  setupViewNav();
  setupMobileMenu();
  setupResetBtn();
  checkBudgetWarnings(state.transactions, state.budgets, state.currentYear, state.currentMonth);
}

// ── 데이터 로드 ───────────────────────────────────────────────

async function loadAllData() {
  await Promise.all([
    fetchTransactions(),
    fetchFixedItems(),
    fetchBudgets(),
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
    case "budget":   renderBudgetView();   break;
    case "fixed":    renderFixedView();    break;
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

  document.getElementById("summaryBar").innerHTML = `
    <div class="sum-card">
      <div class="lbl">수입</div>
      <div class="val income">${fmtMoney(totalIncome)}</div>
    </div>
    <div class="sum-card">
      <div class="lbl">지출</div>
      <div class="val expense">${fmtMoney(totalExpense)}</div>
    </div>
    <div class="sum-card">
      <div class="lbl">이번달 잔액</div>
      <div class="val ${balanceClass}">${balanceSign}${fmtMoney(balance)}</div>
    </div>
    <div class="sum-card">
      <div class="lbl">누적 잔액</div>
      <div class="val ${accumClass}">${accumSign}${fmtMoney(accumTotal)}</div>
      <div class="sub">${state.currentMonth > 1 ? "이전 달 포함" : "첫 달"}</div>
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

// ── 데이터 초기화 ──────────────────────────────────────────────

function setupResetBtn() {
  document.getElementById("resetDataBtn").addEventListener("click", async () => {
    if (!confirm("모든 거래내역, 고정비, 예산 데이터를 삭제합니다.\n정말 초기화하시겠습니까?")) return;
    if (!confirm("⚠️ 되돌릴 수 없습니다.\n진짜로 전부 삭제하시겠습니까?")) return;
    await clearAllData();
    renderAll();
    showToast("데이터가 초기화되었습니다");
  });
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

// ── 앱 부트스트랩 ─────────────────────────────────────────────

setupAuth();
setupTxModal();
setupFixedModal();
setupCsvModal();
