// js/db.js 시나리오 테스트 — 가짜 Firestore(tools/mock/sdk-firestore.js) 위에서 실제 db.js를 그대로 돌린다
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import state from "../js/state.js";
import * as db from "../js/db.js";

const pad = n => String(n).padStart(2, "0");
const tx = o => ({ type: "expense", category: "food", kind: "variable", memo: o.name ?? "", ...o });
const store = col => globalThis.__store[col];
const writes = () => globalThis.__writes.map(w => `${w.op}:${w.col}/${w.id}`);

function reset(data = {}, year = 2026, month = 11) {
  globalThis.__latency = 0;
  globalThis.__failWrites = false;
  globalThis.__resetStore({ transactions: {}, fixed_items: {}, settings: {}, budget_plans: {}, ...data });
  db.unwatchTransactions(); // 실시간 사본 없이 조회 경로로 (캐시도 함께 비워진다)
  Object.assign(state, {
    currentYear: year, currentMonth: month, transactions: [], transactionsYM: null,
    fixedItems: [], skippedFixedIds: new Set(),
  });
}
beforeEach(() => reset());

// 실제 오늘 기준 연·월 (고정비 동기화가 "과거 기록"을 가르는 기준)
const now = new Date();
const NOW = { y: now.getFullYear(), m: now.getMonth() + 1 };
const ymOf = ({ y, m }) => `${y}-${pad(m)}`;
const prevMonth = ({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });

test("fetchTransactions: 건너뜀 표시는 목록에서 빼고 ID만 모은다", async () => {
  reset({ transactions: {
    a: tx({ name: "커피", amount: 4500, date: "2026-11-03", year: 2026, month: 11 }),
    "fixed_f1_2026-11": { fixedId: "f1", year: 2026, month: 11, date: "2026-11-25", fromFixed: true, skipped: true },
    old: tx({ name: "지난달", amount: 1000, date: "2026-10-03", year: 2026, month: 10 }),
  } });
  await db.fetchTransactions();
  assert.deepEqual(state.transactions.map(t => t.id), ["a"]);
  assert.deepEqual([...state.skippedFixedIds], ["f1"]);
  assert.equal(state.transactionsYM, "2026-11");
  assert.deepEqual(writes(), [], "조회만으로는 아무것도 쓰지 않는다");
});

test("applyFixedItemsToMonth: 없는 것만 만들고, 이미 있는 문서와 건너뜀 표시는 건드리지 않는다", async () => {
  reset({
    fixed_items: {
      f1: { name: "월세", amount: 800000, type: "expense", category: "rent", day: 31 },
      f2: { name: "관리비", amount: 150000, type: "expense", category: "mgmt", day: 10 },
      f3: { name: "넷플릭스", amount: 17000, type: "expense", category: "sub", day: 5 },
      f4: { name: "내년 시작", amount: 1, type: "expense", category: "sub", day: 1, startYear: 2027, startMonth: 1 },
    },
    transactions: {
      // f2: 이번 달 것을 손으로 고쳐 둔 상태 — 덮어쓰면 안 된다
      "fixed_f2_2026-11": tx({ name: "관리비", amount: 163200, date: "2026-11-10", year: 2026, month: 11, fromFixed: true, fixedId: "f2", kind: "fixed" }),
      // f3: 이번 달은 삭제(건너뜀)
      "fixed_f3_2026-11": { fixedId: "f3", year: 2026, month: 11, date: "2026-11-05", fromFixed: true, skipped: true },
    },
  });
  await db.fetchFixedItems();
  await db.fetchTransactions();
  await db.applyFixedItemsToMonth(2026, 11);
  assert.deepEqual(writes(), ["create:transactions/fixed_f1_2026-11"]);
  const made = store("transactions").get("fixed_f1_2026-11");
  assert.equal(made.date, "2026-11-30", "31일은 그 달 말일로");
  assert.equal(made.amount, 800000);
  assert.equal(store("transactions").get("fixed_f2_2026-11").amount, 163200);
  assert.equal(store("transactions").get("fixed_f3_2026-11").skipped, true);
});

