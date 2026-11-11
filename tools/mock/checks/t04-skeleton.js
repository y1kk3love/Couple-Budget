// t04 — 스켈레톤 반짝임을 합성 단계(transform)로: background-position 애니메이션 금지
function allRules() {
  const out = [];
  const walk = list => {
    for (const r of list) {
      out.push(r);
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
  const rules = allRules();

  const shimmer = rules.filter(r => r instanceof CSSKeyframesRule && r.name === "m-shimmer");
  t.ok(shimmer.length >= 1, "@keyframes m-shimmer 없음");
  for (const k of shimmer) {
    t.ok(/transform/.test(k.cssText) && !/background-position/.test(k.cssText), `m-shimmer: ${k.cssText}`);
  }
  const bgpos = rules.filter(r => r instanceof CSSKeyframesRule && /background-position/.test(r.cssText)).map(r => r.name);
  t.ok(bgpos.length === 0, `background-position 키프레임: ${bgpos.join(", ")}`);

  const el = document.createElement("span");
  el.className = "skeleton";
  document.body.append(el);
  const self = getComputedStyle(el).animationName;
  const after = getComputedStyle(el, "::after").animationName;
  el.remove();
  t.ok(self === "none", `.skeleton 자체 애니메이션 ${self}`);
  t.ok(after === "m-shimmer", `.skeleton::after 애니메이션 ${after}`);

  const loginAfter = rules.some(r => r.selectorText && r.selectorText.includes(".login-screen.auth-pending .google-btn::after"));
  t.ok(loginAfter, "로그인 대기 버튼 ::after 규칙 없음");

  return t.done();
}
