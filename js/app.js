// ================================================================
// js/app.js — 진입점 및 앱 초기화
// ================================================================

import state from "./state.js";
import { fmtMoney, showToast, todayStr, downloadCSV, escapeHtml, hasUnsavedInput } from "./utils.js";
import { getCategoryInfo } from "./constants.js";
import {
  fetchTransactions, fetchFixedItems,
  applyFixedItemsToMonth, calcAccumulatedBalance, fetchBudget,
  fetchBudgetPlans, fetchAllTransactions
} from "./db.js";
import { setupAuth }      from "./auth.js";
import { setupThemeToggle } from "./theme.js";
import { setupTxModal, openAddModal } from "./modals/txModal.js";
import { setupFixedModal } from "./modals/fixedModal.js";
import { setupCsvModal }  from "./modals/csvModal.js";
import { setupBudgetModal, openBudgetModal } from "./modals/budgetModal.js";
import { renderCalendarView } from "./views/calendar.js";
import { renderListView }     from "./views/list.js";
import { renderStatsView, setupCategoryDetailModal } from "./views/stats.js";
import { renderFixedView }    from "./views/fixed.js";
import { renderPlanView, resetPlanEdit } from "./views/plan.js";
import { renderWeddingView, setWeddingSegment, markWeddingStale, weddingAddAction } from "./views/wedding.js";
import { setupWeddingModals } from "./modals/weddingModal.js";
import { fetchWeddingEvents } from "./weddingDb.js";
import { startSync } from "./sync.js";

// ── 앱 초기화 ─────────────────────────────────────────────────

// 로그아웃 → 재로그인 시 onAuthStateChanged가 initApp을 다시 호출하므로,
// 이벤트 리스너는 최초 1회만 등록한다 (중복 등록 시 클릭당 여러 번 실행됨).
let listenersBound = false;

export async function initApp() {
  updateMonthLabel();
  // 리스너를 데이터 로드보다 먼저 건다 — 예전에는 로드 뒤에 걸어서, 첫 로드가 실패하면
  // (오프라인·색인 누락 등) 월 이동·탭 전환 버튼이 그 세션 내내 먹통이었다
  if (!listenersBound) {
    setupMonthNav();
    setupViewNav();
    setupMobileMenu();
    setupGlobalKeys();
    setupWeddingBanner();
    listenersBound = true;
  }
  // 실시간 동기화 시작 (로그아웃 시 auth.js가 멈춘다). 조회보다 먼저 걸어 두면
  // 누적 잔액용 전체 조회를 리스너의 첫 스냅샷이 대신한다.
  startSync();
  // 결혼 일정은 메인 화면 배너·달력 마커에 쓰여 로그인 시 1회 미리 로드
  // (다른 결혼 데이터는 탭 진입 시 로드 — 이 예외는 CLAUDE.md에 문서화)
  await fetchWeddingEvents();
  await loadAllData();
}

// ── 로그아웃 정리 (auth.js가 호출) ─────────────────────────────
// 모듈 상태와 DOM은 로그아웃해도 남는다. 같은 브라우저에서 상대가 로그인했을 때
// 내가 쓰던 초안·입력이 보이거나 상대 이름으로 저장되지 않도록 비운다.
export function resetSessionUI() {
  resetPlanEdit();
  // 열린 모달은 각자의 닫기 버튼으로 닫아 모달별 정리 로직을 태운다 (확인 다이얼로그는 취소)
  document.querySelector(".confirm-overlay .confirm-cancel")?.click();
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
}

// ── 상대 기기의 변경 반영 (sync.js가 호출) ─────────────────────
// state는 리스너가 이미 최신으로 바꿔 두었다. 입력 중인 화면은 다시 그리면 입력이 날아가므로
// 그 화면은 그대로 두고 요약·배너만 갱신한다 — 화면은 다음 렌더 때 최신으로 그려진다.
export function renderRemoteChange() {
  if (loadError) { loadAllData(); return; } // 로드 실패 중이었다면 연결이 돌아온 것 — 다시 로드
  const view = document.getElementById(`view-${state.currentView}`);
  if (view && hasUnsavedInput(view)) {
    if (!MONTHLESS_VIEWS[state.currentView]) renderSummary();
    renderWeddingBanner();
    return;
  }
  renderAll();
}

// ── 데이터 로드 ───────────────────────────────────────────────
// 월 이동을 연타하면 이전 달 로드가 나중에 끝나 최신 화면을 덮을 수 있어,
// 순번을 매겨 낡은 로드는 렌더하지 않는다 (fetchTransactions도 자체 방어함).
let loadSeq = 0;
// 마지막 로드 실패 원인 — 있으면 월 화면 대신 오류 안내와 "다시 시도"를 보인다.
// (빈 화면을 그리면 "내역이 하나도 없다"로 오해하게 된다)
let loadError = null;

