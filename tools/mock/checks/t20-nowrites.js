// t20 — 데이터 보호: 앱을 열고 둘러보는 것만으로는 기존 문서를 고치거나 지우지 않는다.
// 모든 탭·지난달·결혼 세그먼트를 돌고, 추가·수정 창을 열었다가 저장 없이 닫은 뒤 쓰기 기록(__writes)을 본다.
// 허용되는 쓰기는 "이번 달 고정비 자동 기록 생성"(없던 문서를 새로 만드는 것)뿐이다.
export default async function () {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const before = JSON.stringify(Object.fromEntries(Object.entries(__store).map(([c, m]) => [c, [...m.entries()]])));
  const startWrites = __writes.length;
  const closeAll = async () => {
    document.querySelectorAll(".modal-overlay:not(.hidden):not(.is-closing) .modal-close").forEach(b => b.click());
    await __wait(320);
    document.querySelector(".confirm-overlay:not(.is-closing) .confirm-ok")?.click(); // "입력을 버릴까요?"가 뜨면 버린다
    await __wait(250);
  };
  await closeAll();

  for (const v of ["calendar", "list", "stats", "fixed", "plan", "wedding"]) { await __go(v); await __settle(); }
  // 결혼 세그먼트
  for (const seg of ["budget", "events", "checklist", "vendors", "memo"]) {
    document.querySelector(`#view-wedding .scope-btn[data-seg="${seg}"]`)?.click(); await __wait(200);
  }
  // 지난달 갔다가 돌아오기 (이미 지나간 달은 고정비가 반영돼 있어 새로 생길 것이 없다)
  await __go("calendar");
  document.getElementById("prevMonth").click(); await __wait(500);
  await __go("list"); await __go("stats");
  document.getElementById("nextMonth").click(); await __wait(500);

  // 창을 열었다 저장 없이 닫기: 내역 추가, 내역 수정, 고정비 수정, 예산, 결혼 항목
  document.getElementById("addTxBtn").click(); await __wait(200); await closeAll();
  await __go("list"); await __settle();
  document.querySelector("#view-list .tx-item")?.click(); await __wait(250); await closeAll();
  await __go("fixed"); await __settle();
  document.querySelector("#view-fixed .fixed-item[data-id]")?.click(); await __wait(200); await closeAll();
  await __go("calendar"); await __settle();
  document.getElementById("budgetCard")?.click(); await __wait(200); await closeAll();
  document.querySelector("#view-calendar .cal-cell:not(.empty)")?.click(); await __wait(250); await closeAll();
  await __go("wedding");
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]')?.click(); await __wait(250);
  document.querySelector("#view-wedding [data-wd-item]")?.click(); await __wait(200); await closeAll();
  await __go("calendar"); await __settle();

  const ym = `${st.currentYear}-${String(st.currentMonth).padStart(2, "0")}`;
  const mine = __writes.slice(startWrites);
  const unexpected = mine.filter(w => !(w.op === "create" && w.col === "transactions" && w.id.startsWith("fixed_") && w.id.endsWith(`_${ym}`)));
  t.ok(unexpected.length === 0, `예상 밖의 쓰기: ${unexpected.map(w => `${w.op}:${w.col}/${w.id}`).join(", ")}`);
  // 처음부터의 쓰기 전체도 "새 문서 생성"뿐이어야 한다 (기존 문서 수정·삭제·덮어쓰기 0건)
  const touching = __writes.filter(w => w.op !== "create");
  t.ok(touching.length === 0, `기존 문서를 건드린 쓰기: ${touching.map(w => `${w.op}:${w.col}/${w.id}`).join(", ")}`);
  // 저장소 내용 비교 — 시작 시점과 같아야 한다
  const after = JSON.stringify(Object.fromEntries(Object.entries(__store).map(([c, m]) => [c, [...m.entries()]])));
  t.ok(after === before, "둘러본 뒤 저장소 내용이 달라짐");
  return t.done({ writesSinceLoad: __writes.length, during: mine.length });
}
