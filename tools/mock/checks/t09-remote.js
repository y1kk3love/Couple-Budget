// t09 — 상대가 다른 기기에서 추가·수정한 행만 은은하게 반짝임 (.m-remote). 입력 중·내 저장에는 없음
export default async function () {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const ym = `${st.currentYear}-${String(st.currentMonth).padStart(2, "0")}`;
  const tx = (name, amount, day) => ({
    type: "expense", amount, category: "etc", kind: "variable", memo: "", name,
    date: `${ym}-${String(day).padStart(2, "0")}`, year: st.currentYear, month: st.currentMonth,
  });
  const lit = root => [...root.querySelectorAll(".m-remote")];

  // 목록: 상대가 추가 → 그 행만
  await __go("list"); await __settle();
  const view = document.getElementById("view-list");
  __remote("transactions", "t09a", tx("t09 상대 추가", 3333, 12));
  await __wait(300);
  const row = view.querySelector('[data-flip-key="t09a"]');
  t.ok(row?.classList.contains("m-remote"), `상대 추가 행: ${row ? row.className : "없음"}`);
  t.ok(lit(view).length === 1, `반짝이는 행 ${lit(view).length}개 (기대 1)`);
  await __settle(); await __wait(50);

  // 같은 문서 수정 → 다시
  __remote("transactions", "t09a", { amount: 4444 }, true);
  await __wait(300);
  t.ok(view.querySelector('[data-flip-key="t09a"]')?.classList.contains("m-remote"), "상대 수정 행이 반짝이지 않음");
  await __settle();

  // 필터 입력 중 → 다시 그리지 않으니 반짝임도 없음
  view.querySelector("#filterToggleBtn").click(); await __wait(150);
  const input = view.querySelector("#f-name");
  input.focus(); input.value = "t09";
  __remote("transactions", "t09b", tx("t09 입력 중", 555, 13));
  await __wait(300);
  t.ok(lit(view).length === 0, `입력 중인데 반짝임 ${lit(view).length}개`);
  input.value = ""; input.blur();
  view.querySelector("#filterToggleBtn").click(); await __wait(200); await __settle();

  // 내 저장 → 반짝임(m-remote) 없음
  const before = new Set([...view.querySelectorAll(".tx-item")].map(r => r.dataset.flipKey));
  document.getElementById("addTxBtn").click(); await __wait(100);
  document.getElementById("txAmount").value = "999";
  document.getElementById("txMemo").value = "t09 내 저장";
  document.getElementById("saveTxBtn").click();
  await __wait(400);
  const mine = [...view.querySelectorAll(".tx-item")].find(r => !before.has(r.dataset.flipKey));
  t.ok(mine && !mine.classList.contains("m-remote"), `내 저장 행: ${mine ? mine.className : "없음"}`);
  await __settle();

  // 결혼 예산: 상대가 항목 추가
  await __go("wedding");
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]')?.click();
  await __wait(200); await __settle();
  __remote("wedding_items", "t09w", { name: "t09 결혼", category: "etc_w", planned: 10000, payer: "both", payments: [], order: 999 });
  await __wait(300);
  const wrow = document.querySelector('#view-wedding [data-flip-key="t09w"]');
  t.ok(wrow?.classList.contains("m-remote"), `결혼 항목: ${wrow ? wrow.className : "없음"}`);
  await __settle();

  // 고정비: 상대가 고정비 추가
  await __go("fixed"); await __settle();
  __remote("fixed_items", "t09f", { name: "t09 고정", amount: 1000, type: "expense", category: "etc", day: 5, startYear: st.currentYear, startMonth: st.currentMonth });
  await __wait(400);
  const frow = document.querySelector('#view-fixed [data-flip-key="t09f"]');
  t.ok(frow?.classList.contains("m-remote"), `고정비 행: ${frow ? frow.className : "없음"}`);
  await __settle();

  // 정리
  for (const [c, i] of [["transactions", "t09a"], ["transactions", "t09b"], ["wedding_items", "t09w"], ["fixed_items", "t09f"], ["transactions", `fixed_t09f_${ym}`]]) {
    __remote(c, i, null);
  }
  if (mine) __remote("transactions", mine.dataset.flipKey, null);
  await __wait(300); await __settle();
  await __go("list"); await __settle();

  return t.done();
}
