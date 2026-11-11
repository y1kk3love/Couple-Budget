// t21 — 평가에서 확인된 화면 버그들
//  ① 휴대폰 서랍의 로그아웃이 하단 탭에 가려지지 않는다 (변형 "mobile": 375px 폭에서 실행)
//  ② 지출이 0원이면 고정비·변동비 모두 0% (예전: 변동비 0원 (100%)에 막대가 꽉 참)
//  ③ 필터가 없을 때 빈 목록은 "조건에 맞는…"이 아니라 그 달에 내역이 없다고 알린다
//  ④ 금액이 문자열로 저장된 문서가 있어도 요약 숫자가 깨지거나 태그가 끼어들지 않는다
export default async function ({ variant }) {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const db = await import(__appUrl("js/db.js"));
  const app = await import(__appUrl("js/app.js"));
  const restore = async () => { await db.fetchTransactions(); app.renderAll(); await __settle(); };
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());

  if (variant === "mobile") {
    t.ok(innerWidth <= 768, `모바일 폭이 아님 (${innerWidth}px)`);
    await __go("calendar");
    document.getElementById("mobileMenuBtn").click(); await __wait(500); await __settle();
    const lo = document.getElementById("logoutBtn");
    const r = lo.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    t.ok(top === lo || lo.contains(top), `로그아웃 버튼이 가려짐: ${top?.className || top?.tagName} (버튼 ${Math.round(r.top)}~${Math.round(r.bottom)}px)`);
    t.ok(r.bottom <= innerHeight, `로그아웃 버튼이 화면 밖 (${Math.round(r.bottom)} > ${innerHeight})`);
    // 서랍이 열린 동안 하단 탭은 막 뒤에 있어 눌리지 않는다
    const tab = document.querySelector('.mob-tab[data-view="stats"]').getBoundingClientRect();
    const overTab = document.elementFromPoint(tab.left + tab.width / 2, tab.top + tab.height / 2);
    t.ok(!overTab?.closest(".mobile-tabs"), "서랍이 열렸는데 하단 탭이 그 위에 있음");
    document.getElementById("sidebarScrim").click(); await __wait(450);
    return t.done();
  }

  // ② 지출 0원
  const saved = st.transactions;
  st.transactions = [];
  await __go("stats"); await __settle();
  const statsText = document.getElementById("view-stats").innerText.replace(/\s+/g, " ");
  t.ok(!/0원 \(100%\)/.test(statsText), `지출 0원인데 100%: ${statsText.match(/변동비[^고]*/)?.[0]}`);
  const fills = [...document.querySelectorAll("#view-stats .stats-card .pfill")].map(f => f.style.width);
  t.ok(fills.every(w => w === "0%"), `지출·수입이 없는데 막대가 참: ${fills.join(",")}`);

  // ③ 빈 목록 문구
  await __go("list"); await __settle();
  const emptyText = document.querySelector("#view-list .empty-state")?.innerText ?? "";
  t.ok(emptyText && !/조건/.test(emptyText), `필터가 없는데 빈 목록 문구: "${emptyText.replace(/\s+/g, " ")}"`);
  st.transactions = saved;

  // ④ 문자열 금액
  __remote("transactions", "t21bad", { name: "문자열 금액", memo: "", type: "expense", category: "etc", kind: "variable",
    amount: '1000"><img id="t21x" src=x>', date: `${st.currentYear}-${String(st.currentMonth).padStart(2, "0")}-01`, year: st.currentYear, month: st.currentMonth });
  await __wait(300);
  await __go("calendar"); await __settle(); await __wait(700);
  t.ok(!document.getElementById("t21x"), "문자열 금액이 태그로 끼어듦");
  const sums = [...document.querySelectorAll("#summaryBar [data-count]")].map(e => e.textContent);
  t.ok(sums.every(s => !/NaN/.test(s)), `요약 숫자가 깨짐: ${sums.join(" | ")}`);
  __remote("transactions", "t21bad", null); await __wait(300);
  await restore();
  return t.done();
}
