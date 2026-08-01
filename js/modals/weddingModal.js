// ================================================================
// js/modals/weddingModal.js — 결혼 준비 설정 / 예산 항목 모달
// ================================================================

import state from "../state.js";
import { showToast, showConfirm, setupAmountPresets, escapeHtml, fmtMoney, todayStr, ownerName } from "../utils.js";
import { WEDDING_CATEGORIES } from "../constants.js";
import { saveWeddingConfig, saveWeddingItem, deleteWeddingItem, fetchWeddingItems } from "../weddingDb.js";
import { renderWeddingView } from "../views/wedding.js";
import { ALLOWED_EMAILS } from "../../firebase.js";

let editingItemId = null;
let draftPayments = []; // 편집 중 결제 내역 — 저장 시 통째로 기록 (마지막 저장 승리, 스펙에 명시된 트레이드오프)

const PAY_LABELS = ["계약금", "중도금", "잔금"];

// ── 설정 모달 ─────────────────────────────────────────────────

export function openWeddingSettingsModal() {
  const cfg = state.wedding.config ?? {};
  document.getElementById("wdDate").value        = cfg.date ?? "";
  document.getElementById("wdTotalBudget").value = cfg.totalBudget ?? "";
  document.getElementById("weddingSettingsModal").classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("weddingSettingsModal").classList.add("hidden");
}

// ── 예산 항목 모달 ────────────────────────────────────────────

export function openWeddingItemModal(item) {
  editingItemId = item?.id ?? null;
  draftPayments = (item?.payments ?? []).map(p => ({ ...p }));

  document.getElementById("wdItemTitle").textContent = item ? "예산 항목 수정" : "예산 항목 추가";
  document.getElementById("wdItemDelete").classList.toggle("hidden", !item);
  document.getElementById("wdItemId").value      = item?.id ?? "";
  document.getElementById("wdItemName").value    = item?.name ?? "";
  populateCategorySelect(item?.category);
  document.getElementById("wdItemPlanned").value = item?.planned || "";
  populatePayerSelect(item?.payer ?? "both");
  document.getElementById("wdItemMemo").value    = item?.memo ?? "";
  renderPayments();
  document.getElementById("weddingItemModal").classList.remove("hidden");
}

function closeItem() {
  document.getElementById("weddingItemModal").classList.add("hidden");
}

function populateCategorySelect(selected) {
  const sel = document.getElementById("wdItemCategory");
  sel.innerHTML = WEDDING_CATEGORIES
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  sel.value = selected ?? WEDDING_CATEGORIES[0].id;
}

function populatePayerSelect(selected) {
  const sel = document.getElementById("wdItemPayer");
  const options = [
    ...ALLOWED_EMAILS.map(e => ({ v: e, label: ownerName(e) })),
    { v: "both", label: "공동" },
  ];
  sel.innerHTML = options
    .map(o => `<option value="${escapeHtml(o.v)}">${escapeHtml(o.label)}</option>`)
    .join("");
  sel.value = selected;
}

// ── 결제 내역 (모달 안 동적 렌더) ─────────────────────────────

function renderPayments() {
  const box = document.getElementById("wdPayments");
  const rows = draftPayments.map((p, i) => `
    <div class="wd-pay-row">
      <span class="wd-pay-label">${escapeHtml(p.label)}</span>
      <span class="wd-pay-date">${p.date ?? ""}</span>
      <span class="wd-pay-amt">${fmtMoney(p.amount)}원</span>
      <button type="button" class="wd-pay-del" data-pay-i="${i}" title="삭제">&times;</button>
    </div>`).join("");

  box.innerHTML = `
    ${rows || `<p class="wd-empty-note">아직 결제 기록이 없어요</p>`}
    <div class="wd-pay-presets">
      ${PAY_LABELS.map(l => `<button type="button" class="preset-btn" data-pay-label="${l}">+ ${l}</button>`).join("")}
      <button type="button" class="preset-btn" data-pay-label="">+ 직접 입력</button>
    </div>`;

  box.querySelectorAll(".wd-pay-del").forEach(btn =>
    btn.addEventListener("click", () => {
      draftPayments.splice(Number(btn.dataset.payI), 1);
      renderPayments();
    })
  );
  box.querySelectorAll("[data-pay-label]").forEach(btn =>
    btn.addEventListener("click", () => renderPayInput(btn.dataset.payLabel))
  );
}

