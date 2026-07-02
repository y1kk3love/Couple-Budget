// ================================================================
// js/modals/budgetModal.js — 월 예산 설정 모달
// ================================================================

import state from "../state.js";
import { showToast, setupAmountPresets } from "../utils.js";
import { saveBudget, deleteBudget } from "../db.js";
import { renderAll } from "../app.js";

// ── 열기/닫기 ─────────────────────────────────────────────────

export function openBudgetModal() {
  document.getElementById("budgetAmount").value = state.budget ?? "";
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

  // 저장
  document.getElementById("budgetSaveBtn").addEventListener("click", async () => {
    const amount = parseInt(document.getElementById("budgetAmount").value);
    if (!amount || amount <= 0) { showToast("금액을 입력하세요"); return; }

    closeModal();
    await saveBudget(amount);
    showToast("예산이 설정되었습니다");
    renderAll();
  });

  // 설정 해제
  document.getElementById("budgetDeleteBtn").addEventListener("click", async () => {
    closeModal();
    await deleteBudget();
    showToast("예산 설정이 해제되었습니다");
    renderAll();
  });
}
