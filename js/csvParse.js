// ================================================================
// js/csvParse.js — CSV 가져오기의 순수 함수 (파싱 · 문서 ID · 기존 내역과의 대조)
// Firebase나 화면에 닿지 않아 Node에서 그대로 테스트한다 (tests/csv.test.js).
// 화면·저장은 js/modals/csvModal.js.
// ================================================================

import { CATEGORIES } from "./constants.js";

const categoryNameToId = Object.fromEntries(CATEGORIES.expense.map(c => [c.name, c.id]));
const incomeNameToId   = Object.fromEntries(CATEGORIES.income.map(c => [c.name, c.id]));

// 문자열을 안정적인 짧은 해시로 (FNV-1a 32bit). 가맹점명을 문서 ID에
// 안전하게 끼워넣기 위한 용도라 암호학적 강도는 필요 없음.
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// 한 줄을 필드 배열로 분해 — 따옴표로 감싼 필드 안의 쉼표("ABC, DEF")와
// 이중 따옴표 이스케이프("")를 처리한다. (필드 내 줄바꿈은 미지원)
export function parseCsvLine(line) {
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
// "-15,000", 유니코드 마이너스 "−15,000", 회계식 "(15,000)", 뒤에 붙는 부호 "15,000-",
// "12,000원", "₩12,000", "12000.00"을 처리한다.
// 예전에는 숫자 외 문자를 모두 지워 부호와 소수점이 사라졌다
// (환불 -15,000이 지출 15,000으로, 12000.00이 1,200,000으로 들어왔다).
export function parseAmount(raw) {
  // 숫자·부호·소수점·괄호 외의 문자("원", "₩", 통화 표기, 인코딩이 깨진 기호 등)는 버린다 — 예전처럼 관대하게
  let s = String(raw ?? "").replace(/−/g, "-").replace(/[^\d.+\-()]/g, "");
  let negative = false;
  // 부호가 앞에 붙은 괄호 "-(15,000)"는 일부러 읽지 않는다(null) — 예전 파서가 건너뛰던 표기라, 새로 읽으면
  // 그 행이 순번을 하나 차지해 뒤따르는 같은 날·가맹점·금액 행의 문서 ID가 밀리고, 다시 가져올 때 중복이 된다.
  const paren = s.match(/^\((.*)\)$/); // (15,000)
  if (paren) { negative = true; s = paren[1]; }
  const trailing = s.match(/^(\d+(?:\.\d+)?)-$/); // 15,000- (일부 은행 표기)
  if (trailing) { negative = true; s = trailing[1]; }
  const m = s.match(/^([+-]?)(\d+(?:\.\d+)?)/);
  if (!m) return null;
  if (m[1] === "-") negative = !negative;
  return { amount: Math.round(parseFloat(m[2])), negative };
}

// 날짜 문자열 → "YYYY-MM-DD" — 읽을 수 없거나 없는 날짜면 null.
// 2026-09-01 / 2026.09.01 / 2026. 9. 1 / 2026/09/01 / 2026년 9월 1일 / 20260901, 뒤에 시간이 붙어도 된다.
// 예전에는 모르는 형식을 오늘 날짜로 넣어 버려, 전부 이번 달에 쌓이고 다른 날 다시
// 가져오면 문서 ID(날짜 포함)가 달라져 중복이 생겼다. 이제는 그 행을 빼고 미리보기에서 알린다.
export function parseDate(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/) ||
            s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 반환: { rows, badDates: 날짜를 읽지 못해 뺀 행 수, badAmounts: 금액 칸에 글자가 있는데 읽지 못해 뺀 행 수,
//         reversed: 음수라 수입↔지출을 뒤집은 행 수 }
export function parseCSV(text) {
  const result = { rows: [], badDates: 0, badAmounts: 0, reversed: 0 };
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
    if (!parsed?.amount) {
      // 금액이 비었거나 0인 행(소계·빈 줄 등)은 조용히 건너뛰되, 뭔가 적혀 있는데 읽지 못한 행은 센다
      if (!parsed && String(row[amtKey] ?? "").trim()) result.badAmounts++;
      continue;
    }

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

// 같은 CSV를 다시 가져와도 중복이 쌓이지 않도록, 행 내용으로 결정적
// 문서 ID를 만든다. 한 파일 안에 완전히 동일한 행(같은 날·금액·가맹점)이
// 여러 건이면 occ(등장 순번)로 구분해 모두 보존한다.
// idName: ID용 원래 가맹점명 — 환불 행은 표시 이름에 "환불"이 붙지만 ID는 예전 방식 그대로 만든다.
// owner: 가져오는 사람의 이메일 (작성자로 기록)
export function buildImportOps(rows, owner = null) {
  const seen = new Map();
  return rows.map(({ idName, ...row }) => {
    const [y, m]  = row.date.split("-").map(Number);
    const baseKey = `${row.date}_${row.amount}_${hashStr(idName)}`;
    const occ     = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occ + 1);
    return {
      id:   `csv_${baseKey}_${occ}`,
      data: { ...row, year: y, month: m, owner },
    };
  });
}

// 가져올 행을 지금 있는 거래와 대조한다 (쓰지 않는다).
//  existing: 지금 있는 거래 목록 [{ id, date, amount, type }]
// 반환: 각 op에 표시를 붙인 배열
//  exists  — 같은 문서 ID가 이미 있다 (예전에 가져온 행). 기본은 건너뛴다.
//            예전에는 통째로 덮어써서, 가져온 뒤 고친 카테고리·이름이 CSV 값으로 되돌아갔다.
//  suspect — 새 행인데, 손으로 입력한 내역 중 날짜·금액·수입/지출이 같은 것이 있다 (중복일 수 있음)
export function planImport(ops, existing) {
  const ids = new Set(existing.map(t => t.id));
  const manualKeys = new Set(existing
    .filter(t => !String(t.id).startsWith("csv_"))
    .map(t => `${t.date}|${t.amount}|${t.type}`));
  return ops.map(op => {
    const exists = ids.has(op.id);
    return {
      ...op,
      exists,
      suspect: !exists && manualKeys.has(`${op.data.date}|${op.data.amount}|${op.data.type}`),
    };
  });
}
