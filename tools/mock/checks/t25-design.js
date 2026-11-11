// t25 — 디자인·접근성 기본기 (지금 창 크기에서 검사 — 320·375·1280px 등 크기를 바꿔 가며 돌린다)
//  · 어느 화면에서도 가로로 넘치지 않는다 (요약 카드의 가로 스크롤은 의도된 것)
//  · 보이는 글자는 11px 이상, 터치 기기의 입력칸은 16px 이상(아이폰 자동 확대 방지)
//  · 휴대폰 하단 탭은 5칸이고 + 버튼이 가운데
//  · 닫기 버튼·라벨·현재 탭에 낭독용 이름과 상태가 있다
//  · 화면 글자에 이모지가 없다 (아이콘은 선 아이콘 한 벌 — utils.js icon())
const VIEWS = ["calendar", "list", "stats", "fixed", "plan", "wedding"];

function overflowing() {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`문서 폭 ${document.documentElement.scrollWidth} > ${innerWidth}`);
  const header = document.querySelector(".main-header");
  if (header.scrollWidth > header.clientWidth + 1) out.push(`헤더가 넘침 ${header.scrollWidth} > ${header.clientWidth}`);
  document.querySelectorAll(".view.active *, .modal-overlay:not(.hidden) .modal *").forEach(el => {
    if (!el.offsetParent || el.closest(".summary-bar, .sr-only, .cal-sign, .flip-ghost")) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    // 스스로 스크롤하는 상자(표 등) 안은 제외
    for (let p = el.parentElement; p && !p.classList.contains("view"); p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden") return;
    }
    if (r.right > innerWidth + 1 || r.left < -1) out.push(`${(el.className || el.tagName).toString().slice(0, 30)} ${Math.round(r.left)}~${Math.round(r.right)}`);
  });
  return [...new Set(out)].slice(0, 5);
}

function smallText(root) {
  const out = new Set();
  root.querySelectorAll("*").forEach(el => {
    if (!el.offsetParent || el.closest(".sr-only, .cal-sign, .skeleton")) return;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) out.add(`${(el.className || el.tagName).toString().slice(0, 24)} ${fs}px`);
  });
  return [...out].slice(0, 6);
}

// 화면에 보이는 글자 속 이모지 (기기마다 그림이 다르고 글자색·테마를 따르지 않는다)
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
function emojiText(root) {
  const out = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (EMOJI.test(n.textContent) && n.parentElement?.offsetParent) out.add(n.textContent.trim().slice(0, 20));
  }
  return [...out].slice(0, 5);
}

