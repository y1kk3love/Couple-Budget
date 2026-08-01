// ================================================================
// js/modals/csvModal.js — CSV 가져오기 모달
// ================================================================

import { db } from "../../firebase.js";
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "../state.js";
import { showToast, todayStr, fmtMoney, escapeHtml } from "../utils.js";
import { CATEGORIES, getCategoryInfo } from "../constants.js";
import { fetchTransactions, invalidateBalanceCache } from "../db.js";
import { renderAll } from "../app.js";

let parsedRows = [];

const categoryNameToId = Object.fromEntries(
  CATEGORIES.expense.map(c => [c.name, c.id])
);
const incomeNameToId = Object.fromEntries(
  CATEGORIES.income.map(c => [c.name, c.id])
);

// 문자열을 안정적인 짧은 해시로 (FNV-1a 32bit). 가맹점명을 문서 ID에
// 안전하게 끼워넣기 위한 용도라 암호학적 강도는 필요 없음.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// 같은 CSV를 다시 가져와도 중복이 쌓이지 않도록, 행 내용으로 결정적
// 문서 ID를 만든다. 한 파일 안에 완전히 동일한 행(같은 날·금액·가맹점)이
// 여러 건이면 occ(등장 순번)로 구분해 모두 보존한다.
function buildImportOps(rows) {
  const seen = new Map();
  return rows.map(row => {
    const [y, m]  = row.date.split("-").map(Number);
    const baseKey = `${row.date}_${row.amount}_${hashStr(row.name)}`;
    const occ     = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occ + 1);
    return {
      id:   `csv_${baseKey}_${occ}`,
      data: { ...row, year: y, month: m, owner: state.currentUser?.email ?? null },
    };
  });
}

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

// 한 줄을 필드 배열로 분해 — 따옴표로 감싼 필드 안의 쉼표("ABC, DEF")와
// 이중 따옴표 이스케이프("")를 처리한다. (필드 내 줄바꿈은 미지원)
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

function parseCSV(text) {
  const lines   = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);

  // 신한카드 주요 컬럼명 자동 감지
  const dateKey = headers.find(h => /날짜|일자|거래일/.test(h));
  const amtKey  = headers.find(h => /금액|이용금액/.test(h));
  const nameKey = headers.find(h => /가맹점|내용|적요/.test(h));
  const typeKey = headers.find(h => /구분|입출금/.test(h));
  const catKey  = headers.find(h => /카테고리/.test(h));

  return lines.slice(1).reduce((acc, line) => {
    const vals = parseCsvLine(line);
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

    const rawCat  = row[catKey] ?? "";
    // 카테고리 이름이 있으면 타입에 맞는 목록에서 찾고, 없으면 기타로
    const category = type === "income"
      ? (incomeNameToId[rawCat] ?? "etc_in")
      : (categoryNameToId[rawCat] ?? "etc");

    acc.push({
      name:     row[nameKey] || "내역",
      amount,
      date,
      type,
      category,
      kind:     "variable",
      memo:     row[nameKey] || "",
    });
    return acc;
  }, []);
}

// ── 미리보기 렌더 ─────────────────────────────────────────────

function renderPreview(rows) {
  const preview = document.getElementById("csvPreview");

  if (!rows.length) {
    preview.innerHTML = `<p style="color:var(--expense);font-size:0.85rem">인식된 데이터가 없습니다. CSV 형식을 확인해주세요.</p>`;
    preview.classList.remove("hidden");
    return;
  }

  const tableRows = rows.map(r => {
    const color   = r.type === "income" ? "var(--income)" : "var(--expense)";
    const sign    = r.type === "income" ? "+" : "-";
    const catName = getCategoryInfo(r.category, r.type).name;
    return `<tr>
      <td>${r.date}</td>
      <td>${escapeHtml(r.name)}</td>
      <td style="color:${color}">${sign}${fmtMoney(r.amount)}</td>
      <td>${catName}</td>
    </tr>`;
  }).join("");

  const totalIncome  = rows.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const totalExpense = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
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
    summaryRows = `<div class="csv-summary-row"><span>총 지출</span><strong style="color:var(--expense)">-${fmtMoney(totalExpense)}원</strong></div>`;
  } else if (totalIncome) {
    summaryRows = `<div class="csv-summary-row"><span>총 수입</span><strong style="color:var(--income)">+${fmtMoney(totalIncome)}원</strong></div>`;
  }

  preview.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text-2);margin-bottom:8px">
      ${rows.length}건 인식됨
    </p>
    <div style="max-height:260px;overflow-y:auto">
      <table>
        <thead><tr><th>날짜</th><th>내용</th><th>금액</th><th>카테고리</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="csv-summary">${summaryRows}</div>`;
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
    const ops   = buildImportOps(parsedRows);

    // writeBatch는 한 번에 최대 500개 쓰기. 여유를 두고 450개씩 끊어 커밋.
    const CHUNK = 450;
    try {
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const { id, data } of ops.slice(i, i + CHUNK)) {
          batch.set(doc(db, "transactions", id), data);
        }
        await batch.commit();
      }
    } catch (err) {
      // 청크 일부만 커밋됐을 수 있다 — 문서 ID가 결정적이라 같은 파일을
      // 다시 가져오면 중복 없이 이어서 채워진다
      console.error("CSV 가져오기 실패:", err);
      invalidateBalanceCache();
      showToast("가져오기에 실패했습니다. 같은 파일로 다시 시도하면 이어서 가져옵니다");
      await fetchTransactions();
      renderAll();
      return;
    }
    invalidateBalanceCache();

    closeModal();
    showToast(`${count}건을 가져왔습니다`);
    await fetchTransactions();
    renderAll();
  });
}
