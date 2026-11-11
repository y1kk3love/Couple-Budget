// ================================================================
// js/modals/txModal.js — 내역 추가 / 수정 모달
// ================================================================

import state from "../state.js";
import { openOverlay, closeOverlay, flash, reducedMotion, animateNextRender, markOverlayDirty } from "../motion.js";
import { showToast, showConfirm, todayStr, fmtMoney, setupAmountPresets, escapeHtml, runWrite, invalidField } from "../utils.js";
import { CATEGORIES, getCategoryInfo } from "../constants.js";
import {
  addTransaction, updateTransaction, deleteTransaction, fetchTransactions, fetchRecentTransactionsByName,
  updateCategoryByName, countCategoryTargets, moveFixedTransaction, fetchAllTransactions
} from "../db.js";
import { renderAll } from "../app.js";
import { selectCalendarDate } from "../views/calendar.js";

let editingTxId = null;
// 수정 중인 거래의 원본 — 전체 기간 목록·이력 패널에서 연 다른 달 거래는
// state.transactions(현재 달)에 없으므로 원본을 여기 들고 있는다
let editingTx = null;
// 창을 열 때마다 1씩 늘어난다. 저장·삭제는 누른 순간의 대상과 이 값을 붙잡아 두고, 기다림(건수 세기·확인 창) 뒤에
// 값이 달라졌거나 창이 닫혔으면 그만둔다. 예전에는 기다린 뒤에 editingTxId를 다시 읽어, 그 사이 다른 내역으로
// 넘어가면 처음 내역의 입력값이 그 내역에 덮어써졌고, 닫고 새로 열면 새 내역으로 한 번 더 추가됐다.
let openSeq = 0;
const isOpenNow = () => { const el = document.getElementById("txModal"); return !el.classList.contains("hidden") && !el.classList.contains("is-closing"); };

// ── 열기 ──────────────────────────────────────────────────────

// 날짜를 정하지 않고 추가할 때의 기본 날짜 — 이번 달을 보고 있으면 오늘, 다른 달을 보고 있으면 그 달.
// 예전에는 항상 오늘이라, 지난달 화면에서 빠뜨린 영수증을 넣으면 이번 달에 저장되고 보던 화면에는
// 아무 변화가 없어 다시 입력하게 됐다. (월과 무관한 화면 — 예산안·결혼 — 에서는 오늘)
function defaultAddDate() {
  const now = new Date();
  const monthless = state.currentView === "plan" || state.currentView === "wedding";
  if (monthless || (state.currentYear === now.getFullYear() && state.currentMonth === now.getMonth() + 1)) return todayStr();
  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const pad = n => String(n).padStart(2, "0");
  return `${state.currentYear}-${pad(state.currentMonth)}-${pad(Math.min(now.getDate(), lastDay))}`;
}

