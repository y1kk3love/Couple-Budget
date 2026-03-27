// ================================================================
// js/views/calendar.js — 달력 뷰
// ================================================================

import state from "../state.js";
import { fmtMoneyShort } from "../utils.js";
import { openAddModal } from "../modals/txModal.js";

export function renderCalendarView() {
  const container    = document.getElementById("view-calendar");
  const daysInMonth  = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const firstDay     = new Date(state.currentYear, state.currentMonth - 1, 1).getDay();
  const today        = new Date();
  const isThisMonth  =
    today.getFullYear() === state.currentYear &&
    today.getMonth() + 1 === state.currentMonth;

  // 날짜별 수입/지출 집계
  const dayMap = {};
  for (const t of state.transactions) {
    const d = parseInt(t.date.split("-")[2]);
    if (!dayMap[d]) dayMap[d] = { inc: 0, exp: 0 };
    if (t.type === "income")  dayMap[d].inc += t.amount;
    if (t.type === "expense") dayMap[d].exp += t.amount;
  }

  const emptyCells = Array(firstDay).fill(`<div class="cal-cell empty"></div>`).join("");

  const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
    const d       = i + 1;
    const isToday = isThisMonth && d === today.getDate();
    const dd      = dayMap[d];
    return `
      <div class="cal-cell${isToday ? " today" : ""}" data-day="${d}">
        <div class="day-num-wrap">
          <div class="day-num">${d}</div>
        </div>
        <div class="cal-amounts">
          ${dd?.inc > 0 ? `<div class="cal-inc">+${fmtMoneyShort(dd.inc)}</div>` : ""}
          ${dd?.exp > 0 ? `<div class="cal-exp">-${fmtMoneyShort(dd.exp)}</div>` : ""}
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
      <div class="cal-grid">${emptyCells}${dayCells}</div>
    </div>`;

  // 날짜 셀 클릭 → 내역 추가 모달
  container.querySelectorAll(".cal-cell[data-day]").forEach(cell => {
    cell.addEventListener("click", () => {
      const dd      = cell.dataset.day.padStart(2, "0");
      const mm      = String(state.currentMonth).padStart(2, "0");
      const dateStr = `${state.currentYear}-${mm}-${dd}`;
      openAddModal(dateStr);
    });
  });
}
