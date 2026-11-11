// t15 — 최종 검토 #1: 예산안 도넛 가운데 금액이 굴러가는 동안 비어 보이지 않아야 한다.
// (SVG <text> 안에 HTML span을 넣으면 그려지지 않아 약 0.58초 동안 가운데가 빈다)
// 상대 예산안이 실시간으로 바뀌는 경우로 굴림을 일으킨다 — 창이 보이는 것처럼 강제해 굴림 경로를 탄다.
export default async function () {
  const t = __expect();
  const partner = "jieun@example.com";
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
  await __go("plan"); await __settle();
  const orig = structuredClone(__store.budget_plans.get(partner));
  t.ok(orig, "상대 예산안 시드 없음");
  if (!orig) return t.done();

  const val = () => document.querySelector(`#view-plan [data-count-key="plan-remain:${partner}"]`);
  t.ok(val(), "상대 도넛 가운데 금액 요소 없음");
  __visible();
  try {
    __remote("budget_plans", partner, { income: (orig.income || 0) + 123000 }, true);
    await __wait(220); // 실시간 디바운스 120ms + 다시 그리기
    const el = val();
    const final = el ? el.dataset.count : null;
    const r = el?.getBoundingClientRect();
    t.ok(el && r.width > 4 && r.height > 4, `굴리는 중 가운데 금액이 그려지지 않음 (${r ? `${r.width.toFixed(1)}×${r.height.toFixed(1)}` : "요소 없음"}, ${el?.namespaceURI?.endsWith("svg") ? "SVG" : "HTML"})`);
    const sr = el?.querySelector(".sr-only");
    t.ok(!el?.querySelector(".roll") || (sr && sr.textContent.replace(/[^\d-]/g, "") === String(final)),
      `화면 낭독기용 최종값이 없음: ${sr?.textContent}`);
    await __wait(700);
    const el2 = val();
    t.ok(el2 && !el2.querySelector(".roll") && el2.textContent.replace(/[^\d-]/g, "") === String(el2.dataset.count),
      `굴림이 끝난 뒤 일반 글자로 돌아오지 않음: "${el2?.textContent}"`);
    const r2 = el2?.getBoundingClientRect();
    t.ok(r2 && r2.width > 4, "굴림이 끝난 뒤에도 가운데 금액이 안 보임");

    // 안전장치: SVG 글자에 굴림을 걸어도 비지 않고 바로 최종값을 보인다
    const { rollNumber } = await import(__appUrl("js/motion.js"));
    const holder = document.createElement("div");
    holder.innerHTML = `<svg width="200" height="40"><text x="0" y="30" font-size="20">0</text></svg>`;
    document.getElementById("view-plan").append(holder);
    const svgText = holder.querySelector("text");
    rollNumber(svgText, "t15-svg", 1000, String);
    rollNumber(svgText, "t15-svg", 98765, String);
    const b = svgText.getBBox();
    t.ok(b.width > 4 && svgText.textContent === "98765", `SVG 글자 굴림이 비어 보임 (폭 ${b.width.toFixed(1)}, "${svgText.textContent}")`);
    holder.remove();
  } finally {
    __visible(false);
    __remote("budget_plans", partner, orig, false);
    await __wait(250); await __settle();
  }
  return t.done();
}
