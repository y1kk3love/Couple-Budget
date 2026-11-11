// t13 — 동작 줄이기: 이동·확대 키프레임은 opacity만의 짧은 페이드로 재정의, 색 반짝임은 유지, 스켈레톤 정지.
// 같은 이름의 @keyframes는 뒤에 정의된 것이 이기므로 규칙은 모든 모션 키프레임보다 뒤에 있어야 한다
export default async function () {
  const t = __expect();
  const sheet = [...document.styleSheets].find(s => (s.href ?? "").endsWith("/style.css"));
  t.ok(sheet, "style.css 없음");
  if (!sheet) return t.done();
  const top = [...sheet.cssRules];
  const medias = top.filter(r => r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion"));
  t.ok(medias.length === 1, `동작 줄이기 규칙 ${medias.length}개 (기대 1)`);
  const media = medias.at(-1);
  const idx = top.indexOf(media);
  const lastKf = Math.max(...top.map((r, i) => (r instanceof CSSKeyframesRule && r.name.startsWith("m-") ? i : -1)));
  t.ok(idx > lastKf, `동작 줄이기 규칙(${idx})이 마지막 모션 키프레임(${lastKf})보다 앞`);

  const inner = media ? [...media.cssRules] : [];
  const kf = name => inner.find(r => r instanceof CSSKeyframesRule && r.name === name);
  const names = [
    "m-rise", "m-rise-sm", "m-slide-next", "m-slide-prev", "m-pop-in", "m-alert-in", "m-sheet-up", "m-toast-in",
    "m-bar-grow", "m-col-grow", "m-donut", "m-check-pop", "m-check-draw", "m-strike",
    "m-pop-out", "m-sheet-down", "m-toast-out", "m-toast-bump",
  ];
  for (const n of names) {
    const k = kf(n);
    t.ok(k, `${n} 재정의 없음`);
    if (k) t.ok(!/transform|stroke|background-size/.test(k.cssText), `${n}에 움직임이 남음: ${k.cssText}`);
  }
  const text = media?.cssText ?? "";
  t.ok(/\.m-flash\s*\{[^}]*1400ms/.test(text), ".m-flash 1400ms 유지 규칙 없음");
  t.ok(/\.m-remote\s*\{[^}]*1600ms/.test(text), ".m-remote 1600ms 유지 규칙 없음");
  // 브라우저가 단축 속성을 풀어 직렬화하므로(animation: auto ease … none) 속성 값으로 확인
  const skel = inner.find(r => r.selectorText?.includes(".skeleton::after"));
  t.ok(skel && skel.style.animationName === "none" && skel.style.getPropertyPriority("animation-name") === "important",
    `스켈레톤 반짝임 정지 규칙: ${skel ? skel.cssText : "없음"}`);
  t.ok(/animation-duration: var\(--dur-fast\)/.test(text), "애니메이션 길이 --dur-fast 규칙 없음");
  return t.done();
}
