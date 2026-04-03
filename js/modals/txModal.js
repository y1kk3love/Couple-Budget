// ================================================================
// js/modals/txModal.js — 내역 추가 / 수정 모달
// ================================================================

import state from "../state.js";
import { showToast, todayStr, checkBudgetWarnings } from "../utils.js";
import { CATEGORIES, getCategoryInfo } from "../constants.js";
import { addTransaction, updateTransaction, deleteTransaction, fetchTransactions } from "../db.js";
import { renderAll } from "../app.js";

let editingTxId = null;

// ── 열기 ──────────────────────────────────────────────────────

export function openAddModal(dateStr = null) {
  editingTxId = null;
  document.getElementById("modalTitle").textContent = "내역 추가";
  document.getElementById("txId").value = "";
  document.getElementById("txAmount").value = "";
  document.getElementById("txDate").value = dateStr ?? todayStr();
  document.getElementById("txMemo").value = "";
  document.getElementById("deleteTxBtn").classList.add("hidden");

  setType("expense");
  setKind("variable");
  document.getElementById("txModal").classList.remove("hidden");
}

export function openEditModal(id) {
  const t = state.transactions.find(t => t.id === id);
  if (!t) return;

  editingTxId = id;
  document.getElementById("modalTitle").textContent = "내역 수정";
  document.getElementById("txId").value = id;
  document.getElementById("txAmount").value = t.amount;
  document.getElementById("txDate").value = t.date;
  document.getElementById("txMemo").value = t.memo ?? "";
  document.getElementById("deleteTxBtn").classList.remove("hidden");

  setType(t.type);
  populateCategorySelect(t.type);
  document.getElementById("txCategory").value = t.category;
  setKind(t.kind ?? "variable");
  document.getElementById("txModal").classList.remove("hidden");
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────

function setType(type) {
  document.querySelectorAll(".type-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.type === type)
  );
  populateCategorySelect(type);
}

function setKind(kind) {
  document.querySelectorAll(".kind-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.kind === kind)
  );
}

function getType() { return document.querySelector(".type-btn.active").dataset.type; }
function getKind() { return document.querySelector(".kind-btn.active").dataset.kind; }

function populateCategorySelect(type) {
  const sel = document.getElementById("txCategory");
  sel.innerHTML = CATEGORIES[type]
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");
}

function closeModal() {
  document.getElementById("txModal").classList.add("hidden");
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupTxModal() {
  // 타입 토글
  document.querySelectorAll(".type-btn").forEach(b =>
    b.addEventListener("click", () => setType(b.dataset.type))
  );

  // 고정/변동 토글
  document.querySelectorAll(".kind-btn").forEach(b =>
    b.addEventListener("click", () => setKind(b.dataset.kind))
  );

  // 닫기
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("txModal").addEventListener("click", e => {
    if (e.target === document.getElementById("txModal")) closeModal();
  });

  // 저장
  document.getElementById("saveTxBtn").addEventListener("click", async () => {
    const amount = parseInt(document.getElementById("txAmount").value);
    const date   = document.getElementById("txDate").value;

    if (!amount || amount <= 0) { showToast("금액을 입력하세요"); return; }
    if (!date)                  { showToast("날짜를 선택하세요"); return; }

    const [y, m] = date.split("-").map(Number);
    const type   = getType();
    const catId  = document.getElementById("txCategory").value;

    const data = {
      amount,
      type,
      category: catId,
      kind:     getKind(),
      memo:     document.getElementById("txMemo").value,
      date,
      year:     y,
      month:    m,
      name:     getCategoryInfo(catId, type).name,
    };

    closeModal();

    if (editingTxId) {
      await updateTransaction(editingTxId, data);
      showToast("수정되었습니다");
    } else {
      await addTransaction(data);
      showToast("추가되었습니다");
    }

    await fetchTransactions();
    renderAll();
    setTimeout(() => checkBudgetWarnings(state.transactions, state.budgets, state.currentYear, state.currentMonth), 2400);
  });

  // 삭제
  document.getElementById("deleteTxBtn").addEventListener("click", async () => {
    if (!confirm("삭제하시겠습니까?")) return;
    closeModal();
    await deleteTransaction(editingTxId);
    showToast("삭제되었습니다");
    await fetchTransactions();
    renderAll();
  });

  // 내역 추가 버튼
  document.getElementById("addTxBtn").addEventListener("click", () => openAddModal());
  document.getElementById("mobAddBtn")?.addEventListener("click", () => openAddModal());
}
