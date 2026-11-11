// t15 — 최종 검토(재등급) : 묶음(날짜 카드·체크리스트 기간 카드)이 있는 목록의 자리 이동.
// 첫 장면(t=0)은 바뀌기 전 화면과 같아야 한다 — 아래 묶음의 머리글이 순간이동하고 행만 제자리에 남아
// 카드 밖으로 잘려(안 보여) 보이던 문제. 머리글과 행은 한 덩어리로 움직이고, 잘리지 않는다.
const label = g => g.querySelector(".list-date-header")?.firstElementChild?.textContent.trim();
const visible = r => r.bottom > 0 && r.top < innerHeight;
const snapshot = view => {
  const heads = new Map(), rows = new Map();
  view.querySelectorAll(".list-group:not(.flip-ghost)").forEach(g => heads.set(label(g), g.querySelector(".list-date-header").getBoundingClientRect()));
  view.querySelectorAll("[data-task-id], .tx-item").forEach(r => rows.set(r.dataset.flipKey, r.getBoundingClientRect()));
  return { heads, rows };
};
// 다시 그려지는 순간(같은 작업 안에서 playLayout까지 끝난 뒤) 모든 애니메이션을 0ms에 세우고 잰다
const atFirstFrame = (view, fn) => new Promise(resolve => {
  const mo = new MutationObserver(() => {
    mo.disconnect();
    document.getAnimations().forEach(a => { try { a.pause(); a.currentTime = 0; } catch { /* */ } });
    try { resolve(fn()); } catch (e) { resolve([`측정 오류 ${e.message}`]); }
  });
  mo.observe(view, { childList: true });
  setTimeout(() => { mo.disconnect(); resolve(["다시 그려지지 않음"]); }, 3000);
});
// 바뀐 묶음(skip)을 뺀 나머지: 머리글·행이 이전 자리 그대로(±1px)이고 카드 밖으로 잘리지 않았다
const continuity = (view, before, skip = null) => {
  const bad = [];
  view.querySelectorAll(".list-group:not(.flip-ghost)").forEach(g => {
    const lb = label(g);
    const h = g.querySelector(".list-date-header").getBoundingClientRect();
    const oh = before.heads.get(lb);
    if (oh && visible(h) && Math.abs(h.top - oh.top) > 1) bad.push(`머리글 ${lb} ${Math.round(oh.top)}→${Math.round(h.top)}`);
    if (lb === skip) return;
    const gr = g.getBoundingClientRect();
    g.querySelectorAll("[data-task-id], .tx-item").forEach(r => {
      const rr = r.getBoundingClientRect();
      if (!visible(rr)) return;
      const o = before.rows.get(r.dataset.flipKey);
      if (o && Math.abs(rr.top - o.top) > 1) bad.push(`행(${lb}) ${Math.round(o.top)}→${Math.round(rr.top)}`);
      if (rr.top < gr.top - 1 || rr.bottom > gr.bottom + 1) bad.push(`잘림(${lb}) 행 ${Math.round(rr.top)}~${Math.round(rr.bottom)} 카드 ${Math.round(gr.top)}~${Math.round(gr.bottom)}`);
    });
  });
  return [...new Set(bad)];
};
const resume = async () => { document.getAnimations().forEach(a => { try { a.play(); } catch { /* */ } }); await __settle(); await __wait(150); };
const confirmOk = async () => { await __wait(80); document.querySelector(".confirm-overlay:not(.is-closing) .confirm-ok")?.click(); };