async function loadAllData() {
  const seq = ++loadSeq;
  const year = state.currentYear, month = state.currentMonth;
  try {
    await Promise.all([
      fetchTransactions(),
      fetchFixedItems(),
      fetchBudget(),
      fetchBudgetPlans(),
    ]);
    if (seq !== loadSeq) return; // 그 사이 더 최신 로드가 시작됨
    await applyFixedItemsToMonth(year, month);
    await fetchTransactions(); // 고정비 적용 후 재조회
  } catch (err) {
    if (seq !== loadSeq) return;
    console.error("데이터 로드 실패:", err);
    loadError = err;
    showToast("데이터를 불러오지 못했어요");
    renderAll();
    return;
  }
  if (seq !== loadSeq) return;
  loadError = null;
  renderAll();
}

// 로드 실패 안내 — 월 이동이나 "다시 시도"로 다시 로드한다
function renderLoadError(container) {
  const hint = loadError?.code === "failed-precondition"
    ? "Firestore 복합 색인이 없어요. README의 '복합 인덱스' 안내대로 색인을 만든 뒤 다시 시도해주세요."
    : "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
  container.innerHTML = `
    <div class="empty-state">
      <span class="empty-emoji">⚠️</span>
      <p>데이터를 불러오지 못했어요</p>
      <p class="load-error-hint">${hint}</p>
      <button class="save-btn load-retry-btn" id="loadRetryBtn">다시 시도</button>
    </div>`;
  container.querySelector("#loadRetryBtn").addEventListener("click", e => {
    e.currentTarget.disabled = true;
    loadAllData();
  });
}

// ── 전체 렌더 (외부에서도 호출 가능) ─────────────────────────

export function renderAll() {
  applyViewChrome();
  // 월과 무관한 화면에서는 요약 바가 숨겨져 있으므로 계산하지 않는다 (돌아오면 다시 그림)
  if (!MONTHLESS_VIEWS[state.currentView]) renderSummary();
  renderWeddingBanner();
  // 월 데이터 로드가 실패한 상태면 월 화면 대신 안내 (예산안·결혼은 각자 따로 읽으므로 그대로 그림)
  if (loadError && !MONTHLESS_VIEWS[state.currentView]) {
    renderLoadError(document.getElementById(`view-${state.currentView}`));
    return;
  }
  switch (state.currentView) {
    case "calendar": renderCalendarView(); break;
    case "list":     renderListView();     break;
    case "stats":    renderStatsView();    break;
    case "fixed":    renderFixedView();    break;
    case "plan":     renderPlanView();     break;
    case "wedding":  renderWeddingView();  break;
  }
}

// ── 화면별 상단 영역 ──────────────────────────────────────────
// 예산안·결혼은 월과 무관한 화면이라 이번 달 요약·월 이동·결혼 일정 배너를 숨기고
// 그 자리에 화면 제목을 보인다 (CSS: .main-content.monthless)

const MONTHLESS_VIEWS = { plan: "예산안", wedding: "결혼 준비" };

function applyViewChrome() {
  const title = MONTHLESS_VIEWS[state.currentView] ?? "";
  document.querySelector(".main-content").classList.toggle("monthless", !!title);
  document.getElementById("viewTitle").textContent = title;
  refreshAddButton();
}

// ── 추가 버튼 (헤더 "내역 추가" · 모바일 하단 +) ─────────────────
// 결혼 탭에서는 지금 세그먼트의 추가(예산 항목·일정·할 일·업체)를, 그 밖에서는 가계부 거래 입력을 연다.

function currentAddAction() {
  return state.currentView === "wedding" ? weddingAddAction() : null;
}

export function refreshAddButton() {
  const label = currentAddAction()?.label ?? "내역 추가";
  document.querySelector("#addTxBtn span").textContent = label;
  document.getElementById("mobAddBtn").setAttribute("aria-label", label);
}

function onAddClick() {
  const action = currentAddAction();
  if (action) action.run();
  else openAddModal();
}

// ── 요약 카드 ─────────────────────────────────────────────────

let summarySeq = 0;

