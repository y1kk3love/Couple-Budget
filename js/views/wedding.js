// ================================================================
// js/views/wedding.js — 결혼 준비 뷰 (셸: D-day 헤더 + 세그먼트 전환 + 예산)
// 기존 가계부와 완전 분리된 장부 — 월 이동과 무관, 탭 최초 진입 시 1회 로드.
// ================================================================

import state from "../state.js";
import { fmtMoney, fmtMoneyShort, escapeHtml, ownerName, emptyStateHTML, showToast } from "../utils.js";
import { getWeddingCategory } from "../constants.js";
import {
  fetchWeddingConfig, fetchWeddingItems, fetchWeddingTasks, fetchWeddingVendors,
  fetchWeddingEvents, itemSpent, itemSettled, weddingTotals,
  saveWeddingItemOrders
} from "../weddingDb.js";
import { openWeddingSettingsModal, openWeddingItemModal } from "../modals/weddingModal.js";
import { renderChecklistSegment } from "./weddingChecklist.js";
import { renderVendorsSegment } from "./weddingVendors.js";
import { renderEventsSegment } from "./weddingEvents.js";
import { renderMemoSegment } from "./weddingMemo.js";

// 현재 세그먼트 — 재렌더·뷰 전환에도 유지 (모듈 레벨 UI 상태 패턴)
let segment = "budget"; // "budget" | "checklist" | "vendors" | "guests"
let loaded  = false;    // 탭 최초 진입 시 1회 로드 플래그

const SEGMENTS = [
  { id: "budget",    label: "예산" },
  { id: "events",    label: "일정" },
  { id: "checklist", label: "체크리스트" },
  { id: "vendors",   label: "업체" },
  { id: "memo",      label: "메모" },
];
const ENABLED = new Set(["budget", "events", "checklist", "vendors", "memo"]);

// 외부(메인 화면 배너)에서 특정 세그먼트를 열도록 지정할 때 사용
export function setWeddingSegment(seg) {
  if (ENABLED.has(seg)) segment = seg;
}

// ── D-day 계산 (자정 기준 날짜 차이) ──────────────────────────

export function dDayInfo(dateStr, today = new Date()) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((target - t0) / 86400000);
  const label = diff > 0 ? `D-${diff}` : diff === 0 ? "D-day 🎉" : `D+${-diff} 🎉`;
  const dow = "일월화수목금토"[target.getDay()];
  return { label, pretty: `${y}년 ${m}월 ${d}일 (${dow})` };
}

// ── 렌더 ──────────────────────────────────────────────────────

export function renderWeddingView() {
  const container = document.getElementById("view-wedding");

  if (!loaded) {
    container.innerHTML = `<p class="list-loading">결혼 준비 데이터를 불러오는 중…</p>`;
    ensureLoaded().then(() => {
      if (state.currentView === "wedding") renderWeddingView(); // 뷰 이탈 시 무시
    });
    return;
  }

  container.innerHTML = `${renderHeader()}${renderSegBar()}<div id="wdSegBody"></div>`;
  renderSegmentBody(container.querySelector("#wdSegBody"));
  bindEvents(container);
}

async function ensureLoaded() {
  await Promise.all([
    fetchWeddingConfig(), fetchWeddingItems(), fetchWeddingTasks(),
    fetchWeddingVendors(), fetchWeddingEvents(),
  ]);
  loaded = true;
}

// ── 헤더 (D-day + 총예산 진행 + 사람별 부담) ──────────────────

