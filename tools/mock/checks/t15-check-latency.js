// t15 — 최종 검토 #2: 체크리스트 체크 효과는 누른 순간 나오고, 느린 네트워크에서 저장 뒤 다시 그려져도
// 체크 표시가 꺼졌다 다시 그려지지 않는다. 진동도 누른 순간. 저장 실패면 되돌린다.
// (예전: 누르면 체크가 바로 보이고 → 저장·재조회 두 번의 왕복 뒤 다시 그리며 체크가 사라졌다 다시 그려졌다)
export default async function () {
  const t = __expect();
  const view = document.getElementById("view-wedding");
  const rowOf = id => view.querySelector(`.wd-task-row[data-task-id="${CSS.escape(id)}"]`);
  const pathOffset = row => parseFloat(getComputedStyle(row.querySelector(".chk-mark path")).strokeDashoffset);
  // 체크리스트 칸이 다시 그려지는 순간(행이 새 요소로 바뀜)을 잡는다
  const nextRender = id => new Promise(resolve => {
    const old = rowOf(id);
    const mo = new MutationObserver(() => {
      const now = rowOf(id);
      if (now && now !== old) { mo.disconnect(); resolve(now); }
    });
    mo.observe(view, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve(null); }, 3000);
  });
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
  __visible();
  try {
    await __go("wedding");
    view.querySelector('.scope-btn[data-seg="checklist"]')?.click();
    await __wait(250); await __settle();

    // 1) 느린 네트워크(왕복 400ms)에서 체크
    window.__latency = 400;
    const chk = view.querySelector(".wd-task-chk:not(:checked)");
    t.ok(chk, "체크 안 된 할 일 없음");
    if (!chk) return t.done();
    const id = chk.dataset.chkId;
    __vibrations.length = 0;
    const rendered = nextRender(id);
    chk.click();
    const row = rowOf(id);
    t.ok(row?.classList.contains("done") && row.classList.contains("m-pop"), `누른 순간 효과 없음: ${row?.className}`);
    t.ok(JSON.stringify(__vibrations) === "[10]", `누른 순간 진동 ${JSON.stringify(__vibrations)}`);
    const fresh = await rendered;
    t.ok(fresh, "저장 뒤 다시 그려지지 않음");
    if (fresh) {
      t.ok(fresh.classList.contains("done"), "다시 그린 행이 완료 상태가 아님");
      t.ok(pathOffset(fresh) === 0, `다시 그릴 때 체크 표시가 사라졌다 다시 그려짐 (dashoffset ${pathOffset(fresh)})`);
      const again = fresh.getAnimations({ subtree: true }).filter(a => a.playState === "running" && a.currentTime <= 60);
      t.ok(again.length === 0, `다시 그릴 때 효과가 처음부터 다시 재생됨: ${again.map(a => a.animationName).join(", ")}`);
    }

    // 2) 해제는 누른 순간 완료 표시가 풀리고 진동은 없다
    await __settle();
    __vibrations.length = 0;
    const on = rowOf(id).querySelector(".wd-task-chk");
    const rendered2 = nextRender(id);
    on.click();
    t.ok(!rowOf(id).classList.contains("done"), "해제했는데 완료 표시가 남음");
    t.ok(__vibrations.length === 0, `해제할 때 진동 ${JSON.stringify(__vibrations)}`);
    await rendered2; await __settle();

    // 3) 저장 실패면 누른 효과를 되돌린다
    window.__failWrites = true;
    const chk3 = rowOf(id).querySelector(".wd-task-chk");
    chk3.click();
    await __wait(700);
    const r3 = rowOf(id);
    t.ok(r3 && !r3.classList.contains("done") && !r3.classList.contains("m-pop") && !r3.querySelector(".wd-task-chk").checked,
      `실패 뒤 되돌리지 않음: ${r3?.className}, checked=${r3?.querySelector(".wd-task-chk").checked}`);
    window.__failWrites = false;

    // 4) 빠른 네트워크: 누른 직후 다시 그려져도 효과가 끊기지 않고 이어진다
    window.__latency = 30;
    const rendered4 = nextRender(id);
    rowOf(id).querySelector(".wd-task-chk").click();
    const r4 = await rendered4;
    const names = r4 ? r4.getAnimations({ subtree: true }).map(a => a.animationName) : [];
    t.ok(r4?.classList.contains("m-pop") && names.includes("m-check-pop"), `빠른 저장 뒤 효과가 끊김: ${r4?.className} [${names.join(", ")}]`);
    await __wait(300); await __settle();
    // 원상태로 (체크 해제)
    const r5 = rowOf(id);
    if (r5?.querySelector(".wd-task-chk").checked) { r5.querySelector(".wd-task-chk").click(); await __wait(300); }
  } finally {
    window.__latency = 30;
    window.__failWrites = false;
    __visible(false);
    await __settle();
  }
  return t.done();
}
