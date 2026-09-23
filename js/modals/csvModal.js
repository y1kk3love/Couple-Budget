// ================================================================
// js/modals/csvModal.js — CSV 가져오기 모달
// ================================================================

import { db } from "../../firebase.js";
import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "../state.js";
import { showToast, fmtMoney, escapeHtml } from "../utils.js";
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
// idName: ID용 원래 가맹점명 — 환불 행은 표시 이름에 "환불"이 붙지만 ID는 예전 방식 그대로
// 만들어, 부호가 사라진 채 지출로 잘못 들어간 예전 기록을 같은 파일 재가져오기로 바로잡는다.
function buildImportOps(rows) {
  const seen = new Map();
  return rows.map(({ idName, ...row }) => {
    const [y, m]  = row.date.split("-").map(Number);
    const baseKey = `${row.date}_${row.amount}_${hashStr(idName)}`;
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

// 금액 문자열 → { amount: 양의 정수(원), negative } — 읽을 수 없으면 null.
// "-15,000", 유니코드 마이너스 "−15,000", 회계식 "(15,000)", "12,000원", "₩12,000", "12000.00"을 처리한다.
// 예전에는 숫자 외 문자를 모두 지워 부호와 소수점이 사라졌다
// (환불 -15,000이 지출 15,000으로, 12000.00이 1,200,000으로 들어왔다).
function parseAmount(raw) {
  // 숫자·부호·소수점·괄호 외의 문자("원", "₩", 통화 표기, 인코딩이 깨진 기호 등)는 버린다 — 예전처럼 관대하게
  let s = String(raw ?? "").replace(/−/g, "-").replace(/[^\d.+\-()]/g, "");
  let negative = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) { negative = true; s = paren[1]; }
  const m = s.match(/^([+-]?)(\d+(?:\.\d+)?)/);
  if (!m) return null;
  if (m[1] === "-") negative = !negative;
  return { amount: Math.round(parseFloat(m[2])), negative };
}

// 날짜 문자열 → "YYYY-MM-DD" — 읽을 수 없거나 없는 날짜면 null.
// 2026-09-01 / 2026.09.01 / 2026. 9. 1 / 2026/09/01 / 2026년 9월 1일 / 20260901, 뒤에 시간이 붙어도 된다.
// 예전에는 모르는 형식을 오늘 날짜로 넣어 버려, 전부 이번 달에 쌓이고 다른 날 다시
// 가져오면 문서 ID(날짜 포함)가 달라져 중복이 생겼다. 이제는 그 행을 빼고 미리보기에서 알린다.
function parseDate(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/) ||
            s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 반환: { rows, badDates: 날짜를 읽지 못해 뺀 행 수, reversed: 음수라 수입↔지출을 뒤집은 행 수 }
function parseCSV(text) {
  const result = { rows: [], badDates: 0, reversed: 0 };
  const lines  = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return result;

  const headers = parseCsvLine(lines[0]);

  // 신한카드 주요 컬럼명 자동 감지
  const dateKey = headers.find(h => /날짜|일자|거래일/.test(h));
  const amtKey  = headers.find(h => /금액|이용금액/.test(h));
  const nameKey = headers.find(h => /가맹점|내용|적요/.test(h));
  const typeKey = headers.find(h => /구분|입출금/.test(h));
  const catKey  = headers.find(h => /카테고리/.test(h));

  for (const line of lines.slice(1)) {
    const vals = parseCsvLine(line);
    if (vals.length < 2) continue;

    const row    = Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    const parsed = parseAmount(row[amtKey]);
    if (!parsed?.amount) continue; // 금액 없는 행(소계·빈 줄 등)은 조용히 건너뜀

    const date = parseDate(row[dateKey]);
    if (!date) { result.badDates++; continue; }

    const baseType = /입금|수입/.test(row[typeKey] ?? "") ? "income" : "expense";
    // 음수 금액은 반대 방향 거래 — 카드 지출의 음수는 환불(수입), 입금의 음수는 취소(지출)
    const type = parsed.negative ? (baseType === "expense" ? "income" : "expense") : baseType;
    if (parsed.negative) result.reversed++;

    const rawCat  = row[catKey] ?? "";
    // 카테고리 이름이 있으면 타입에 맞는 목록에서 찾고, 없으면 기타로
    const category = type === "income"
      ? (incomeNameToId[rawCat] ?? "etc_in")
      : (categoryNameToId[rawCat] ?? "etc");

    const merchant = row[nameKey] || "";
    // 뒤집힌 행은 이름에 표시 — 같은 가맹점의 원래 거래와 구분되고, 목록에서도 바로 알아본다
    const suffix = !parsed.negative ? "" : baseType === "expense" ? " 환불" : " 취소";
    const label  = merchant ? `${merchant}${suffix}` : "";

    result.rows.push({
      name:     label || "내역",
      amount:   parsed.amount,
      date,
      type,
      category,
      kind:     "variable",
      memo:     label,
      idName:   merchant || "내역", // buildImportOps가 ID를 만들 때만 쓰고 저장하지 않음
    });
  }
  return result;
}

// ── 미리보기 렌더 ─────────────────────────────────────────────

function renderPreview({ rows, badDates, reversed }) {
  const preview = document.getElementById("csvPreview");

  // 조용히 바뀌거나 빠지는 행이 없도록 미리보기에서 알린다
  const notes = [
    reversed ? `금액이 음수인 ${reversed}건은 환불·취소로 보고 반대 방향(지출↔수입)으로 가져옵니다.` : "",
    badDates ? `날짜를 읽지 못한 ${badDates}건은 제외했습니다.` : "",
  ].filter(Boolean).map(n => `<p class="csv-warn">${n}</p>`).join("");

  if (!rows.length) {
    preview.innerHTML = `<p style="color:var(--expense);font-size:0.85rem">인식된 데이터가 없습니다. CSV 형식을 확인해주세요.</p>${notes}`;
    preview.classList.remove("hidden");
    document.getElementById("csvImportConfirm").classList.add("hidden");
    return;
  }

  const tableRows = rows.map(r => {
    const color   = r.type === "income" ? "var(--income)" : "var(--expense)";
    const sign    = r.type === "income" ? "+" : "-";
    const catName = getCategoryInfo(r.category, r.type).name;
    return `<tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td style="color:${color}">${sign}${fmtMoney(r.amount)}</td>
      <td>${escapeHtml(catName)}</td>
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
    ${notes}
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
    const parsed = parseCSV(e.target.result);
    parsedRows = parsed.rows;
    renderPreview(parsed);
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
    if (!parsedRows.length || btn.disabled) return;

    const count = parsedRows.length;
    const ops   = buildImportOps(parsedRows);

    // writeBatch는 한 번에 최대 500개 쓰기. 여유를 두고 450개씩 끊어 커밋.
    // 실패 시 전용 안내(이어서 가져오기)가 필요해 runWrite 대신 직접 잠근다 — 연타 방지는 동일
    const CHUNK = 450;
    btn.disabled = true;
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
      // 청크 일부만 커밋됐을 수 있다 — 문서 ID가 결정적이라 같은 파일을
      // 다시 가져오면 중복 없이 이어서 채워진다
      console.error("CSV 가져오기 실패:", err);
      invalidateBalanceCache();
      showToast("가져오기에 실패했습니다. 같은 파일로 다시 시도하면 이어서 가져옵니다");
      await fetchTransactions();
      renderAll();
      return;
    }
    btn.disabled = false;
    invalidateBalanceCache();

    closeModal();
    showToast(`${count}건을 가져왔습니다`);
    await fetchTransactions();
    renderAll();
  });
}
