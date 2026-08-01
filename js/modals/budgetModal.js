// ================================================================
// js/modals/budgetModal.js — 월 예산 설정 모달
// ================================================================

import state from "../state.js";
import { showToast, showConfirm, setupAmountPresets } from "../utils.js";
import { saveBudget, saveMonthBudget, deleteBudget, deleteMonthBudget } from "../db.js";
import { renderAll } from "../app.js";

function currentYM() {
  return `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
}

// ── 열기/닫기 ─────────────────────────────────────────────────

export function openBudgetModal() {
  const hasOverride = state.budgetMonths?.[currentYM()] != null;

  document.getElementById("budgetAmount").value = state.budget ?? "";
  document.getElementById("budgetMonthOnly").checked = hasOverride;
  document.getElementById("budgetMonthOnlyText").textContent =
    `이번 달(${state.currentYear}년 ${state.currentMonth}월)에만 적용`;
  document.getElementById("budgetDeleteBtn").classList.toggle("hidden", state.budget == null);
  document.getElementById("budgetModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("budgetModal").classList.add("hidden");
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupBudgetModal() {
  // 금액 빠른 입력 버튼
  document.querySelectorAll('.amount-presets[data-target="budgetAmount"]').forEach(setupAmountPresets);

  // 닫기
  document.getElementById("budgetModalClose").addEventListener("click", closeModal);
  document.getElementById("budgetModal").addEventListener("click", e => {
    if (e.target === document.getElementById("budgetModal")) closeModal();
  });

  // 저장 — 체크 시 이번 달 전용, 아니면 기본(매달 동일) 예산
  document.getElementById("budgetSaveBtn").addEventListener("click", async () => {
    const amount = parseInt(document.getElementById("budgetAmount").value);
    if (!amount || amount <= 0) { showToast("금액을 입력하세요"); return; }
    const monthOnly = document.getElementById("budgetMonthOnly").checked;

    // 쓰기 성공 후에만 모달을 닫는다 — 실패 시 입력값을 보존하고 알린다
    try {
      if (monthOnly) {
        await saveMonthBudget(amount);
      } else {
        await saveBudget(amount);
        // 체크를 풀고 저장했는데 이번 달 전용 예산이 남아 있으면 함께 해제 —
        // 그대로 두면 전용 값이 계속 이겨서 "저장이 안 됐다"고 보인다
        if (state.budgetMonths?.[currentYM()] != null) await deleteMonthBudget();
      }
    } catch (err) {
      console.error("예산 저장 실패:", err);
      showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }

    closeModal();
    showToast(monthOnly ? `${state.currentMonth}월 예산이 설정되었습니다` : "예산이 설정되었습니다");
    renderAll();
  });

  // 설정 해제 — 이번 달 전용 예산이 있으면 그것만, 없으면 기본 예산만 해제
  // (deleteBudget이 다른 달의 월별 전용 예산은 보존한다)
  document.getElementById("budgetDeleteBtn").addEventListener("click", async () => {
    const hasOverride = state.budgetMonths?.[currentYM()] != null;
    const msg = hasOverride
      ? `${state.currentMonth}월 전용 예산을 해제할까요?`
      : "기본 예산 설정을 해제할까요?";
    if (!(await showConfirm(msg, { confirmText: "해제" }))) return;

    try {
      if (hasOverride) await deleteMonthBudget();
      else             await deleteBudget();
    } catch (err) {
      console.error("예산 해제 실패:", err);
      showToast("해제에 실패했습니다. 네트워크를 확인해주세요");
      return;
    }

    closeModal();
    showToast(hasOverride ? `${state.currentMonth}월 전용 예산을 해제했습니다` : "예산 설정이 해제되었습니다");
    renderAll();
  });
}
