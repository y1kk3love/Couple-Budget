// ================================================================
// js/views/calendar.js — 달력 뷰
// 달력 아래에 고른 날짜의 내역이 바로 보인다 (이번 달이면 처음엔 오늘).
// 예전에는 날짜를 누르면 "내역 추가" 창이 열려, 그날 뭘 썼는지 보려면 입력 창 맨 아래까지
// 스크롤해야 했고 달력 아래 절반은 비어 있었다.
// ================================================================

import state from "../state.js";
import { fmtMoney, fmtMoneyShort, escapeHtml } from "../utils.js";
import { openAddModal, openEditModal } from "../modals/txModal.js";
import { renderTxRow } from "./list.js";

// 고른 날짜 — 어느 달의 며칠인지 함께 들고 있어, 달을 옮기면 저절로 풀린다
let selected = null; // { ym: "YYYY-MM", day }

const pad = n => String(n).padStart(2, "0");
const viewYM = () => `${state.currentYear}-${pad(state.currentMonth)}`;

// 지금 보는 달에서 고른 날 (없으면: 이번 달을 보고 있으면 오늘, 다른 달이면 없음)
function selectedDay() {
  if (selected?.ym === viewYM()) return selected.day;
  const today = new Date();
  return today.getFullYear() === state.currentYear && today.getMonth() + 1 === state.currentMonth
    ? today.getDate() : null;
}

/** 달력 탭에서 고른 날짜 "YYYY-MM-DD" — 추가 버튼이 그 날짜로 창을 열 때 쓴다 (없으면 null) */
export function calendarSelectedDate() {
  const d = selectedDay();
  return d ? `${viewYM()}-${pad(d)}` : null;
}

/** 저장한 내역의 날짜를 고른 상태로 — 달력에서 추가·수정한 뒤 그날 내역이 아래에 보이게 (txModal이 호출) */
export function selectCalendarDate(dateStr) {
  const [y, m, d] = String(dateStr ?? "").split("-").map(Number);
  if (y && m && d) selected = { ym: `${y}-${pad(m)}`, day: d };
}

