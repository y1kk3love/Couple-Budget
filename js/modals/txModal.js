// ================================================================
// js/modals/txModal.js — 내역 추가 / 수정 모달
// ================================================================

import state from "../state.js";
import { showToast, showConfirm, todayStr, fmtMoney, setupAmountPresets, escapeHtml, runWrite } from "../utils.js";
import { CATEGORIES, getCategoryInfo } from "../constants.js";
import { addTransaction, updateTransaction, deleteTransaction, fetchTransactions, fetchRecentTransactionsByName, updateCategoryByName, moveFixedTransaction } from "../db.js";
import { renderAll } from "../app.js";

let editingTxId = null;
// 수정 중인 거래의 원본 — 전체 기간 목록·이력 패널에서 연 다른 달 거래는
// state.transactions(현재 달)에 없으므로 원본을 여기 들고 있는다
let editingTx = null;

// ── 열기 ──────────────────────────────────────────────────────

export function openAddModal(dateStr = null) {
  editingTxId = null;
  editingTx = null;
  const date = dateStr ?? todayStr();
  document.getElementById("modalTitle").textContent = "내역 추가";
  document.getElementById("txId").value = "";
  document.getElementById("txAmount").value = "";
  document.getElementById("txDate").value = date;
  document.getElementById("txMemo").value = "";
  document.getElementById("deleteTxBtn").classList.add("hidden");

  setType("expense");
  setKind("variable");
  document.getElementById("txModal").classList.remove("hidden");
  // 가장 먼저 입력하는 금액 칸에 바로 포커스 (모바일에선 숫자 키패드가 뜬다)
  document.getElementById("txAmount").focus();

  // 해당 날 기존 내역 패널
  const dayTxs = state.transactions.filter(t => t.date === date);
  renderContextPanel(
    dayTxs.length ? `${escapeHtml(date.slice(5).replace("-", "/"))} 기존 내역` : null,
    dayTxs
  );
}

