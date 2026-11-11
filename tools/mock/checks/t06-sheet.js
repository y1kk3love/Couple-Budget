// t06 — 바텀시트 끌기: 배경막은 실제 요소(.modal-scrim, 클릭 통과), 끄는 동안 그 투명도만,
// 느리게 놓으면 360ms 스프링 복귀, 휙 내리면 손가락 속도를 이어 160~280ms ease-out으로 닫힘 (375×812)
const pe = (target, type, y) => target.dispatchEvent(new PointerEvent(type, {
  clientX: 120, clientY: y, bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, pointerType: "touch",
}));

export default async function () {
  const t = __expect();
  if (innerWidth > 768) { t.ok(false, "375×812에서 실행해야 함"); return t.done(); }

  // 결혼 탭에선 + 버튼이 결혼 항목 모달을 연다 — 달력에서 시작하고 열린 모달은 닫아 둔다
  document.querySelectorAll(".modal-overlay:not(.hidden) .modal-close").forEach(b => b.click());
  await __go("calendar"); await __settle();
  const overlay = document.getElementById("txModal");
  const sheet = overlay.querySelector(":scope > .modal");
  document.getElementById("mobAddBtn").click();
  await __wait(80);

  const scrim = overlay.querySelector(":scope > .modal-scrim");
  t.ok(scrim, "배경막 요소 .modal-scrim 없음");
  t.ok(scrim && getComputedStyle(scrim).pointerEvents === "none", "배경막이 클릭을 가로챔");
  const before = getComputedStyle(overlay, "::before").content;
  t.ok(before === "none", `예전 ::before 배경막이 남음 (content ${before})`);
  t.ok(document.elementFromPoint(10, 10) === overlay, `배경을 누르면 오버레이가 아닌 ${document.elementFromPoint(10, 10)?.className}`);

  await __settle();
  const header = sheet.querySelector(".modal-header");

  // 느린 끌기 → 제자리
  pe(header, "pointerdown", 300);
  let midOpacity = null;
  for (let i = 1; i <= 5; i++) {
    await __wait(20);
    pe(document, "pointermove", 300 + i * 12);
    if (i === 3) midOpacity = scrim?.style.opacity;
  }
  t.ok(midOpacity !== null && midOpacity !== "" && Number(midOpacity) < 1, `끄는 동안 배경막 투명도 ${midOpacity}`);
  t.ok(overlay.style.getPropertyValue("--scrim") === "", "오버레이에 --scrim 변수를 아직 씀");
  await __wait(120);
  pe(document, "pointerup", 360);
  t.ok(sheet.style.transition.includes("360ms"), `복귀 전환 ${sheet.style.transition}`);
  t.ok(sheet.style.transform === "", `복귀 뒤 변형 ${sheet.style.transform}`);
  await __wait(400);

  // 휙 내림 → 속도를 이어 닫힘
  pe(header, "pointerdown", 300);
  for (let i = 1; i <= 3; i++) { await __wait(8); pe(document, "pointermove", 300 + i * 40); }
  pe(document, "pointerup", 420);
  const m = sheet.style.transition.match(/transform (\d+)ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  const d = m ? Number(m[1]) : NaN;
  t.ok(m && d >= 160 && d <= 280, `닫기 전환 "${sheet.style.transition}"`);
  t.ok(sheet.style.transform === "translateY(105%)", `닫기 변형 ${sheet.style.transform}`);
  await __wait((Number.isFinite(d) ? d : 280) + 80);
  t.ok(overlay.classList.contains("hidden"), `휙 내린 뒤 시트가 닫히지 않음: ${overlay.className}`);

  // 확인 다이얼로그도 배경막 요소, 배경 누르면 취소
  const { showConfirm } = await import(__appUrl("js/utils.js"));
  const p = showConfirm("t06");
  const cov = document.querySelector(".confirm-overlay:not(.is-closing)");
  t.ok(cov && cov.querySelector(":scope > .modal-scrim"), "확인창에 .modal-scrim 없음");
  cov?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const v = await Promise.race([p, __wait(500).then(() => "timeout")]);
  t.ok(v === false, `확인창 배경 클릭 결과 ${v}`);
  await __wait(250);

  return t.done({ closeMs: d });
}