export function openAddModal(dateStr = null) {
  openSeq++;
  editingTxId = null;
  editingTx = null;
  const date = dateStr ?? defaultAddDate();
  document.getElementById("modalTitle").textContent = "내역 추가";
  document.getElementById("txId").value = "";
  document.getElementById("txAmount").value = "";
  document.getElementById("txDate").value = date;
  document.getElementById("txMemo").value = "";
  document.getElementById("deleteTxBtn").classList.add("hidden");
  document.getElementById("txFixedNote").classList.add("hidden");

  setType("expense");
  setKind("variable");
  openOverlay(document.getElementById("txModal"));
  loadNameSuggest(); // 최근에 쓴 이름 추천 (전체 내역 사본에서 — 보통 네트워크 없이)
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

  openSeq++;
  editingTxId = id;
  editingTx = t;
  document.getElementById("modalTitle").textContent = "내역 수정";
  document.getElementById("txId").value = id;
  document.getElementById("txAmount").value = t.amount;
  document.getElementById("txDate").value = t.date;
  document.getElementById("txMemo").value = t.memo ?? "";
  document.getElementById("deleteTxBtn").classList.remove("hidden");
  // 고정비에서 자동으로 기록된 내역이면, 고치거나 지워도 이 달 기록만 바뀐다는 것을 알린다
  document.getElementById("txFixedNote").classList.toggle("hidden", !(t.fromFixed && t.fixedId));
  document.getElementById("txNameSuggest").classList.add("hidden");

  setType(t.type); // 칩도 이 타입으로 다시 그린다
  setCategory(t.category);
  setKind(t.kind ?? "variable");
  openOverlay(document.getElementById("txModal"));

  // 최근 3개월 유사 이름 내역 패널 (비동기)
  const panel = document.getElementById("txContextPanel");
  panel.innerHTML = `<div class="ctx-loading" aria-label="불러오는 중"><span class="skeleton" style="width:40%"></span><span class="skeleton" style="width:85%"></span></div>`;
  panel.classList.remove("hidden");
  fetchRecentTransactionsByName(t.name, id, 3).then(txs => {
    if (editingTxId !== id) return; // 그 사이 다른 내역을 열었다
    renderContextPanel(txs.length ? `'${escapeHtml(t.name)}' 최근 3개월 내역` : null, txs);
  }).catch(err => {
    console.warn("최근 내역 조회 실패:", err);
    if (editingTxId === id) panel.classList.add("hidden"); // 참고용 패널이라 조용히 숨긴다
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
  // 빠른 금액 버튼 — 지출은 천 원 단위(커피·점심), 수입은 만 원 단위. 예전에는 둘 다 +50만/+10만/+1만이라
  // 매일 쓰는 지출 입력에는 쓸모가 없었다
  document.getElementById("txAmountPresets").innerHTML = PRESETS[type].map(([add, label]) =>
    `<button type="button" class="preset-btn" data-add="${add}">${label}</button>`).join("")
    + `<button type="button" class="preset-btn preset-clear" data-clear="1">지우기</button>`;
  renderNameSuggest();
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
  // "고정비"를 고르면 매달 반복될 것으로 기대하기 쉽다 — 표시일 뿐이라고 알린다 (자동 기록된 내역은 위 안내가 대신한다)
  document.getElementById("txKindHint").classList.toggle("hidden", !(kind === "fixed" && !editingTx?.fromFixed));
}

const PRESETS = {
  expense: [[1000, "+1천"], [5000, "+5천"], [10000, "+1만"], [100000, "+10만"]],
  income:  [[10000, "+1만"], [100000, "+10만"], [1000000, "+100만"]],
};

// ── 내용 추천 (추가할 때) ─────────────────────────────────────
// 최근에 쓴 이름을 칩으로 보여 주고, 누르면 이름과 카테고리를 함께 채운다. 예전에는 매주 가는 곳도
// 매번 다 치고 카테고리를 다시 골라야 했고, "스타벅스"와 "스벅"처럼 이름이 갈려 같은 이름 묶음도 깨졌다.
let suggestPool = null; // 전체 내역(최신순) — 창을 열 때 받아 둔다

async function loadNameSuggest() {
  try { suggestPool = await fetchAllTransactions(); }
  catch { suggestPool = null; } // 추천은 없어도 된다
  renderNameSuggest();
}

function renderNameSuggest() {
  const box = document.getElementById("txNameSuggest");
  if (editingTxId || !suggestPool) { box.classList.add("hidden"); return; }
  const type  = getType();
  const query = document.getElementById("txMemo").value.trim().toLowerCase();
  const picks = [], seen = new Set();
  for (const t of suggestPool) {
    if (picks.length >= 6) break;
    if (t.type !== type || t.fromFixed || !t.name || seen.has(t.name)) continue;
    if (t.name === getCategoryInfo(t.category, t.type).name) continue; // 내용을 비워 카테고리 이름으로 저장된 내역
    if (query && (!t.name.toLowerCase().includes(query) || t.name.toLowerCase() === query)) continue;
    seen.add(t.name);
    picks.push(t);
  }
  box.classList.toggle("hidden", picks.length === 0);
  box.innerHTML = picks.map((t, i) => {
    const cat = getCategoryInfo(t.category, t.type);
    return `<button type="button" class="name-chip" data-i="${i}" title="${escapeHtml(cat.name)}"><i style="background:${cat.color}"></i><span>${escapeHtml(t.name)}</span></button>`;
  }).join("");
  box.querySelectorAll(".name-chip").forEach(chip => chip.addEventListener("click", () => {
    const t = picks[Number(chip.dataset.i)];
    const memo = document.getElementById("txMemo");
    memo.value = t.name;
    setCategory(t.category);
    markOverlayDirty(memo); // 고른 것도 입력이다 (실수로 닫을 때 확인)
    box.classList.add("hidden");
  }));
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

// 방금 저장한 거래를 반짝여 어디에 들어갔는지 보여 준다 (토스).
// 목록이면 그 행을 화면 안으로 가져와 반짝이고, 달력이면 그 날짜 칸을 반짝인다.
function flashSaved(id, date) {
  const view = document.querySelector(".view.active");
  if (!view) return;
  const row = id ? view.querySelector(`.tx-item[data-id="${CSS.escape(id)}"]`) : null;
  if (row) {
    row.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    flash(row);
    return;
  }
  const [y, m, d] = (date ?? "").split("-").map(Number);
  if (y === state.currentYear && m === state.currentMonth) {
    flash(view.querySelector(`.cal-cell[data-day="${d}"]`));
  }
}

// 기존 내역 패널은 비우지 않는다 — 닫히는 애니메이션 동안 내용이 먼저 사라지면 시트가 덜컥 줄어든다.
// 열 때마다 openAddModal/openEditModal이 패널을 새로 채우거나 숨긴다.
function closeModal() {
  closeOverlay(document.getElementById("txModal"));
}

function renderContextPanel(title, txs) {
  const panel = document.getElementById("txContextPanel");
  if (!title || !txs.length) { panel.classList.add("hidden"); return; }

  const rows = txs.map((t, i) => {
    const sign  = t.type === "income" ? "+" : "-";
    const color = t.type === "income" ? "var(--income)" : "var(--expense)";
    return `<div class="ctx-row" role="button" tabindex="0" data-i="${i}" title="눌러서 이 내역 수정">
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

  // 내용: 입력에 맞춰 추천을 거르고, Enter로 바로 저장 (키보드의 "완료")
  const memo = document.getElementById("txMemo");
  memo.addEventListener("input", renderNameSuggest);
  memo.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.isComposing) return; // 한글 조합 중의 Enter는 글자 확정이다
    e.preventDefault();
    document.getElementById("saveTxBtn").click();
  });

  // 닫기
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("txModal").addEventListener("click", e => {
    if (e.target === document.getElementById("txModal")) closeModal();
  });

  // 저장
  document.getElementById("saveTxBtn").addEventListener("click", async e => {
    const btn    = e.currentTarget;
    if (btn.disabled) return;
    // 누른 순간의 대상을 붙잡는다 — 아래의 기다림 뒤에 모듈 변수를 다시 읽지 않는다 (openSeq 설명 참고)
    const id = editingTxId, orig = editingTx, seq = openSeq;
    const stale = () => seq !== openSeq || !isOpenNow();
    const amount = parseInt(document.getElementById("txAmount").value);
    const date   = document.getElementById("txDate").value;

    if (!amount || amount <= 0) { invalidField(document.getElementById("txAmount"), "금액을 입력하세요"); return; }
    if (!date)                  { invalidField(document.getElementById("txDate"), "날짜를 선택하세요"); return; }

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
    if (!id) data.owner = state.currentUser?.email ?? null;

    // 카테고리를 바꿨고 같은 이름의 다른 내역이 있으면, 그것들도 함께 바꿀지 먼저 묻는다.
    // 예전에는 묻지 않고 전 기간의 같은 이름 내역(상대가 입력한 것 포함)을 모두 바꾸고 3초짜리
    // 안내만 띄웠다 — 하루만 다르게 분류하려던 수정이 과거 분류를 되돌릴 수 없게 덮어썼다.
    let propagate = false;
    if (id && orig && orig.category !== data.category) {
      btn.disabled = true; // 세는 동안의 연타 방지 (runWrite가 잠그기 전)
      let others = 0;
      try { others = await countCategoryTargets(data.name, data.type, data.category, id); }
      catch (err) { console.warn("같은 이름 내역 수를 세지 못했습니다 — 이 내역만 바꿉니다:", err); }
      finally { btn.disabled = false; }
      if (stale()) return; // 세는 동안 창을 닫았거나 다른 내역을 열었다 — 이 저장은 버린다
      if (others > 0) {
        const catName = getCategoryInfo(data.category, data.type).name;
        const choice = await showConfirm(
          `'${data.name}' 내역이 ${others}건 더 있어요.\n모두 '${catName}'(으)로 바꿀까요?`,
          { confirmText: `${others}건 모두 바꾸기`, altText: "이 내역만 바꾸기", danger: false });
        if (choice === false) return; // 취소 — 저장하지 않고 입력 창으로 돌아간다
        if (stale()) return;
        propagate = choice === true;
      }
    }

    // 쓰기 성공 후에만 모달을 닫는다 — 실패 시 입력값을 보존하고 알린다
    let toastMsg;
    let savedId = null; // 저장한 거래 ID — 다시 그린 뒤 그 행(달력은 그 날짜 칸)을 반짝인다
    const ok = await runWrite(btn, async () => {
      if (id) {
        const prev = orig;
        // 고정비 자동생성 거래를 다른 달로 옮기면 원래 달엔 skip 마커, 옮긴 달엔 새 일반 거래
        // (결정적 ID를 그대로 두면 원래 달 방문 시 고정비가 다시 생성되며 옮긴 거래를 덮어쓴다)
        const movedFixed = prev?.fromFixed && prev.fixedId &&
          (prev.year !== data.year || prev.month !== data.month);
        if (movedFixed) savedId = await moveFixedTransaction(id, prev, data);
        else          { await updateTransaction(id, data); savedId = id; }

        // 사용자가 고른 경우에만 같은 이름의 거래 전체(전 기간)에 카테고리를 전파
        const synced = propagate
          ? await updateCategoryByName(data.name, data.type, data.category, savedId)
          : 0;
        toastMsg = synced > 0 ? `수정되었습니다 · 같은 이름 ${synced}건 카테고리 변경` : "수정되었습니다";
        if (prev && (prev.year !== data.year || prev.month !== data.month)) toastMsg += ` · ${m}월로 옮겼어요`;
      } else {
        savedId = await addTransaction(data);
        // 어느 날짜에 들어갔는지 알린다 — 보고 있는 달이 아니면 화면에 변화가 없어 사라진 것처럼 보였다
        toastMsg = `${m}월 ${Number(date.split("-")[2])}일 내역으로 추가되었습니다`;
      }
    });
    if (!ok) return;

    closeModal();
    showToast(toastMsg);
    if (state.currentView === "calendar") selectCalendarDate(data.date); // 달력 아래에 그날 내역이 보이게
    await fetchTransactions();
    animateNextRender(); // 목록이면 새 행이 나타나고 나머지가 제자리로 (다시 그리기 바로 앞에서만 유효)
    renderAll();
    // 전체 기간 목록은 한 박자 늦게(프로미스 뒤) 그려지므로 다음 작업에서 찾는다.
    // (requestAnimationFrame은 숨겨진 탭에서 멈춰 쓰지 않는다)
    setTimeout(() => flashSaved(savedId, data.date), 0);
  });

  // 삭제
  document.getElementById("deleteTxBtn").addEventListener("click", async e => {
    const btn = e.currentTarget;
    const id = editingTxId, orig = editingTx, seq = openSeq; // 누른 순간의 대상 (저장과 같은 이유)
    if (!id) return;
    // 고정비 자동 기록은 문서를 지우는 대신 "이 달은 건너뜀"으로 남는다 — 무슨 일이 일어나는지 그대로 알린다
    const msg = orig?.fromFixed && orig.fixedId
      ? "이 달의 고정비 기록을 지울까요?\n이 달만 건너뛰고, 고정비 자체와 다른 달 기록은 그대로예요."
      : "이 내역을 삭제할까요?";
    if (!(await showConfirm(msg, { confirmText: "삭제" }))) return;
    if (seq !== openSeq || !isOpenNow()) return;
    if (!(await runWrite(btn, () => deleteTransaction(id), "삭제"))) return;
    closeModal();
    showToast("삭제되었습니다");
    await fetchTransactions();
    animateNextRender(); // 지운 행은 흐려지며 빠지고 아래 행이 올라온다
    renderAll();
  });

  // 헤더 "내역 추가"·하단 + 버튼은 화면에 따라 동작이 달라 app.js가 바인딩한다 (onAddClick)
}