// tx: 현재 달 state에 없는 거래(전체 기간 목록)를 열 때 직접 전달
export function openEditModal(id, tx = null) {
  const t = tx ?? state.transactions.find(t => t.id === id);
  if (!t) return;

  editingTxId = id;
  editingTx = t;
  document.getElementById("modalTitle").textContent = "내역 수정";
  document.getElementById("txId").value = id;
  document.getElementById("txAmount").value = t.amount;
  document.getElementById("txDate").value = t.date;
  document.getElementById("txMemo").value = t.memo ?? "";
  document.getElementById("deleteTxBtn").classList.remove("hidden");

  setType(t.type); // 칩도 이 타입으로 다시 그린다
  setCategory(t.category);
  setKind(t.kind ?? "variable");
  document.getElementById("txModal").classList.remove("hidden");

  // 최근 3개월 유사 이름 내역 패널 (비동기)
  const panel = document.getElementById("txContextPanel");
  panel.innerHTML = `<p class="ctx-loading">불러오는 중…</p>`;
  panel.classList.remove("hidden");
  fetchRecentTransactionsByName(t.name, id, 3).then(txs => {
    renderContextPanel(txs.length ? `'${escapeHtml(t.name)}' 최근 3개월 내역` : null, txs);
  });
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────

// ⚠ 셀렉터는 반드시 #txModal 범위로 한정 — .kind-btn은 고정비 모달의
// 지출/수입 토글에도 쓰이는 클래스라, 전역 셀렉터를 쓰면 서로 상태를 오염시킨다.
const modalEl = () => document.getElementById("txModal");

function setType(type) {
  modalEl().querySelectorAll(".type-btn").forEach(b => {
    const on = b.dataset.type === type;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
  populateCategorySelect(type);
  // "내용" 칸이 곧 목록에 보이는 이름이라는 걸 예시로 알려 준다 (예전 라벨 "메모 (선택)"은 이를 가렸다)
  document.getElementById("txMemo").placeholder = type === "income"
    ? "예: 월급 (비우면 카테고리 이름)"
    : "예: 스타벅스 (비우면 카테고리 이름)";
}

function setKind(kind) {
  modalEl().querySelectorAll(".kind-btn").forEach(b => {
    const on = b.dataset.kind === kind;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
}

function getType() { return modalEl().querySelector(".type-btn.active").dataset.type; }
function getKind() { return modalEl().querySelector(".kind-btn.active").dataset.kind; }

// 카테고리 칩을 타입(지출/수입)에 맞게 다시 그리고 첫 카테고리를 고른다.
// 선택값은 숨은 입력 #txCategory에 둔다 — 저장 흐름은 그 값을 읽는다.
function populateCategorySelect(type) {
  const box = document.getElementById("txCategoryChips");
  box.innerHTML = CATEGORIES[type].map(c => `
    <button type="button" class="cat-chip" data-cat="${c.id}" aria-pressed="false" title="${c.name}">
      <i style="background:${c.color}"></i><span>${c.name}</span>
    </button>`).join("");
  box.querySelectorAll(".cat-chip").forEach(chip =>
    chip.addEventListener("click", () => setCategory(chip.dataset.cat))
  );
  setCategory(CATEGORIES[type][0].id);
}

function setCategory(id) {
  document.getElementById("txCategory").value = id;
  document.querySelectorAll("#txCategoryChips .cat-chip").forEach(chip => {
    const on = chip.dataset.cat === id;
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", on);
  });
}

function closeModal() {
  document.getElementById("txModal").classList.add("hidden");
  document.getElementById("txContextPanel").classList.add("hidden");
  document.getElementById("txContextPanel").innerHTML = "";
}

function renderContextPanel(title, txs) {
  const panel = document.getElementById("txContextPanel");
  if (!title || !txs.length) { panel.classList.add("hidden"); return; }

  const rows = txs.map((t, i) => {
    const sign  = t.type === "income" ? "+" : "-";
    const color = t.type === "income" ? "var(--income)" : "var(--expense)";
    return `<div class="ctx-row" role="button" tabindex="0" data-i="${i}" title="클릭해서 이 내역 수정">
      <span class="ctx-date">${escapeHtml(t.date.slice(5).replace("-", "/"))}</span>
      <span class="ctx-name">${escapeHtml(t.name)}</span>
      <span class="ctx-amt" style="color:${color}">${sign}${fmtMoney(t.amount)}</span>
    </div>`;
  }).join("");

  panel.innerHTML = `<div class="ctx-title">${title}</div><div class="ctx-list">${rows}</div>`;

  // 행 클릭 → 해당 내역 수정으로 전환 (다른 달 거래일 수 있어 객체를 직접 넘긴다)
  panel.querySelectorAll(".ctx-row").forEach(el => {
    el.addEventListener("click", () => {
      const t = txs[Number(el.dataset.i)];
      openEditModal(t.id, t);
    });
  });
  panel.classList.remove("hidden");
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupTxModal() {
  // 금액 빠른 입력 버튼
  document.querySelectorAll('.amount-presets[data-target="txAmount"]').forEach(setupAmountPresets);

  // 타입 토글 (#txModal 범위로 한정 — 고정비 모달의 .kind-btn과 충돌 방지)
  document.querySelectorAll("#txModal .type-btn").forEach(b =>
    b.addEventListener("click", () => setType(b.dataset.type))
  );

  // 고정/변동 토글
  document.querySelectorAll("#txModal .kind-btn").forEach(b =>
    b.addEventListener("click", () => setKind(b.dataset.kind))
  );

  // 닫기
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("txModal").addEventListener("click", e => {
    if (e.target === document.getElementById("txModal")) closeModal();
  });

  // 저장
  document.getElementById("saveTxBtn").addEventListener("click", async e => {
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
      name:     document.getElementById("txMemo").value.trim() || getCategoryInfo(catId, type).name,
    };

    // 새 내역에만 작성자를 기록 — 수정 시에는 원래 작성자를 보존한다
    if (!editingTxId) data.owner = state.currentUser?.email ?? null;

    // 쓰기 성공 후에만 모달을 닫는다 — 실패 시 입력값을 보존하고 알린다
    let toastMsg;
    const ok = await runWrite(e.currentTarget, async () => {
      if (editingTxId) {
        const prev = editingTx;
        // 고정비 자동생성 거래를 다른 달로 옮기면 원래 달엔 skip 마커, 옮긴 달엔 새 일반 거래
        // (결정적 ID를 그대로 두면 원래 달 방문 시 고정비가 다시 생성되며 옮긴 거래를 덮어쓴다)
        const movedFixed = prev?.fromFixed && prev.fixedId &&
          (prev.year !== data.year || prev.month !== data.month);
        if (movedFixed) await moveFixedTransaction(editingTxId, prev, data);
        else            await updateTransaction(editingTxId, data);

        // 카테고리를 바꿨으면 같은 이름의 거래 전체(전 기간)에 전파
        let synced = 0;
        if (prev && prev.category !== data.category) {
          synced = await updateCategoryByName(data.name, data.type, data.category, editingTxId);
        }
        toastMsg = synced > 0 ? `수정되었습니다 · 같은 이름 ${synced}건 카테고리 변경` : "수정되었습니다";
      } else {
        await addTransaction(data);
        toastMsg = "추가되었습니다";
      }
    });
    if (!ok) return;

    closeModal();
    showToast(toastMsg);
    await fetchTransactions();
    renderAll();
  });

  // 삭제
  document.getElementById("deleteTxBtn").addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!(await showConfirm("이 내역을 삭제할까요?", { confirmText: "삭제" }))) return;
    if (!(await runWrite(btn, () => deleteTransaction(editingTxId), "삭제"))) return;
    closeModal();
    showToast("삭제되었습니다");
    await fetchTransactions();
    renderAll();
  });

  // 헤더 "내역 추가"·하단 + 버튼은 화면에 따라 동작이 달라 app.js가 바인딩한다 (onAddClick)
}
