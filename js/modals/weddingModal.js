// ================================================================
// js/modals/weddingModal.js — 결혼 준비 설정 / 예산 항목 모달
// ================================================================

import state from "../state.js";
import { showToast, showConfirm, setupAmountPresets, escapeHtml, fmtMoney, todayStr, ownerName, runWrite } from "../utils.js";
import { WEDDING_CATEGORIES, WEDDING_PERIODS, getWeddingCategory } from "../constants.js";
import {
  saveWeddingConfig, saveWeddingItem, deleteWeddingItem, fetchWeddingItems,
  saveWeddingTask, deleteWeddingTask, fetchWeddingTasks,
  saveWeddingVendor, deleteWeddingVendor, fetchWeddingVendors,
  saveWeddingEvent, deleteWeddingEvent, fetchWeddingEvents, paymentSettled
} from "../weddingDb.js";
import { renderWeddingView } from "../views/wedding.js";
import { ALLOWED_EMAILS } from "../../firebase.js";

let editingItemId   = null;
let editingTaskId   = null;
let editingVendorId = null;
let editingVendorStatus = "candidate";
let editingEventId  = null;
let draftPayments = []; // 편집 중 결제 내역 — 저장 시 통째로 기록 (마지막 저장 승리, 스펙에 명시된 트레이드오프)

const PAY_LABELS = ["계약금", "중도금", "잔금"];

// ── 설정 모달 ─────────────────────────────────────────────────

export function openWeddingSettingsModal() {
  const cfg = state.wedding.config ?? {};
  document.getElementById("wdDate").value     = cfg.date ?? "";
  document.getElementById("wdSheetUrl").value = cfg.sheetUrl ?? "";
  document.getElementById("weddingSettingsModal").classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("weddingSettingsModal").classList.add("hidden");
}

// ── 예산 항목 모달 ────────────────────────────────────────────

