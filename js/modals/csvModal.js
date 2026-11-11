// ================================================================
// js/modals/csvModal.js — CSV 가져오기 모달
// 파싱·문서 ID·기존 내역과의 대조는 js/csvParse.js (순수 함수, Node 테스트 대상)
// ================================================================

import { db } from "../../firebase.js";
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "../state.js";
import { openOverlay, closeOverlay } from "../motion.js";
import { showToast, fmtMoney, escapeHtml } from "../utils.js";
import { getCategoryInfo } from "../constants.js";
import { fetchTransactions, fetchAllTransactions, invalidateBalanceCache } from "../db.js";
import { parseCSV, buildImportOps, planImport } from "../csvParse.js";
import { renderAll } from "../app.js";

// 가져오기 계획 — 파일을 읽을 때 만든다: [{ id, data, exists, suspect }]
// exists: 같은 문서가 이미 있음(예전에 가져온 행) — 기본은 건너뛴다
let plan = [];
let parseInfo = null; // 미리보기 안내용 { badDates, badAmounts, reversed }
let fileSeq = 0;      // 파일을 연달아 고르면 나중 것만 반영

// ── 열기/닫기 ─────────────────────────────────────────────────

// 초기화는 열 때 한다 — 닫는 애니메이션 도중 미리보기가 사라지면 시트가 덜컥 줄어든다
function openModal()  { resetModal(); openOverlay(document.getElementById("csvModal")); }
function closeModal() { closeOverlay(document.getElementById("csvModal")); }

function resetModal() {
  plan = [];
  parseInfo = null;
  fileSeq++;
  document.getElementById("csvPreview").classList.add("hidden");
  document.getElementById("csvImportConfirm").classList.add("hidden");
  document.getElementById("csvFileInput").value = "";
}

const overwriteChecked = () => document.getElementById("csvOverwrite")?.checked ?? false;
// 이번에 실제로 쓸 행 — 새 행, 그리고 "덮어쓰기"를 골랐을 때만 이미 있는 행
const opsToWrite = () => plan.filter(op => !op.exists || overwriteChecked());

function refreshConfirmButton() {
  const btn = document.getElementById("csvImportConfirm");
  const n = opsToWrite().length;
  btn.classList.toggle("hidden", n === 0);
  btn.textContent = `${n.toLocaleString("ko-KR")}건 가져오기`;
}

// ── 미리보기 렌더 ─────────────────────────────────────────────

function renderPreview() {
  const preview = document.getElementById("csvPreview");
  const { badDates, badAmounts, reversed } = parseInfo;
  const existing = plan.filter(op => op.exists).length;
  const fresh    = plan.length - existing;
  const suspects = plan.filter(op => op.suspect).length;

  // 조용히 바뀌거나 빠지는 행이 없도록 미리보기에서 알린다
  const notes = [
    reversed   ? `금액이 음수인 ${reversed}건은 환불·취소로 보고 반대 방향(지출↔수입)으로 가져옵니다.` : "",
    badDates   ? `날짜를 읽지 못한 ${badDates}건은 제외했습니다.` : "",
    badAmounts ? `금액을 읽지 못한 ${badAmounts}건은 제외했습니다.` : "",
    suspects   ? `직접 입력한 내역과 날짜·금액이 같은 ${suspects}건이 있어요(표의 '중복 의심'). 가져온 뒤 겹치는지 확인해 주세요.` : "",
  ].filter(Boolean).map(n => `<p class="csv-warn">${n}</p>`).join("");

  if (!plan.length) {
    preview.innerHTML = `<p style="color:var(--expense);font-size:0.85rem">인식된 데이터가 없습니다. CSV 형식을 확인해주세요.</p>${notes}`;
    preview.classList.remove("hidden");
    document.getElementById("csvImportConfirm").classList.add("hidden");
    return;
  }

  const tableRows = plan.map(({ data: r, exists, suspect }) => {
    const color   = r.type === "income" ? "var(--income)" : "var(--expense)";
    const sign    = r.type === "income" ? "+" : "-";
    const catName = getCategoryInfo(r.category, r.type).name;
    const mark    = exists ? `<span class="csv-mark">이미 있음</span>` : suspect ? `<span class="csv-mark warn">중복 의심</span>` : "";
    return `<tr class="${exists ? "csv-exists" : ""}">
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.name)}${mark}</td>
      <td style="color:${color}">${sign}${fmtMoney(r.amount)}</td>
      <td>${escapeHtml(catName)}</td>
    </tr>`;
  }).join("");

  // 합계는 새로 들어올 행만 (이미 있는 행은 기본으로 건너뛰므로)
  const freshRows    = plan.filter(op => !op.exists).map(op => op.data);
  const totalIncome  = freshRows.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const totalExpense = freshRows.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const net          = totalIncome - totalExpense;
  const netColor     = net >= 0 ? "var(--income)" : "var(--expense)";
  const netSign      = net >= 0 ? "+" : "-";

  let summaryRows = "";
  if (totalIncome && totalExpense) {
    summaryRows = `
      <div class="csv-summary-row"><span>지출</span><strong style="color:var(--expense)">-${fmtMoney(totalExpense)}원</strong></div>
      <div class="csv-summary-row"><span>수입</span><strong style="color:var(--income)">+${fmtMoney(totalIncome)}원</strong></div>
      <div class="csv-summary-row csv-summary-net"><span>합계</span><strong style="color:${netColor}">${netSign}${fmtMoney(net)}원</strong></div>`;
  } else if (totalExpense) {
    summaryRows = `<div class="csv-summary-row"><span>새 내역 총 지출</span><strong style="color:var(--expense)">-${fmtMoney(totalExpense)}원</strong></div>`;
  } else if (totalIncome) {
    summaryRows = `<div class="csv-summary-row"><span>새 내역 총 수입</span><strong style="color:var(--income)">+${fmtMoney(totalIncome)}원</strong></div>`;
  }

  // 이미 있는 행 — 기본은 건너뛴다. 예전에는 통째로 덮어써서, 가져온 뒤 고친 카테고리·이름이
  // CSV 값으로 되돌아갔다. 예전 파일의 잘못된 값을 바로잡으려는 경우에만 덮어쓰기를 고른다.
  const existingBox = existing ? `
    <div class="csv-existing">
      <p>이미 가져온 내역 <strong>${existing}건</strong>은 건너뜁니다 — 가져온 뒤 고친 내용이 그대로 남아요.</p>
      <label class="check-row">
        <input type="checkbox" id="csvOverwrite" />
        <span>이미 있는 ${existing}건도 CSV 내용으로 덮어쓰기 (고친 카테고리·이름이 CSV 값으로 돌아가요)</span>
      </label>
    </div>` : "";

  preview.innerHTML = `
    <p style="font-size:0.85rem;color:var(--text-2);margin-bottom:8px">
      ${plan.length}건 인식됨 · <strong>새 내역 ${fresh}건</strong>${existing ? ` · 이미 있음 ${existing}건` : ""}
    </p>
    ${notes}
    <div style="max-height:260px;overflow-y:auto">
      <table>
        <thead><tr><th>날짜</th><th>내용</th><th>금액</th><th>카테고리</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="csv-summary">${summaryRows}</div>
    ${existingBox}`;
  preview.querySelector("#csvOverwrite")?.addEventListener("change", refreshConfirmButton);
  preview.classList.remove("hidden");
  refreshConfirmButton();
}

