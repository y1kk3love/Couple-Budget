// ================================================================
// js/views/weddingVendors.js — 결혼 업체 비교 세그먼트
// wedding.js(셸)가 세그먼트 컨테이너를 넘겨 호출한다.
// ================================================================

import state from "../state.js";
import { escapeHtml, fmtMoney, emptyStateHTML } from "../utils.js";
import { getWeddingCategory } from "../constants.js";
import { openWeddingVendorModal } from "../modals/weddingModal.js";

// 카테고리 필터 — 재렌더에도 유지
let vendorFilter = ""; // "" = 전체

export function renderVendorsSegment(container) {
  const vendors = state.wedding.vendors;

  // 후보가 있는 카테고리만 필터 칩으로 노출
  const usedCatIds = [...new Set(vendors.map(v => v.category))];
  const chips = usedCatIds.length < 2 ? "" : `
    <div class="sort-bar"><div class="sort-keys">
      <button class="sort-key-btn ${vendorFilter === "" ? "active" : ""}" data-vf="">전체</button>
      ${usedCatIds.map(id => `
        <button class="sort-key-btn ${vendorFilter === id ? "active" : ""}" data-vf="${escapeHtml(id)}">${escapeHtml(getWeddingCategory(id).name)}</button>`).join("")}
    </div></div>`;

  const list = vendorFilter ? vendors.filter(v => v.category === vendorFilter) : vendors;

  const rows = list.map(v => {
    const cat    = getWeddingCategory(v.category);
    const chosen = v.status === "chosen";
    const meta   = [cat.name, v.contact, v.memo].filter(Boolean).map(escapeHtml).join(" · ");
    return `
      <div class="fixed-item" data-wd-vendor="${escapeHtml(v.id)}" role="button" tabindex="0">
        <div class="fixed-cat-dot" style="background:${cat.color}"></div>
        <div class="fixed-info">
          <div class="fixed-name">${escapeHtml(v.name)} ${chosen ? `<span class="tag applied">확정</span>` : ""}</div>
          <div class="fixed-meta">${meta}</div>
        </div>
        <div class="fixed-amount">${v.price > 0 ? `${fmtMoney(v.price)}원` : ""}</div>
      </div>`;
  }).join("");

  const empty = list.length ? "" : emptyStateHTML("등록된 업체가 없어요", "🏛️");

  container.innerHTML = `
    ${chips}
    <div class="fixed-list">
      ${rows}${empty}
      <button class="add-fixed-btn" id="wdVendorAddBtn">+ 업체 추가</button>
    </div>`;

  // ── 바인딩 ──────────────────────────────────────────────────

  container.querySelectorAll("[data-vf]").forEach(btn =>
    btn.addEventListener("click", () => {
      vendorFilter = btn.dataset.vf;
      renderVendorsSegment(container);
    })
  );

  container.querySelector("#wdVendorAddBtn").addEventListener("click", () => openWeddingVendorModal(null));

  container.querySelectorAll("[data-wd-vendor]").forEach(el =>
    el.addEventListener("click", () => {
      const v = state.wedding.vendors.find(x => x.id === el.dataset.wdVendor);
      if (v) openWeddingVendorModal(v);
    })
  );
}
