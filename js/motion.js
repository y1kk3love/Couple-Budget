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

// ── 짧은 진동 (안드로이드) ────────────────────────────────────
// 체크 완료·드래그 정렬처럼 손으로 무언가를 확정하는 순간에만 쓴다. 안드로이드 Chrome·삼성 인터넷만
// 지원하고, 아이폰 웹·파이어폭스는 navigator.vibrate가 없어 아무 일도 하지 않는다(아이폰의 우회 요령은
// iOS 26.5부터 막혀 쓰지 않는다). 진동은 움직임이 아니라 동작 줄이기와 무관하다.
export function haptic(pattern = 10) {
  try { navigator.vibrate?.(pattern); } catch { /* 지원하지 않는 환경 */ }
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
  layoutArmed = false; // 탐색이면 등장이 우선 — 목록 자리 이동은 하지 않는다
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

// ── 숫자 굴리기 (토스·NumberFlow) ─────────────────────────────
// 바뀐 자리만 슬롯처럼 굴러간다. 숫자 칸마다 0~9를 두 번 쌓은 띠를 두고 옮긴다 — 금액이 늘면 위로,
// 줄면 아래로 한 방향으로만 돈다(9→0도 같은 방향). 자리는 오른쪽(일의 자리)끼리 짝지어, 앞에 새로
// 생긴 자리는 흐리게 나타난다. key마다 마지막 값을 기억해 이전 값에서 굴린다(처음 보이는 값은 0에서).
// format은 호출부가 정한다(부호·"원" 등). 끝나면 일반 텍스트로 되돌린다 — 복사나 다른 코드에
// 굴림용 DOM이 남지 않게. 화면 낭독기는 굴리는 동안에도 .sr-only의 최종 금액을 읽는다.

const ROLL_MS = 520;
const ROLL_FADE_MS = 300;
const lastCounts = new Map();
const DIGIT_STRIP = `<span class="roll-s">${[..."01234567890123456789"].map(d => `<i>${d}</i>`).join("")}</span>`;
const isDigit = ch => ch >= "0" && ch <= "9";

export function rollNumber(el, key, to, format) {
  const from = lastCounts.has(key) ? lastCounts.get(key) : 0;
  lastCounts.set(key, to);
  const final = format(to);
  const token = {};
  el._rollToken = token;
  // 보이지 않는 탭에선 전환이 진행되지 않는다 — 이때와 동작 줄이기는 바로 최종값으로.
  // SVG <text> 같은 HTML이 아닌 요소는 안에 넣은 span을 그리지 않아 굴리는 동안 비어 보이므로 역시 바로 최종값.
  if (from === to || reducedMotion() || document.hidden || !(el instanceof HTMLElement) ||
      !Number.isFinite(to) || !Number.isFinite(from)) {
    el.textContent = final;
    return;
  }
  try {
    const old = format(from);
    const up = to >= from;
    const roll = document.createElement("span");
    roll.className = "roll";
    roll.setAttribute("aria-hidden", "true");
    const moves = [];
    [...final].forEach((ch, i) => {
      if (!isDigit(ch)) {
        const c = document.createElement("span");
        c.className = "roll-c";
        c.textContent = ch;
        roll.append(c);
        return;
      }
      const oc = old[old.length - (final.length - i)];
      const d = Number(ch);
      const od = isDigit(oc ?? "") ? Number(oc) : null;
      let start, end;
      if (od === null) { start = end = d; }                    // 새로 생긴 자리 — 굴리지 않고 흐리게 나타남
      else if (up) { start = od; end = d >= od ? d : d + 10; } // 위로 — 작아지면 다음 바퀴로
      else { start = od + 10; end = d <= od ? d + 10 : d; }    // 아래로
      const cell = document.createElement("span");
      cell.className = "roll-d";
      cell.innerHTML = DIGIT_STRIP;
      const strip = cell.firstChild;
      strip.style.transform = `translateY(${-start * 5}%)`;
      if (od === null) cell.style.opacity = "0";
      moves.push({ cell, strip, end, fresh: od === null });
      roll.append(cell);
    });
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = final;
    el.replaceChildren(sr, roll);
    void roll.offsetWidth; // 시작 위치를 확정한 뒤 전환 (requestAnimationFrame 없이)
    for (const { cell, strip, end, fresh } of moves) {
      strip.style.transition = `transform ${ROLL_MS}ms ${EASE_OUT}`;
      strip.style.transform = `translateY(${-end * 5}%)`;
      if (fresh) {
        cell.style.transition = `opacity ${ROLL_FADE_MS}ms ease`;
        cell.style.opacity = "1";
      }
    }
    setTimeout(() => { if (el._rollToken === token) el.textContent = final; }, ROLL_MS + 60);
  } catch (err) {
    console.warn("금액 굴리기 실패 — 최종값으로 표시:", err);
    el.textContent = final;
  }
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

// ── 목록 자리 이동 (FLIP — Paul Lewis, AutoAnimate) ───────────
// 내가 저장·삭제·정렬하면 남은 행은 새 자리로 미끄러지고, 새 행은 살짝 커지며 나타나고, 지운 행은
// 흐려지며 사라진다. 다시 그리기 전에 [data-flip-key] 행의 위치를 기록(captureLayout)하고, 그린 뒤
// 같은 키끼리 비교해 이전 자리에서 새 자리로 옮긴다(playLayout).
// 스위치(animateNextRender)는 같은 동기 호출 안에서만 켜져 있다 — 다시 그리기 바로 앞에서 부르고,
// 쓰이지 않으면 마이크로태스크에서 저절로 꺼진다. 실시간 반영·탭 이동에는 움직이지 않는다
// (읽던 화면이 스스로 움직이면 산만하다). 화면(위아래 100px 여유) 밖 행은 건너뛰고 최대 60개만.

const LAYOUT_MOVE_MS = 280;
const LAYOUT_ADD_MS = 240;
const LAYOUT_REMOVE_MS = 200;
const LAYOUT_MAX = 60;
const LAYOUT_MARGIN = 100;
let layoutArmed = false;

export function animateNextRender() {
  layoutArmed = true;
  queueMicrotask(() => { layoutArmed = false; });
}

export function captureLayout(root) {
  const armed = layoutArmed;
  layoutArmed = false;
  if (!armed || !root || reducedMotion()) return null;
  const snap = new Map();
  root.querySelectorAll("[data-flip-key]:not(.flip-ghost)").forEach(el =>
    snap.set(el.dataset.flipKey, { rect: el.getBoundingClientRect(), node: el }));
  return snap;
}

export function playLayout(root, snap) {
  if (!snap || !root?.isConnected) return;
  try {
    const onScreen = r => r.bottom > -LAYOUT_MARGIN && r.top < innerHeight + LAYOUT_MARGIN;
    // 읽기를 모두 끝낸 뒤 쓴다 (읽기·쓰기가 섞이면 행마다 레이아웃을 다시 계산한다)
    const rootRect = root.getBoundingClientRect();
    const moves = [], adds = [], seen = new Set();
    root.querySelectorAll("[data-flip-key]:not(.flip-ghost)").forEach(el => {
      const key = el.dataset.flipKey;
      seen.add(key);
      const now = el.getBoundingClientRect();
      const prev = snap.get(key);
      if (prev) {
        const dx = prev.rect.left - now.left, dy = prev.rect.top - now.top;
        if ((Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) && (onScreen(prev.rect) || onScreen(now))) moves.push({ el, dx, dy });
      } else if (onScreen(now)) {
        adds.push(el);
      }
    });
    const removes = [];
    snap.forEach((prev, key) => { if (!seen.has(key) && onScreen(prev.rect)) removes.push(prev); });

    let budget = LAYOUT_MAX;
    for (const { el, dx, dy } of moves) {
      if (budget-- <= 0) break;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: LAYOUT_MOVE_MS, easing: EASE_OUT });
    }
    for (const el of adds) {
      if (budget-- <= 0) break;
      el.animate([{ opacity: 0, transform: "scale(0.98)" }, { opacity: 1, transform: "none" }],
        { duration: LAYOUT_ADD_MS, easing: EASE_OUT });
    }
    // 지운 행: 이전 노드를 원래 자리에 유령으로 다시 붙여 흐려지게 한 뒤 뗀다 (눌리지 않고, 읽히지 않게)
    for (const { rect, node } of removes) {
      if (budget-- <= 0) break;
      node.classList.add("flip-ghost");
      node.setAttribute("aria-hidden", "true");
      Object.assign(node.style, {
        position: "absolute", margin: "0", pointerEvents: "none",
        top: `${rect.top - rootRect.top}px`, left: `${rect.left - rootRect.left}px`, width: `${rect.width}px`,
      });
      root.appendChild(node);
      const drop = () => node.remove();
      node.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.98)" }],
        { duration: LAYOUT_REMOVE_MS, easing: "ease-out", fill: "forwards" }).finished.then(drop, drop);
      setTimeout(drop, LAYOUT_REMOVE_MS + 100); // 숨은 탭처럼 애니메이션이 끝나지 않을 때
    }
  } catch (err) {
    console.warn("목록 자리 이동 애니메이션 실패:", err);
  }
}

