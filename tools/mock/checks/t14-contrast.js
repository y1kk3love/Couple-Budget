// t14 — 두 테마 × 6화면 + 내역 모달의 글자 대비 (WCAG AA: 4.5:1, 큰 글자 3:1). 세그먼트 엄지 위 선택 버튼은 엄지 색을 배경으로
const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m[3] ?? 1 }; };
const L = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const bgOf = el => {
  const layers = [];
  for (let e = el; e; e = e.parentElement) {
    if (e.matches?.(".has-thumb > button.active")) {
      const th = e.parentElement.querySelector(":scope > .seg-thumb");
      if (th) { layers.push(parse(getComputedStyle(th).backgroundColor)); break; }
    }
    const c = parse(getComputedStyle(e).backgroundColor);
    if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
  }
  let rgb = [255, 255, 255];
  for (const l of layers.reverse()) rgb = rgb.map((v, i) => v * (1 - l.a) + l.rgb[i] * l.a);
  return rgb;
};
const scan = root => {
  const f = [];
  root.querySelectorAll("*").forEach(el => {
    if (!el.offsetParent) return;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || +cs.opacity < 0.9 || el.closest(".wd-event-past, .skeleton, .sr-only, .flip-ghost")) return;
    const fs = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const r = ratio(parse(cs.color).rgb, bgOf(el));
    if (r < ((fs >= 24 || (bold && fs >= 18.66)) ? 3 : 4.5)) f.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 12)}" ${r.toFixed(2)}`);
  });
  return [...new Set(f)];
};
const settle = async () => { await __wait(60); document.getAnimations().forEach(a => { try { a.finish(); } catch { /* 무한 */ } }); await __wait(40); };

export default async function () {
  const t = __expect();
  const html = document.documentElement;
  const saved = html.dataset.theme;
  let thumbs = 0;
  for (const theme of ["light", "dark"]) {
    html.dataset.theme = theme; await settle();
    for (const v of ["calendar", "list", "stats", "fixed", "plan", "wedding"]) {
      document.querySelector(`.sidebar [data-view="${v}"]`).click(); await __wait(250); await settle();
      thumbs += document.querySelectorAll(".has-thumb > button.active").length;
      const f = scan(document.body);
      t.ok(f.length === 0, `${theme}:${v} ${f.join(" | ")}`);
    }
    document.querySelector('.sidebar [data-view="calendar"]').click(); await __wait(200);
    document.getElementById("addTxBtn").click(); await __wait(200); await settle();
    const f = scan(document.getElementById("txModal"));
    t.ok(f.length === 0, `${theme}:txModal ${f.join(" | ")}`);
    document.getElementById("modalClose").click(); await __wait(300); await settle();
  }
  if (saved) html.dataset.theme = saved; else delete html.dataset.theme;
  await settle();
  return t.done({ thumbsChecked: thumbs });
}
