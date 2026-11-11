// t05 — 화면 등장: 탭 0.32초 안, 막대 450ms, 끝난 뒤 정리(900ms 고정 아님), 월 이동 260ms·연타 생략, 첫 로그인 풍성하게
// 변형 "reduce"(?reduce=1): 등장 클래스가 아예 붙지 않는다
const ENTER = new Set(["m-rise", "m-rise-sm", "m-slide-next", "m-slide-prev", "m-bar-grow", "m-col-grow", "m-donut"]);
const enterAnims = el => el.getAnimations({ subtree: true }).filter(a => ENTER.has(a.animationName));
const timing = a => a.effect.getTiming();

export default async function ({ variant }) {
  const t = __expect();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (variant === "reduce" || reduced) {
    t.ok(reduced, "?reduce=1로 열어야 함");
    await __go("calendar"); await __settle();
    await __go("stats");
    t.ok(!document.getElementById("view-stats").classList.contains("entering"), "동작 줄이기인데 등장 클래스가 붙음");
    return t.done();
  }

  // 탭 전환 (창이 보이면 애니메이션이 실제로 흐르므로 곧바로 잰다)
  await __go("calendar"); await __settle();
  document.querySelector('.sidebar [data-view="stats"]').click();
  await __wait(60);
  const stats = document.getElementById("view-stats");
  const rises = enterAnims(stats).filter(a => a.animationName.startsWith("m-rise"));
  t.ok(rises.length > 0, "탭 등장 애니메이션 없음");
  t.ok(rises.every(a => a.animationName === "m-rise-sm"), `탭 등장 이름: ${[...new Set(rises.map(a => a.animationName))]}`);
  const end = Math.max(0, ...rises.map(a => timing(a).delay + timing(a).duration));
  t.ok(end <= 320, `탭 등장 끝 ${end}ms (기대 ≤ 320)`);
  const bars = enterAnims(stats).filter(a => a.animationName === "m-bar-grow");
  t.ok(bars.length > 0 && bars.every(a => timing(a).duration === 450), `막대 ${bars.map(a => timing(a).duration)}`);
  await __wait(940); // 클릭 뒤 약 1초
  if (__realHidden()) {
    // 숨은 창: 애니메이션이 끝나지 않으므로 1200ms 안전 타이머 전까지 남아 있어야 한다 (예전 900ms 고정 정리라면 이미 없음)
    t.ok(stats.classList.contains("entering"), "약 1초에 등장 클래스가 이미 없음 (고정 타이머로 정리)");
  } else {
    // 보이는 창: 애니메이션이 실제로 끝났으면 정리됐어야 한다
    t.ok(!stats.classList.contains("entering") && enterAnims(stats).length === 0, "애니메이션이 끝났는데 등장 클래스가 남음 (보이는 창)");
  }
  await __settle(); await __wait(50);
  t.ok(!stats.classList.contains("entering"), "애니메이션이 끝났는데 등장 클래스가 남음");

  // 월 이동 + 연타
  await __go("calendar"); await __settle(); await __wait(50);
  const cal = document.getElementById("view-calendar");
  const label = document.getElementById("currentMonthLabel");
  document.getElementById("nextMonth").click();
  await __wait(120);
  const slide = cal.getAnimations().find(a => a.animationName === "m-slide-next");
  t.ok(cal.classList.contains("entering") && cal.classList.contains("dir-next"), `월 이동 클래스: ${cal.className}`);
  t.ok(slide && timing(slide).duration === 260, `월 이동 ${slide ? timing(slide).duration : "없음"}ms (기대 260)`);
  const lab = label.getAnimations().find(a => a.animationName === "m-slide-next");
  t.ok(lab && timing(lab).duration === 260, `라벨 ${lab ? timing(lab).duration : "없음"}ms (기대 260)`);
  document.getElementById("nextMonth").click();
  await __wait(120);
  t.ok(!cal.classList.contains("entering"), `연타했는데 다시 재생: ${cal.className}`);
  t.ok(!cal.getAnimations().some(a => a.animationName.startsWith("m-slide")), "연타 뒤 월 슬라이드 애니메이션이 남음");
  t.ok(label.getAnimations().length === 0, "연타 뒤 라벨 애니메이션이 다시 재생됨");
  await __settle();
  document.getElementById("prevMonth").click(); await __wait(250);
  document.getElementById("prevMonth").click(); await __wait(250);
  await __settle();

  // 결혼: 행이 많아도 막대가 끝나기 전에 정리되지 않는다
  for (let i = 0; i < 14; i++) {
    __remote("wedding_items", `t05-${i}`, {
      name: `t05 ${i}`, category: "etc_w", planned: 100000, payer: "both",
      payments: [{ label: "x", amount: 50000, date: "2026-09-01" }], order: 100 + i,
    });
  }
  await __wait(200);
  await __go("wedding");
  await __wait(700);
  const wd = document.getElementById("view-wedding");
  if (__realHidden()) {
    t.ok(wd.classList.contains("entering"), "결혼 탭: 약 1초에 등장 클래스가 이미 없음");
  } else {
    t.ok(!wd.classList.contains("entering") && enterAnims(wd).length === 0, "결혼 탭: 애니메이션이 끝났는데 등장 클래스가 남음 (보이는 창)");
  }
  await __settle();
  for (let i = 0; i < 14; i++) __remote("wedding_items", `t05-${i}`, null);
  await __wait(200);

  // 첫 로그인: 현행처럼 풍성한 등장
  await __go("calendar"); await __settle();
  __loginAs(null);
  await __wait(200);
  __loginAs("minsu@example.com");
  await __wait(300);
  const cal2 = document.getElementById("view-calendar");
  t.ok(cal2.classList.contains("entering") && cal2.classList.contains("first"), `첫 로그인 클래스: ${cal2.className}`);
  const firstRises = enterAnims(cal2).filter(a => a.animationName.startsWith("m-rise"));
  t.ok(firstRises.length > 0 && firstRises.every(a => a.animationName === "m-rise" && timing(a).duration === 480),
    `첫 로그인 등장: ${firstRises.map(a => `${a.animationName}/${timing(a).duration}`).join(",")}`);
  await __settle();

  return t.done();
}
