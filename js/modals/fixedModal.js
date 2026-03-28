// ================================================================
// js/modals/fixedModal.js — 고정비 추가 / 수정 모달
// ================================================================

import state from "../state.js";
import { showToast } from "../utils.js";
import { CATEGORIES } from "../constants.js";
import { saveFixedItem, deleteFixedItem, fetchFixedItems } from "../db.js";
import { renderAll } from "../app.js";

// ── 열기 ──────────────────────────────────────────────────────

export function openFixedEditModal(id) {
  const item = id ? state.fixedItems.find(f => f.id === id) : null;

  document.getElementById("fixedEditId").value     = id ?? "";
  document.getElementById("fixedEditName").value   = item?.name   ?? "";
  document.getElementById("fixedEditAmount").value = item?.amount ?? "";

  // 시작 연월 — 기존 항목은 저장된 값, 신규는 이번 달로 기본값
  const defaultStart = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
  const savedStart   = item?.startYear && item?.startMonth
    ? `${item.startYear}-${String(item.startMonth).padStart(2, "0")}`
    : defaultStart;
  document.getElementById("fixedEditStart").value = savedStart;

  const type = item?.type ?? "expense";
  setFixedType(type);
  populateFixedCategorySelect(type);
  if (item) document.getElementById("fixedEditCategory").value = item.category;

  document.getElementById("fixedEditModal").classList.remove("hidden");
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────

function setFixedType(type) {
  document.querySelectorAll("#fixedTypeToggle .kind-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.kind === type)
  );
  populateFixedCategorySelect(type);
}

function getFixedType() {
  return document.querySelector("#fixedTypeToggle .kind-btn.active").dataset.kind;
}

function populateFixedCategorySelect(type) {
  const sel = document.getElementById("fixedEditCategory");
  sel.innerHTML = CATEGORIES[type]
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");
}

function closeModal() {
  document.getElementById("fixedEditModal").classList.add("hidden");
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupFixedModal() {
  // 지출/수입 타입 토글
  document.querySelectorAll("#fixedTypeToggle .kind-btn").forEach(b =>
    b.addEventListener("click", () => setFixedType(b.dataset.kind))
  );

  // 닫기
  document.getElementById("fixedEditClose").addEventListener("click", closeModal);
  document.getElementById("fixedEditModal").addEventListener("click", e => {
    if (e.target === document.getElementById("fixedEditModal")) closeModal();
  });

  // 저장
  document.getElementById("fixedSaveBtn").addEventListener("click", async () => {
    const id     = document.getElementById("fixedEditId").value || null;
    const name   = document.getElementById("fixedEditName").value.trim();
    const amount = parseInt(document.getElementById("fixedEditAmount").value);

    const startVal                = document.getElementById("fixedEditStart").value;
    const [startYear, startMonth] = startVal.split("-").map(Number);

    if (!name)                     { showToast("항목명을 입력하세요"); return; }
    if (!amount || amount <= 0)    { showToast("금액을 입력하세요"); return; }
    if (!startYear || !startMonth) { showToast("시작 월을 선택하세요"); return; }

    const data = {
      name,
      amount,
      type:       getFixedType(),
      category:   document.getElementById("fixedEditCategory").value,
      startYear,
      startMonth,
    };

    closeModal();
    await saveFixedItem(data, id);
    showToast(id ? "수정되었습니다" : "고정비가 추가되었습니다");
    await fetchFixedItems();
    renderAll();
  });

  // 삭제
  document.getElementById("fixedDeleteBtn").addEventListener("click", async () => {
    const id = document.getElementById("fixedEditId").value;
    if (!id || !confirm("삭제하시겠습니까?")) return;
    closeModal();
    await deleteFixedItem(id);
    showToast("삭제되었습니다");
    await fetchFixedItems();
    renderAll();
  });
}
