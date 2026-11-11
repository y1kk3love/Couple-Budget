// t07 — 자리마다 굴러가는 금액 rollNumber (토스·NumberFlow 방식)
// 변형 "reduce"(?reduce=1): 굴리지 않고 바로 최종값
const fmt = v => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toLocaleString("ko-KR") + "원";
const strips = el => [...el.querySelectorAll(".roll-s")].map(s => s.style.transform);
const want = cells => cells.map(n => `translateY(${-n * 5}%)`);

export default async function ({ variant }) {
  const t = __expect();
  const m = await import(__appUrl("js/motion.js"));
  const made = [];
  const box = () => { const d = document.createElement("div"); d.className = "val"; document.body.append(d); made.push(d); return d; };

  if (variant === "reduce") {
    __visible();
    const a = box(); m.rollNumber(a, "t07r", 1000, fmt);
    const b = box(); m.rollNumber(b, "t07r", 2500, fmt);
    t.ok(!b.querySelector(".roll") && b.textContent === "+2,500원", `동작 줄이기인데 굴림: ${b.innerHTML}`);
    __visible(false); made.forEach(e => e.remove());
    return t.done();
  }

  __visible();
  t.ok(typeof m.rollNumber === "function", "rollNumber 없음");
  t.ok(!("animateCount" in m), "animateCount가 아직 남아 있음");
  if (typeof m.rollNumber !== "function") { __visible(false); return t.done(); }

  const a = box(); m.rollNumber(a, "t07k", 1234000, fmt);
  t.ok(a.querySelector(".sr-only")?.textContent === "+1,234,000원", `낭독용 ${a.querySelector(".sr-only")?.textContent}`);
  t.ok(a.querySelector('.roll[aria-hidden="true"]'), "aria-hidden 굴림 요소 없음");
  t.ok(a.querySelectorAll(".roll-d").length === 7, `숫자 칸 ${a.querySelectorAll(".roll-d").length}`);

  const b = box(); m.rollNumber(b, "t07k", 1251500, fmt);
  t.ok(JSON.stringify(strips(b)) === JSON.stringify(want([1, 2, 5, 11, 5, 0, 0])), `위로: ${strips(b)}`);
  const c = box(); m.rollNumber(c, "t07k", 987000, fmt);
  t.ok(JSON.stringify(strips(c)) === JSON.stringify(want([9, 8, 7, 10, 10, 10])), `아래로: ${strips(c)}`);

  // rollEdge — 자리 수가 늘 때 새 자리만 페이드, 부호가 바뀔 때, 처음 값이 0일 때
  box(); m.rollNumber(made.at(-1), "t07k2", 999000, fmt);
  const e = box(); m.rollNumber(e, "t07k2", 1000000, fmt);
  const cells = [...e.querySelectorAll(".roll-d")];
  t.ok(cells.length === 7, `1,000,000 칸 ${cells.length}`);
  t.ok(cells[0]?.style.transition.includes("opacity") && cells.slice(1).every(d => !d.style.transition.includes("opacity")),
    `새 자리 페이드: ${cells.map(d => d.style.transition || "-").join(" | ")}`);
  box(); m.rollNumber(made.at(-1), "t07k4", 50000, fmt);
  const s = box(); m.rollNumber(s, "t07k4", -20000, fmt);
  t.ok(s.querySelector(".sr-only")?.textContent === "-20,000원", `부호 전환 ${s.querySelector(".sr-only")?.textContent}`);
  const z = box(); m.rollNumber(z, "t07k3", 0, fmt);
  t.ok(!z.querySelector(".roll") && z.textContent === "0원", `0 → 0 즉시가 아님: ${z.innerHTML}`);

  await __wait(620);
  t.ok(b.textContent === "+1,251,500원" && !b.querySelector(".roll"), `끝난 뒤 일반 텍스트로 안 돌아옴: ${b.innerHTML.slice(0, 80)}`);

  __visible("hidden"); // 숨은 창 — 바로 최종값
  const h = box(); m.rollNumber(h, "t07k5", 1000, fmt);
  t.ok(!h.querySelector(".roll") && h.textContent === "+1,000원", `숨은 창인데 굴림: ${h.innerHTML.slice(0, 80)}`);

  // 앱: 월을 넘기면 요약 카드가 굴러간다
  __visible();
  await __go("calendar"); await __settle();
  document.getElementById("nextMonth").click();
  await __wait(250);
  const hero = document.querySelector(".sum-card.hero .val");
  t.ok(hero && (hero.querySelector(".roll") || /^[+-]?[\d,]+원$/.test(hero.textContent)), `요약 카드: ${hero?.innerHTML.slice(0, 80)}`);
  await __wait(700);
  t.ok(hero && /^[+-]?[\d,]+원$/.test(hero.textContent), `요약 카드가 최종 텍스트가 아님: ${hero?.textContent}`);
  __visible(false);
  await __settle();
  document.getElementById("prevMonth").click(); await __wait(300);
  await __settle();

  made.forEach(el => el.remove());
  return t.done();
}