test("deleteTransaction: 고정비 자동 기록은 지우지 않고 date가 있는 건너뜀 표시로 바꾼다", async () => {
  reset({ transactions: {
    "fixed_f1_2026-11": tx({ name: "월세", amount: 800000, date: "2026-11-25", year: 2026, month: 11, fromFixed: true, fixedId: "f1" }),
    plain: tx({ name: "커피", amount: 4500, date: "2026-11-03", year: 2026, month: 11 }),
  } });
  await db.fetchTransactions();
  await db.deleteTransaction("fixed_f1_2026-11");
  await db.deleteTransaction("plain");
  assert.deepEqual(store("transactions").get("fixed_f1_2026-11"),
    { fixedId: "f1", year: 2026, month: 11, date: "2026-11-25", fromFixed: true, skipped: true });
  assert.equal(store("transactions").has("plain"), false);
});

test("calcAccumulatedBalance: 계산 도중 달을 옮겨도 다른 달 값이 캐시에 남지 않는다", async () => {
  reset({ transactions: {
    sep: tx({ name: "9월 수입", type: "income", amount: 2500000, date: "2026-09-10", year: 2026, month: 9 }),
    oct: tx({ name: "10월 수입", type: "income", amount: 1000000, date: "2026-10-10", year: 2026, month: 10 }),
    nov: tx({ name: "11월 지출", amount: 30000, date: "2026-11-02", year: 2026, month: 11 }),
  } });
  globalThis.__latency = 15;
  const first = db.calcAccumulatedBalance(); // 11월 기준으로 시작
  state.currentMonth = 10;                   // 응답을 기다리는 사이 10월로 이동
  const firstValue = await first;
  assert.equal(firstValue, 3500000, "시작할 때의 달(11월) 기준으로 계산한다");
  assert.equal(await db.calcAccumulatedBalance(), 2500000, "10월 기준");
  state.currentMonth = 11;
  assert.equal(await db.calcAccumulatedBalance(), 3500000, "11월로 돌아와도 11월 이전 합계");
});

test("syncFixedItemTransactions: 바뀐 항목만 반영 — 날짜만 고치면 손으로 고친 금액은 그대로", async () => {
  const cur = ymOf(NOW), past = ymOf(prevMonth(NOW));
  const p = prevMonth(NOW);
  reset({ transactions: {
    [`fixed_f1_${cur}`]: tx({ name: "관리비", memo: "관리비", amount: 163200, category: "mgmt", date: `${cur}-10`, year: NOW.y, month: NOW.m, fromFixed: true, fixedId: "f1", kind: "fixed" }),
    [`fixed_f1_${past}`]: tx({ name: "관리비", memo: "관리비", amount: 150000, category: "mgmt", date: `${past}-10`, year: p.y, month: p.m, fromFixed: true, fixedId: "f1", kind: "fixed" }),
  } });
  const prev = { name: "관리비", amount: 150000, type: "expense", category: "mgmt", day: 10 };
  await db.syncFixedItemTransactions("f1", { ...prev, day: 12 }, prev);
  const curDoc = store("transactions").get(`fixed_f1_${cur}`);
  assert.equal(curDoc.amount, 163200, "이번 달에 손으로 고친 금액은 유지");
  assert.equal(curDoc.date, `${cur}-12`, "바뀐 날짜는 반영");
  assert.equal(store("transactions").get(`fixed_f1_${past}`).date, `${past}-10`, "지난달 기록은 그대로");

  // 금액을 바꾸면 이번 달부터 반영된다 (지난달은 여전히 그대로)
  await db.syncFixedItemTransactions("f1", { ...prev, day: 12, amount: 170000 }, { ...prev, day: 12 });
  assert.equal(store("transactions").get(`fixed_f1_${cur}`).amount, 170000);
  assert.equal(store("transactions").get(`fixed_f1_${past}`).amount, 150000);

  // 이름을 바꾸면 이름·내용이 함께 바뀐다. 아무것도 안 바뀌었으면 쓰지 않는다
  globalThis.__writes.length = 0;
  await db.syncFixedItemTransactions("f1", { ...prev, day: 12, amount: 170000 }, { ...prev, day: 12, amount: 170000 });
  assert.deepEqual(writes(), []);
  await db.syncFixedItemTransactions("f1", { ...prev, name: "아파트 관리비", day: 12, amount: 170000 }, { ...prev, day: 12, amount: 170000 });
  assert.equal(store("transactions").get(`fixed_f1_${cur}`).name, "아파트 관리비");
  assert.equal(store("transactions").get(`fixed_f1_${cur}`).memo, "아파트 관리비");
});
