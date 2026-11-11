// 목업 전용 — 애니메이션 속도를 손으로 맞춰 보는 조절판 (주소에 ?tune=1 을 붙이면 뜬다. ?tune=1.5 처럼 시작값을 줄 수도 있다)
// 앱 코드는 바꾸지 않는다. 화면에서 도는 모든 애니메이션(CSS animation·transition, Element.animate)의 재생 속도를
// 한꺼번에 늦추거나 당기고, 애니메이션 끝을 기다리는 타이머(창 닫힘 240ms, 등장 정리 등)도 같은 비율로 늘린다.
// 여기서 고른 배수를 style.css의 --motion-scale에 곱해 적으면 실제 앱이 같은 속도가 된다 (CSS와 JS가 그 값 하나를 함께 읽는다).
const KEY = "mock-tune-scale";
const clamp = v => Math.min(3, Math.max(0.5, Number(v) || 1));
const fromUrl = new URLSearchParams(location.search).get("tune");
let saved = null;
try { saved = sessionStorage.getItem(KEY); } catch { /* 저장소를 쓸 수 없는 환경 */ }
let scale = clamp(Number(fromUrl) > 0 && fromUrl !== "1" ? fromUrl : saved ?? 1); // 길이 배수 — 클수록 느리다
window.__tuneScale = () => scale;

// ── 타이머 — 애니메이션과 맞물린 것(100~1500ms)만 같은 비율로. 토스트(3초)·가짜 네트워크 지연(30ms)은 그대로 ──
const origSetTimeout = window.setTimeout;
window.setTimeout = (fn, ms = 0, ...args) => origSetTimeout(fn, ms >= 100 && ms <= 1500 ? ms * scale : ms, ...args);

// ── 재생 속도 ──
let panel = null;
function applyRate() {
  const rate = 1 / scale;
  for (const a of document.getAnimations()) {
    const target = a.effect?.target;
    if (panel && target && panel.contains(target)) continue; // 조절판 자신은 제외
    if (Math.abs(a.playbackRate - rate) > 0.001) { try { a.playbackRate = rate; } catch { /* 끝난 애니메이션 */ } }
  }
}
// 새 애니메이션이 시작되는 순간 바로 맞춘다 (이벤트) + Element.animate로 만든 것은 매 프레임 훑어 잡는다
for (const type of ["animationstart", "transitionrun", "transitionstart"]) document.addEventListener(type, applyRate, true);
(function loop() { applyRate(); requestAnimationFrame(loop); })();

// ── 조절판 ──
const fmt = v => `${v.toFixed(2)}×`;
function build() {
  panel = document.createElement("div");
  panel.id = "tunePanel";
  panel.innerHTML = `
    <style>
      #tunePanel { position: fixed; right: 12px; bottom: 88px; z-index: 9999; width: 248px; padding: 12px 14px 14px;
        background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 14px;
        box-shadow: var(--shadow-pop); font: 500 13px/1.4 var(--font); }
      #tunePanel .tune-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      #tunePanel .tune-val { font-size: 20px; font-weight: 700; color: var(--accent); }
      #tunePanel input[type=range] { width: 100%; margin: 0; min-height: 28px; accent-color: var(--accent-fill); }
      #tunePanel .tune-scale { display: flex; justify-content: space-between; color: var(--text-3); font-size: 12px; }
      #tunePanel .tune-presets { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-top: 10px; }
      #tunePanel button { min-height: 32px; padding: 0; border: none; border-radius: 8px; cursor: pointer;
        background: var(--surface2); color: var(--text-2); font: 600 12px var(--font); }
      #tunePanel button.on { background: var(--accent-fill); color: #fff; }
      #tunePanel .tune-note { margin-top: 10px; color: var(--text-3); font-size: 12px; }
    </style>
    <div class="tune-head"><span>애니메이션 길이</span><span class="tune-val" id="tuneVal"></span></div>
    <input type="range" id="tuneRange" min="0.5" max="3" step="0.05" aria-label="애니메이션 길이 배수">
    <div class="tune-scale"><span>빠르게</span><span>느리게</span></div>
    <div class="tune-presets">${[0.75, 1, 1.25, 1.5, 2].map(v => `<button type="button" data-v="${v}">${v}×</button>`).join("")}</div>
    <div class="tune-note" id="tuneNote"></div>`;
  document.body.appendChild(panel);

  const range = panel.querySelector("#tuneRange"), val = panel.querySelector("#tuneVal"), note = panel.querySelector("#tuneNote");
  const set = v => {
    scale = clamp(v);
    range.value = scale;
    val.textContent = fmt(scale);
    // 지금 앱에 적용된 배수(style.css의 --motion-scale) 위에 이 조절판의 배수가 한 번 더 곱해진다
    const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-scale")) || 1;
    const total = Math.round(base * scale * 100) / 100;
    note.textContent = scale === 1
      ? `1× = 지금 앱의 속도 (--motion-scale ${base})`
      : `지금보다 ${scale > 1 ? `${Math.round((scale - 1) * 100)}% 느리게` : `${Math.round((1 - scale) * 100)}% 빠르게`} · --motion-scale로는 ${total} · 창 열기 ${Math.round(480 * total)}ms`;
    panel.querySelectorAll("button[data-v]").forEach(b => b.classList.toggle("on", Number(b.dataset.v) === scale));
    try { sessionStorage.setItem(KEY, String(scale)); } catch { /* 저장 불가 — 이번 화면에서만 유지 */ }
    applyRate();
  };
  range.addEventListener("input", () => set(range.value));
  panel.querySelectorAll("button[data-v]").forEach(b => b.addEventListener("click", () => set(b.dataset.v)));
  // 조절판을 만지는 것이 앱의 "입력함" 표시·바깥 누르기 처리에 섞이지 않게 한다
  for (const type of ["input", "change", "click", "pointerdown"]) panel.addEventListener(type, e => e.stopPropagation());
  set(scale);
}
if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
