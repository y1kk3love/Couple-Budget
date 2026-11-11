// t12 — 드래그 정렬 공용화: 들어 올린 행(.drag-lift, 1.02배)이 손가락을 따라오고 형제는 180ms로 비켜난다.
// 놓거나 취소하면 제자리에 앉고 그 순서로 반영, 집을 때·놓을 때 짧은 진동. 변형 "reduce": 확대·형제 애니메이션 없음
const pe = (target, type, y) => target.dispatchEvent(new PointerEvent(type, {
  clientX: 20, clientY: y, bubbles: true, cancelable: true, button: 0, pointerId: 7, isPrimary: true, pointerType: "mouse",
}));
const isFlip = a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition);

export default async function ({ variant }) {
  const t = __expect();
  const reduced = variant === "reduce";
  __vibrations.length = 0;

  // 예산안 편집 행
  await __go("plan"); await __settle();
  document.getElementById("planEditBtn")?.click(); await __wait(150);
  const rows = () => [...document.querySelectorAll("#view-plan .plan-edit-row")];
  const names = () => rows().map(r => r.querySelector(".pe-name").value);
  t.ok(rows().length >= 3, `예산안 편집 행 ${rows().length}개`);
  if (rows().length < 3) return t.done();

  const n0 = names();
  const r0 = rows()[0];
  pe(r0.querySelector(".pe-drag"), "pointerdown", r0.getBoundingClientRect().top + 10);
  t.ok(r0.classList.contains("drag-lift"), "들어 올린 행 표시(.drag-lift) 없음");
  if (reduced) t.ok(!/scale/.test(r0.style.transform), `동작 줄이기인데 확대: ${r0.style.transform}`);
  else t.ok(/scale\(1\.02\)/.test(r0.style.transform), `들기 변형: "${r0.style.transform}"`);

  const r2 = rows()[2].getBoundingClientRect();
  pe(document, "pointermove", r2.bottom - 2);
  const sib = rows().filter(r => r !== r0).flatMap(r => r.getAnimations().filter(isFlip));
  if (reduced) t.ok(sib.length === 0, `동작 줄이기인데 형제 애니메이션 ${sib.length}개`);
  else t.ok(sib.some(a => a.effect.getTiming().duration === 180), `형제 비켜남 애니메이션 ${sib.length}개`);
  t.ok(/translateY\(/.test(r0.style.transform), `잡은 행이 손가락을 따라오지 않음: "${r0.style.transform}"`);
  pe(document, "pointerup", r2.bottom - 2);
  await __wait(400);
  const n1 = names();
  t.ok(n1.indexOf(n0[0]) > 0, `첫 행이 뒤로 가지 않음: ${n1.join(", ")}`);
  t.ok(!document.querySelector(".drag-lift"), "놓은 뒤 .drag-lift가 남음");
  t.ok(JSON.stringify(__vibrations) === "[8,8]", `진동 ${JSON.stringify(__vibrations)}`);

  // cancel — 이동 중 pointercancel: 들린 상태가 남지 않고 취소 순간의 순서로
  const c0 = rows()[0];
  pe(c0.querySelector(".pe-drag"), "pointerdown", c0.getBoundingClientRect().top + 10);
  const c2 = rows()[2].getBoundingClientRect();
  pe(document, "pointermove", c2.bottom - 2);
  const domOrder = names();
  pe(document, "pointercancel", c2.bottom - 2);
  await __wait(400);
  t.ok(!document.querySelector(".drag-lift"), "취소 뒤 .drag-lift가 남음");
  t.ok(JSON.stringify(names()) === JSON.stringify(domOrder), `취소 뒤 순서 ${names().join(",")} (기대 ${domOrder.join(",")})`);
  document.getElementById("peCancelBtn")?.click(); await __wait(150);

  // 결혼 예산 행 — 놓으면 순서 저장
  await __go("wedding");
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]')?.click();
  await __wait(250); await __settle();
  const wrows = () => [...document.querySelectorAll("#view-wedding [data-wd-item]")];
  t.ok(wrows().length >= 3, `결혼 예산 행 ${wrows().length}개`);
  if (wrows().length >= 3) {
    const w0 = wrows()[0];
    const moved = w0.dataset.wdItem;
    const w2 = wrows()[2].getBoundingClientRect();
    pe(w0.querySelector(".wd-item-drag"), "pointerdown", w0.getBoundingClientRect().top + 10);
    pe(document, "pointermove", w2.bottom - 2);
    pe(document, "pointerup", w2.bottom - 2);
    await __wait(600);
    const ids = wrows().map(r => r.dataset.wdItem);
    t.ok(ids.indexOf(moved) > 0, `결혼 행이 뒤로 가지 않음`);
    const stored = ids.map(id => __store.wedding_items.get(id)?.order);
    t.ok(stored.every((o, i) => o === i), `저장된 순서 ${stored.join(",")}`);
  }
  await __settle();
  return t.done();
}
