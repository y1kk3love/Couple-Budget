// ================================================================
// js/views/weddingEvents.js — 결혼 일정 세그먼트 (미니 달력 + 목록)
// wedding.js(셸)가 세그먼트 컨테이너를 넘겨 호출한다.
// ================================================================

import state from "../state.js";
import { escapeHtml, todayStr } from "../utils.js";
import { openWeddingEventModal } from "../modals/weddingModal.js";

// 미니 달력이 보여주는 연월 — 재렌더에도 유지, 기본은 오늘
const now = new Date();
let calYear  = now.getFullYear();
let calMonth = now.getMonth() + 1;

// 오늘 기준 D-라벨 (일정용 — 지난 일정은 "지남")
function dLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t  = new Date();
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = Math.round((new Date(y, m - 1, d) - t0) / 86400000);
  return diff > 0 ? `D-${diff}` : diff === 0 ? "오늘" : "지남";
}

// "9/5 (토) 14:00" 형태
function fmtEventDate(e) {
  const [y, m, d] = e.date.split("-").map(Number);
  const dow = "일월화수목금토"[new Date(y, m - 1, d).getDay()];
  return `${m}/${d} (${dow})${e.time ? ` ${escapeHtml(e.time)}` : ""}`;
}

export function renderEventsSegment(container) {
  // 좌: 일정 목록(자체 스크롤) / 우: 미니 달력 — 모바일에서는 달력이 위로 스택
  container.innerHTML = `
    <div class="wd-events-layout">
      <div class="wd-events-list">${renderEventList()}</div>
      <div class="wd-events-cal">${renderMiniCal()}</div>
    </div>`;
  bindEvents(container);
}

// ── 미니 달력 ─────────────────────────────────────────────────

function renderMiniCal() {
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDay    = new Date(calYear, calMonth - 1, 1).getDay();
  const today       = todayStr();
  const ym          = `${calYear}-${String(calMonth).padStart(2, "0")}`;

  // 이 달에 일정이 있는 날짜 집합
  const eventDays = new Set(
    state.wedding.events.filter(e => e.date.startsWith(ym)).map(e => parseInt(e.date.slice(8)))
  );

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"]
    .map(n => `<div class="wd-mc-dayname">${n}</div>`).join("");
  const empties = Array(firstDay).fill(`<div class="wd-mc-cell empty"></div>`).join("");
  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const d       = i + 1;
    const dateStr = `${ym}-${String(d).padStart(2, "0")}`;
    const cls = [
      "wd-mc-cell",
      dateStr === today ? "today" : "",
      eventDays.has(d) ? "has-event" : "",
    ].filter(Boolean).join(" ");
    return `<div class="${cls}" data-mc-date="${dateStr}" role="button" tabindex="0"
      aria-label="${calMonth}월 ${d}일 일정 추가">${d}</div>`;
  }).join("");

  return `
    <div class="wd-minical">
      <div class="wd-minical-head">
        <button class="arrow-btn" id="wdCalPrev" aria-label="이전 달">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="wd-minical-title">${calYear}년 ${calMonth}월</span>
        <button class="arrow-btn" id="wdCalNext" aria-label="다음 달">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="wd-minical-grid">${dayNames}${empties}${cells}</div>
    </div>`;
}

// ── 일정 목록 (다가오는 순, 지난 일정은 흐리게 하단) ──────────

function renderEventList() {
  const today    = todayStr();
  const events   = state.wedding.events;
  const upcoming = events.filter(e => e.date >= today);
  const past     = events.filter(e => e.date < today).slice().reverse(); // 최근에 지난 순

  const row = (e, isPast) => `
    <div class="fixed-item ${isPast ? "wd-event-past" : ""}" data-wd-event="${escapeHtml(e.id)}" role="button" tabindex="0">
      <span class="wd-event-dday">${dLabel(e.date)}</span>
      <div class="fixed-info">
        <div class="fixed-name">${escapeHtml(e.title)}</div>
        <div class="fixed-meta">${fmtEventDate(e)}${e.memo ? ` · ${escapeHtml(e.memo)}` : ""}</div>
      </div>
    </div>`;

  const upcomingRows = upcoming.map(e => row(e, false)).join("");
  const pastRows     = past.length
    ? `<p class="wd-past-title">지난 일정</p><div class="fixed-list">${past.map(e => row(e, true)).join("")}</div>`
    : "";
  const empty = events.length ? "" : `<p class="wd-empty-note">등록된 일정이 없어요 — 달력에서 날짜를 누르거나 아래 버튼으로 추가하세요</p>`;

  return `
    <div class="fixed-list">
      ${upcomingRows}${empty}
      <button class="add-fixed-btn" id="wdEventAddBtn">+ 일정 추가</button>
    </div>
    ${pastRows}`;
}

// ── 바인딩 ────────────────────────────────────────────────────

function bindEvents(container) {
  container.querySelector("#wdCalPrev").addEventListener("click", () => {
    calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; }
    renderEventsSegment(container);
  });
  container.querySelector("#wdCalNext").addEventListener("click", () => {
    calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; }
    renderEventsSegment(container);
  });

  // 날짜 클릭 → 그 날짜가 채워진 추가 모달
  container.querySelectorAll("[data-mc-date]").forEach(cell =>
    cell.addEventListener("click", () => openWeddingEventModal(null, cell.dataset.mcDate))
  );

  container.querySelector("#wdEventAddBtn").addEventListener("click", () => openWeddingEventModal(null));

  container.querySelectorAll("[data-wd-event]").forEach(el =>
    el.addEventListener("click", () => {
      const e = state.wedding.events.find(x => x.id === el.dataset.wdEvent);
      if (e) openWeddingEventModal(e);
    })
  );
}
