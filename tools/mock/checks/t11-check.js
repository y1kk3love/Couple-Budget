// t11 — 체크리스트 체크: 상자가 톡 튀며 차고 체크·취소선이 그려진다, 체크할 때만 짧은 진동
function allStyleRules() {
  const out = [];
  const walk = list => {
    for (const r of list) {
      if (r.selectorText) out.push(r);
      if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* 다른 출처 */ } }
  return out;
}

export default async function () {
  const t = __expect();
  __visible();
  await __go("wedding");
  document.querySelector('#view-wedding .scope-btn[data-seg="checklist"]')?.click();
  await __wait(250); await __settle();
  const view = document.getElementById("view-wedding");

  const chk = view.querySelector(".wd-task-chk:not(:checked)");
  t.ok(chk, "체크 안 된 할 일 없음");
  if (!chk) { __visible(false); return t.done(); }
  t.ok(getComputedStyle(chk).appearance === "none", `체크박스 appearance ${getComputedStyle(chk).appearance}`);
  t.ok(chk.closest("label")?.querySelector('svg.chk-mark path[pathLength="1"]'), "체크 표시 svg 없음");
  t.ok(allStyleRules().some(r => r.selectorText.includes(".wd-task-chk:focus-visible")), ".wd-task-chk:focus-visible 규칙 없음");

  const id = chk.dataset.chkId;
  const rowOf = () => view.querySelector(`.wd-task-row[data-task-id="${CSS.escape(id)}"]`);
  __vibrations.length = 0;
  chk.click();
  await __wait(300);
  const row = rowOf();
  t.ok(row?.classList.contains("m-pop"), `방금 체크한 행: ${row ? row.className : "없음"}`);
  t.ok(row?.dataset.flipKey === id, "행에 data-flip-key 없음");
  const names = row ? row.getAnimations({ subtree: true }).map(a => a.animationName) : [];
  for (const n of ["m-check-pop", "m-check-draw", "m-strike"]) t.ok(names.includes(n), `${n} 없음 (${names.join(", ")})`);
  t.ok(JSON.stringify(__vibrations) === "[10]", `체크 진동 ${JSON.stringify(__vibrations)}`);

  await __settle();
  const strike = rowOf()?.querySelector(".strike");
  const cs = strike && getComputedStyle(strike);
  t.ok(cs && cs.textDecorationLine === "none" && cs.backgroundSize.startsWith("100%"),
    `완료 취소선: ${cs ? `${cs.textDecorationLine} / ${cs.backgroundSize}` : "없음"}`);

  // 해제 → 진동 없음
  view.querySelector(`.wd-task-chk[data-chk-id="${CSS.escape(id)}"]`)?.click();
  await __wait(300);
  t.ok(JSON.stringify(__vibrations) === "[10]", `해제에도 진동 ${JSON.stringify(__vibrations)}`);
  await __settle();

  __visible(false);
  return t.done();
}
