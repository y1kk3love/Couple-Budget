// js/csvParse.js — CSV 파싱과 가져오기 계획
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, parseDate, parseCsvLine, parseCSV, buildImportOps, planImport } from "../js/csvParse.js";

test("parseAmount: 부호·괄호·소수·통화 표기", () => {
  const cases = [
    ["15,000", 15000, false], ["-15,000", 15000, true], ["−15,000", 15000, true], ["(15,000)", 15000, true],
    ["15,000-", 15000, true], ["12,000원", 12000, false], ["₩12,000", 12000, false],
    ["12000.00", 12000, false], ["12000.6", 12001, false], ["+3,000", 3000, false], ["0", 0, false],
  ];
  for (const [raw, amount, negative] of cases) assert.deepEqual(parseAmount(raw), { amount, negative }, raw);
  for (const raw of ["", "abc", "원", null, undefined]) assert.equal(parseAmount(raw), null, String(raw));
});

test("parseDate: 받아들이는 형식과 없는 날짜", () => {
  const ok = ["2026-09-01", "2026.09.01", "2026. 9. 1", "2026/9/1", "2026년 9월 1일", "20260901", "2026-09-01 13:20:11", "2026.09.01 13:20"];
  for (const raw of ok) assert.equal(parseDate(raw), "2026-09-01", raw);
  assert.equal(parseDate("2024-02-29"), "2024-02-29");
  for (const raw of ["2026-02-30", "2023-02-29", "2026-13-01", "2026-00-10", "09/01/2026", "어제", "", null]) assert.equal(parseDate(raw), null, String(raw));
});

test("parseCsvLine: 따옴표 안의 쉼표와 이중 따옴표", () => {
  assert.deepEqual(parseCsvLine('2026-09-01,"ABC, DEF","1,200",지출'), ["2026-09-01", "ABC, DEF", "1,200", "지출"]);
  assert.deepEqual(parseCsvLine('a,"그는 ""안녕""이라 했다",b'), ["a", '그는 "안녕"이라 했다', "b"]);
});

test("parseCSV: 환불은 뒤집고, 읽지 못한 행은 세어서 알린다", () => {
  const text = [
    "날짜,가맹점,금액,구분,카테고리",
    "2026-09-01,스타벅스,4500,지출,식비",
    "2026-09-02,쿠팡,-15000,지출,쇼핑",       // 환불 → 수입
    "어제,김밥천국,7000,지출,식비",            // 날짜를 못 읽음
    "2026-09-03,이마트,abc,지출,식비",         // 금액을 못 읽음
    "2026-09-04,소계,,,",                      // 금액이 빈 행 — 조용히 건너뜀
    "2026-09-05,월급,3000000,입금,월급",
  ].join("\n");
  const r = parseCSV(text);
  assert.equal(r.rows.length, 3);
  assert.deepEqual([r.badDates, r.badAmounts, r.reversed], [1, 1, 1]);
  assert.deepEqual(r.rows.map(x => [x.name, x.type, x.amount, x.category]), [
    ["스타벅스", "expense", 4500, "food"],
    ["쿠팡 환불", "income", 15000, "etc_in"],
    ["월급", "income", 3000000, "salary"],
  ]);
  assert.equal(r.rows[1].idName, "쿠팡", "ID는 원래 가맹점명으로");
});

test("buildImportOps: 같은 파일은 언제 가져와도 같은 ID, 같은 행은 순번으로 구분", () => {
  const rows = parseCSV("날짜,가맹점,금액\n2026-09-01,GS25,3000\n2026-09-01,GS25,3000\n2026-09-02,GS25,3000").rows;
  const a = buildImportOps(rows, "a@example.com"), b = buildImportOps(rows, "b@example.com");
  assert.deepEqual(a.map(o => o.id), b.map(o => o.id), "가져오는 사람이 달라도 ID는 같다");
  assert.equal(new Set(a.map(o => o.id)).size, 3);
  assert.match(a[0].id, /^csv_2026-09-01_3000_[0-9a-z]+_0$/);
  assert.match(a[1].id, /_1$/);
  assert.deepEqual(a[0].data, { name: "GS25", amount: 3000, date: "2026-09-01", type: "expense", category: "etc", kind: "variable", memo: "GS25", year: 2026, month: 9, owner: "a@example.com" });
  assert.equal("idName" in a[0].data, false, "idName은 저장하지 않는다");
});

test("planImport: 이미 있는 행과 손으로 입력한 중복 의심을 가려낸다", () => {
  const rows = parseCSV("날짜,가맹점,금액\n2026-09-01,GS25,3000\n2026-09-02,스타벅스,4500\n2026-09-03,쿠팡,20000").rows;
  const ops = buildImportOps(rows, "a@example.com");
  const existing = [
    { id: ops[0].id, date: "2026-09-01", amount: 3000, type: "expense" },      // 예전에 가져온 행
    { id: "auto123", date: "2026-09-02", amount: 4500, type: "expense" },      // 손으로 입력한 같은 날·금액
    { id: "auto456", date: "2026-09-03", amount: 20000, type: "income" },      // 방향이 달라 중복 아님
  ];
  const plan = planImport(ops, existing);
  assert.deepEqual(plan.map(p => [p.exists, p.suspect]), [[true, false], [false, true], [false, false]]);
});

// 문서 ID는 이미 저장된 데이터와 맞물려 있다 — 계산식이 조금이라도 바뀌면 같은 명세서를 다시 가져올 때
// 전부 "새 내역"으로 보여 중복으로 들어간다. 실제 문자열을 고정해 둔다 (2026-11 이전 코드가 만든 값과 같다).
test("buildImportOps: 문서 ID 문자열이 예전과 같다", () => {
  const rows = parseCSV("날짜,가맹점,금액\n2026-09-01,GS25,3000\n2026-09-02,스타벅스 강남점,-4500").rows;
  assert.deepEqual(buildImportOps(rows, "x").map(o => o.id),
    ["csv_2026-09-01_3000_1wtfsk6_0", "csv_2026-09-02_4500_mwuxfz_0"]);
});

// 예전 파서가 읽지 못해 건너뛰던 표기를 새로 읽기 시작하면, 그 행이 순번을 하나 차지해
// 뒤에 오는 같은 날·가맹점·금액 행의 ID가 _0 → _1로 밀린다. 다시 가져오면 그 행이 새 지출로 한 번 더 들어간다.
test("parseCSV: 예전에 건너뛰던 -(금액) 표기는 계속 건너뛰고, 다른 행의 순번을 밀지 않는다", () => {
  for (const raw of ["-(15,000)", "+(15,000)"]) assert.equal(parseAmount(raw), null, raw);
  const r = parseCSV('날짜,가맹점,금액\n2026-09-01,쿠팡,"-(15,000)"\n2026-09-01,쿠팡,"15,000"');
  assert.equal(r.badAmounts, 1, "읽지 못한 행으로 세어 미리보기에 알린다");
  const ops = buildImportOps(r.rows, "x");
  assert.equal(ops.length, 1);
  assert.match(ops[0].id, /_0$/, "일반 행의 순번은 예전 그대로 0");
});