function renderPreviewError(msg) {
  const preview = document.getElementById("csvPreview");
  preview.innerHTML = `<p style="color:var(--expense);font-size:0.85rem">${msg}</p>`;
  preview.classList.remove("hidden");
  document.getElementById("csvImportConfirm").classList.add("hidden");
}

// ── 파일 처리 ─────────────────────────────────────────────────

function handleFile(file) {
  const seq = ++fileSeq;
  const reader = new FileReader();
  reader.onload = async e => {
    const parsed = parseCSV(e.target.result);
    const ops    = buildImportOps(parsed.rows, state.currentUser?.email ?? null);
    // 지금 있는 내역과 대조해 "새 내역 / 이미 있음"을 가른다. 대조하지 못하면 가져오지 않는다 —
    // 모르는 채로 쓰면 예전처럼 고친 내용을 덮어쓸 수 있다.
    let existing;
    try {
      existing = await fetchAllTransactions();
    } catch (err) {
      console.error("CSV 가져오기: 기존 내역 조회 실패", err);
      if (seq === fileSeq) renderPreviewError("지금 있는 내역을 확인하지 못해 가져올 수 없어요. 네트워크를 확인한 뒤 파일을 다시 선택해 주세요.");
      return;
    }
    if (seq !== fileSeq) return; // 그 사이 다른 파일을 골랐거나 창을 다시 열었다
    plan = planImport(ops, existing);
    parseInfo = parsed;
    renderPreview();
  };
  reader.readAsText(file, "euc-kr");
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupCsvModal() {
  document.getElementById("csvImportBtn").addEventListener("click", openModal);
  document.getElementById("sideImportBtn").addEventListener("click", openModal); // 모바일 햄버거 메뉴
  document.getElementById("csvModalClose").addEventListener("click", closeModal);
  document.getElementById("csvModal").addEventListener("click", e => {
    if (e.target === document.getElementById("csvModal")) closeModal();
  });

  // 드래그 앤 드롭
  const dropZone = document.getElementById("csvDropZone");
  dropZone.addEventListener("click", () => document.getElementById("csvFileInput").click());
  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // 파일 선택
  document.getElementById("csvFileInput").addEventListener("change", e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  // 가져오기 확정
  document.getElementById("csvImportConfirm").addEventListener("click", async e => {
    const btn = e.currentTarget;
    const ops = opsToWrite();
    if (!ops.length || btn.disabled) return;

    const skipped = plan.length - ops.length;
    const label   = btn.textContent;

    // writeBatch는 한 번에 최대 500개 쓰기. 여유를 두고 450개씩 끊어 커밋.
    // 실패 시 전용 안내(이어서 가져오기)가 필요해 runWrite 대신 직접 잠근다 — 연타 방지는 동일
    const CHUNK = 450;
    btn.disabled = true;
    btn.textContent = "가져오는 중…";
    try {
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const { id, data } of ops.slice(i, i + CHUNK)) {
          batch.set(doc(db, "transactions", id), data);
        }
        await batch.commit();
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = label;
      // 청크 일부만 커밋됐을 수 있다 — 문서 ID가 결정적이라 버튼을 다시 누르면 같은 문서에
      // 같은 내용을 다시 쓸 뿐 중복 없이 이어서 채워진다
      console.error("CSV 가져오기 실패:", err);
      invalidateBalanceCache();
      showToast("가져오기에 실패했습니다. 다시 누르면 이어서 가져옵니다");
      await fetchTransactions();
      renderAll();
      return;
    }
    btn.disabled = false;
    btn.textContent = label;
    invalidateBalanceCache();

    closeModal();
    showToast(skipped
      ? `${ops.length}건을 가져왔습니다 · 이미 있던 ${skipped}건은 그대로 두었어요`
      : `${ops.length}건을 가져왔습니다`);
    await fetchTransactions();
    renderAll();
  });
}
