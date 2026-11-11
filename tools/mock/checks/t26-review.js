// t26 — 배포 전 검토(2026-11-11)에서 나온 문제들
//  ① 내역 저장: 같은 이름 건수를 세는 동안(실시간 사본이 없을 때 생기는 틈) 다른 내역으로 넘어가거나
//     창을 닫고 새로 열어도, 처음 누른 저장이 엉뚱한 내역에 쓰이지 않는다
//  ② 카테고리 칩·지출/수입·변동/고정만 바꿔도 "입력함"으로 친다 (배경을 눌렀을 때 묻는다)
//  ③ 창을 닫자마자 다른 창을 여는 흐름(통계 → 카테고리 상세 → 행)에서도 뒤로가기 계수가 맞는다
// ※ ①은 실시간 사본을 끊었다가 다시 잇는다 — 이 검사 뒤에 다른 검사를 돌려도 된다.
const isOpen = id => { const el = document.getElementById(id); return !el.classList.contains("hidden") && !el.classList.contains("is-closing"); };
const confirmBox = () => document.querySelector(".confirm-overlay:not(.is-closing)");
const txWrites = from => __writes.slice(from).filter(w => w.col === "transactions").map(w => `${w.op}:${w.id}`);

export default async function () {
  const t = __expect();
  const st = (await import(__appUrl("js/state.js"))).default;
  const db = await import(__appUrl("js/db.js"));
  const sync = await import(__appUrl("js/sync.js"));
  const closeAll = async () => {
    confirmBox()?.querySelector(".confirm-cancel")?.click();
    document.querySelectorAll(".modal-overlay:not(.hidden):not(.is-closing) .modal-close").forEach(b => b.click());
    await __wait(350);
  };
  const otherChip = () => [...document.querySelectorAll("#txCategoryChips .cat-chip")].find(c => !c.classList.contains("active"));
  await closeAll();

  // ① 저장을 누른 뒤 세는 동안 다른 내역으로 넘어감
  {
    await __go("list"); await __settle();
    // 같은 이름의 내역이 더 있어 "최근 내역" 패널이 뜨는 것을 고른다
    const plain = st.transactions.filter(x => !x.fromFixed);
    const a = plain.find(x => plain.some(y => y.id !== x.id && y.name === x.name && y.type === x.type));
    t.ok(a, "같은 이름이 둘 이상인 내역이 없음 (검사 준비)");
    if (a) {
      // A: 저장 → 세는 동안 아래 패널의 다른 내역 B를 누름
      document.querySelector(`#view-list .tx-item[data-id="${CSS.escape(a.id)}"]`).click(); await __wait(450);
      const rowB = document.querySelector("#txContextPanel .ctx-row");
      t.ok(rowB, "최근 내역 패널에 행이 없음 (검사 준비)");
      const before = JSON.stringify([...__store.transactions.entries()].sort());
      otherChip().click();
      db.unwatchTransactions();            // 실시간 사본 없음 → 건수를 직접 조회로 센다
      window.__latency = 700;
      const w0 = __writes.length;
      document.getElementById("saveTxBtn").click(); await __wait(120);
      rowB?.click(); await __wait(1600);
      t.ok(!confirmBox(), "다른 내역으로 넘어갔는데 처음 내역의 확인 창이 뜸");
      t.ok(txWrites(w0).length === 0, `다른 내역으로 넘어갔는데 저장이 실행됨: ${txWrites(w0).join(", ")}`);
      t.ok(JSON.stringify([...__store.transactions.entries()].sort()) === before, "저장소의 내역이 바뀜 (A→B 덮어쓰기)");
      t.ok(isOpen("txModal") && !document.getElementById("saveTxBtn").disabled, "넘어간 뒤 창이 닫혔거나 저장 버튼이 잠겨 있음");
      await closeAll();

      // B: 저장 → 세는 동안 X로 닫고 + 로 새 창을 엶
      window.__latency = 30;
      document.querySelector(`#view-list .tx-item[data-id="${CSS.escape(a.id)}"]`).click(); await __wait(450);
      otherChip().click();
      db.invalidateBalanceCache();          // 앞 단계에서 채워진 전체 내역 캐시를 비워, 세는 동안의 틈을 다시 만든다
      window.__latency = 700;
      const w1 = __writes.length;
      document.getElementById("saveTxBtn").click(); await __wait(120);
      document.getElementById("modalClose").click(); await __wait(350);
      document.getElementById("addTxBtn").click(); await __wait(1500);
      t.ok(!confirmBox(), "창을 닫고 새로 열었는데 처음 내역의 확인 창이 뜸");
      t.ok(txWrites(w1).length === 0, `창을 닫고 새로 열었는데 저장이 실행됨: ${txWrites(w1).join(", ")}`);
      t.ok(JSON.stringify([...__store.transactions.entries()].sort()) === before, "저장소의 내역이 바뀜 (닫은 뒤 추가)");
      t.ok(!document.getElementById("saveTxBtn").disabled, "새 창의 저장 버튼이 잠겨 있음");
      await closeAll();
    }
    window.__latency = 30;
    sync.stopSync(); sync.startSync(); await __wait(400); // 실시간 사본 다시 잇기
    await db.fetchTransactions();
  }

  // ② 버튼으로만 바꾼 것도 입력이다
  {
    await __go("calendar"); await __settle();
    const cases = [
      ["카테고리 칩", () => otherChip()],
      ["지출/수입", () => document.querySelector("#txModal .type-btn:not(.active)")],
      ["변동/고정", () => document.querySelector("#txModal .kind-btn:not(.active)")],
    ];
    for (const [label, pick] of cases) {
      document.getElementById("addTxBtn").click(); await __wait(350);
      pick().click(); await __wait(50);
      document.getElementById("txModal").click(); await __wait(300); // 배경 누르기
      t.ok(isOpen("txModal") && confirmBox(), `${label}만 바꾼 뒤 배경을 누르면 묻지 않고 닫힘`);
      await closeAll(); await __wait(150);
    }
  }

  // ③ 닫자마자 여는 흐름의 뒤로가기 계수
  {
    await __go("stats"); await __settle();
    const bar = document.querySelector("#view-stats .cat-bar-item[data-cat-id]");
    t.ok(bar, "통계에 카테고리 막대가 없음 (검사 준비)");
    if (bar) {
      // 지금 항목에 표식을 남겨 "바닥"을 알아본다 (새로고침한 탭은 바닥 항목에도 예전 상태가 남아 있을 수 있다)
      const stamp = "t26-" + Date.now();
      history.replaceState({ ...(history.state ?? {}), t26: stamp }, "");
      const atBase = () => history.state?.t26 === stamp;
      bar.click(); await __wait(450);
      const row = document.querySelector("#categoryDetailBody .cd-row[data-tx-id]");
      t.ok(row, "카테고리 상세에 행이 없음 (검사 준비)");
      row?.click(); await __wait(700);
      const top = history.state?.couplebudgetLayer === true && !atBase();
      t.ok(isOpen("txModal") && !isOpen("categoryDetailModal"), "행을 눌렀는데 수정 창으로 넘어가지 않음");
      t.ok(top, "수정 창이 열려 있는데 방문 기록의 맨 위가 이 창의 항목이 아님 (닫을 때 앱을 벗어난다)");
      // 어긋난 상태에서 창을 닫으면 페이지를 떠나 검사가 죽는다 — 창을 연 채로 여기서 끝낸다 (이 뒤에는 새로고침)
      if (!top) return t.done({ note: "수정 창을 열어 둔 채 끝냄 — 페이지를 새로고침할 것" });
      {
        document.getElementById("modalClose").click(); await __wait(600);
        t.ok(location.pathname.includes("mock") && atBase(), "닫은 뒤 쌓아 둔 항목이 남거나 바닥을 지나침");
        document.getElementById("addTxBtn").click(); await __wait(350);
        history.back(); await __wait(450);
        t.ok(!isOpen("txModal") && atBase(), "그 뒤 뒤로가기로 창이 닫히지 않거나 바닥을 지나침");
      }
    }
    await closeAll();
  }

  await __go("calendar"); await __settle();
  return t.done();
}
