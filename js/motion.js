// ================================================================
// js/motion.js — 모션 공통 (iOS·토스 참고)
// - 움직임은 transform·opacity만 (레이아웃을 다시 계산하지 않아 부드럽다)
// - 운영체제의 '동작 줄이기'를 켜면 JS 애니메이션은 건너뛰고, CSS 쪽은 style.css의
//   prefers-reduced-motion 규칙이 길이·지연을 0으로 만든다
// - 이 모듈은 다른 앱 모듈을 import하지 않는다 (utils 등에서 자유롭게 가져다 쓰도록)
// ================================================================

const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");
export const reducedMotion = () => reduceMq.matches;

// style.css의 --ease-out과 같은 곡선 (JS 전환·애니메이션은 CSS 변수를 곡선으로 쓸 수 없는 곳이 있다)
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

// ── 오버레이(모달·바텀시트) 열기/닫기 ─────────────────────────
// 닫을 때 바로 숨기지 않고 .is-closing으로 퇴장 애니메이션(시트는 아래로, 팝업은 작아지며
// 사라짐)을 재생한 뒤 .hidden을 붙인다. 닫는 중에 다시 열면 퇴장을 취소한다.

const CLOSE_MS = 240; // 가장 긴 퇴장(시트 240ms) — 팝업 160ms, 배경막 200ms
const closeTimers = new WeakMap();

// 배경막은 오버레이의 첫 자식 요소(.modal-scrim). 예전엔 ::before라 JS가 투명도를 직접 바꿀 수 없어
// 오버레이의 CSS 변수(--scrim)를 매 이동마다 바꿨고, 모달 전체의 스타일을 다시 계산했다.
function ensureScrim(overlay) {
  let scrim = overlay.querySelector(":scope > .modal-scrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    overlay.prepend(scrim);
  }
  return scrim;
}

function resetSheet(overlay) {
  const sheet = overlay.querySelector(":scope > .modal");
  if (sheet) { sheet.style.transform = ""; sheet.style.transition = ""; }
  const scrim = overlay.querySelector(":scope > .modal-scrim");
  if (scrim) { scrim.style.opacity = ""; scrim.style.transition = ""; }
  delete overlay.dataset.dismissed;
}

export function openOverlay(overlay) {
  const t = closeTimers.get(overlay);
  if (t) { clearTimeout(t); closeTimers.delete(overlay); }
  overlay.classList.remove("is-closing");
  ensureScrim(overlay);
  resetSheet(overlay);
  overlay.classList.remove("hidden");
}

export function closeOverlay(overlay) {
  if (overlay.classList.contains("hidden") || closeTimers.has(overlay)) return;
  // 끌어서 닫은 시트는 이미 화면 밖으로 내려가 있다 — 퇴장 애니메이션 없이 숨긴다
  if (reducedMotion() || overlay.dataset.dismissed) {
    overlay.classList.add("hidden");
    resetSheet(overlay);
    return;
  }
  overlay.classList.add("is-closing");
  closeTimers.set(overlay, setTimeout(() => {
    closeTimers.delete(overlay);
    overlay.classList.remove("is-closing");
    overlay.classList.add("hidden");
    resetSheet(overlay);
  }, CLOSE_MS));
}

// ── 눌림 효과가 아이폰에서도 보이도록 ─────────────────────────
// iOS Safari는 touchstart 리스너가 하나도 없으면 :active를 적용하지 않는다(MDN :active 호환성 표).
// 이 앱엔 없었기 때문에 버튼·행의 눌림 효과가 아이폰에서는 보이지 않았다. 빈 리스너 하나로 켠다.
export function setupTouchFeedback() {
  document.addEventListener("touchstart", () => {}, { passive: true });
}

// ── 바텀시트 끌어서 닫기 (iOS) ────────────────────────────────
// 모바일에서 시트 윗부분(손잡이·제목)을 아래로 끌면 따라 내려오고, 충분히 끌었거나
// 빠르게 튕기면 닫힌다. 모달별 정리 로직을 그대로 타도록 닫기는 .modal-close 클릭으로 한다.