export function openWeddingItemModal(item) {
  editingItemId = item?.id ?? null;
  // 과거 기록(settled 체크만 있는 결제)도 settledAmount 형태로 정규화해서 편집·저장
  draftPayments = (item?.payments ?? []).map(p => withSettled({ ...p }, paymentSettled(p)));

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

// ── 일정 모달 ─────────────────────────────────────────────────

// prefillDate: 미니 달력에서 날짜를 눌러 추가할 때 미리 채울 날짜
export function openWeddingEventModal(event, prefillDate = null) {
  editingEventId = event?.id ?? null;

  document.getElementById("wdEventModalTitle").textContent = event ? "일정 수정" : "일정 추가";
  document.getElementById("wdEventDelete").classList.toggle("hidden", !event);
  document.getElementById("wdEventId").value    = event?.id ?? "";
  document.getElementById("wdEventTitle").value = event?.title ?? "";
  document.getElementById("wdEventDate").value  = event?.date ?? prefillDate ?? todayStr();
  document.getElementById("wdEventTime").value  = event?.time ?? "";
  document.getElementById("wdEventMemo").value  = event?.memo ?? "";
  document.getElementById("weddingEventModal").classList.remove("hidden");
}

function closeEvent() {
  document.getElementById("weddingEventModal").classList.add("hidden");
}

// ── 결제 내역 (모달 안 동적 렌더) ─────────────────────────────

// 결제 한 건에 정산 금액을 기록 — settledAmount가 원본, settled는 전액 여부(과거 형태 호환)
function withSettled(p, amt) {
  const amount = p.amount || 0;
  p.settledAmount = Math.max(0, Math.min(amount, amt || 0));
  p.settled = amount > 0 && p.settledAmount >= amount;
  return p;
}

function renderPayments() {
  const box = document.getElementById("wdPayments");
  const rows = draftPayments.map((p, i) => {
    const settledAmt = paymentSettled(p);
    return `
    <div class="wd-pay-row${p.settled ? " settled" : ""}" data-pay-row="${i}">
      <span class="wd-pay-label">${escapeHtml(p.label)}</span>
      <span class="wd-pay-date">${p.date ?? ""}</span>
      <span class="wd-pay-amt">${fmtMoney(p.amount)}원</span>
      <button type="button" class="wd-pay-del" data-pay-i="${i}" title="삭제">&times;</button>
      <div class="wd-pay-settle" title="상대에게 돌려받은(정산된) 금액을 입력하세요">
        <span class="wd-pay-settle-lbl">정산</span>
        <input type="number" class="wd-pay-settle-amt" data-settle-i="${i}" min="0" max="${p.amount || 0}" step="1"
               placeholder="0" value="${settledAmt || ""}" aria-label="정산 금액" />
        <span class="wd-pay-settle-of">/ ${fmtMoney(p.amount)}원</span>
        <button type="button" class="wd-pay-settle-full" data-settle-full="${i}">전액</button>
        <span class="wd-pay-settle-done">✓ 정산 완료</span>
      </div>
    </div>`;
  }).join("");

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
  // 정산 금액 — draft에만 반영, 저장 버튼을 눌러야 확정.
  // input마다 재렌더하면 포커스가 끊기므로 입력 중에는 클램프+행 스타일만 갱신, 포커스가 빠지면 재렌더로 표시 정리
  box.querySelectorAll(".wd-pay-settle-amt").forEach(inp =>
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.settleI);
      const p = withSettled(draftPayments[i], parseInt(inp.value) || 0);
      if (inp.value !== "" && parseInt(inp.value) !== p.settledAmount) inp.value = p.settledAmount;
      inp.closest(".wd-pay-row").classList.toggle("settled", p.settled);
    })
  );
  box.querySelectorAll(".wd-pay-settle-amt").forEach(inp =>
    inp.addEventListener("change", renderPayments)
  );
  box.querySelectorAll(".wd-pay-settle-full").forEach(btn =>
    btn.addEventListener("click", () => {
      const p = draftPayments[Number(btn.dataset.settleFull)];
      withSettled(p, p.amount);
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
    draftPayments.push({ label: lbl, amount, date, settled: false, settledAmount: 0 });
    renderPayments();
  });
  row.querySelector(".wd-pay-in-amount").focus();
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupWeddingModals() {
  document.querySelectorAll('.amount-presets[data-target="wdItemPlanned"]').forEach(setupAmountPresets);
  document.querySelectorAll('.amount-presets[data-target="wdVendorPrice"]').forEach(setupAmountPresets);

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
  document.getElementById("wdEventClose").addEventListener("click", closeEvent);
  document.getElementById("weddingEventModal").addEventListener("click", e => {
    if (e.target.id === "weddingEventModal") closeEvent();
  });

  // 설정 저장 — 쓰기 성공 후에만 닫는다
  // (총예산은 예산 항목 계획 합계로 파생되므로 여기서는 날짜만 저장)
  document.getElementById("wdSettingsSave").addEventListener("click", async e => {
    const date = document.getElementById("wdDate").value;
    if (!date) { showToast("결혼식 날짜를 선택하세요"); return; }

    // 시트 링크 — http(s)만 허용 (javascript: 등 위험한 스킴 차단)
    const sheetUrl = document.getElementById("wdSheetUrl").value.trim();
    if (sheetUrl && !/^https?:\/\//.test(sheetUrl)) {
      showToast("링크는 http:// 또는 https:// 로 시작해야 해요");
      return;
    }

    if (!(await runWrite(e.currentTarget, () => saveWeddingConfig({ date, sheetUrl: sheetUrl || null })))) return;
    closeSettings();
    showToast("저장되었습니다");
    renderWeddingView();
  });

  // 항목 저장
  document.getElementById("wdItemSave").addEventListener("click", async e => {
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

    if (!(await runWrite(e.currentTarget, () => saveWeddingItem(data, editingItemId)))) return;
    closeItem();
    showToast(editingItemId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingItems();
    renderWeddingView();
  });

  // 할 일 저장
  document.getElementById("wdTaskSave").addEventListener("click", async e => {
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

    if (!(await runWrite(e.currentTarget, () => saveWeddingTask(data, editingTaskId)))) return;
    closeTask();
    showToast(editingTaskId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingTasks();
    renderWeddingView();
  });

  // 할 일 삭제
  document.getElementById("wdTaskDelete").addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!editingTaskId) return;
    if (!(await showConfirm("이 할 일을 삭제할까요?", { confirmText: "삭제" }))) return;
    if (!(await runWrite(btn, () => deleteWeddingTask(editingTaskId), "삭제"))) return;
    closeTask();
    showToast("삭제되었습니다");
    await fetchWeddingTasks();
    renderWeddingView();
  });

  // 업체 저장
  document.getElementById("wdVendorSave").addEventListener("click", async e => {
    const data = readVendorForm();
    if (!data.name) { showToast("업체명을 입력하세요"); return; }
    if (!editingVendorId) data.status = "candidate";

    if (!(await runWrite(e.currentTarget, () => saveWeddingVendor(data, editingVendorId)))) return;
    closeVendor();
    showToast(editingVendorId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingVendors();
    renderWeddingView();
  });

  // 업체 삭제
  document.getElementById("wdVendorDelete").addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!editingVendorId) return;
    if (!(await showConfirm("이 업체를 삭제할까요?", { confirmText: "삭제" }))) return;
    if (!(await runWrite(btn, () => deleteWeddingVendor(editingVendorId), "삭제"))) return;
    closeVendor();
    showToast("삭제되었습니다");
    await fetchWeddingVendors();
    renderWeddingView();
  });

  // 업체 확정 — 같은 카테고리 예산 항목에 견적 반영/생성까지 이어지는 흐름
  document.getElementById("wdVendorChoose").addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!editingVendorId) return;
    const v = readVendorForm();
    if (!v.name) { showToast("업체명을 입력하세요"); return; }
    if (!(await showConfirm(`'${v.name}'을(를) 확정 업체로 표시할까요?`, { confirmText: "확정", danger: false }))) return;

    const ok = await runWrite(btn, async () => {
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
    }, "확정");
    if (!ok) return;

    closeVendor();
    showToast("확정했습니다 💍");
    await Promise.all([fetchWeddingVendors(), fetchWeddingItems()]);
    renderWeddingView();
  });

  // 일정 저장
  document.getElementById("wdEventSave").addEventListener("click", async e => {
    const title = document.getElementById("wdEventTitle").value.trim();
    const date  = document.getElementById("wdEventDate").value;
    if (!title) { showToast("일정을 입력하세요"); return; }
    if (!date)  { showToast("날짜를 선택하세요"); return; }

    const data = {
      title,
      date,
      time: document.getElementById("wdEventTime").value || null,
      memo: document.getElementById("wdEventMemo").value,
    };

    if (!(await runWrite(e.currentTarget, () => saveWeddingEvent(data, editingEventId)))) return;
    closeEvent();
    showToast(editingEventId ? "수정되었습니다" : "추가되었습니다");
    await fetchWeddingEvents();
    renderWeddingView();
  });

  // 일정 삭제
  document.getElementById("wdEventDelete").addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!editingEventId) return;
    if (!(await showConfirm("이 일정을 삭제할까요?", { confirmText: "삭제" }))) return;
    if (!(await runWrite(btn, () => deleteWeddingEvent(editingEventId), "삭제"))) return;
    closeEvent();
    showToast("삭제되었습니다");
    await fetchWeddingEvents();
    renderWeddingView();
  });

  // 항목 삭제
  document.getElementById("wdItemDelete").addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!editingItemId) return;
    if (!(await showConfirm("이 예산 항목을 삭제할까요?", { confirmText: "삭제" }))) return;
    if (!(await runWrite(btn, () => deleteWeddingItem(editingItemId), "삭제"))) return;
    closeItem();
    showToast("삭제되었습니다");
    await fetchWeddingItems();
    renderWeddingView();
  });
}
