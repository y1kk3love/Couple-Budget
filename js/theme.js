// ================================================================
// js/theme.js — 다크/라이트 테마 전환
// ================================================================

// 기본은 시스템 설정을 따르고, 헤더 버튼으로 바꾸면 localStorage("theme")에
// 저장 후 <html data-theme>로 강제한다 (style.css의 :root[data-theme] 블록).
// index.html <head>의 인라인 스크립트가 첫 페인트 전에 같은 키를 읽어
// 새로고침 시 깜빡임을 막는다.

const THEME_BG = { light: "#f2f4f6", dark: "#17171c" };

const SUN_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

// 저장소 접근 — 브라우저가 사이트 데이터를 막으면(일부 사생활 보호 설정 등) localStorage 접근 자체가
// 예외를 던진다. 예전에는 이 예외가 app.js 부트스트랩까지 번져 뒤따르는 모달 설정이 모두 건너뛰어졌다.
// 막혀 있으면 이번 세션 동안만 메모리에 기억한다.
let memTheme = null;
function readSaved() {
  try { return localStorage.getItem("theme") ?? memTheme; } catch { return memTheme; }
}
function writeSaved(theme) {
  memTheme = theme;
  try { localStorage.setItem("theme", theme); } catch { /* 저장 불가 — 메모리 값으로 이번 세션만 유지 */ }
}

// 현재 실제로 보이는 테마 (저장값 우선, 없으면 시스템)
function effectiveTheme() {
  const saved = readSaved();
  if (saved === "light" || saved === "dark") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// 저장값을 <html data-theme>와 주소창 색(meta theme-color)에 반영
function applyTheme() {
  const saved = readSaved();
  if (saved === "light" || saved === "dark") {
    document.documentElement.dataset.theme = saved;
  } else {
    delete document.documentElement.dataset.theme;
  }
  const bg = THEME_BG[effectiveTheme()];
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = bg; });
}

// 다크일 때는 해(→라이트), 라이트일 때는 달(→다크) 아이콘
function renderButton(btn) {
  const dark = effectiveTheme() === "dark";
  btn.innerHTML = dark ? SUN_SVG : MOON_SVG;
  btn.title = dark ? "라이트 모드로 전환" : "다크 모드로 전환";
  btn.setAttribute("aria-label", btn.title);
}

export function setupThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  applyTheme();
  renderButton(btn);

  btn.addEventListener("click", () => {
    writeSaved(effectiveTheme() === "dark" ? "light" : "dark");
    applyTheme();
    renderButton(btn);
  });

  // 저장값 없이 시스템을 따르는 동안 시스템 테마가 바뀌면 아이콘·주소창 색 동기화
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    applyTheme();
    renderButton(btn);
  });
}
