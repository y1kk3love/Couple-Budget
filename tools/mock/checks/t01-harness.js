// t01 — 검증 도구 자체 점검: 전역 도우미와 목업 스냅샷의 docChanges()
export default async function () {
  const t = __expect();
  for (const g of ["__check", "__expect", "__visible", "__wait", "__settle", "__go"]) {
    t.ok(typeof window[g] === "function", `${g} 함수 없음`);
  }
  for (const g of ["__listenersLog", "__vibrations", "__animateCalls"]) {
    t.ok(Array.isArray(window[g]), `${g} 배열 없음`);
  }

  const fs = await import(__appUrl("tools/mock/sdk-firestore.js"));
  const snaps = [];
  const unsub = fs.onSnapshot(fs.collection(null, "t01col"), s => snaps.push(s));
  await __wait(120); // 첫 스냅샷
  const last = () => {
    const s = snaps.at(-1);
    return s && typeof s.docChanges === "function"
      ? JSON.stringify(s.docChanges().map(c => `${c.type}:${c.doc.id}`))
      : "docChanges 없음";
  };

  __remote("t01col", "a", { v: 1 });
  t.ok(last() === '["added:a"]', `추가: ${last()}`);
  __remote("t01col", "a", { v: 2 }, true);
  t.ok(last() === '["modified:a"]', `수정: ${last()}`);
  __remote("t01col", "a", null);
  t.ok(last() === '["removed:a"]', `삭제: ${last()}`);
  unsub();

  return t.done({ snapshots: snaps.length });
}
