// t15 — 최종 검토 #3: 놓은 뒤 제자리에 앉는 동안(250ms) 다른 행을 잡아도 행이 복제되지 않는다.
// 예전: 앉기가 끝나며 목록이 다시 그려진 뒤, 떨어져 나간 두 번째 행이 새 목록에 끼어들어 저장까지 복제됐다.
// 함께: 다른 손가락(다른 pointerId)은 잡은 행을 옮기거나 끝내지 않고, 놓자마자 저장해도 오류가 없다.
const pe = (target, type, y, id = 7) => target.dispatchEvent(new PointerEvent(type, {
  clientX: 20, clientY: y, bubbles: true, cancelable: true, button: 0, pointerId: id, isPrimary: id === 7, pointerType: "touch",
}));

export default async function () {
  const t = __expect();
  const me = "minsu@example.com";
  const orig = structuredClone(__store.budget_plans.get(me));
  const errors = [];
  const onErr = e => errors.push(String(e.message ?? e.reason ?? e));
  addEventListener("error", onErr);
  addEventListener("unhandledrejection", onErr);
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
  try {
    await __go("plan"); await __settle();
    document.getElementById("planEditBtn")?.click(); await __wait(150);
    const rows = () => [...document.querySelectorAll("#view-plan .plan-edit-row")];
    const names = () => rows().map(r => r.querySelector(".pe-name").value);
    const n0 = names();
    t.ok(n0.length >= 3, `예산안 편집 행 ${n0.length}개`);
    if (n0.length < 3) return t.done();

    // 1) 첫 행을 셋째 뒤로 놓고, 앉는 중에 다른 행을 잡아 조금 움직인다
    const a = rows()[0];
    pe(a.querySelector(".pe-drag"), "pointerdown", a.getBoundingClientRect().top + 10);
    const r2 = rows()[2].getBoundingClientRect();
    pe(document, "pointermove", r2.bottom - 2);
    pe(document, "pointerup", r2.bottom - 2);
    await __wait(30);
    const b = rows().find(r => r !== a);
    const bTop = b.getBoundingClientRect().top;
    pe(b.querySelector(".pe-drag"), "pointerdown", bTop + 10);
    pe(document, "pointermove", bTop + 14);
    // 2) 첫 행이 앉아 목록이 다시 그려진 뒤에도 계속 움직이다 놓는다
    await __wait(400);
    const last = rows().at(-1).getBoundingClientRect();
    pe(document, "pointermove", last.bottom - 2);
    pe(document, "pointerup", last.bottom - 2);
    await __wait(400);
    const n1 = names();
    t.ok(n1.length === n0.length, `행 수 ${n1.length} (기대 ${n0.length}): ${n1.join(",")}`);
    t.ok(new Set(n1).size === n1.length, `행이 복제됨: ${n1.join(",")}`);
    t.ok([...n1].sort().join() === [...n0].sort().join(), `항목 구성이 바뀜: ${n1.join(",")}`);
    t.ok(!document.querySelector(".drag-lift"), "앉기 뒤 .drag-lift가 남음");

    // 3) 다른 손가락의 움직임·떼기는 잡은 행을 옮기거나 드래그를 끝내지 않는다
    const c = rows()[0];
    const cTop = c.getBoundingClientRect().top;
    pe(c.querySelector(".pe-drag"), "pointerdown", cTop + 10, 7);
    const far = rows().at(-1).getBoundingClientRect();
    pe(document, "pointermove", far.bottom - 2, 9);
    t.ok(rows()[0] === c, "다른 손가락의 움직임에 잡은 행이 옮겨짐");
    pe(document, "pointerup", far.bottom - 2, 9);
    await __wait(350); // 끝났다면 이 사이에 제자리에 앉아 .drag-lift가 빠진다
    t.ok(c.classList.contains("drag-lift"), "다른 손가락을 떼자 드래그가 끝남");
    pe(document, "pointerup", cTop + 10, 7);
    await __wait(400);
    t.ok(!document.querySelector(".drag-lift"), "놓은 뒤 .drag-lift가 남음");

    // 4) 놓자마자(앉기 전) 저장해도 오류가 없고, 놓은 순서로 저장된다
    const d = rows()[0];
    const d2 = rows()[2].getBoundingClientRect();
    pe(d.querySelector(".pe-drag"), "pointerdown", d.getBoundingClientRect().top + 10);
    pe(document, "pointermove", d2.bottom - 2);
    pe(document, "pointerup", d2.bottom - 2);
    const expected = names().filter(Boolean);
    document.getElementById("peSaveBtn")?.click();
    await __wait(500);
    t.ok(errors.length === 0, `저장 직후 오류: ${errors.join(" | ")}`);
    const saved = (__store.budget_plans.get(me)?.items ?? []).map(i => i.name);
    t.ok(JSON.stringify(saved) === JSON.stringify(expected), `저장된 순서 ${saved.join(",")} (기대 ${expected.join(",")})`);

    // 5) 끄는 중 상대의 변경이 실시간으로 와도 잡은 행이 떨어져 나가지 않고, 놓은 순서가 반영된다
    document.getElementById("planEditBtn")?.click(); await __wait(150);
    const e0 = rows()[0];
    const eName = e0.querySelector(".pe-name").value;
    const e2 = rows()[2].getBoundingClientRect();
    pe(e0.querySelector(".pe-drag"), "pointerdown", e0.getBoundingClientRect().top + 10);
    pe(document, "pointermove", e2.bottom - 2);
    const partner = "jieun@example.com";
    const pOrig = structuredClone(__store.budget_plans.get(partner));
    __remote("budget_plans", partner, { income: (pOrig?.income || 0) + 1000 }, true);
    await __wait(300);
    t.ok(e0.isConnected && e0.classList.contains("drag-lift"), "끄는 중 실시간 반영에 잡은 행이 떨어져 나감");
    pe(document, "pointermove", e2.bottom - 2);
    pe(document, "pointerup", e2.bottom - 2);
    await __wait(400);
    const n5 = names();
    t.ok(n5.indexOf(eName) > 0 && new Set(n5).size === n5.length, `실시간 반영 뒤 순서 ${n5.join(",")}`);
    if (pOrig) __remote("budget_plans", partner, pOrig, false);
  } finally {
    removeEventListener("error", onErr);
    removeEventListener("unhandledrejection", onErr);
    document.getElementById("peCancelBtn")?.click();
    if (orig) __remote("budget_plans", me, orig, false);
    await __wait(250); await __settle();
  }
  return t.done();
}
