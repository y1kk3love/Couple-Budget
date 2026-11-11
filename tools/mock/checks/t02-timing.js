// t02 — 타이밍 토큰·즉시 출발 퇴장·토스트 3초·세그먼트 엄지·transition: all 정리
// 1280×900(데스크톱)과 375×812(모바일, 변형 "mobile") 두 번 실행한다.
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

function allStyleRules() {
  const out = [];
  const walk = list => {
    for (const r of list) {
      if (r.style) out.push(r);
      if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) {
    try { walk(sh.cssRules); } catch { /* 다른 출처 글꼴 CSS */ }
  }
  return out;
}

export default async function () {
  const t = __expect();

  // transition: all 금지 (transition-property 목록에 all이 있으면 위반 — 속성 없이 쓴 transition도 all)
  const alls = allStyleRules()
    .filter(r => r.style.transitionProperty && r.style.transitionProperty.split(",").map(s => s.trim()).includes("all"))
    .map(r => r.selectorText);
  t.ok(alls.length === 0, `transition: all ${alls.length}곳: ${alls.join(" | ")}`);

  const root = getComputedStyle(document.documentElement);
  for (const [name, want] of [["--dur-press", "90ms"], ["--dur-nav", "260ms"], ["--dur-sheet", "480ms"]]) {
    const got = root.getPropertyValue(name).trim();
    t.ok(got === want, `${name} = "${got}" (기대 ${want})`);
  }

  const overlay = document.getElementById("txModal");
  const sheet = overlay.querySelector(":scope > .modal");

  if (innerWidth > 768) {
    await __go("list");
    const thumb = document.querySelector("#view-list .seg-thumb");
    t.ok(thumb, "목록 세그먼트 엄지 없음");
    if (thumb) {
      const d = getComputedStyle(thumb).transitionDuration;
      t.ok(d.startsWith("0.3s"), `엄지 전환 ${d} (기대 0.3s)`);
    }

    document.getElementById("addTxBtn").click();
    await __wait(60);
    let cs = getComputedStyle(sheet);
    t.ok(cs.animationName === "m-pop-in" && cs.animationDuration === "0.28s",
      `팝업 열기 ${cs.animationName} ${cs.animationDuration} (기대 m-pop-in 0.28s)`);
    document.getElementById("modalClose").click();
    cs = getComputedStyle(sheet);
    t.ok(cs.animationName === "m-pop-out" && cs.animationDuration === "0.16s" && cs.animationTimingFunction === EASE_OUT,
      `팝업 닫기 ${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}`);
    await __wait(300);

    const { showToast } = await import(__appUrl("js/utils.js"));
    const toast = document.getElementById("toast");
    showToast("t02");
    await __wait(2900);
    t.ok(!toast.classList.contains("hidden") && !toast.classList.contains("toast-out"),
      `2.9초에 토스트가 이미 사라지는 중: ${toast.className}`);
    await __wait(400);
    t.ok(toast.classList.contains("hidden"), `3.3초에 토스트가 남아 있음: ${toast.className}`);
  } else {
    // 결혼 탭에선 + 버튼이 결혼 항목 모달을 연다 — 달력에서 시작하고 열린 모달은 닫아 둔다
    document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
    await __go("calendar"); await __settle();
    document.getElementById("mobAddBtn").click();
    await __wait(60);
    let cs = getComputedStyle(sheet);
    t.ok(cs.animationName === "m-sheet-up" && cs.animationDuration === "0.48s",
      `시트 열기 ${cs.animationName} ${cs.animationDuration} (기대 m-sheet-up 0.48s)`);
    document.getElementById("modalClose").click();
    cs = getComputedStyle(sheet);
    t.ok(cs.animationName === "m-sheet-down" && cs.animationDuration === "0.24s" && cs.animationTimingFunction === EASE_OUT,
      `시트 닫기 ${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}`);
    await __wait(300);
  }

  return t.done({ viewport: `${innerWidth}x${innerHeight}` });
}
