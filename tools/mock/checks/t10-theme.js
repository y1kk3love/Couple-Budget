// t10 — 테마 원형 전환 (View Transitions) + 전환이 없을 때도 얼룩 없이 한 번에
// 변형 "reduce"(?reduce=1): View Transition을 쓰지 않는다
// 창이 실제로 보이면 진짜 View Transition도 끝까지 확인한다
const theme = () => document.documentElement.dataset.theme ?? "";
const stubVT = calls => {
  document.startViewTransition = cb => {
    calls.push(1);
    cb();
    return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} };
  };
};
const unstubVT = () => { delete document.startViewTransition; };
const circleCall = () => __animateCalls.find(c => c.options?.pseudoElement === "::view-transition-new(root)");

export default async function ({ variant }) {
  const t = __expect();
  const btn = document.getElementById("themeToggleBtn");
  const html = document.documentElement;
  const start = theme();
  const realVisible = !__realHidden();
  await __settle();

  if (variant === "reduce") {
    const calls = [];
    stubVT(calls); __visible();
    btn.click(); await __wait(50);
    t.ok(calls.length === 0, "동작 줄이기인데 View Transition 사용");
    t.ok(theme() !== start, "테마가 바뀌지 않음");
    btn.click(); await __wait(50);
    unstubVT(); __visible(false);
    return t.done();
  }

  // 숨은 창(= View Transition을 쓸 수 없는 경우): 즉시, 색 전환 없이 한 번에
  __visible("hidden");
  btn.click(); await __wait(50);
  t.ok(theme() !== start, `테마가 안 바뀜 (${start} → ${theme()})`);
  t.ok(!html.classList.contains("theme-switching"), "theme-switching이 남음");
  const trans = document.getAnimations().filter(a => a instanceof CSSTransition);
  t.ok(trans.length === 0, `전환 직후 색 전환 ${trans.length}개: ${[...new Set(trans.map(a => a.transitionProperty))].join(", ")}`);
  await __settle();
  btn.click(); await __wait(50); await __settle(); // 원래대로

  // doubleToggle — 연속 두 번이면 처음 테마로, 저장값과 화면이 일치
  btn.click(); btn.click(); await __wait(50);
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch { /* 저장소 막힘 */ }
  t.ok(theme() === start || (start === "" && theme() === saved), `두 번 누른 뒤 테마 ${theme()} (처음 ${start})`);
  t.ok(saved === null || saved === theme(), `저장값 ${saved} ≠ 화면 ${theme()}`);
  t.ok(!html.classList.contains("theme-switching"), "두 번 누른 뒤 theme-switching이 남음");
  await __settle();

  // View Transition 흉내 — 버튼에서 원형으로 번지는 clip-path
  const calls = [];
  stubVT(calls); __visible();
  __animateCalls.length = 0;
  btn.click(); await __wait(50);
  const call = circleCall();
  t.ok(calls.length === 1, `startViewTransition 호출 ${calls.length}회`);
  t.ok(call && call.options.duration === 480 && String(call.keyframes?.clipPath?.[0]).startsWith("circle(0px at"),
    `원형 전환: ${call ? JSON.stringify({ kf: call.keyframes, d: call.options.duration }) : "없음"}`);
  unstubVT();
  __visible("hidden");
  btn.click(); await __wait(50); await __settle(); // 원래대로
  __visible(false);

  // 창이 보이면 진짜 View Transition — 비동기로 교체되고 원형 애니메이션이 붙는다
  if (realVisible && document.startViewTransition) {
    __animateCalls.length = 0;
    const before = theme();
    btn.click(); await __wait(700);
    t.ok(theme() !== before, `진짜 전환 뒤 테마가 안 바뀜 (${before})`);
    t.ok(circleCall(), "진짜 전환에 원형 애니메이션이 없음");
    t.ok(!html.classList.contains("theme-switching"), "진짜 전환 뒤 theme-switching이 남음");
    btn.click(); await __wait(700); // 원래대로
    t.ok(theme() === before, "원래 테마로 안 돌아옴");
  }

  return t.done({ realVisible });
}
