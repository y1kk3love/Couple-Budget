// t22 — 데이터 안전 기능
//  ① 전체 백업: 저장소의 모든 문서가 그대로 담기고, 백업은 아무것도 쓰지 않는다
//  ② 카테고리 변경: 같은 이름의 다른 내역이 있으면 먼저 묻는다 — 이 내역만 / 모두 / 취소
//  ③ CSV: 이미 가져온 행은 건너뛴다(고친 내용 유지), 고른 경우에만 덮어쓴다, 중복 의심 표시
//  ④ 다른 달을 보는 중 추가하면 기본 날짜가 그 달
//  ⑤ 저장 중 버튼 글자, 검증 실패 칸 표시
// 빈 컬렉션은 뺀다 — 가짜 저장소는 없는 컬렉션을 읽기만 해도 빈 칸을 만든다
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(__store).filter(([, m]) => m.size).map(([c, m]) => [c, [...m.entries()].sort()])));
const pad = n => String(n).padStart(2, "0");
const confirmBox = () => document.querySelector(".confirm-overlay:not(.is-closing)");
// "날짜,가맹점,금액" (EUC-KR) + ASCII 행들 — 가져오기는 파일을 EUC-KR로 읽는다
const HEADER = [179, 175, 194, 165, 44, 176, 161, 184, 205, 193, 161, 44, 177, 221, 190, 215, 10];
const csvFile = lines => new File([new Uint8Array([...HEADER, ...new TextEncoder().encode(lines.join("\n"))])], "t22.csv", { type: "text/csv" });
async function pickFile(file) {
  const input = document.getElementById("csvFileInput");
  const dt = new DataTransfer(); dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await __wait(400);
}