export default async function () {
  const t = __expect();
  const mobile = innerWidth <= 768;
  const closeAll = async () => { document.querySelectorAll(".modal-overlay:not(.hidden):not(.is-closing) .modal-close").forEach(b => b.click()); await __wait(350); };
  await closeAll();

  for (const v of VIEWS) {
    await __go(v); await __settle();
    const o = overflowing();
    t.ok(o.length === 0, `${v}: 가로 넘침 — ${o.join(" | ")}`);
    const s = smallText(document.getElementById("app"));
    t.ok(s.length === 0, `${v}: 11px 미만 글자 — ${s.join(" | ")}`);
    const e = emojiText(document.getElementById("app"));
    t.ok(e.length === 0, `${v}: 화면 글자에 이모지 — ${e.join(" | ")}`);
    const active = [...document.querySelectorAll(`[data-view="${v}"]`)];
    t.ok(active.every(b => b.getAttribute("aria-current") === "page"), `${v}: 현재 탭 표시(aria-current) 없음`);
  }
  // 결혼 세그먼트들
  for (const seg of ["budget", "events", "checklist", "vendors", "memo"]) {
    document.querySelector(`#view-wedding .scope-btn[data-seg="${seg}"]`).click(); await __wait(250); await __settle();
    const o = overflowing();
    t.ok(o.length === 0, `결혼·${seg}: 가로 넘침 — ${o.join(" | ")}`);
  }
  document.querySelector('#view-wedding .scope-btn[data-seg="budget"]').click(); await __wait(200);

  // 내역 창 — 넘침, 작은 글자, 입력칸 크기
  await __go("calendar"); await __settle();
  document.getElementById("addTxBtn").offsetParent
    ? document.getElementById("addTxBtn").click()
    : document.getElementById("mobAddBtn").click();
  await __wait(600); await __settle();
  const o = overflowing();
  t.ok(o.length === 0, `내역 창: 가로 넘침 — ${o.join(" | ")}`);
  const s = smallText(document.getElementById("txModal"));
  t.ok(s.length === 0, `내역 창: 11px 미만 글자 — ${s.join(" | ")}`);
  if (matchMedia("(pointer: coarse)").matches) {
    const small = [...document.querySelectorAll("#txModal input:not([type=hidden]), #txModal select")]
      .filter(el => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map(el => `${el.id} ${getComputedStyle(el).fontSize}`);
    t.ok(small.length === 0, `터치 기기인데 16px 미만 입력칸: ${small.join(", ")}`);
  }
  // 창을 열면 포커스가 창 안에 있다
  t.ok(document.getElementById("txModal").contains(document.activeElement), "창을 열었는데 포커스가 뒤 화면에 있음");
  await closeAll();

  // 낭독용 이름
  const closes = [...document.querySelectorAll(".modal-close")];
  t.ok(closes.length >= 9 && closes.every(b => b.getAttribute("aria-label")), "이름 없는 닫기 버튼이 있음");
  const unlinked = [...document.querySelectorAll(".modal .form-row > label")]
    .filter(l => !l.htmlFor && !l.id && !l.querySelector("input") && l.parentElement.querySelector("input:not([type=hidden]), select, textarea")).map(l => l.textContent.trim());
  t.ok(unlinked.length === 0, `입력칸과 연결되지 않은 라벨: ${unlinked.join(", ")}`);
  const fixedIcon = document.querySelector('.sidebar [data-view="fixed"] svg').innerHTML;
  t.ok(!/circle cx="9" cy="7"/.test(fixedIcon), "고정비 아이콘이 아직 사람 모양");

  if (mobile) {
    const tabs = [...document.querySelectorAll(".mobile-tabs > button")];
    t.ok(tabs.length === 5, `하단 탭 ${tabs.length}칸 (기대 5)`);
    const add = document.getElementById("mobAddBtn").getBoundingClientRect();
    t.ok(Math.abs((add.left + add.right) / 2 - innerWidth / 2) < 2, `+ 버튼이 가운데가 아님 (${Math.round((add.left + add.right) / 2)} / ${innerWidth / 2})`);
    t.ok(tabs.every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44), "하단 탭 누름 영역이 44px 미만");
    // 고정비·예산안은 서랍으로 갈 수 있다
    document.getElementById("mobileMenuBtn").click(); await __wait(450);
    const drawer = [...document.querySelectorAll(".sidebar .nav-btn[data-view]")].filter(b => b.offsetParent).map(b => b.dataset.view);
    t.ok(drawer.includes("fixed") && drawer.includes("plan"), `서랍에 고정비·예산안이 없음: ${drawer.join(",")}`);
    document.getElementById("sidebarScrim").click(); await __wait(450);
  } else {
    // 통계: 혼자 남는 반쪽 카드가 없다
    await __go("stats"); await __settle();
    const cards = [...document.querySelectorAll("#view-stats .stats-card")];
    const last = cards.at(-1).getBoundingClientRect(), grid = document.querySelector("#view-stats .stats-grid").getBoundingClientRect();
    const halves = cards.filter(c => !c.classList.contains("full")).length;
    if (halves % 2) t.ok(last.width > grid.width * 0.9, `마지막 통계 카드가 반쪽으로 혼자 남음 (${Math.round(last.width)} / ${Math.round(grid.width)})`);
    await __go("calendar");
  }
  await __settle();
  return t.done({ width: innerWidth });
}