// ── 테마 원형 전환 (View Transitions) ─────────────────────────
// 테마 버튼 자리에서 새 테마가 원형으로 번진다(480ms). 브라우저가 이전 화면을 찍어 두고 새 화면을
// clip-path 원으로 넓혀 보인다 — Chrome·Edge·Whale 111+, Safari 18+(iOS 18+), Firefox 144+, 삼성 인터넷 23+.
// 그 밖의 브라우저·동작 줄이기·숨은 탭은 즉시 바꾸되, 바꾸는 순간 색 전환을 꺼서(.theme-switching)
// 요소마다 0.15초씩 늦게 따라와 화면이 얼룩지던 문제를 없앤다.
// update는 동기여야 한다 — View Transition은 콜백이 끝날 때까지 화면을 멈춰 둔다.
export function revealTheme(originEl, update) {
  const html = document.documentElement;
  const swap = () => {
    html.classList.add("theme-switching");
    try { update(); } finally {
      void html.offsetWidth; // 새 색을 전환 없이 확정한 뒤 전환을 되살린다
      html.classList.remove("theme-switching");
    }
  };
  if (!document.startViewTransition || reducedMotion() || document.hidden || !originEl) { swap(); return; }
  let started = false; // 전환을 시작한 뒤라면 교체는 브라우저가 부른다 — 여기서 또 바꾸면 두 번 바뀐다
  try {
    const b = originEl.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(swap);
    started = true;
    vt.ready.then(() => html.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 480, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
    )).catch(() => { /* 전환이 건너뛰어져도 테마는 이미 바뀌었다 */ });
    vt.finished.catch(() => {});
  } catch (err) {
    console.warn("테마 원형 전환 실패 — 즉시 전환:", err);
    if (!started) swap();
  }
}

