// t24 — 핵심 흐름
//  ① 달력: 날짜를 누르면 입력 창이 아니라 그날 내역이 아래에 보인다. + 버튼은 고른 날짜로 연다
//  ② 내역 창: 지출/수입별 빠른 금액, 금액 읽기 표시, "고정비" 안내, 최근 이름 추천, Enter로 저장
//  ③ 목록: Enter로 필터 적용, 여러 단어는 모두 포함, 결과 건수·합계
//  ④ 뒤로가기: 열린 창을 닫는다 (앱을 벗어나지 않는다). 입력한 창은 먼저 묻는다
//  ⑤ 긴 안내(토스트)가 화면 밖으로 나가지 않는다
//  변형 "mobile"(375px): 서랍도 뒤로가기로 닫힌다
const pad = n => String(n).padStart(2, "0");
const confirmBox = () => document.querySelector(".confirm-overlay:not(.is-closing)");
const isOpen = id => { const o = document.getElementById(id); return !o.classList.contains("hidden") && !o.classList.contains("is-closing"); };
const type = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
const back = async () => { history.back(); await __wait(350); };

export default async function ({ variant }) {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const closeAll = async () => { document.querySelectorAll(".modal-overlay:not(.hidden):not(.is-closing) .modal-close").forEach(b => b.click()); await __wait(350); };
  await closeAll();
  await __go("calendar"); await __settle();
  const ym = `${st.currentYear}-${pad(st.currentMonth)}`;

  if (variant === "mobile") {
    t.ok(innerWidth <= 768, `모바일 폭이 아님 (${innerWidth}px)`);
    const sidebar = document.querySelector(".sidebar");
    document.getElementById("mobileMenuBtn").click(); await __wait(400);
    t.ok(sidebar.classList.contains("open"), "서랍이 열리지 않음");
    await back();
    t.ok(!sidebar.classList.contains("open"), "뒤로가기로 서랍이 닫히지 않음");
    t.ok(!document.getElementById("app").classList.contains("hidden") && location.pathname.includes("mock"), "뒤로가기로 앱을 벗어남");
    // 서랍에서 CSV 가져오기를 열고 뒤로가기 → 창만 닫힌다
    document.getElementById("mobileMenuBtn").click(); await __wait(400);
    document.getElementById("sideImportBtn").click(); await __wait(500);
    t.ok(isOpen("csvModal") && !sidebar.classList.contains("open"), "서랍 항목으로 창이 열리지 않음");
    await back();
    t.ok(!isOpen("csvModal"), "뒤로가기로 창이 닫히지 않음");
    return t.done();
  }

  // ① 달력
  {
    __remote("transactions", "t24a", { name: "t24 점심", memo: "t24 점심", amount: 9000, type: "expense", category: "food", kind: "variable", date: `${ym}-02`, year: st.currentYear, month: st.currentMonth });
    __remote("transactions", "t24b", { name: "t24 커피", memo: "t24 커피", amount: 4500, type: "expense", category: "food", kind: "variable", date: `${ym}-02`, year: st.currentYear, month: st.currentMonth });
    await __wait(300); await __settle();
    const cell = document.querySelector('#view-calendar .cal-cell[data-day="2"]');
    cell.click(); await __wait(150);
    t.ok(!isOpen("txModal"), "날짜를 누르자 입력 창이 열림");
    const panel = () => document.querySelector("#view-calendar .cal-day-panel");
    const names = () => [...panel().querySelectorAll(".tx-name")].map(e => e.textContent);
    t.ok(names().includes("t24 점심") && names().includes("t24 커피"), `그날 내역이 아래에 없음: ${names().join(",")}`);
    const want = [...__store.transactions.values()].filter(d => d.date === `${ym}-02` && !d.skipped).length;
    t.ok(names().length === want, `그날 내역 ${names().length}건 (저장소 ${want}건)`);
    t.ok(cell.classList.contains("selected") && cell.getAttribute("aria-pressed") === "true", "고른 날짜 표시 없음");
    t.ok(/지출/.test(cell.getAttribute("aria-label")) && /내역 \d+건/.test(cell.getAttribute("aria-label")), `칸 이름에 금액·건수 없음: ${cell.getAttribute("aria-label")}`);
    // 행을 누르면 수정
    [...panel().querySelectorAll(".tx-item")].find(r => r.textContent.includes("t24 점심")).click(); await __wait(250);
    t.ok(isOpen("txModal") && document.getElementById("txAmount").value === "9000", "그날 내역의 행을 눌러도 수정 창이 안 열림");
    await closeAll();
    // + 버튼은 고른 날짜로
    document.getElementById("addTxBtn").click(); await __wait(250);
    t.ok(document.getElementById("txDate").value === `${ym}-02`, `+ 버튼의 날짜 ${document.getElementById("txDate").value} (고른 날 ${ym}-02)`);
    // ② 빠른 금액·읽기 표시·고정비 안내
    const presets = () => [...document.querySelectorAll("#txAmountPresets .preset-btn[data-add]")].map(b => b.dataset.add).join(",");
    t.ok(presets() === "1000,5000,10000,100000", `지출 빠른 금액: ${presets()}`);
    document.querySelector('#txModal .type-btn[data-type="income"]').click();
    t.ok(presets() === "10000,100000,1000000", `수입 빠른 금액: ${presets()}`);
    document.querySelector('#txModal .type-btn[data-type="expense"]').click();
    document.querySelector('#txAmountPresets .preset-btn[data-add="5000"]').click();
    document.querySelector('#txAmountPresets .preset-btn[data-add="1000"]').click();
    t.ok(document.getElementById("txAmount").value === "6000", `빠른 금액 누적: ${document.getElementById("txAmount").value}`);
    t.ok(document.querySelector("#txModal .amount-hint")?.textContent === "6,000원", `금액 읽기 표시: "${document.querySelector("#txModal .amount-hint")?.textContent}"`);
    type(document.getElementById("txAmount"), "35000000");
    t.ok(document.querySelector("#txModal .amount-hint")?.textContent === "3,500만원", `금액 읽기 표시: "${document.querySelector("#txModal .amount-hint")?.textContent}"`);
    const hint = document.getElementById("txKindHint");
    t.ok(hint.classList.contains("hidden"), "변동비인데 고정비 안내가 보임");
    document.querySelector('#txModal .kind-btn[data-kind="fixed"]').click();
    t.ok(!hint.classList.contains("hidden"), "고정비를 골랐는데 안내가 없음");
    document.querySelector('#txModal .kind-btn[data-kind="variable"]').click();
    // 이름 추천 → 이름과 카테고리가 채워진다
    await __wait(100);
    type(document.getElementById("txMemo"), "t24");
    const chips = [...document.querySelectorAll("#txNameSuggest .name-chip")];
    t.ok(chips.some(c => c.textContent === "t24 커피"), `이름 추천: ${chips.map(c => c.textContent).join(",")}`);
    __remote("transactions", "t24c", { name: "t24 영화", memo: "t24 영화", amount: 15000, type: "expense", category: "culture", kind: "variable", date: `${ym}-01`, year: st.currentYear, month: st.currentMonth });
    await __wait(300);
    await closeAll(); document.getElementById("addTxBtn").click(); await __wait(300);
    type(document.getElementById("txMemo"), "t24 영");
    document.querySelector("#txNameSuggest .name-chip")?.click();
    t.ok(document.getElementById("txMemo").value === "t24 영화" && document.getElementById("txCategory").value === "culture",
      `추천을 눌러도 이름·카테고리가 안 채워짐: ${document.getElementById("txMemo").value} / ${document.getElementById("txCategory").value}`);
    // Enter로 저장 → 달력 아래에 그날 내역으로 보인다
    type(document.getElementById("txAmount"), "7700");
    document.getElementById("txMemo").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await __wait(600);
    t.ok(!isOpen("txModal"), "내용 칸에서 Enter로 저장되지 않음");
    t.ok(names().includes("t24 영화"), `저장한 내역이 달력 아래에 안 보임: ${names().join(",")}`);
    const savedNew = [...__store.transactions.entries()].find(([id, d]) => d.name === "t24 영화" && d.amount === 7700);
    t.ok(savedNew && savedNew[1].date === `${ym}-02`, `고른 날짜로 저장되지 않음: ${savedNew?.[1].date}`);
    if (savedNew) __remote("transactions", savedNew[0], null);
  }

  // 고정비 자동 기록 — 안내와 삭제 문구
  {
    await __go("list"); await __settle();
    const fixedRow = [...document.querySelectorAll("#view-list .tx-item")].find(r => r.dataset.id.startsWith("fixed_"));
    t.ok(fixedRow, "이번 달 고정비 기록이 목록에 없음");
    if (fixedRow) {
      fixedRow.click(); await __wait(250);
      t.ok(!document.getElementById("txFixedNote").classList.contains("hidden"), "고정비 자동 기록인데 안내가 없음");
      document.getElementById("deleteTxBtn").click(); await __wait(150);
      t.ok(/이 달만 건너뛰/.test(confirmBox()?.textContent ?? ""), `삭제 확인 문구: ${confirmBox()?.textContent.replace(/\s+/g, " ")}`);
      confirmBox()?.querySelector(".confirm-cancel").click(); await __wait(250);
      await closeAll();
    }
    // 변동 꼬리표는 더 이상 붙지 않는다
    t.ok(!document.querySelector("#view-list .tag.variable"), "목록에 '변동' 꼬리표가 남음");
  }

  // ③ 목록 검색
  {
    document.getElementById("filterToggleBtn").click(); await __wait(150);
    const nameInput = () => document.getElementById("f-name");
    type(nameInput(), "t24 점심");
    nameInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await __wait(300); await __settle();
    const rows = [...document.querySelectorAll("#view-list .tx-item .tx-name")].map(e => e.textContent);
    t.ok(rows.length === 1 && rows[0] === "t24 점심", `Enter 적용·모두 포함: ${rows.join(",")}`);
    const result = document.querySelector("#view-list .list-result")?.innerText.replace(/\s+/g, " ") ?? "";
    t.ok(/1건/.test(result) && /9,000원/.test(result), `결과 요약: "${result}"`);
    document.getElementById("filterResetBtn").click(); await __wait(300); await __settle();
    t.ok(!document.querySelector("#view-list .list-result"), "필터가 없는데 결과 요약이 보임");
    document.getElementById("filterToggleBtn").click(); await __wait(150);
  }

  // ④ 뒤로가기
  {
    await __go("calendar"); await __settle();
    document.getElementById("addTxBtn").click(); await __wait(300);
    await back();
    t.ok(!isOpen("txModal"), "뒤로가기로 입력 창이 닫히지 않음");
    t.ok(!document.getElementById("app").classList.contains("hidden") && location.pathname.includes("mock"), "뒤로가기로 앱을 벗어남");
    // 입력한 창은 먼저 묻는다
    document.getElementById("addTxBtn").click(); await __wait(300);
    type(document.getElementById("txAmount"), "100");
    await back();
    t.ok(isOpen("txModal") && confirmBox(), "입력한 창이 뒤로가기로 묻지 않고 닫힘");
    await back(); // 확인 창에서 뒤로가기 = 취소 (창은 그대로)
    t.ok(isOpen("txModal") && !confirmBox(), "확인 창에서 뒤로가기를 눌렀는데 창이 닫히거나 확인 창이 남음");
    await back();
    confirmBox()?.querySelector(".confirm-ok").click(); await __wait(450);
    t.ok(!isOpen("txModal"), "버리기 뒤 닫히지 않음");
    // 화면에서 닫은 뒤에는 쌓아 둔 기록이 남지 않는다 — 열고 닫기를 반복해도 길이가 그대로
    await __wait(200);
    const len0 = history.length;
    for (let i = 0; i < 3; i++) { document.getElementById("addTxBtn").click(); await __wait(300); await closeAll(); await __wait(150); }
    document.getElementById("addTxBtn").click(); await __wait(300);
    const lenOpen = history.length;
    await closeAll(); await __wait(200);
    t.ok(lenOpen - len0 <= 1, `열고 닫을 때마다 방문 기록이 쌓임 (${len0} → ${lenOpen})`);
  }

  // ⑤ 긴 토스트
  {
    const { showToast } = await import(__appUrl("js/utils.js"));
    showToast("연결이 느려요. 저장을 계속 시도하고 있어요 — 다시 입력하지 않아도 돼요. 이 안내는 일부러 길게 쓴 검사용 문장입니다");
    await __wait(100);
    const r = document.getElementById("toast").getBoundingClientRect();
    t.ok(r.left >= 0 && r.right <= innerWidth + 0.5, `토스트가 화면 밖으로 나감 (${Math.round(r.left)}~${Math.round(r.right)} / ${innerWidth})`);
  }

  for (const id of ["t24a", "t24b", "t24c"]) __remote("transactions", id, null);
  await __wait(300); await __go("calendar"); await __settle();
  return t.done();
}
