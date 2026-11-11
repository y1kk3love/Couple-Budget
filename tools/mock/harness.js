// 목업 전용 검증 도우미 — 앱보다 먼저 로드된다 (tools/mock/index.html이 <head>에 넣는다)
// 실행(브라우저 콘솔·Browser 창): await __check("t05-entrance")  /  변형: await __check("t02-timing", "mobile")
// 검사 파일은 tools/mock/checks/<이름>.js — default export 함수가 { pass, failures, info }를 돌려준다
window.__appUrl = p => new URL("../../" + p, import.meta.url).href; // 저장소 루트 기준 주소 (앱과 같은 모듈 인스턴스를 얻는다)

// document·window에 걸린 리스너 기록 (예: iOS :active용 touchstart)
window.__listenersLog = [];
const origAdd = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, fn, options) {
  if (this === document || this === window) {
    window.__listenersLog.push({
      type,
      target: this === document ? "document" : "window",
      options: options && typeof options === "object" ? { ...options } : { capture: !!options },
    });
  }
  return origAdd.call(this, type, fn, options);
};

// 진동 호출 기록
window.__vibrations = [];
try {
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: pattern => { window.__vibrations.push(pattern); return true; },
  });
} catch { /* 정의 불가 환경 */ }

// Element.animate 호출 기록 (원래 동작은 그대로)
window.__animateCalls = [];
const origAnimate = Element.prototype.animate;
Element.prototype.animate = function (keyframes, options) {
  window.__animateCalls.push({ target: this, keyframes, options });
  return origAnimate.call(this, keyframes, options);
};

window.__wait = ms => new Promise(r => setTimeout(r, ms));

// Browser 창은 숨겨질 때도, 보일 때도 있다 — 검사가 창 상태에 기대지 않도록 강제한다.
// __visible(): 보이는 척 / __visible("hidden"): 숨은 척 / __visible(false): 실제 상태로
window.__realHidden = () => Object.getOwnPropertyDescriptor(Document.prototype, "hidden").get.call(document);
window.__visible = (on = true) => {
  if (on === false) {
    delete document.hidden;
    delete document.visibilityState;
    return;
  }
  const hidden = on === "hidden";
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
};

// 숨은 창에선 애니메이션이 진행되지 않는다 — 유한 애니메이션을 끝 상태로
window.__settle = async () => {
  await __wait(30);
  document.getAnimations().forEach(a => { try { a.finish(); } catch { /* 무한 반복 */ } });
  await __wait(30);
};

window.__go = async view => {
  document.querySelector(`.sidebar [data-view="${view}"]`)?.click();
  await __wait(300);
};

window.__expect = () => {
  const failures = [];
  return {
    ok(cond, msg) { if (!cond) failures.push(msg); },
    done(info) { return { pass: failures.length === 0, failures, info }; },
  };
};

window.__check = async (name, variant = "") => {
  let result;
  try {
    const mod = await import(new URL(`checks/${name}.js?${Date.now()}`, import.meta.url).href);
    result = await mod.default({ variant });
  } catch (e) {
    result = { pass: false, failures: [`예외: ${e?.name}: ${e?.message}`], info: String(e?.stack ?? "").slice(0, 800) };
  }
  const key = variant ? `${name}.${variant}` : name;
  const record = {
    name: key, at: new Date().toISOString(), url: location.href,
    viewport: `${innerWidth}x${innerHeight}`, ...result,
  };
  return record;
};

// 여러 검사를 차례로 — 백그라운드로 돌리고 __suite.results / __suite.done 으로 확인한다
// 사용: __runSuite(["t01-harness", ["t02-timing", "mobile"]])
window.__suite = { results: [], done: true };
window.__runSuite = names => {
  window.__suite = { results: [], done: false };
  (async () => {
    for (const n of names) {
      const [name, variant] = Array.isArray(n) ? n : [n, ""];
      const r = await __check(name, variant);
      window.__suite.results.push({ name: r.name, pass: r.pass, failures: r.failures });
    }
    window.__suite.done = true;
  })();
  return "started";
};
window.__suiteWait = async (maxMs = 38000) => {
  const t0 = Date.now();
  while (!window.__suite.done && Date.now() - t0 < maxMs) await __wait(500);
  return { done: window.__suite.done, results: window.__suite.results };
};