// ── 드래그 정렬 (iOS 목록 편집) ───────────────────────────────
// 손잡이를 잡으면 행이 살짝 떠오르고(1.02배·그림자) 손가락을 그대로 따라오며, 지나가는 자리의 행들은
// 부드럽게 비켜난다(FLIP 180ms). 놓거나 취소하면 스프링으로 제자리에 앉은 뒤 onDrop(새 순서의 행들).
// 포인터 캡처 대신 document 리스너 — 드래그 중 행을 DOM에서 옮기면 캡처가 풀리기 때문.
// 예산안 편집 행과 결혼 예산 행이 같이 쓴다 (예전엔 두 화면에 같은 코드가 복사돼 있었다).

const DRAG_SHIFT_MS = 180;
const DRAG_SETTLE_MS = 250;

export function setupDragReorder(container, { rowSelector, handleSelector, onDrop }) {
  const rows = () => [...container.querySelectorAll(rowSelector)];
  container.querySelectorAll(handleSelector).forEach(handle => {
    // 드래그 뒤 이어지는 click이 행 클릭(수정 모달 등)으로 번지지 않게
    handle.addEventListener("click", e => e.stopPropagation());
    handle.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const row = handle.closest(rowSelector);
      if (!row) return;
      e.preventDefault(); // 텍스트 선택 방지 (터치 스크롤은 CSS touch-action:none이 막는다)
      const calm = reducedMotion();
      const lift = calm ? "" : " scale(1.02)";
      const startY = e.clientY;
      const startTop = row.offsetTop;
      row.classList.add("drag-lift");
      row.style.transition = "none";
      row.style.transform = `translateY(0px)${lift}`;
      haptic(8);

      // 잡은 행은 DOM 자리가 바뀌어도 손가락 아래에 그대로 (레이아웃 이동만큼 되돌린다)
      const follow = y => {
        row.style.transform = `translateY(${(y - startY) - (row.offsetTop - startTop)}px)${lift}`;
      };
      // 형제 행 FLIP — 옮기기 전 보이는 위치에서 옮긴 뒤 자리로
      const shiftSiblings = mutate => {
        const sibs = rows().filter(r => r !== row);
        const first = calm ? null : new Map(sibs.map(s => [s, s.getBoundingClientRect().top]));
        sibs.forEach(s => s._dragShift?.cancel());
        mutate();
        if (calm) return;
        for (const s of sibs) {
          const dy = first.get(s) - s.getBoundingClientRect().top;
          if (Math.abs(dy) > 0.5) {
            s._dragShift = s.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
              { duration: DRAG_SHIFT_MS, easing: EASE_OUT });
          }
        }
      };

      const onMove = ev => {
        try {
          // 포인터가 중간점보다 위인 첫 행 앞에, 없으면 맨 뒤로 — 판단은 변형을 뺀 레이아웃 위치로
          // (비켜나는 중인 행의 움직이는 위치로 판단하면 자리가 앞뒤로 흔들린다)
          const all = rows();
          const others = all.filter(r => r !== row);
          const base = row.offsetParent?.getBoundingClientRect().top ?? 0;
          const py = ev.clientY - base;
          const next = others.find(o => py < o.offsetTop + o.offsetHeight / 2) ?? null;
          const curNext = all[all.indexOf(row) + 1] ?? null;
          if (next !== curNext) {
            shiftSiblings(() => (next ? next.before(row) : others[others.length - 1]?.after(row)));
          }
          follow(ev.clientY);
        } catch (err) {
          console.warn("드래그 정렬 이동 실패:", err);
        }
      };
      const onEnd = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("pointercancel", onEnd);
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          row.classList.remove("drag-lift");
          row.style.transition = "";
          row.style.transform = "";
          haptic(8);
          onDrop(rows());
        };
        if (calm) { settle(); return; }
        // 제자리로 스프링 — 끝나면(숨은 탭 대비 타이머도) 정리하고 새 순서를 넘긴다
        row.style.transition = `transform ${DRAG_SETTLE_MS}ms var(--ease-spring)`;
        row.style.transform = "";
        row.addEventListener("transitionend", settle, { once: true });
        setTimeout(settle, DRAG_SETTLE_MS + 50);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onEnd);
      document.addEventListener("pointercancel", onEnd);
    });
  });
}

// ── 상대가 바꾼 행 반짝임 ─────────────────────────────────────
// 상대가 다른 기기에서 추가·수정한 행을 1.6초 동안 은은한 파란 음영으로 표시한다(.m-remote).
// 내가 저장한 행의 반짝임(m-flash, 파란 테두리)과 모양이 다르다. 색만 바뀌어 동작 줄이기에서도 유지.
export function highlightRows(root, ids) {
  if (!root || !ids) return;
  try {
    for (const id of ids) {
      const el = root.querySelector(`[data-flip-key="${CSS.escape(id)}"]:not(.flip-ghost)`);
      if (!el) continue;
      el.classList.remove("m-remote");
      void el.offsetWidth; // 이미 반짝이는 중이면 처음부터 다시
      el.classList.add("m-remote");
      const end = e => {
        if (e.target !== el || e.animationName !== "m-remote") return;
        el.classList.remove("m-remote");
        el.removeEventListener("animationend", end);
      };
      el.addEventListener("animationend", end);
    }
  } catch (err) {
    console.warn("상대 변경 표시 실패:", err);
  }
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