function renderHeader() {
  const cfg = state.wedding.config;
  if (!cfg?.date) {
    return `
      <div class="wd-header" id="wdHeader" role="button" tabindex="0" title="클릭해서 설정">
        <div class="wd-dday">💍 결혼 준비</div>
        <div class="wd-date">결혼식 날짜를 설정해주세요 — 클릭해서 시작</div>
      </div>`;
  }

  const { label, pretty } = dDayInfo(cfg.date);
  const totals = weddingTotals(state.wedding.items);

  // 총예산 = 예산 항목들의 계획 금액 합 (별도 저장값 아님 — 목록과 항상 일치)
  // 진행 바 색 규칙은 기존 예산 카드와 동일: 80% 경고, 초과 빨강
  let budgetLine = "";
  if (totals.planned > 0) {
    const pct    = Math.round(totals.spent / totals.planned * 100);
    const barPct = Math.min(100, pct);
    const over   = totals.spent > totals.planned;
    const color  = over ? "var(--expense)" : pct >= 80 ? "var(--warn)" : "var(--accent)";
    budgetLine = `
      <div class="wd-budget-line">
        <span>지출 <strong>${fmtMoney(totals.spent)}원</strong> / 총예산 ${fmtMoney(totals.planned)}원</span>
        <span>${pct}%</span>
      </div>
      <div class="pbar"><div class="pfill" style="width:${barPct}%;background:${color}"></div></div>`;
  } else if (totals.spent > 0) {
    budgetLine = `<div class="wd-budget-line"><span>지금까지 지출 <strong>${fmtMoney(totals.spent)}원</strong></span></div>`;
  }

  // 사람별 부담 요약 (payer 이메일 → 표시 이름, "both" → 공동)
  const payerSum = Object.entries(totals.byPayer)
    .filter(([, v]) => v > 0)
    .map(([key, v]) => `<span>${escapeHtml(key === "both" ? "공동" : ownerName(key))} <strong>${fmtMoneyShort(v)}</strong></span>`)
    .join("");

  // 검증 시트 바로가기 — 설정에 저장된 링크가 있을 때만 (http/https만 렌더)
  const sheetOk = /^https?:\/\//.test(cfg.sheetUrl ?? "");
  const sheetLink = sheetOk
    ? `<a class="wd-sheet-link" href="${escapeHtml(cfg.sheetUrl)}" target="_blank" rel="noopener" title="검증 시트 열기 (새 탭)">📄 검증 시트</a>`
    : "";

  return `
    <div class="wd-header" id="wdHeader" role="button" tabindex="0" title="클릭해서 설정 변경">
      ${sheetLink}
      <div class="wd-dday">${label}</div>
      <div class="wd-date">${pretty}</div>
      ${budgetLine}
      ${payerSum ? `<div class="wd-payer-sum">${payerSum}</div>` : ""}
    </div>`;
}

// ── 세그먼트 바 ───────────────────────────────────────────────

function renderSegBar() {
  const btns = SEGMENTS.map(s => {
    const enabled = ENABLED.has(s.id);
    return `<button class="scope-btn ${segment === s.id ? "active" : ""}" data-seg="${s.id}"
      aria-pressed="${segment === s.id}" ${enabled ? "" : `disabled title="준비 중"`}>${s.label}</button>`;
  }).join("");
  return `<div class="scope-toggle wd-seg">${btns}</div>`;
}

function renderSegmentBody(body) {
  if (state.wedding.loadError) {
    body.innerHTML = `<p class="wd-empty-note">데이터를 불러오지 못했어요. firestore.rules에 결혼 컬렉션(wedding_*)이 게시되어 있는지 확인해주세요.</p>`;
    return;
  }
  switch (segment) {
    case "budget":    body.innerHTML = renderBudgetSegment(); break;
    case "checklist": renderChecklistSegment(body); break;
    case "vendors":   renderVendorsSegment(body); break;
    case "events":    renderEventsSegment(body); break;
    case "memo":      renderMemoSegment(body); break;
    default:          body.innerHTML = "";
  }
}

// ── 예산 세그먼트 ─────────────────────────────────────────────

