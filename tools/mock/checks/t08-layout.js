// t08 — 목록 자리 이동 (FLIP): 내 저장·삭제·정렬 때만 움직이고, 실시간 반영·탭 이동에는 움직이지 않는다
// 변형 "reduce"(?reduce=1): 정렬을 바꿔도 FLIP 없음
const isFlip = a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition);
const flipAnims = root => root.getAnimations({ subtree: true }).filter(isFlip);
const kf = a => JSON.stringify(a.effect.getKeyframes());
const inView = r => r.bottom > -100 && r.top < innerHeight + 100;

export default async function ({ variant }) {
  const t = __expect();
  const m = await import(__appUrl("js/motion.js"));
  const st = (await import(__appUrl("js/state.js"))).default;
  const view = document.getElementById("view-list");
  const rows = () => [...view.querySelectorAll(".tx-item")].filter(r => !r.closest(".flip-ghost"));
  const ghosts = () => [...view.querySelectorAll(".flip-ghost")];
  const sortBtn = key => view.querySelector(`[data-sort-key="${key}"]`);
  const ymd = d => `${st.currentYear}-${String(st.currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const tx = (name, amount, day) => ({
    type: "expense", amount, category: "etc", kind: "variable", memo: "", name,
    date: ymd(day), year: st.currentYear, month: st.currentMonth,
  });
  const deleteRow = async row => {
    row.click(); await __wait(150);
    document.getElementById("deleteTxBtn").click(); await __wait(80);
    document.querySelector(".confirm-overlay:not(.is-closing) .confirm-ok").click();
  };

  const ok = ["animateNextRender", "captureLayout", "playLayout"].every(f => typeof m[f] === "function");
  t.ok(ok, "FLIP 함수 없음");

  await __go("list"); await __settle();
  t.ok(rows().length > 2, `목록 행 ${rows().length}`);
  t.ok(rows().every(r => r.dataset.flipKey), "data-flip-key 없는 행이 있음");
  if (!ok) return t.done();

  if (variant === "reduce") {
    sortBtn("amount").click(); await __wait(80);
    t.ok(flipAnims(view).length === 0, "동작 줄이기인데 FLIP");
    sortBtn("date").click(); await __settle();
    return t.done();
  }

  // 정렬 → 이동. 날짜(묶음 카드)↔금액(카드 하나)은 행이 다른 카드로 옮겨 가 교차 페이드,
  // 카드 하나 안의 정렬끼리(금액→이름)는 행이 새 자리로 미끄러진다
  sortBtn("amount").click(); await __wait(80);
  const restructured = flipAnims(view);
  t.ok(restructured.length >= 1 && restructured.every(a => !/translate/.test(kf(a))),
    `묶음이 바뀌는 정렬은 교차 페이드여야: ${restructured.length}개 ${restructured.filter(a => /translate/.test(kf(a))).length}개 이동`);
  await __settle();
  sortBtn("name").click(); await __wait(80);
  const moved = flipAnims(view).filter(a => /translate/.test(kf(a)) && a.effect.getTiming().duration === 280);
  t.ok(moved.length >= 1, `정렬 이동 애니메이션 ${moved.length}개`);
  await __settle();
  sortBtn("date").click(); await __settle();

  // 실시간 반영 → 움직이지 않음
  __remote("transactions", "t08r", tx("t08 실시간", 1000, 15));
  await __wait(300);
  t.ok(flipAnims(view).length === 0, `실시간 반영에 FLIP ${flipAnims(view).length}개`);
  __remote("transactions", "t08r", null); await __wait(300); await __settle();

  // 탭 이동 → 등장만
  await __go("calendar"); await __go("list");
  t.ok(flipAnims(view).length === 0, "탭 이동에 FLIP");
  await __settle();

  // 켜 둔 스위치는 다음 작업에서 만료
  m.animateNextRender(); await __wait(0);
  await __go("calendar"); await __go("list");
  t.ok(flipAnims(view).length === 0, "만료된 스위치로 FLIP");
  await __settle();

  // 추가 (모달 저장) → 새 행이 나타남
  const before = new Set(rows().map(r => r.dataset.flipKey));
  document.getElementById("addTxBtn").click(); await __wait(100);
  document.getElementById("txAmount").value = "4321";
  document.getElementById("txMemo").value = "t08 추가";
  document.getElementById("txDate").value = ymd(28);
  document.getElementById("saveTxBtn").click();
  await __wait(150); // 창이 보이면 240ms 애니메이션이 실제로 흐른다 — 도는 중에 확인
  const added = rows().find(r => !before.has(r.dataset.flipKey));
  // 그날 첫 내역이면 날짜 카드째 나타난다 (안의 행은 따로 흐려지지 않는다)
  const fadeIn = el => el?.getAnimations().find(a => isFlip(a) && /"opacity":"0"/.test(kf(a)));
  const addAnim = fadeIn(added) ?? fadeIn(added?.closest(".list-group"));
  t.ok(addAnim && addAnim.effect.getTiming().duration === 240, `새 행 애니메이션 ${addAnim ? addAnim.effect.getTiming().duration : "없음"}`);
  await __settle(); await __wait(300);

  // 삭제 → 유령이 흐려지며 사라짐
  const mine = rows().find(r => r.textContent.includes("t08 추가"));
  t.ok(mine, "추가한 행을 못 찾음");
  if (mine) {
    await deleteRow(mine);
    await __wait(120); // 유령(200ms)이 흐려지는 동안 확인
    const g = ghosts()[0];
    t.ok(g && getComputedStyle(g).position === "absolute" && getComputedStyle(g).pointerEvents === "none",
      `삭제 유령: ${g ? g.style.cssText : "없음"}`);
    await __settle(); await __wait(50);
    t.ok(ghosts().length === 0, "유령이 남음");
  }

  // twiceRender — 정렬을 곧바로 두 번
  sortBtn("amount").click(); sortBtn("date").click();
  await __settle(); await __wait(50);
  t.ok(ghosts().length === 0, "두 번 그린 뒤 유령");
  t.ok(rows().every(r => r.style.transform === ""), "행에 인라인 변형이 남음");
  t.ok(flipAnims(view).length === 0, "두 번 그린 뒤 애니메이션이 남음");

  // scrolled — 스크롤된 목록에서 지운 행의 유령이 원래 자리에
  __remote("transactions", "t08s", tx("t08 스크롤", 777, 10));
  __remote("transactions", "t08s2", tx("t08 스크롤 짝", 778, 10)); // 같은 날 한 건 더 — 카드가 남아 행만 유령이 된다
  await __wait(300); await __settle();
  const vc = document.querySelector(".view-container");
  const srow = rows().find(r => r.textContent.includes("t08 스크롤") && !r.textContent.includes("짝"));
  if (srow) {
    vc.scrollTop = 300;
    srow.scrollIntoView({ block: "center" }); await __wait(50);
    const top0 = srow.getBoundingClientRect().top;
    await deleteRow(srow);
    await __wait(120); // 유령(200ms)이 흐려지는 동안 확인
    const g2 = ghosts()[0];
    const top1 = g2?.getBoundingClientRect().top;
    t.ok(g2 && Math.abs(top1 - top0) <= 2, `스크롤 유령 위치 ${top1} (원래 ${top0})`);
    await __settle();
  } else t.ok(false, "스크롤 확인용 행 없음");
  __remote("transactions", "t08s2", null); await __wait(300); await __settle();
  vc.scrollTop = 0;

  // bulk — 전체 기간 수백 행: 화면 안 행만, 최대 60개
  for (let i = 0; i < 300; i++) __remote("transactions", `t08b${i}`, tx(`t08 대량 ${i}`, 100 + i * 7, 1 + (i % 28)));
  await __wait(400); await __settle();
  view.querySelector('[data-scope="all"]').click(); await __wait(400); await __settle();
  sortBtn("amount").click(); await __wait(100); await __settle(); // 묶음→카드 하나 (교차 페이드)
  __animateCalls.length = 0;
  sortBtn("name").click(); await __wait(100); // 카드 하나 안에서 수백 행 재정렬
  // 창이 보이면 100ms 사이에도 행이 이미 움직였다 — 원래 자리는 애니메이션 첫 키프레임의 이동량으로 계산
  const calls = __animateCalls.filter(c => c.target.matches?.(".tx-item"));
  await __settle();
  const offscreen = calls.filter(c => {
    const mm = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(c.keyframes?.[0]?.transform ?? "");
    const end = c.target.getBoundingClientRect();
    const dy = mm ? Number(mm[2]) : 0;
    const start = { top: end.top + dy, bottom: end.bottom + dy };
    return !(inView(start) || inView(end));
  });
  t.ok(calls.length > 0 && calls.length <= 60, `대량 정렬 FLIP 행 ${calls.length}개 (기대 1~60)`);
  t.ok(offscreen.length === 0, `화면 밖 행까지 움직임 ${offscreen.length}개`);
  view.querySelector('[data-scope="month"]').click(); await __wait(200);
  sortBtn("date").click(); await __settle();
  for (let i = 0; i < 300; i++) __remote("transactions", `t08b${i}`, null);
  await __wait(400); await __settle();

  return t.done();
}
