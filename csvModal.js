// ================================================================
// js/modals/csvModal.js — CSV 가져오기 모달
// ================================================================

import { db } from "../../firebase.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { showToast, todayStr, fmtMoney } from "../utils.js";
import { fetchTransactions } from "../db.js";
import { renderAll } from "../app.js";

let parsedRows = [];

// ── 열기/닫기 ─────────────────────────────────────────────────

function openModal()  { document.getElementById("csvModal").classList.remove("hidden"); }
function closeModal() {
  document.getElementById("csvModal").classList.add("hidden");
  resetModal();
}

function resetModal() {
  parsedRows = [];
  document.getElementById("csvPreview").classList.add("hidden");
  document.getElementById("csvImportConfirm").classList.add("hidden");
  document.getElementById("csvFileInput").value = "";
}

// ── CSV 파싱 ──────────────────────────────────────────────────

function parseCSV(text) {
  const lines   = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  // 신한카드 주요 컬럼명 자동 감지
  const dateKey = headers.find(h => /날짜|일자|거래일/.test(h));
  const amtKey  = headers.find(h => /금액|이용금액/.test(h));
  const nameKey = headers.find(h => /가맹점|내용|적요/.test(h));
  const typeKey = headers.find(h => /구분|입출금/.test(h));

  return lines.slice(1).reduce((acc, line) => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    if (vals.length < 2) return acc;

    const row    = Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    const amount = parseInt((row[amtKey] ?? "").replace(/[^0-9]/g, "")) || 0;
    if (!amount) return acc;

    // 날짜 정규화 (YYYYMMDD / YYYY.MM.DD / YYYY-MM-DD → YYYY-MM-DD)
    let date = (row[dateKey] ?? "")
      .replace(/\./g, "-")
      .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayStr();

    const rawType = row[typeKey] ?? "";
    const type    = /입금|수입/.test(rawType) ? "income" : "expense";

    acc.push({
      name:     row[nameKey] || "내역",
      amount,
      date,
      type,
      category: type === "income" ? "salary" : "etc",
      kind:     "variable",
      memo:     "",
    });
    return acc;
  }, []);
}

// ── 미리보기 렌더 ─────────────────────────────────────────────

function renderPreview(rows) {
  const preview = document.getElementById("csvPreview");

  if (!rows.length) {
    preview.innerHTML = `<p style="color:var(--expense);font-size:0.85rem">
      인식된 데이터가 없습니다. CSV 형식을 확인해주세요.
    </p>`;
    preview.classList.remove("hidden");
    return;
  }

  const tableRows = rows.slice(0, 5).map(r => {
    const color = r.type === "income" ? "var(--income)" : "var(--expense)";
    const sign  = r.type === "income" ? "+" : "-";
    return `<tr>
      <td>${r.date}</td>
      <td>${r.name}</td>
      <td style="color:${color}">${sign}${fmtMoney(r.amount)}</td>
    </tr>`;
  }).join("");

  preview.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text-2);margin-bottom:8px">
      ${rows.length}건 인식됨 (최대 5건 미리보기)
    </p>
    <table>
      <thead><tr><th>날짜</th><th>내용</th><th>금액</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`;
  preview.classList.remove("hidden");
  document.getElementById("csvImportConfirm").classList.remove("hidden");
}

// ── 파일 처리 ─────────────────────────────────────────────────

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    parsedRows = parseCSV(e.target.result);
    renderPreview(parsedRows);
  };
  reader.readAsText(file, "euc-kr");
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────

export function setupCsvModal() {
  document.getElementById("csvImportBtn").addEventListener("click", openModal);
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
  document.getElementById("csvImportConfirm").addEventListener("click", async () => {
    if (!parsedRows.length) return;

    const count = parsedRows.length;
    for (const row of parsedRows) {
      const [y, m] = row.date.split("-").map(Number);
      await addDoc(collection(db, "transactions"), { ...row, year: y, month: m });
    }

    closeModal();
    showToast(`${count}건을 가져왔습니다`);
    await fetchTransactions();
    renderAll();
  });
}