export function renderCalendarView() {
  const container    = document.getElementById("view-calendar");
  const daysInMonth  = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const firstDay     = new Date(state.currentYear, state.currentMonth - 1, 1).getDay();
  const today        = new Date();
  const isThisMonth  =
    today.getFullYear() === state.currentYear &&
    today.getMonth() + 1 === state.currentMonth;
  const picked       = selectedDay();

  // 날짜별 수입/지출 집계
  const dayMap = {};
  for (const t of state.transactions) {
    const d = parseInt(t.date.split("-")[2]);
    if (!dayMap[d]) dayMap[d] = { inc: 0, exp: 0, n: 0 };
    if (t.type === "income")  dayMap[d].inc += t.amount;
    if (t.type === "expense") dayMap[d].exp += t.amount;
    dayMap[d].n++;
  }

  // 이 달의 결혼 일정을 일자별로 모음 (셀에 💍 마커 표시)
  const ymPrefix = viewYM();
  const weddingByDay = {};
  for (const e of (state.wedding?.events ?? [])) {
    if (!e.date.startsWith(ymPrefix)) continue;
    const d = parseInt(e.date.slice(8));
    (weddingByDay[d] ??= []).push(e);
  }

  const emptyCells = Array(firstDay).fill(`<div class="cal-cell empty"></div>`).join("");
  // 마지막 주의 남는 칸도 채운다 — 비워 두면 그 칸 위의 가로줄이 끊겨 보였다
  const tailCells = Array((7 - (firstDay + daysInMonth) % 7) % 7).fill(`<div class="cal-cell empty"></div>`).join("");

  const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
    const d       = i + 1;
    const isToday = isThisMonth && d === today.getDate();
    const dd      = dayMap[d];
    // 화면 낭독기용 이름 — 예전에는 "N일 내역 추가"만 읽혀 칸의 금액이 빠졌다
    const label = [
      `${state.currentMonth}월 ${d}일`,
      dd?.exp > 0 ? `지출 ${fmtMoney(dd.exp)}원` : "",
      dd?.inc > 0 ? `수입 ${fmtMoney(dd.inc)}원` : "",
      dd ? `내역 ${dd.n}건` : "내역 없음",
      weddingByDay[d] ? `결혼 일정 ${weddingByDay[d].length}건` : "",
    ].filter(Boolean).join(", ");
    return `
      <div class="cal-cell${isToday ? " today" : ""}${d === picked ? " selected" : ""}" data-day="${d}" role="button" tabindex="0"
        aria-pressed="${d === picked}" aria-label="${escapeHtml(label)}">
        <div class="day-num-wrap">
          <div class="day-num">${d}</div>
        </div>
        ${weddingByDay[d] ? `<div class="cal-event" title="${escapeHtml(weddingByDay[d].map(e => e.title).join(", "))}"><span class="cal-event-ring">💍</span><span class="cal-event-text"> ${escapeHtml(weddingByDay[d][0].title)}${weddingByDay[d].length > 1 ? ` +${weddingByDay[d].length - 1}` : ""}</span></div>` : ""}
        <div class="cal-amounts">
          ${dd?.inc > 0 ? `<div class="cal-inc"><span class="cal-sign">+</span>${fmtMoneyShort(dd.inc)}</div>` : ""}
          ${dd?.exp > 0 ? `<div class="cal-exp"><span class="cal-sign">-</span>${fmtMoneyShort(dd.exp)}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="calendar-wrap">
      <div class="cal-head">
        <div class="cal-day-name">일</div>
        <div class="cal-day-name">월</div>
        <div class="cal-day-name">화</div>
        <div class="cal-day-name">수</div>
        <div class="cal-day-name">목</div>
        <div class="cal-day-name">금</div>
        <div class="cal-day-name">토</div>
      </div>
      <div class="cal-grid">${emptyCells}${dayCells}${tailCells}</div>
    </div>
    ${renderDayPanel(picked, weddingByDay[picked] ?? [])}`;

  // 날짜 칸 → 그날 내역을 아래에 (다시 그리지 않고 표시만 바꾼다 — 달력이 통째로 깜빡이지 않게)
  container.querySelectorAll(".cal-cell[data-day]").forEach(cell => {
    cell.addEventListener("click", () => {
      const day = Number(cell.dataset.day);
      selected = { ym: viewYM(), day };
      container.querySelectorAll(".cal-cell[data-day]").forEach(c => {
        const on = c === cell;
        c.classList.toggle("selected", on);
        c.setAttribute("aria-pressed", on);
      });
      const panel = container.querySelector(".cal-day-panel");
      panel.outerHTML = renderDayPanel(day, weddingByDay[day] ?? []);
      bindDayPanel(container);
    });
  });
  bindDayPanel(container);
}

// ── 고른 날짜의 내역 ──────────────────────────────────────────

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function renderDayPanel(day, events) {
  if (!day) {
    return `
      <div class="cal-day-panel">
        <p class="cal-day-empty">날짜를 누르면 그날 내역이 여기에 보여요</p>
      </div>`;
  }
  const dateStr = `${viewYM()}-${pad(day)}`;
  const txs     = state.transactions.filter(t => t.date === dateStr);
  const inc     = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp     = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const weekday = WEEKDAYS[new Date(state.currentYear, state.currentMonth - 1, day).getDay()];
  const totals  = [
    exp > 0 ? `<span class="minus">-${fmtMoney(exp)}원</span>` : "",
    inc > 0 ? `<span class="plus">+${fmtMoney(inc)}원</span>` : "",
  ].filter(Boolean).join("");
  const eventLines = events.map(e =>
    `<div class="cal-day-event">💍 ${escapeHtml(e.title)}${e.time ? ` <span>${escapeHtml(e.time)}</span>` : ""}</div>`).join("");

  return `
    <div class="cal-day-panel" data-date="${dateStr}">
      <div class="cal-day-head">
        <h4>${state.currentMonth}월 ${day}일 <span>${weekday}요일</span></h4>
        <div class="cal-day-total">${totals}</div>
      </div>
      ${eventLines}
      ${txs.length
        ? `<div class="list-group cal-day-list">${txs.map(t => renderTxRow(t, { showDate: false })).join("")}</div>`
        : `<p class="cal-day-empty">이 날은 내역이 없어요</p>`}
      <button class="add-fixed-btn cal-day-add" id="calDayAddBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${state.currentMonth}월 ${day}일에 추가
      </button>
    </div>`;
}

function bindDayPanel(container) {
  const panel = container.querySelector(".cal-day-panel");
  if (!panel) return;
  panel.querySelectorAll(".tx-item[data-id]").forEach(el =>
    el.addEventListener("click", () => openEditModal(el.dataset.id)));
  panel.querySelector("#calDayAddBtn")?.addEventListener("click", () => openAddModal(panel.dataset.date));
}
