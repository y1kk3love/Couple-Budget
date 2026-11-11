// t14 — 기존 동작 회귀: 추가·수정·삭제, 저장 실패 시 모달 유지, 고정비 추가·삭제, Esc 닫기,
// 로그아웃 시 모달 정리·재로그인, 결혼 항목 충돌(상대 수정) 재로드 (1280×900)
const open = id => { const o = document.getElementById(id); return o && !o.classList.contains("hidden") && !o.classList.contains("is-closing"); };
const txDocs = () => [...__store.transactions.entries()];
const confirmOk = async () => { await __wait(80); document.querySelector(".confirm-overlay:not(.is-closing) .confirm-ok")?.click(); };
const confirmCancel = async () => { await __wait(80); document.querySelector(".confirm-overlay:not(.is-closing) .confirm-cancel")?.click(); };

export default async function () {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const ym = `${st.currentYear}-${String(st.currentMonth).padStart(2, "0")}`;
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
  await __go("list"); await __settle();

  // 추가
  document.getElementById("addTxBtn").click(); await __wait(120);
  document.getElementById("txAmount").value = "1414";
  document.getElementById("txMemo").value = "t14 회귀";
  document.getElementById("txDate").value = `${ym}-14`;
  document.getElementById("saveTxBtn").click(); await __wait(400);
  let entry = txDocs().find(([, d]) => d.name === "t14 회귀");
  t.ok(entry && entry[1].amount === 1414, "추가가 저장되지 않음");
  const row = () => document.querySelector(`#view-list .tx-item[data-id="${CSS.escape(entry?.[0] ?? "")}"]`);
  t.ok(row(), "추가한 행이 목록에 없음");

  // 수정
  if (row()) {
    row().click(); await __wait(150);
    document.getElementById("txAmount").value = "2828";
    document.getElementById("saveTxBtn").click(); await __wait(400);
    t.ok(__store.transactions.get(entry[0])?.amount === 2828, "수정이 저장되지 않음");
  }

  // 저장 실패 → 모달 유지 + 토스트
  window.__failWrites = true;
  document.getElementById("addTxBtn").click(); await __wait(120);
  document.getElementById("txAmount").value = "999";
  document.getElementById("saveTxBtn").click(); await __wait(300);
  t.ok(open("txModal"), "저장 실패인데 모달이 닫힘");
  t.ok(/실패/.test(document.getElementById("toast").textContent), `실패 토스트: ${document.getElementById("toast").textContent}`);
  window.__failWrites = false;
  document.getElementById("modalClose").click(); await __wait(300);

  // 삭제
  if (row()) {
    row().click(); await __wait(150);
    document.getElementById("deleteTxBtn").click(); await confirmOk(); await __wait(400);
    t.ok(!__store.transactions.has(entry[0]), "삭제가 반영되지 않음");
    t.ok(!row(), "삭제한 행이 남음");
  }
  await __settle();

  // 고정비 추가·삭제
  await __go("fixed"); await __settle();
  document.getElementById("addFixedBtn").click(); await __wait(150);
  document.getElementById("fixedEditName").value = "t14 고정";
  document.getElementById("fixedEditAmount").value = "7000";
  document.getElementById("fixedSaveBtn").click(); await __wait(500);
  const fx = [...__store.fixed_items.entries()].find(([, d]) => d.name === "t14 고정");
  t.ok(fx, "고정비 추가가 저장되지 않음");
  const frow = () => document.querySelector(`#view-fixed .fixed-item[data-id="${CSS.escape(fx?.[0] ?? "")}"]`);
  if (frow()) {
    frow().click(); await __wait(150);
    document.getElementById("fixedDeleteBtn").click(); await confirmOk(); await __wait(500);
    t.ok(!__store.fixed_items.has(fx[0]), "고정비 삭제가 반영되지 않음");
  } else t.ok(false, "추가한 고정비 행이 없음");
  if (fx) __remote("transactions", `fixed_${fx[0]}_${ym}`, null);
  await __settle();

  // Esc → 닫힘 애니메이션을 거쳐 숨김
  await __go("calendar");
  document.getElementById("addTxBtn").click(); await __wait(120);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const closing = document.getElementById("txModal").classList.contains("is-closing");
  await __wait(320);
  t.ok(closing && document.getElementById("txModal").classList.contains("hidden"), "Esc로 닫히지 않음");

  // 로그아웃 → 열린 모달 정리, 재로그인 → 달력
  document.getElementById("addTxBtn").click(); await __wait(120);
  __loginAs(null); await __wait(300);
  t.ok(!open("txModal") && !document.getElementById("loginScreen").classList.contains("hidden"), "로그아웃 뒤 모달이 남거나 로그인 화면이 없음");
  __loginAs("minsu@example.com"); await __wait(500);
  t.ok(!document.getElementById("app").classList.contains("hidden"), "재로그인 뒤 앱이 안 보임");
  await __settle();

  // 결혼 항목: 모달을 연 사이 상대가 수정 → 저장 시 확인 → 취소하면 서버 값으로 다시 채움
  await __go("wedding");
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]')?.click();
  await __wait(250); await __settle();
  const wrow = document.querySelector("#view-wedding [data-wd-item]");
  if (wrow) {
    const wid = wrow.dataset.wdItem;
    wrow.click(); await __wait(150);
    __remote("wedding_items", wid, { planned: 7777777 }, true); await __wait(200);
    document.getElementById("wdItemSave").click(); await confirmCancel(); await __wait(300);
    t.ok(document.getElementById("wdItemPlanned").value === "7777777", `충돌 재로드: ${document.getElementById("wdItemPlanned").value}`);
    document.getElementById("wdItemClose").click(); await __wait(300);
  } else t.ok(false, "결혼 예산 행 없음");

  await __go("calendar"); await __settle();
  return t.done();
}
