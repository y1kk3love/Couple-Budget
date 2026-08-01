// ================================================================
// js/modals/weddingModal.js — 결혼 준비 설정 / 예산 항목 모달
// ================================================================

import state from "../state.js";
import { showToast, showConfirm, setupAmountPresets, escapeHtml, fmtMoney, todayStr, ownerName } from "../utils.js";
import { WEDDING_CATEGORIES, WEDDING_PERIODS, getWeddingCategory } from "../constants.js";
import {
  saveWeddingConfig, saveWeddingItem, deleteWeddingItem, fetchWeddingItems,
  saveWeddingTask, deleteWeddingTask, fetchWeddingTasks,
  saveWeddingVendor, deleteWeddingVendor, fetchWeddingVendors,
  saveWeddingGuest, deleteWeddingGuest, fetchWeddingGuests
} from "../weddingDb.js";
import { renderWeddingView } from "../views/wedding.js";
import { ALLOWED_EMAILS } from "../../firebase.js";

let editingItemId   = null;
let editingTaskId   = null;
let editingVendorId = null;
let editingVendorStatus = "candidate";
let editingGuestId  = null;
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

// ── 할 일 모달 ────────────────────────────────────────────────

export function openWeddingTaskModal(task) {
  editingTaskId = task?.id ?? null;

  document.getElementById("wdTaskModalTitle").textContent = task ? "할 일 수정" : "할 일 추가";
  document.getElementById("wdTaskDelete").classList.toggle("hidden", !task);
  document.getElementById("wdTaskId").value    = task?.id ?? "";
  document.getElementById("wdTaskTitle").value = task?.title ?? "";

  const sel = document.getElementById("wdTaskPeriod");
  sel.innerHTML = WEDDING_PERIODS.map(p => `<option value="${p.id}">${p.label}</option>`).join("");
  sel.value = task?.period ?? WEDDING_PERIODS[0].id;

  document.getElementById("wdTaskMemo").value = task?.memo ?? "";
  document.getElementById("weddingTaskModal").classList.remove("hidden");
}

function closeTask() {
  document.getElementById("weddingTaskModal").classList.add("hidden");
}

// ── 업체 모달 ─────────────────────────────────────────────────

export function openWeddingVendorModal(vendor) {
  editingVendorId     = vendor?.id ?? null;
  editingVendorStatus = vendor?.status ?? "candidate";

  document.getElementById("wdVendorModalTitle").textContent = vendor ? "업체 수정" : "업체 추가";
  document.getElementById("wdVendorDelete").classList.toggle("hidden", !vendor);
  // 확정 버튼은 저장된 업체이면서 아직 확정 전일 때만
  document.getElementById("wdVendorChoose").classList.toggle("hidden", !vendor || vendor.status === "chosen");
  document.getElementById("wdVendorId").value = vendor?.id ?? "";

  const sel = document.getElementById("wdVendorCategory");
  sel.innerHTML = WEDDING_CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  sel.value = vendor?.category ?? WEDDING_CATEGORIES[0].id;

  document.getElementById("wdVendorName").value    = vendor?.name ?? "";
  document.getElementById("wdVendorPrice").value   = vendor?.price || "";
  document.getElementById("wdVendorContact").value = vendor?.contact ?? "";
  document.getElementById("wdVendorMemo").value    = vendor?.memo ?? "";
  document.getElementById("weddingVendorModal").classList.remove("hidden");
}

function closeVendor() {
  document.getElementById("weddingVendorModal").classList.add("hidden");
}

// 모달 입력값을 업체 데이터로 수집
function readVendorForm() {
  return {
    category: document.getElementById("wdVendorCategory").value,
    name:     document.getElementById("wdVendorName").value.trim(),
    price:    parseInt(document.getElementById("wdVendorPrice").value) || 0,
    contact:  document.getElementById("wdVendorContact").value.trim(),
    memo:     document.getElementById("wdVendorMemo").value,
  };
}

// ── 하객 모달 ─────────────────────────────────────────────────