export default async function () {
  const t = __expect();
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
  const view = document.getElementById("view-list");
  await __go("list"); await __settle();
  document.scrollingElement.scrollTop = 0; document.querySelector(".main-content")?.scrollTo?.(0, 0);
  await __wait(50);
  const groups = () => [...view.querySelectorAll(".list-group:not(.flip-ghost)")];
  const onScreen = g => { const r = g.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight - 150; };

  // (a) 여러 행 묶음의 첫 행 삭제 — 아래 묶음은 머리글·행이 한 덩어리로, 지운 행의 유령은 불투명
  // (휴대폰 화면처럼 첫 화면에 없으면 그 묶음을 화면 가운데로 스크롤)
  const gA0 = groups().find((g, i, all) => i < all.length - 1 && g.querySelectorAll(".tx-item").length >= 2);
  if (gA0 && !onScreen(gA0)) { gA0.scrollIntoView({ block: "center" }); await __wait(80); }
  const gA = gA0 && onScreen(gA0) ? gA0 : null;
  t.ok(gA, "화면 안에 행 2개 이상인 날짜 묶음이 없음");
  if (gA) {
    const lbA = label(gA);
    const before = snapshot(view);
    gA.querySelector(".tx-item").click(); await __wait(150);
    const measured = atFirstFrame(view, () => {
      const bad = continuity(view, before, lbA);
      const ghost = view.querySelector(".flip-ghost.tx-item");
      const bg = ghost ? getComputedStyle(ghost).backgroundColor : "";
      const alpha = bg.startsWith("rgba") ? parseFloat(bg.split(",")[3]) : bg ? 1 : 0;
      if (!ghost) bad.push("지운 행의 유령 없음");
      else if (alpha < 0.99) bad.push(`지운 행의 유령이 투명(${bg}) — 아래로 올라오는 행과 글자가 겹친다`);
      return bad;
    });
    document.getElementById("deleteTxBtn").click(); await confirmOk();
    const bad = await measured;
    t.ok(bad.length === 0, `(a) 행 삭제 첫 장면: ${bad.slice(0, 6).join(" | ")}`);
    await resume();
  }

  // (b) 행 하나뿐인 묶음 삭제 — 사라지는 묶음은 머리글째 제자리에서 흐려진다
  const gB = groups().find(g => onScreen(g) && g.querySelectorAll(".tx-item").length === 1 && g !== groups().at(-1));
  t.ok(gB, "화면 안에 행 1개인 날짜 묶음이 없음");
  if (gB) {
    const lbB = label(gB);
    const before = snapshot(view);
    gB.querySelector(".tx-item").click(); await __wait(150);
    const measured = atFirstFrame(view, () => {
      const bad = continuity(view, before);
      const ghostHead = [...view.querySelectorAll(".flip-ghost .list-date-header")].find(h => h.firstElementChild?.textContent.trim() === lbB);
      if (!ghostHead) bad.push(`사라진 묶음(${lbB})의 머리글이 첫 장면에 없음`);
      else if (Math.abs(ghostHead.getBoundingClientRect().top - before.heads.get(lbB).top) > 1) bad.push("사라진 묶음 머리글이 제자리가 아님");
      return bad;
    });
    document.getElementById("deleteTxBtn").click(); await confirmOk();
    const bad = await measured;
    t.ok(bad.length === 0, `(b) 묶음 삭제 첫 장면: ${bad.slice(0, 6).join(" | ")}`);
    await resume();
  }

  // (c) 정렬 방향 뒤집기 — 모든 행이 이전 자리에서 출발하고 카드에 잘리지 않는다
  {
    const before = snapshot(view);
    const measured = atFirstFrame(view, () => continuity(view, before));
    view.querySelector("#sortDirBtn").click();
    const bad = await measured;
    t.ok(bad.length === 0, `(c) 정렬 뒤집기 첫 장면: ${bad.slice(0, 6).join(" | ")}`);
    await resume();
    view.querySelector("#sortDirBtn").click(); await __wait(50); await resume();
  }

  // (d) 체크리스트 기간 카드 — 중간 카드의 할 일 삭제 뒤 아래 카드 머리글이 제자리에서 출발
  await __go("wedding");
  const wview = document.getElementById("view-wedding");
  wview.querySelector('.scope-btn[data-seg="checklist"]')?.click();
  await __wait(250); await __settle();
  const wgroups = [...wview.querySelectorAll(".list-group:not(.flip-ghost)")];
  const gD = wgroups.find((g, i) => i < wgroups.length - 1 && onScreen(g) && g.querySelectorAll("[data-task-id]").length >= 2);
  t.ok(gD, "화면 안에 할 일 2개 이상인 기간 카드가 없음");
  if (gD) {
    const lbD = label(gD);
    const before = snapshot(wview);
    gD.querySelector("[data-task-id]").click(); await __wait(150);
    const measured = atFirstFrame(wview, () => continuity(wview, before, lbD));
    document.getElementById("wdTaskDelete").click(); await confirmOk();
    const bad = await measured;
    t.ok(bad.length === 0, `(d) 체크리스트 삭제 첫 장면: ${bad.slice(0, 6).join(" | ")}`);
    await resume();
  }

  // (e) 끝나면 유령·인라인 변형이 남지 않는다
  await __wait(400); await __settle();
  t.ok(document.querySelectorAll(".flip-ghost").length === 0, `유령 ${document.querySelectorAll(".flip-ghost").length}개 남음`);
  await __go("calendar"); await __settle();
  return t.done();
}
