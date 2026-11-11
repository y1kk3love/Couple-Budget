// t27 — 애니메이션 속도 배수 (--motion-scale)
//  주인이 조절판(?tune=1)으로 고른 값: 지금까지의 2.5배 길이(2026-11-11).
//  · style.css의 --motion-scale 하나가 CSS(전환·애니메이션)와 JS(타이머·Element.animate)를 함께 늘린다
//  · --dur-* 토큰은 기준값 그대로 (다른 검사와 문서가 그 값을 본다)
//  ※ 다른 검사는 기준 속도(배수 1)에서 돈다 — __check가 시작할 때 1로 맞춘다. 이 검사만 실제 값을 본다.
const WANT = 2.5;
const near = (got, want, tol) => Math.abs(got - want) <= tol;

export default async function () {
  const t = __expect();
  const root = document.documentElement;
  const forced = root.style.getPropertyValue("--motion-scale");
  root.style.removeProperty("--motion-scale"); // 스타일시트에 적힌 실제 값으로
  try {
    const real = parseFloat(getComputedStyle(root).getPropertyValue("--motion-scale"));
    t.ok(real === WANT, `--motion-scale = ${real} (기대 ${WANT})`);

    const m = await import(__appUrl("js/motion.js"));
    t.ok(m.motionScale?.() === WANT, `motionScale() = ${m.motionScale?.()} (기대 ${WANT})`);

    // 토큰은 기준값
    const cs = getComputedStyle(root);
    t.ok(cs.getPropertyValue("--dur-base").trim() === "250ms", `--dur-base = ${cs.getPropertyValue("--dur-base").trim()} (기준값 250ms여야 함)`);

    // CSS: 버튼 눌림 복귀(--dur-base 250ms)와 색 전환(0.15s)이 배수만큼 길다
    const durs = getComputedStyle(document.getElementById("addTxBtn")).transitionDuration.split(",").map(s => parseFloat(s) * (s.trim().endsWith("ms") ? 1 : 1000));
    t.ok(durs.some(d => near(d, 250 * WANT, 1)), `버튼 전환 길이 ${durs.join("/")}ms 에 ${250 * WANT}ms 없음`);
    t.ok(durs.some(d => near(d, 150 * WANT, 1)), `버튼 색 전환 길이 ${durs.join("/")}ms 에 ${150 * WANT}ms 없음`);

    // JS: 창을 닫으면 퇴장(240ms × 배수)이 끝난 뒤에 숨는다
    await __go("calendar"); await __settle();
    document.getElementById("addTxBtn").click(); await __wait(1500);
    const overlay = document.getElementById("txModal");
    const t0 = performance.now();
    document.getElementById("modalClose").click();
    let hiddenAt = null;
    while (performance.now() - t0 < 2500) {
      if (overlay.classList.contains("hidden")) { hiddenAt = performance.now() - t0; break; }
      await __wait(20);
    }
    t.ok(hiddenAt != null && near(hiddenAt, 240 * WANT, 150), `창이 닫힌 시점 ${Math.round(hiddenAt ?? -1)}ms (기대 약 ${240 * WANT}ms)`);

    // 동작 줄이기 규칙은 배수를 타지 않는다 (짧은 페이드 그대로)
    const css = await (await fetch(__appUrl("style.css"), { cache: "no-store" })).text();
    const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    t.ok(!reduce.includes("--motion-scale"), "동작 줄이기 규칙에 배수가 들어감");
  } finally {
    if (forced) root.style.setProperty("--motion-scale", forced);
  }
  await __wait(300); await __settle();
  return t.done({ want: WANT });
}
