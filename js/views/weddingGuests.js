// ================================================================
// js/views/weddingGuests.js — 결혼 하객·축의금 세그먼트
// wedding.js(셸)가 세그먼트 컨테이너를 넘겨 호출한다.
// ================================================================

import state from "../state.js";
import { escapeHtml, fmtMoney, fmtMoneyShort, ownerName, emptyStateHTML } from "../utils.js";
import { openWeddingGuestModal } from "../modals/weddingModal.js";

// 측 필터 — 재렌더에도 유지 ("" = 전체, 그 외 = 해당 측 이메일)
let sideFilter = "";

export function renderGuestsSegment(container) {
  const guests = state.wedding.guests;

  // 측별 요약 (필터와 무관하게 전체 기준)
  const sides = [...new Set(guests.map(g => g.side).filter(Boolean))];
  const totalCount = guests.reduce((s, g) => s + (g.count || 1), 0);
  const totalGift  = guests.reduce((s, g) => s + (g.gift || 0), 0);
  const sideSummary = sides.map(side => {
    const list = guests.filter(g => g.side === side);
    const cnt  = list.reduce((s, g) => s + (g.count || 1), 0);
    return `<span>${escapeHtml(ownerName(side))}측 <strong>${cnt}명</strong></span>`;
  }).join("");

  const summary = guests.length ? `
    <div class="wd-progress">
      <div class="wd-budget-line">
        <span>예상 하객 <strong>${totalCount}명</strong></span>
        ${totalGift > 0 ? `<span>축의금 합계 <strong>${fmtMoney(totalGift)}원</strong></span>` : ""}
      </div>
      ${sideSummary ? `<div class="wd-payer-sum">${sideSummary}</div>` : ""}
    </div>` : "";

  // 측 필터 칩 (양측 하객이 있을 때만)
  const chips = sides.length < 2 ? "" : `
    <div class="sort-bar"><div class="sort-keys">
      <button class="sort-key-btn ${sideFilter === "" ? "active" : ""}" data-gf="">전체</button>
      ${sides.map(side => `
        <button class="sort-key-btn ${sideFilter === side ? "active" : ""}" data-gf="${escapeHtml(side)}">${escapeHtml(ownerName(side))}측</button>`).join("")}
    </div></div>`;

  const list = sideFilter ? guests.filter(g => g.side === sideFilter) : guests;

  const rows = list.map(g => {
    const meta = [
      g.relation,
      (g.count || 1) > 1 ? `동반 ${g.count}명` : null,
      g.memo,
    ].filter(Boolean).map(escapeHtml).join(" · ");
    return `
      <div class="fixed-item" data-wd-guest="${g.id}" role="button" tabindex="0">
        <div class="fixed-info">
          <div class="fixed-name">${escapeHtml(g.name)} <span class="tag variable">${escapeHtml(ownerName(g.side))}측</span></div>
          <div class="fixed-meta">${meta}</div>
        </div>
        <div class="fixed-amount ${g.gift > 0 ? "income" : ""}">${g.gift > 0 ? `+${fmtMoneyShort(g.gift)}` : ""}</div>
      </div>`;
  }).join("");

  const empty = list.length ? "" : emptyStateHTML("등록된 하객이 없어요", "💌");

  container.innerHTML = `
    ${summary}
    ${chips}
    <div class="fixed-list">
      ${rows}${empty}
      <button class="add-fixed-btn" id="wdGuestAddBtn">+ 하객 추가</button>
    </div>`;

  // ── 바인딩 ──────────────────────────────────────────────────

  container.querySelectorAll("[data-gf]").forEach(btn =>
    btn.addEventListener("click", () => {
      sideFilter = btn.dataset.gf;
      renderGuestsSegment(container);
    })
  );

  container.querySelector("#wdGuestAddBtn").addEventListener("click", () => openWeddingGuestModal(null));

  container.querySelectorAll("[data-wd-guest]").forEach(el =>
    el.addEventListener("click", () => {
      const g = state.wedding.guests.find(x => x.id === el.dataset.wdGuest);
      if (g) openWeddingGuestModal(g);
    })
  );
}