// 라벨 프리셋 클릭 → 금액·날짜 입력 행 노출
function renderPayInput(label) {
  const box = document.getElementById("wdPayments");
  box.querySelector(".wd-pay-input")?.remove(); // 입력 행은 하나만

  const row = document.createElement("div");
  row.className = "wd-pay-input";
  row.innerHTML = `
    <input type="text" class="wd-pay-in-label" placeholder="라벨" maxlength="10" value="${escapeHtml(label)}" />
    <input type="number" class="wd-pay-in-amount" placeholder="금액" min="0" />
    <input type="date" class="wd-pay-in-date" value="${todayStr()}" />
    <button type="button" class="save-btn wd-pay-in-add">추가</button>`;
  box.appendChild(row);

  row.querySelector(".wd-pay-in-add").addEventListener("click", () => {
    const lbl    = row.querySelector(".wd-pay-in-label").value.trim() || "결제";
    const amount = parseInt(row.querySelector(".wd-pay-in-amount").value);
    const date   = row.querySelector(".wd-pay-in-date").value;
    if (!amount || amount <= 0) { showToast("금액을 입력하세요"); return; }
    draftPayments.push({ label: lbl, amount, date });
    renderPayments();
  });
  row.querySelector(".wd-pay-in-amount").focus();
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupWeddingModals() {
  document.querySelectorAll('.amount-presets[data-target="wdTotalBudget"]').forEach(setupAmountPresets);
  document.querySelectorAll('.amount-presets[data-target="wdItemPlanned"]').forEach(setupAmountPresets);

  // 닫기
  document.getElementById("wdSettingsClose").addEventListener("click", closeSettings);
  document.getElementById("weddingSettingsModal").addEventListener("click", e => {
    if (e.target.id === "weddingSettingsModal") closeSettings();
  });
  document.getElementById("wdItemClose").addEventListener("click", closeItem);
  document.getElementById("weddingItemModal").addEventListener("click", e => {
    if (e.target.id === "weddingItemModal") closeItem();
  });

  // 설정 저장 — 쓰기 성공 후에만 닫는다
  document.getElementById("wdSettingsSave").addEventListener("click", async () => {
    const date = document.getElementById("wdDate").value;
    if (!date) { showToast("결혼식 날짜를 선택하세요"); return; }
    const budgetVal = parseInt(document.getElementById("wdTotalBudget").value);

    try {
      await saveWeddingConfig({ date, totalBudget: budgetVal > 0 ? budgetVal : null });
    } catch (err) {
      console.error("결혼 설정 저장 실패:", err);
      showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeSettings();
    showToast("저장되었습니다");
    renderWeddingView();
  });

  // 항목 저장
  document.getElementById("wdItemSave").addEventListener("click", async () => {
    const name = document.getElementById("wdItemName").value.trim();
    if (!name) { showToast("항목명을 입력하세요"); return; }

    const data = {
      name,
      category: document.getElementById("wdItemCategory").value,
      planned:  parseInt(document.getElementById("wdItemPlanned").value) || 0,
      payer:    document.getElementById("wdItemPayer").value,
      memo:     document.getElementById("wdItemMemo").value,
      payments: draftPayments,
    };
    if (!editingItemId) {
      data.order    = state.wedding.items.length;
      data.vendorId = null;
    }

    try {
      await saveWeddingItem(data, editingItemId);
    } catch (err) {
      console.error("예산 항목 저장 실패:", err);
      showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeItem();
    showToast(editingItemId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingItems();
    renderWeddingView();
  });

  // 항목 삭제
  document.getElementById("wdItemDelete").addEventListener("click", async () => {
    if (!editingItemId) return;
    if (!(await showConfirm("이 예산 항목을 삭제할까요?", { confirmText: "삭제" }))) return;
    try {
      await deleteWeddingItem(editingItemId);
    } catch (err) {
      console.error("예산 항목 삭제 실패:", err);
      showToast("삭제에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeItem();
    showToast("삭제되었습니다");
    await fetchWeddingItems();
    renderWeddingView();
  });
}