async function renderSummary() {
  const seq = ++summarySeq;
  const totalIncome  = state.transactions
    .filter(t => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = state.transactions
    .filter(t => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  // 누적 잔액은 전체 거래를 읽어야 해서 오프라인이면 실패한다 — 요약 바 전체가 멈추지 않게 그 칸만 비운다
  let accum = null;
  try {
    accum = await calcAccumulatedBalance();
  } catch (err) {
    console.error("누적 잔액 계산 실패:", err);
  }
  if (seq !== summarySeq) return; // 더 최신 렌더가 시작됨 — 낡은 결과로 덮지 않는다
  const accumTotal = (accum ?? 0) + balance;

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
      ${accum === null
        ? `<div class="val neutral">—</div><div class="sub">불러오지 못함</div>`
        : `<div class="val ${accumClass}">${accumSign}${fmtMoney(accumTotal)}원</div>
      <div class="sub">${accum !== 0 ? "이전 달 포함" : "첫 달"}</div>`}
    </div>
    ${renderBudgetCard(totalExpense)}`;

  // 예산 카드 클릭 → 설정 모달 (innerHTML 재생성이므로 매번 다시 바인딩)
  document.getElementById("budgetCard").addEventListener("click", openBudgetModal);
}

// ── 예산 카드 ─────────────────────────────────────────────────

function renderBudgetCard(totalExpense) {
  if (state.budget == null) {
    return `
      <div class="sum-card budget-card unset" id="budgetCard" role="button" tabindex="0" title="클릭해서 월 예산 설정">
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
    <div class="sum-card budget-card" id="budgetCard" role="button" tabindex="0" title="클릭해서 월 예산 수정">
      <div class="lbl">예산 ${over ? "초과" : "남음"}</div>
      <div class="val ${valClass}">${over ? "-" : ""}${fmtMoney(remaining)}원</div>
      <div class="pbar budget-pbar"><div class="pfill" style="width:${barPct}%;background:${barColor}"></div></div>
      <div class="sub">${subText}</div>
    </div>`;
}

// ── 결혼 일정 배너 ────────────────────────────────────────────
// 보고 있는 달에 오늘 이후 결혼 일정이 있으면 요약 바 아래 한 줄로 알린다.
// 클릭 → 결혼 탭 일정 세그먼트. 결혼 탭 안에서는 중복이라 숨긴다.

function renderWeddingBanner() {
  const el = document.getElementById("weddingBanner");
  const ym = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
  const today = todayStr();
  const upcoming = (state.wedding.events ?? [])
    .filter(e => e.date.startsWith(ym) && e.date >= today);

  if (!upcoming.length || state.currentView === "wedding") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  const list = upcoming.slice(0, 3).map(e => {
    const [, m, d] = e.date.split("-").map(Number);
    return `${escapeHtml(e.title)} ${m}/${d}`;
  }).join(" · ");
  const more = upcoming.length > 3 ? ` 외 ${upcoming.length - 3}건` : "";

  el.innerHTML = `💍 이번 달 결혼 일정 ${upcoming.length}건 — ${list}${more}`;
  el.classList.remove("hidden");
}

function setupWeddingBanner() {
  document.getElementById("weddingBanner").addEventListener("click", () => {
    setWeddingSegment("events");
    switchView("wedding");
  });
}

// ── 월 이동 ───────────────────────────────────────────────────

function setupMonthNav() {
  document.getElementById("prevMonth").addEventListener("click", () => changeMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => changeMonth(+1));
  // 월 라벨 클릭 → 이번 달로 복귀
  document.getElementById("currentMonthLabel").addEventListener("click", () => {
    const now = new Date();
    setMonth(now.getFullYear(), now.getMonth() + 1);
  });
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
  // 결혼 탭은 월 로드와 무관하게 따로 읽으므로, 들어올 때마다 최신본을 다시 받게 표시
  if (view === "wedding") markWeddingStale();

  // 뷰 컨테이너 전환
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");

  // 사이드바 / 모바일 탭 활성화 상태
  document.querySelectorAll("[data-view]").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view)
  );

  renderAll();
}

// ── 전역 키보드 (접근성) ──────────────────────────────────────

function setupGlobalKeys() {
  document.addEventListener("keydown", e => {
    // Esc → 열려 있는 모달 닫기 (확인 다이얼로그는 utils.js에서 자체 처리)
    if (e.key === "Escape" && !document.querySelector(".confirm-overlay")) {
      const open = document.querySelector(".modal-overlay:not(.hidden)");
      // 각 모달의 닫기 버튼을 눌러 모달별 정리 로직(초기화 등)을 그대로 태운다
      open?.querySelector(".modal-close")?.click();
      return;
    }
    // role="button"인 div/행을 Enter·Space로 활성화 (키보드 접근성)
    if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLElement
        && e.target.getAttribute("role") === "button") {
      e.preventDefault();
      e.target.click();
    }
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
document.getElementById("sideExportBtn").addEventListener("click", exportAllCsv); // 모바일 햄버거 메뉴
document.getElementById("addTxBtn").addEventListener("click", onAddClick);
document.getElementById("mobAddBtn").addEventListener("click", onAddClick);
setupTxModal();
setupFixedModal();
setupCsvModal();
setupBudgetModal();
setupWeddingModals();
setupCategoryDetailModal();
