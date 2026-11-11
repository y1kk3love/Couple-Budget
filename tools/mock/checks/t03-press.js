// t03 — 눌림 피드백: 아이폰 :active(touchstart 리스너), 기본 탭 하이라이트 끔, 행은 배경 음영
function allStyleRules() {
  const out = [];
  const walk = list => {
    for (const r of list) {
      if (r.style && r.selectorText) out.push(r);
      if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) {
    try { walk(sh.cssRules); } catch { /* 다른 출처 */ }
  }
  return out;
}

export default async function () {
  const t = __expect();

  t.ok(__listenersLog.some(l => l.type === "touchstart" && l.target === "document" && l.options?.passive === true),
    "document에 passive touchstart 리스너 없음");

  const tap = getComputedStyle(document.documentElement).webkitTapHighlightColor;
  t.ok(tap === "rgba(0, 0, 0, 0)", `탭 하이라이트 ${tap}`);

  const rules = allStyleRules();
  const rowRules = rules.filter(r => r.selectorText.includes(".tx-item:active"));
  // 호버(--surface-hover, 흰 배경 위 1.03:1)와 구분되도록 한 단계 짙은 --surface2
  const tint = rowRules.find(r => (r.style.background || r.style.backgroundColor).includes("var(--surface2)"));
  t.ok(tint, `.tx-item:active 배경 음영 규칙 없음 (${rowRules.map(r => r.cssText).join(" / ")})`);
  if (tint) {
    t.ok(tint.style.transform === "" || tint.style.transform === "none", `행 눌림 규칙에 변형: ${tint.style.transform}`);
    for (const sel of [".fixed-item:active", ".cd-row:active", ".cat-bar-item.clickable:active", ".cal-cell:not(.empty):active"]) {
      t.ok(tint.selectorText.includes(sel), `행 음영 규칙에 ${sel} 없음`);
    }
  }
  const rowScaled = rowRules.filter(r => /scale/.test(r.style.transform));
  t.ok(rowScaled.length === 0, `목록 행이 아직 축소됨: ${rowScaled.map(r => r.selectorText).join(" | ")}`);

  for (const sel of [".budget-card:active", ".mc-col:active"]) {
    const r = rules.find(x => x.selectorText.split(",").map(s => s.trim()).includes(sel) && x.style.transform);
    t.ok(r && r.style.transform === "scale(0.98)", `${sel} 축소 규칙 ${r?.style.transform}`);
  }

  const emptyTinted = rules.filter(r =>
    /\.cal-cell\.empty:active/.test(r.selectorText) && (r.style.background || /scale/.test(r.style.transform)));
  t.ok(emptyTinted.length === 0, `빈 달력 칸에 눌림 효과: ${emptyTinted.map(r => r.cssText).join(" / ")}`);

  return t.done();
}
