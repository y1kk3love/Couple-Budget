// t23 — 입력 보존
//  ① 입력한 창을 배경 누르기·Esc로 닫으려 하면 먼저 묻는다. 입력이 없으면 그냥 닫힌다.
//     X 버튼과 저장 뒤의 닫힘은 묻지 않는다.
//  ② 결혼 예산 항목에 결제를 추가한 뒤에도 묻는다
//  ③ 메모·예산안 수정 중 다른 탭에 다녀와도 입력이 남는다
//  변형 "mobile"(375px): 입력한 시트를 끌어내려도 닫히지 않고 묻는다
const confirmBox = () => document.querySelector(".confirm-overlay:not(.is-closing)");
const isOpen = id => { const o = document.getElementById(id); return !o.classList.contains("hidden") && !o.classList.contains("is-closing"); };
const type = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
const pe = (target, kind, y) => target.dispatchEvent(new PointerEvent(kind, { clientX: 180, clientY: y, bubbles: true, cancelable: true, button: 0, pointerId: 3, isPrimary: true, pointerType: "touch" }));

export default async function ({ variant }) {
  const t = __expect();
  document.querySelectorAll(".modal-overlay:not(.hidden):not(.is-closing) .modal-close").forEach(b => b.click());
  await __wait(320);
  await __go("calendar"); await __settle();
  const tx = document.getElementById("txModal");

  if (variant === "mobile") {
    t.ok(innerWidth <= 768, `모바일 폭이 아님 (${innerWidth}px)`);
    document.getElementById("mobAddBtn").click(); await __wait(600); await __settle();
    type(document.getElementById("txAmount"), "5000");
    const header = tx.querySelector(".modal-header");
    const y0 = header.getBoundingClientRect().top + 20;
    pe(header, "pointerdown", y0); pe(document, "pointermove", y0 + 120); pe(document, "pointermove", y0 + 260); pe(document, "pointerup", y0 + 260);
    await __wait(450);
    t.ok(isOpen("txModal"), "입력한 시트가 끌어내리기로 닫힘");
    t.ok(confirmBox(), "끌어내렸는데 버릴지 묻지 않음");
    confirmBox()?.querySelector(".confirm-cancel").click(); await __wait(450); await __settle();
    t.ok(isOpen("txModal") && document.getElementById("txAmount").value === "5000", "계속 입력을 골랐는데 입력이 사라짐");
    const top = tx.querySelector(".modal").getBoundingClientRect();
    t.ok(Math.abs(top.bottom - innerHeight) < 4, `시트가 제자리로 돌아오지 않음 (아래 ${Math.round(top.bottom)} / ${innerHeight})`);
    // 입력이 없으면 끌어내려 바로 닫힌다
    document.getElementById("modalClose").click(); await __wait(350);
    document.getElementById("mobAddBtn").click(); await __wait(600); await __settle();
    const y1 = header.getBoundingClientRect().top + 20;
    pe(header, "pointerdown", y1); pe(document, "pointermove", y1 + 120); pe(document, "pointermove", y1 + 260); pe(document, "pointerup", y1 + 260);
    await __wait(600);
    t.ok(!isOpen("txModal") && !confirmBox(), "입력이 없는데 끌어내리기로 닫히지 않음");
    return t.done();
  }

  // ① 내역 추가 창
  document.getElementById("addTxBtn").click(); await __wait(200);
  tx.click(); await __wait(320); // 입력 없음 → 배경 누르면 바로 닫힘
  t.ok(!isOpen("txModal") && !confirmBox(), "입력이 없는데 배경 누르기로 닫히지 않음");

  document.getElementById("addTxBtn").click(); await __wait(200);
  type(document.getElementById("txAmount"), "7700");
  tx.click(); await __wait(150);
  t.ok(isOpen("txModal") && confirmBox(), "입력했는데 배경 누르기로 묻지 않고 닫힘");
  t.ok(/계속 입력/.test(confirmBox()?.textContent ?? ""), `확인 창 문구: ${confirmBox()?.textContent.replace(/\s+/g, " ")}`);
  confirmBox()?.querySelector(".confirm-cancel").click(); await __wait(300);
  t.ok(isOpen("txModal") && document.getElementById("txAmount").value === "7700", "계속 입력을 골랐는데 닫히거나 값이 사라짐");

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await __wait(150);
  t.ok(isOpen("txModal") && confirmBox(), "입력했는데 Esc로 묻지 않고 닫힘");
  confirmBox()?.querySelector(".confirm-ok").click(); await __wait(400);
  t.ok(!isOpen("txModal"), "버리기를 골랐는데 닫히지 않음");

  // 금액 빠른 버튼도 입력이다
  document.getElementById("addTxBtn").click(); await __wait(200);
  tx.querySelector(".preset-btn[data-add]").click();
  tx.click(); await __wait(150);
  t.ok(confirmBox(), "빠른 금액 버튼으로 넣은 뒤 배경 누르기로 묻지 않음");
  confirmBox()?.querySelector(".confirm-cancel").click(); await __wait(300);
  // X 버튼은 묻지 않는다
  document.getElementById("modalClose").click(); await __wait(350);
  t.ok(!isOpen("txModal") && !confirmBox(), "X 버튼인데 물었거나 닫히지 않음");

  // 다시 열면 깨끗한 상태 (이전 입력 흔적으로 묻지 않는다)
  document.getElementById("addTxBtn").click(); await __wait(200);
  tx.click(); await __wait(320);
  t.ok(!isOpen("txModal") && !confirmBox(), "새로 연 창인데 이전 입력 흔적으로 물음");

  // 저장 뒤의 닫힘은 묻지 않는다
  document.getElementById("addTxBtn").click(); await __wait(200);
  type(document.getElementById("txAmount"), "1234"); type(document.getElementById("txMemo"), "t23 저장");
  document.getElementById("saveTxBtn").click(); await __wait(500);
  t.ok(!isOpen("txModal") && !confirmBox(), "저장했는데 물었거나 닫히지 않음");
  const saved = [...__store.transactions.entries()].find(([, d]) => d.name === "t23 저장");
  t.ok(saved, "저장되지 않음");
  if (saved) __remote("transactions", saved[0], null);
  await __wait(300);

  // ② 결혼 예산 항목 — 결제를 추가한 뒤 배경 누르기
  await __go("wedding");
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]')?.click(); await __wait(300); await __settle();
  document.querySelector("#view-wedding [data-wd-item]").click(); await __wait(250);
  const item = document.getElementById("weddingItemModal");
  item.querySelector("[data-pay-label]").click(); await __wait(100);
  item.querySelector(".wd-pay-in-amount").value = "50000";
  item.querySelector(".wd-pay-in-amount").closest(".wd-pay-input").querySelector("button:not(.wd-pay-del)")?.click();
  await __wait(100);
  item.click(); await __wait(150);
  t.ok(isOpen("weddingItemModal") && confirmBox(), "결제를 추가했는데 배경 누르기로 묻지 않음");
  confirmBox()?.querySelector(".confirm-ok").click(); await __wait(400);
  t.ok(!isOpen("weddingItemModal"), "버리기 뒤 닫히지 않음");

  // ③ 메모 — 쓰다가 다른 세그먼트·탭에 다녀와도 남는다
  document.querySelector('#view-wedding .scope-btn[data-seg="memo"]').click(); await __wait(300);
  const memoBefore = __store.settings.get("wedding").memo;
  type(document.getElementById("wdMemoText"), memoBefore + "\nt23 쓰던 글");
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]').click(); await __wait(250);
  document.querySelector('#view-wedding .scope-btn[data-seg="memo"]').click(); await __wait(250);
  t.ok(document.getElementById("wdMemoText")?.value.endsWith("t23 쓰던 글"), "세그먼트를 다녀오니 메모 입력이 사라짐");
  await __go("calendar"); await __go("wedding"); await __wait(300);
  t.ok(document.getElementById("wdMemoText")?.value.endsWith("t23 쓰던 글"), "탭을 다녀오니 메모 입력이 사라짐");
  t.ok(__store.settings.get("wedding").memo === memoBefore, "저장을 누르지 않았는데 메모가 저장됨");
  // 원래 내용으로 되돌리면 초안이 아니다
  type(document.getElementById("wdMemoText"), memoBefore);
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]').click(); await __wait(250);

  // 예산안 수정 — 입력 중 다른 탭에 다녀와도 남는다
  await __go("plan"); await __settle();
  document.getElementById("planEditBtn").click(); await __wait(200);
  type(document.getElementById("peIncome"), "3456000");
  type(document.querySelector("#view-plan .plan-edit-row .pe-name"), "t23 항목");
  await __go("calendar"); await __go("plan"); await __wait(200);
  t.ok(document.getElementById("peIncome")?.value === "3456000", `탭을 다녀오니 월급 입력이 사라짐: ${document.getElementById("peIncome")?.value}`);
  t.ok(document.querySelector("#view-plan .plan-edit-row .pe-name")?.value === "t23 항목", "탭을 다녀오니 항목 이름 입력이 사라짐");
  document.getElementById("peCancelBtn")?.click(); await __wait(200);
  await __go("calendar"); await __settle();
  return t.done();
}