function renderBudgetSegment() {
  const items = state.wedding.items;

  const rows = items.map(it => {
    const cat       = getWeddingCategory(it.category);
    const spent     = itemSpent(it);
    const settled   = itemSettled(it);
    const unsettled = spent - settled;
    const pctSpent   = it.planned > 0 ? Math.min(100, Math.round(spent / it.planned * 100)) : 0;
    const pctSettled = it.planned > 0 ? Math.min(100, Math.round(settled / it.planned * 100)) : 0;
    const over  = it.planned > 0 && spent > it.planned;
    const color = over ? "var(--expense)" : cat.color;
    const payer = it.payer === "both" ? "공동" : ownerName(it.payer);
    // 그래프 두 겹: 진한 색 = 정산 완료, 연한 색 = 아직 미정산인 지출
    return `
      <div class="fixed-item" data-wd-item="${it.id}" role="button" tabindex="0">
        <span class="pe-drag wd-item-drag" title="드래그로 순서 변경">⠿</span>
        <div class="fixed-cat-dot" style="background:${cat.color}"></div>
        <div class="fixed-info">
          <div class="fixed-name">${escapeHtml(it.name)} <span class="tag ${it.payer === "both" ? "fixed" : "variable"}">${escapeHtml(payer)}</span></div>
          <div class="wd-item-plan">${fmtMoney(spent)} / ${fmtMoney(it.planned ?? 0)}원 · ${cat.name}${unsettled > 0 ? ` · <span class="wd-unsettled">미정산 ${fmtMoneyShort(unsettled)}</span>` : ""}</div>
          <div class="pbar wd-pbar-layered" style="margin-top:5px" title="진한 색: 정산 완료 · 연한 색: 미정산">
            <div class="pfill wd-fill-spent" style="width:${pctSpent}%;background:${color}"></div>
            <div class="pfill" style="width:${pctSettled}%;background:${color}"></div>
          </div>
        </div>
        <div class="fixed-amount">${fmtMoneyShort(spent)}</div>
      </div>`;
  }).join("");

  const empty = items.length ? "" : emptyStateHTML("아직 예산 항목이 없어요", "💐");
  return `
    <div class="fixed-list">
      ${rows}${empty}
      <button class="add-fixed-btn" id="wdItemAddBtn">+ 예산 항목 추가</button>
    </div>`;
}

// ── 이벤트 ────────────────────────────────────────────────────

function bindEvents(container) {
  container.querySelector("#wdHeader")?.addEventListener("click", openWeddingSettingsModal);
  // 시트 링크 클릭이 헤더 클릭(설정 모달)으로 번지지 않게 분리
  container.querySelector(".wd-sheet-link")?.addEventListener("click", e => e.stopPropagation());

  container.querySelectorAll(".scope-btn[data-seg]").forEach(b =>
    b.addEventListener("click", () => {
      if (b.disabled || b.dataset.seg === segment) return;
      segment = b.dataset.seg;
      renderWeddingView();
    })
  );

  container.querySelector("#wdItemAddBtn")?.addEventListener("click", () => openWeddingItemModal(null));
  container.querySelectorAll("[data-wd-item]").forEach(el =>
    el.addEventListener("click", () => {
      const it = state.wedding.items.find(i => i.id === el.dataset.wdItem);
      if (it) openWeddingItemModal(it);
    })
  );
  bindItemDrag(container);
}

// 예산 항목 드래그 정렬 — plan.js와 같은 패턴.
// 주의: 드래그 중 행을 DOM에서 재배치하면(제거+재삽입) 포인터 캡처가 풀리므로,
// setPointerCapture 대신 document에 리스너를 걸어 이벤트를 계속 받는다.
function bindItemDrag(container) {
  const list = container.querySelector(".fixed-list");
  if (!list) return;

  container.querySelectorAll(".wd-item-drag").forEach(handle => {
    // 드래그 종료 직후 발생하는 click이 행 클릭(수정 모달)으로 번지지 않게 차단
    handle.addEventListener("click", e => e.stopPropagation());

    handle.addEventListener("pointerdown", e => {
      e.preventDefault(); // 텍스트 선택 방지 (터치 스크롤은 CSS touch-action:none이 차단)
      const row = handle.closest("[data-wd-item]");
      row.classList.add("dragging");

      const onMove = ev => {
        // 포인터 세로 위치가 중간점보다 위인 첫 행 앞에 삽입, 없으면 맨 뒤로
        const others = [...list.querySelectorAll("[data-wd-item]")].filter(r => r !== row);
        const next = others.find(o => {
          const r = o.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        if (next) next.before(row);
        else others[others.length - 1]?.after(row);
      };
      const onUp = async () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        row.classList.remove("dragging");

        const orderedIds = [...list.querySelectorAll("[data-wd-item]")].map(r => r.dataset.wdItem);
        try {
          await saveWeddingItemOrders(orderedIds);
        } catch (err) {
          console.error("순서 저장 실패:", err);
          showToast("순서 저장에 실패했습니다. 네트워크를 확인해주세요");
        }
        await fetchWeddingItems(); // 성공 시 새 순서, 실패 시 원래 순서로 복원
        renderWeddingView();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  });
}