export function openWeddingGuestModal(guest) {
  editingGuestId = guest?.id ?? null;

  document.getElementById("wdGuestModalTitle").textContent = guest ? "하객 수정" : "하객 추가";
  document.getElementById("wdGuestDelete").classList.toggle("hidden", !guest);
  document.getElementById("wdGuestId").value   = guest?.id ?? "";
  document.getElementById("wdGuestName").value = guest?.name ?? "";

  // 측 선택 — 두 사용자 이메일을 절대 기준으로 저장, 라벨은 표시 이름
  const sel = document.getElementById("wdGuestSide");
  sel.innerHTML = ALLOWED_EMAILS
    .map(e => `<option value="${escapeHtml(e)}">${escapeHtml(ownerName(e))}측</option>`)
    .join("");
  sel.value = guest?.side ?? state.currentUser?.email ?? ALLOWED_EMAILS[0];

  document.getElementById("wdGuestRelation").value = guest?.relation ?? "친구";
  document.getElementById("wdGuestCount").value    = guest?.count ?? 1;
  document.getElementById("wdGuestGift").value     = guest?.gift || "";
  document.getElementById("wdGuestMemo").value     = guest?.memo ?? "";
  document.getElementById("weddingGuestModal").classList.remove("hidden");
}

function closeGuest() {
  document.getElementById("weddingGuestModal").classList.add("hidden");
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
  document.querySelectorAll('.amount-presets[data-target="wdVendorPrice"]').forEach(setupAmountPresets);
  document.querySelectorAll('.amount-presets[data-target="wdGuestGift"]').forEach(setupAmountPresets);

  // 닫기
  document.getElementById("wdSettingsClose").addEventListener("click", closeSettings);
  document.getElementById("weddingSettingsModal").addEventListener("click", e => {
    if (e.target.id === "weddingSettingsModal") closeSettings();
  });
  document.getElementById("wdItemClose").addEventListener("click", closeItem);
  document.getElementById("weddingItemModal").addEventListener("click", e => {
    if (e.target.id === "weddingItemModal") closeItem();
  });
  document.getElementById("wdTaskClose").addEventListener("click", closeTask);
  document.getElementById("weddingTaskModal").addEventListener("click", e => {
    if (e.target.id === "weddingTaskModal") closeTask();
  });
  document.getElementById("wdVendorClose").addEventListener("click", closeVendor);
  document.getElementById("weddingVendorModal").addEventListener("click", e => {
    if (e.target.id === "weddingVendorModal") closeVendor();
  });
  document.getElementById("wdGuestClose").addEventListener("click", closeGuest);
  document.getElementById("weddingGuestModal").addEventListener("click", e => {
    if (e.target.id === "weddingGuestModal") closeGuest();
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

  // 할 일 저장
  document.getElementById("wdTaskSave").addEventListener("click", async () => {
    const title = document.getElementById("wdTaskTitle").value.trim();
    if (!title) { showToast("할 일을 입력하세요"); return; }

    const data = {
      title,
      period: document.getElementById("wdTaskPeriod").value,
      memo:   document.getElementById("wdTaskMemo").value,
    };
    if (!editingTaskId) {
      data.done  = false;
      data.order = 1000 + state.wedding.tasks.length; // 직접 추가한 항목은 템플릿 뒤에
    }

    try {
      await saveWeddingTask(data, editingTaskId);
    } catch (err) {
      console.error("할 일 저장 실패:", err);
      showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeTask();
    showToast(editingTaskId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingTasks();
    renderWeddingView();
  });

  // 할 일 삭제
  document.getElementById("wdTaskDelete").addEventListener("click", async () => {
    if (!editingTaskId) return;
    if (!(await showConfirm("이 할 일을 삭제할까요?", { confirmText: "삭제" }))) return;
    try {
      await deleteWeddingTask(editingTaskId);
    } catch (err) {
      console.error("할 일 삭제 실패:", err);
      showToast("삭제에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeTask();
    showToast("삭제되었습니다");
    await fetchWeddingTasks();
    renderWeddingView();
  });

  // 업체 저장
  document.getElementById("wdVendorSave").addEventListener("click", async () => {
    const data = readVendorForm();
    if (!data.name) { showToast("업체명을 입력하세요"); return; }
    if (!editingVendorId) data.status = "candidate";

    try {
      await saveWeddingVendor(data, editingVendorId);
    } catch (err) {
      console.error("업체 저장 실패:", err);
      showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeVendor();
    showToast(editingVendorId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingVendors();
    renderWeddingView();
  });

  // 업체 삭제
  document.getElementById("wdVendorDelete").addEventListener("click", async () => {
    if (!editingVendorId) return;
    if (!(await showConfirm("이 업체를 삭제할까요?", { confirmText: "삭제" }))) return;
    try {
      await deleteWeddingVendor(editingVendorId);
    } catch (err) {
      console.error("업체 삭제 실패:", err);
      showToast("삭제에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeVendor();
    showToast("삭제되었습니다");
    await fetchWeddingVendors();
    renderWeddingView();
  });

  // 업체 확정 — 같은 카테고리 예산 항목에 견적 반영/생성까지 이어지는 흐름
  document.getElementById("wdVendorChoose").addEventListener("click", async () => {
    if (!editingVendorId) return;
    const v = readVendorForm();
    if (!v.name) { showToast("업체명을 입력하세요"); return; }
    if (!(await showConfirm(`'${v.name}'을(를) 확정 업체로 표시할까요?`, { confirmText: "확정", danger: false }))) return;

    try {
      await saveWeddingVendor({ ...v, status: "chosen" }, editingVendorId);

      const catName = getWeddingCategory(v.category).name;
      const item    = state.wedding.items.find(i => i.category === v.category);
      if (item) {
        if (v.price > 0 &&
            await showConfirm(`예산 항목 '${item.name}'의 계획 금액을 견적가 ${fmtMoney(v.price)}원으로 바꿀까요?`, { confirmText: "반영", danger: false })) {
          await saveWeddingItem({ planned: v.price, vendorId: editingVendorId }, item.id);
        } else {
          await saveWeddingItem({ vendorId: editingVendorId }, item.id);
        }
      } else if (await showConfirm(`'${catName}' 예산 항목을 새로 만들까요?`, { confirmText: "만들기", danger: false })) {
        await saveWeddingItem({
          name: catName, category: v.category, planned: v.price || 0,
          payer: "both", payments: [], memo: v.name,
          order: state.wedding.items.length, vendorId: editingVendorId,
        });
      }
    } catch (err) {
      console.error("업체 확정 실패:", err);
      showToast("확정에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }

    closeVendor();
    showToast("확정했습니다 💍");
    await Promise.all([fetchWeddingVendors(), fetchWeddingItems()]);
    renderWeddingView();
  });

  // 하객 저장
  document.getElementById("wdGuestSave").addEventListener("click", async () => {
    const name = document.getElementById("wdGuestName").value.trim();
    if (!name) { showToast("이름을 입력하세요"); return; }

    const data = {
      name,
      side:     document.getElementById("wdGuestSide").value,
      relation: document.getElementById("wdGuestRelation").value,
      count:    Math.max(1, parseInt(document.getElementById("wdGuestCount").value) || 1),
      gift:     parseInt(document.getElementById("wdGuestGift").value) || 0,
      memo:     document.getElementById("wdGuestMemo").value,
    };

    try {
      await saveWeddingGuest(data, editingGuestId);
    } catch (err) {
      console.error("하객 저장 실패:", err);
      showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeGuest();
    showToast(editingGuestId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingGuests();
    renderWeddingView();
  });

  // 하객 삭제
  document.getElementById("wdGuestDelete").addEventListener("click", async () => {
    if (!editingGuestId) return;
    if (!(await showConfirm("이 하객을 삭제할까요?", { confirmText: "삭제" }))) return;
    try {
      await deleteWeddingGuest(editingGuestId);
    } catch (err) {
      console.error("하객 삭제 실패:", err);
      showToast("삭제에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }
    closeGuest();
    showToast("삭제되었습니다");
    await fetchWeddingGuests();
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