export function setupSheetDrag() {
  const mobile = matchMedia("(max-width: 768px)");
  document.addEventListener("pointerdown", e => {
    if (!mobile.matches || e.button !== 0) return;
    // 손잡이가 달린 제목줄에서만 (본문은 스크롤이어야 한다) — 제목줄은 CSS에서 touch-action:none
    const header = e.target.closest(".modal-overlay:not(.confirm-overlay) > .modal > .modal-header");
    if (!header) return;
    if (e.target.closest("button, input, select, textarea, a, label, [role='button']")) return;
    const sheet = header.parentElement;
    const overlay = sheet.parentElement;
    const scrim = ensureScrim(overlay);
    const height = sheet.offsetHeight; // 끄는 동안 레이아웃을 다시 읽지 않도록 시작할 때 한 번만

    const startY = e.clientY;
    let lastY = startY, lastT = performance.now(), velocity = 0, dy = 0;
    sheet.style.transition = "none";
    scrim.style.transition = "none";

    const onMove = ev => {
      dy = ev.clientY - startY;
      // 위로 끌면 고무줄처럼 조금만 (iOS)
      const shown = dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
      sheet.style.transform = `translateY(${shown}px)`;
      scrim.style.opacity = String(Math.max(0, 1 - dy / height));
      const now = performance.now();
      velocity = (ev.clientY - lastY) / Math.max(8, now - lastT);
      lastY = ev.clientY; lastT = now;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      // 손가락을 멈췄다가 떼면 튕긴 게 아니다 — 마지막 움직임 뒤 80ms가 지났으면 속도 0 (iOS)
      const flingVelocity = performance.now() - lastT > 80 ? 0 : velocity;
      const dismiss = dy > Math.min(140, height * 0.3) || (dy > 20 && flingVelocity > 0.6);
      if (dismiss) {
        // 손가락 속도를 이어받아 끊김 없이 내려간다 (Apple WWDC 'Animate with springs').
        // ease-out 곡선의 시작 기울기가 약 4.5라 4.5 × 남은 거리 ÷ 시간이 곧 시작 속도 —
        // 예전의 천천히 출발하는 곡선(ease-in)은 휙 내린 직후 순간 멈칫했다
        const d = Math.round(Math.min(280, Math.max(160, 4.5 * (height - dy) / Math.max(flingVelocity, 0.01))));
        sheet.style.transition = `transform ${d}ms ${EASE_OUT}`;
        sheet.style.transform = "translateY(105%)";
        scrim.style.transition = `opacity ${d}ms ${EASE_OUT}`;
        scrim.style.opacity = "0";
        setTimeout(() => {
          overlay.dataset.dismissed = "1";
          overlay.querySelector(".modal-close")?.click();
          // 닫기 버튼이 없는 모달이라면 직접 숨긴다
          if (!overlay.classList.contains("hidden")) closeOverlay(overlay);
        }, d);
      } else {
        // 제자리로 스프링 복귀, 배경막도 원래 진하기로
        sheet.style.transition = "transform 360ms var(--ease-spring)";
        sheet.style.transform = "";
        scrim.style.transition = "opacity 360ms ease";
        scrim.style.opacity = "";
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

// ── 화면 등장 (탭 전환·월 이동) ───────────────────────────────
// dir 0: 카드·행이 차례로 떠오른다 — 앞 6개만 20ms 간격, 끝까지 약 0.32초 (하루 수십 번 하는 동작이라 짧게).
// dir ±1: 달력처럼 화면 전체가 옆에서 밀려 들어온다(0.26초). first: 로그인 직후 첫 화면만 예전처럼 풍성하게.
// 실시간 갱신·저장 후 다시 그리기에는 쓰지 않는다 — 탐색할 때만 움직여야 산만하지 않다.

const STAGGER = [
  ".calendar-wrap", ".list-toolbar", ".sort-bar", ".list-group", ".section-header",
  ".fixed-list > *", ".stats-card", ".plan-card", ".wd-header", ".wd-seg", ".wd-progress",
  ".wd-memo-card", ".wd-minical", ".empty-state",
].join(", ");
const ENTER_ANIMS = new Set(["m-rise", "m-rise-sm", "m-slide-next", "m-slide-prev", "m-bar-grow", "m-col-grow", "m-donut"]);
const ENTER_HOLD_MS = 200;      // 자리표시를 먼저 그리는 화면(결혼 탭 첫 진입)의 실제 내용이 올 때까지 기다린다
const ENTER_FALLBACK_MS = 1200; // 숨은 탭처럼 애니메이션이 끝나지 않을 때의 안전장치

function clearEntrance(view) {
  clearTimeout(view._enterTimer);
  clearTimeout(view._enterHold);
  view._enterToken = null;
  view.classList.remove("entering", "first", "dir-next", "dir-prev");
}

export function playEntrance(view, dir = 0, { first = false } = {}) {
  if (!view || reducedMotion()) return;
  // 월을 빠르게 연달아 넘기면 진행 중인 슬라이드를 처음부터 다시 재생하지 않고 그냥 바꾼다
  if (dir && view.classList.contains("entering") &&
      (view.classList.contains("dir-next") || view.classList.contains("dir-prev"))) {
    clearEntrance(view);
    return;
  }
  clearEntrance(view);
  if (dir === 0) {
    // 문서 순서대로 번호 — CSS가 --i로 지연을 계산한다 (상한 뒤로는 같은 지연)
    const cap = first ? 14 : 6;
    view.querySelectorAll(STAGGER).forEach((el, i) => el.style.setProperty("--i", Math.min(i, cap)));
  }
  void view.offsetWidth; // 같은 클래스를 다시 붙여도 애니메이션이 처음부터 재생되도록
  view.classList.add("entering");
  if (first) view.classList.add("first");
  if (dir) view.classList.add(dir > 0 ? "dir-next" : "dir-prev");

  // 등장 애니메이션이 모두 끝난 뒤 클래스를 걷는다. 예전엔 900ms 고정 타이머라 긴 목록의 막대가
  // 끝나기 전에 툭 끊겼다. 도중에 다시 그려져 새로 생긴 애니메이션(늦게 온 내용)도 다시 모아 기다린다.
  const token = {};
  view._enterToken = token;
  const done = () => { if (view._enterToken === token) clearEntrance(view); };
  const waitAll = () => {
    if (view._enterToken !== token) return;
    const running = view.getAnimations({ subtree: true })
      .filter(a => ENTER_ANIMS.has(a.animationName) && a.playState !== "finished");
    if (!running.length) { done(); return; }
    Promise.allSettled(running.map(a => a.finished)).then(waitAll);
  };
  view._enterHold = setTimeout(waitAll, ENTER_HOLD_MS);
  view._enterTimer = setTimeout(done, ENTER_FALLBACK_MS);
}

// 월 라벨이 넘기는 방향으로 바뀐다 (iOS 달력 제목). 앞 슬라이드가 아직 재생 중이면(연타) 생략
export function slideLabel(el, dir) {
  if (!el || !dir || reducedMotion()) return;
  const busy = el.getAnimations().some(a => a.animationName?.startsWith("m-slide") && a.playState === "running");
  el.classList.remove("label-next", "label-prev");
  if (busy) return;
  void el.offsetWidth;
  el.classList.add(dir > 0 ? "label-next" : "label-prev");
}

// ── 숫자 굴리기 (토스) ────────────────────────────────────────
// key마다 마지막 값을 기억해, 값이 바뀌면 이전 값에서 새 값까지 굴려 보여준다.
// 처음 보이는 값은 0부터. format은 호출부가 정한다 (부호·"원" 등).

const lastCounts = new Map();
const countRuns = new Map(); // key → { frame, timer }
const easeOutExpo = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

export function animateCount(el, key, to, format, duration = 650) {
  const from = lastCounts.has(key) ? lastCounts.get(key) : 0;
  lastCounts.set(key, to);
  const prevRun = countRuns.get(key);
  if (prevRun) { cancelAnimationFrame(prevRun.frame); clearTimeout(prevRun.timer); countRuns.delete(key); }
  // 보이지 않는 탭에선 프레임 콜백이 멈춰 시작값에 머문다 — 이때는 바로 최종값으로
  if (from === to || reducedMotion() || document.hidden || !Number.isFinite(to)) {
    el.textContent = format(to);
    return;
  }
  const run = {};
  const finish = () => {
    cancelAnimationFrame(run.frame); clearTimeout(run.timer);
    el.textContent = format(to);
    if (countRuns.get(key) === run) countRuns.delete(key);
  };
  const start = performance.now();
  const step = now => {
    const p = Math.min(1, (now - start) / duration);
    if (p >= 1) { finish(); return; }
    el.textContent = format(Math.round(from + (to - from) * easeOutExpo(p)));
    run.frame = requestAnimationFrame(step);
  };
  el.textContent = format(from);
  run.frame = requestAnimationFrame(step);
  // 도중에 탭을 떠나 프레임이 멈춰도 결국 정확한 값이 되도록 안전장치
  run.timer = setTimeout(finish, duration + 150);
  countRuns.set(key, run);
}

// 막대 폭을 이전 값에서 새 값으로 (다시 그려진 요소라 CSS 전환이 자동으로 걸리지 않는다)
const lastWidths = new Map();
export function animateWidth(el, key, pct) {
  const prev = lastWidths.get(key);
  lastWidths.set(key, pct);
  if (prev == null || prev === pct || reducedMotion()) return;
  el.style.width = `${prev}%`;
  void el.offsetWidth;
  el.style.width = `${pct}%`;
}

// ── 세그먼트 컨트롤 슬라이딩 배경 (iOS) ───────────────────────
// 선택된 버튼 뒤에 흰 '엄지'가 미끄러져 따라간다. 화면을 innerHTML로 다시 그리면 엄지도 새로
// 생기므로, 컨트롤마다 마지막 위치를 기억했다가 거기서 새 위치로 옮긴다 (FLIP).
// 어떤 화면이 그리든 자동으로 적용되도록 DOM 변화를 지켜본다.

const SEG = ".scope-toggle, .type-toggle, .kind-toggle";
const lastThumbs = new Map();

function segKey(box) {
  return box.dataset.segKey || box.id || `${box.closest("[id]")?.id ?? ""}:${box.className}`;
}

function placeThumb(box) {
  if (!box.offsetParent) return; // 숨겨진 화면·모달
  const active = box.querySelector(":scope > button.active");
  let thumb = box.querySelector(":scope > .seg-thumb");
  if (!active) { thumb?.remove(); box.classList.remove("has-thumb"); return; }
  const cur = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
  const key = segKey(box);
  const prev = lastThumbs.get(key);
  lastThumbs.set(key, cur);
  const apply = p => {
    thumb.style.transform = `translate(${p.x}px, ${p.y}px)`;
    thumb.style.width = `${p.w}px`;
    thumb.style.height = `${p.h}px`;
  };
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = "seg-thumb";
    thumb.setAttribute("aria-hidden", "true");
    box.prepend(thumb);
    box.classList.add("has-thumb");
    if (prev && !reducedMotion() && (prev.x !== cur.x || prev.w !== cur.w)) {
      thumb.style.transition = "none";
      apply(prev);
      void thumb.offsetWidth;
      thumb.style.transition = "";
    }
  }
  apply(cur);
}

export function setupSegmentThumbs() {
  // MutationObserver 콜백은 한 작업의 변경을 모아 한 번 불리므로 여기서 바로 맞춘다.
  // (requestAnimationFrame으로 미루면 숨겨진 탭에서 콜백이 멈춰 엄지가 영영 안 생길 수 있다)
  // 엄지를 만들며 생기는 변경으로 한 번 더 불리지만, 이미 제자리라 아무것도 바꾸지 않고 끝난다.
  const sync = () => document.querySelectorAll(SEG).forEach(placeThumb);
  // 글자만 바뀐 변경(굴러가는 숫자는 매 프레임 글자를 바꾼다)은 무시 — 클래스 변화나 요소 추가만 본다
  const relevant = records => records.some(r =>
    r.type === "attributes" || [...r.addedNodes].some(n => n.nodeType === Node.ELEMENT_NODE));
  new MutationObserver(records => { if (relevant(records)) sync(); }).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["class"],
  });
  addEventListener("resize", sync);
  sync();
}

// ── 방금 추가·수정한 항목 반짝임 (토스) ───────────────────────
export function flash(el) {
  if (!el || reducedMotion()) return;
  el.classList.remove("m-flash");
  void el.offsetWidth;
  el.classList.add("m-flash");
  el.addEventListener("animationend", () => el.classList.remove("m-flash"), { once: true });
}