export default async function () {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const closeAll = async () => { document.querySelectorAll(".modal-overlay:not(.hidden):not(.is-closing) .modal-close").forEach(b => b.click()); await __wait(320); };
  await closeAll();
  await __go("calendar"); await __settle();
  const ym = `${st.currentYear}-${pad(st.currentMonth)}`;

  // ① 전체 백업
  {
    const before = snapshot(); const w0 = __writes.length;
    let blob = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => { blob = b; return orig.call(URL, b); };
    // 검사 중에는 실제로 내려받지 않는다 — 예전에는 검사를 돌릴 때마다 가짜 데이터 백업 파일이
    // 다운로드 폴더에 저장됐다(저장 창이 떠서 진짜 백업처럼 보였다). 내려받기 직전의 클릭만 막고 이름을 본다.
    const origClick = HTMLAnchorElement.prototype.click;
    let fileName = null;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { fileName = this.download; return; } return origClick.call(this); };
    try {
      document.getElementById("backupBtn").click();
      await __wait(500);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
      URL.createObjectURL = orig;
    }
    t.ok(blob, "백업 파일이 만들어지지 않음");
    t.ok(/전체백업.*\.json$/.test(fileName ?? ""), `백업 파일 이름: ${fileName}`);
    if (blob) {
      const data = JSON.parse(await blob.text());
      for (const col of ["transactions", "fixed_items", "budget_plans", "wedding_items", "wedding_tasks", "wedding_vendors", "wedding_events"]) {
        const want = __store[col]?.size ?? 0, got = Object.keys(data.collections[col] ?? {}).length;
        t.ok(want === got, `백업 ${col}: ${got}건 (저장소 ${want}건)`);
      }
      const [id, doc] = [...__store.transactions.entries()][3];
      t.ok(JSON.stringify(data.collections.transactions[id]) === JSON.stringify(doc), "백업의 거래 문서가 저장소와 다름");
      t.ok(data.settings.budget && data.settings.wedding, "백업에 설정 문서가 없음");
      t.ok(data.app === "couple-budget" && data.formatVersion === 1 && data.exportedBy, "백업 머리 정보 누락");
    }
    t.ok(__writes.length === w0 && snapshot() === before, "백업이 저장소를 건드림");
  }

  // ② 카테고리 변경 확인
  {
    const mk = (id, day, cat) => __remote("transactions", id, { name: "t22 점심", memo: "t22 점심", amount: 9000, type: "expense", category: cat, kind: "variable", date: `${ym}-${pad(day)}`, year: st.currentYear, month: st.currentMonth });
    mk("t22a", 2, "food"); mk("t22b", 3, "food"); mk("t22c", 4, "food");
    await __wait(300); await __go("list"); await __settle();
    const openA = async () => { document.querySelector('#view-list .tx-item[data-id="t22a"]').click(); await __wait(250); };
    const pickCat = cat => document.querySelector(`#txCategoryChips .cat-chip[data-cat="${cat}"]`).click();
    const cats = () => ["t22a", "t22b", "t22c"].map(id => __store.transactions.get(id).category).join(",");

    // 취소 → 아무것도 저장되지 않고 창은 열린 채
    await openA(); pickCat("culture");
    document.getElementById("saveTxBtn").click(); await __wait(250);
    const box = confirmBox();
    t.ok(box && /2건/.test(box.textContent) && box.querySelector(".confirm-alt"), `일괄 변경 전에 묻지 않음: ${box?.textContent.replace(/\s+/g, " ")}`);
    box?.querySelector(".confirm-cancel").click(); await __wait(300);
    t.ok(cats() === "food,food,food", `취소했는데 저장됨: ${cats()}`);
    t.ok(!document.getElementById("txModal").classList.contains("hidden"), "취소했는데 입력 창이 닫힘");

    // 이 내역만
    document.getElementById("saveTxBtn").click(); await __wait(250);
    confirmBox()?.querySelector(".confirm-alt")?.click(); await __wait(500);
    t.ok(cats() === "culture,food,food", `이 내역만: ${cats()}`);

    // 모두 바꾸기
    await __settle(); await openA(); pickCat("shopping");
    document.getElementById("saveTxBtn").click(); await __wait(250);
    confirmBox()?.querySelector(".confirm-ok")?.click(); await __wait(500);
    t.ok(cats() === "shopping,shopping,shopping", `모두 바꾸기: ${cats()}`);

    // 같은 이름이 더 없으면 묻지 않는다
    await __settle(); await openA(); pickCat("food");
    document.getElementById("txMemo").value = "t22 혼자";
    document.getElementById("saveTxBtn").click(); await __wait(400);
    t.ok(!confirmBox() && __store.transactions.get("t22a").category === "food", "대상이 없는데 물음");
    for (const id of ["t22a", "t22b", "t22c"]) __remote("transactions", id, null);
    await __wait(300); await closeAll();
  }

  // ③ CSV 다시 가져오기
  {
    const rows = [`${ym}-05,T22 CAFE,4500`, `${ym}-06,T22 MART,32000`, `${ym}-07,T22 TAXI,8800`];
    __remote("transactions", "t22manual", { name: "직접 입력", memo: "", amount: 8800, type: "expense", category: "transport", kind: "variable", date: `${ym}-07`, year: st.currentYear, month: st.currentMonth });
    await __wait(300);
    document.getElementById("csvImportBtn").click(); await __wait(250);
    await pickFile(csvFile(rows));
    const prev1 = document.getElementById("csvPreview").innerText.replace(/\s+/g, " ");
    t.ok(/새 내역 3건/.test(prev1), `처음 미리보기: ${prev1.slice(0, 60)}`);
    t.ok(/중복 의심/.test(prev1), "직접 입력한 같은 날·금액 내역을 표시하지 않음");
    document.getElementById("csvImportConfirm").click(); await __wait(600);
    const mine = [...__store.transactions.entries()].filter(([id]) => id.startsWith(`csv_${ym}`));
    t.ok(mine.length === 3, `가져온 문서 ${mine.length}건`);
    // 가져온 뒤 카테고리와 이름을 고쳐 둔다
    const [editedId] = mine.find(([, d]) => d.name === "T22 CAFE");
    __remote("transactions", editedId, { category: "food", name: "단골 카페" }, true); await __wait(300);

    // 같은 파일 + 새 행 하나 — 이미 있는 3건은 건너뛴다
    const w0 = __writes.length;
    document.getElementById("csvImportBtn").click(); await __wait(250);
    await pickFile(csvFile([...rows, `${ym}-08,T22 BOOK,15000`]));
    const prev2 = document.getElementById("csvPreview").innerText.replace(/\s+/g, " ");
    t.ok(/새 내역 1건/.test(prev2) && /이미 있음 3건/.test(prev2), `다시 가져오기 미리보기: ${prev2.slice(0, 70)}`);
    t.ok(/1건 가져오기/.test(document.getElementById("csvImportConfirm").textContent), `버튼: ${document.getElementById("csvImportConfirm").textContent}`);
    document.getElementById("csvImportConfirm").click(); await __wait(600);
    const wrote = __writes.slice(w0);
    t.ok(wrote.length === 1 && wrote[0].op === "create", `건너뛰기인데 쓰기: ${wrote.map(w => w.op + ":" + w.id).join(", ")}`);
    t.ok(__store.transactions.get(editedId).name === "단골 카페" && __store.transactions.get(editedId).category === "food", "고친 내용이 CSV 값으로 되돌아감");

    // 덮어쓰기를 고르면 CSV 값으로
    document.getElementById("csvImportBtn").click(); await __wait(250);
    await pickFile(csvFile(rows));
    t.ok(document.getElementById("csvImportConfirm").classList.contains("hidden"), "새 내역이 없는데 가져오기 버튼이 보임");
    document.getElementById("csvOverwrite").click(); await __wait(50);
    t.ok(/3건 가져오기/.test(document.getElementById("csvImportConfirm").textContent), "덮어쓰기를 골라도 버튼이 그대로");
    document.getElementById("csvImportConfirm").click(); await __wait(600);
    t.ok(__store.transactions.get(editedId).name === "T22 CAFE", "덮어쓰기를 골랐는데 그대로");
    for (const [id] of [...__store.transactions.entries()].filter(([id]) => id.startsWith(`csv_${ym}`))) __remote("transactions", id, null);
    __remote("transactions", "t22manual", null); await __wait(300); await closeAll();
  }

  // ④ 기본 날짜 — 목록에서 본다 (달력에서는 + 가 "고른 날짜"로 열리고, 앞선 검사가 고른 날이 남아 있을 수 있다)
  {
    await __go("list"); await __settle();
    const today = new Date(); const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    document.getElementById("addTxBtn").click(); await __wait(200);
    t.ok(document.getElementById("txDate").value === todayStr, `이번 달 기본 날짜 ${document.getElementById("txDate").value}`);
    await closeAll();
    document.getElementById("prevMonth").click(); await __wait(500);
    document.getElementById("addTxBtn").click(); await __wait(200);
    const v = document.getElementById("txDate").value;
    t.ok(v.startsWith(`${st.currentYear}-${pad(st.currentMonth)}-`) && v !== todayStr, `지난달을 보는 중 기본 날짜 ${v}`);

    // ⑤ 검증 실패 칸 표시 + 저장 중 글자 + 날짜가 들어간 안내
    document.getElementById("saveTxBtn").click(); await __wait(50);
    t.ok(document.getElementById("txAmount").classList.contains("invalid") && document.activeElement?.id === "txAmount", "금액이 비었는데 칸 표시·포커스 없음");
    document.getElementById("txAmount").value = "1200";
    document.getElementById("txAmount").dispatchEvent(new Event("input", { bubbles: true }));
    t.ok(!document.getElementById("txAmount").classList.contains("invalid"), "다시 입력해도 표시가 남음");
    window.__latency = 300;
    const save = document.getElementById("saveTxBtn");
    save.click(); await __wait(80);
    t.ok(save.disabled && /저장 중/.test(save.textContent), `저장 중 버튼: "${save.textContent}" disabled=${save.disabled}`);
    await __wait(900); window.__latency = 30;
    t.ok(save.textContent === "저장" && !save.disabled, `저장 뒤 버튼: "${save.textContent}"`);
    const toast = document.getElementById("toast").textContent;
    t.ok(new RegExp(`${st.currentMonth}월 \\d+일`).test(toast), `추가 안내에 날짜 없음: "${toast}"`);
    const added = [...__store.transactions.entries()].find(([, d]) => d.amount === 1200 && d.date === v);
    t.ok(added, "지난달 날짜로 저장되지 않음");
    if (added) __remote("transactions", added[0], null);
    document.getElementById("nextMonth").click(); await __wait(500);
  }
  await __settle();
  return t.done();
}
