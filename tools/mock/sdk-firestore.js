// 인메모리 Firestore 흉내 — 앱이 쓰는 API만 구현 (브라우저 목업과 Node 테스트가 같이 쓴다)
//  window.__latency     : 응답 지연(ms, 기본 30)
//  window.__failWrites  : true면 쓰기 실패
//  window.__failReads   : true면 읽기(getDocs/getDoc/리스너 시작) 실패
//  window.__remote(col, id, data|null, merge?) : "상대 기기"의 쓰기 — 리스너에 hasPendingWrites:false로 알림
//  window.__readCount   : 서버 읽기(문서 수) 누계
//  window.__writes      : 이 기기(앱 코드)의 쓰기 기록 [{ op, col, id }] — "기존 데이터를 건드리지 않는다" 검사용
//  window.__resetStore(data?) : 저장소를 주어진 내용(없으면 시드)으로 되돌린다 — 테스트용
import { seed } from "./seed.js";
const W = globalThis;
const params = new URLSearchParams(W.location?.search ?? "");
const store = {};
const colMap = name => (store[name] ??= new Map());
const clone = v => (v == null ? v : structuredClone(v));
function load(data) {
  for (const k of Object.keys(store)) delete store[k];
  for (const [col, docs] of Object.entries(data)) store[col] = new Map(Object.entries(clone(docs)));
}
load(seed());
let seq = 0;
const DEL = { __delete: true };
const autoId = () => "auto" + (++seq) + Math.random().toString(36).slice(2, 7);
const delay = () => new Promise(r => setTimeout(r, W.__latency ?? 30));
const wdelay = async () => { await delay(); if (W.__failWrites) throw new Error("mock network error"); };
const rdelay = async () => { await delay(); if (W.__failReads || W.__failCode) { const e = new Error("mock read failure"); e.code = W.__failCode ?? "unavailable"; throw e; } };
W.__readCount = 0;
W.__writes = [];
const logWrite = (op, col, id) => W.__writes.push({ op, col, id });
// ?reduce=1 → 동작 줄이기 설정 흉내 (JS 쪽 matchMedia만)
if (params.get("reduce") === "1") { const mm = W.matchMedia.bind(W); W.matchMedia = q => q.includes("prefers-reduced-motion: reduce") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q); }
// ?nostorage=1 → 사이트 데이터 차단 흉내: localStorage 접근 시 SecurityError
if (params.get("nostorage") === "1") Object.defineProperty(W, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
// ?deny=transactions,budget_plans → 해당 컬렉션 리스너 권한 오류
if (params.get("deny")) W.__denyListen = params.get("deny").split(",");
// ?offline=1 → 처음부터 읽기 실패 (첫 로드 실패 재현용)
if (params.get("offline") === "1") W.__failReads = true;
// ?noindex=1 → 복합 색인 누락 오류 재현
if (params.get("noindex") === "1") W.__failCode = "failed-precondition";

export function getFirestore() { return {}; }
export function collection(db, name) { return { kind: "col", name }; }
export function doc(a, name, id) {
  // doc(collectionRef) → 자동 ID
  if (a && a.kind === "col") return { kind: "doc", col: a.name, id: autoId() };
  return { kind: "doc", col: name, id };
}
export function where(field, op, val) { return { t: "where", field, op, val }; }
export function orderBy(field, dir = "asc") { return { t: "order", field, dir }; }
export function query(col, ...cs) { return { kind: "query", name: col.name, cs }; }
export function deleteField() { return DEL; }

function snapOf(col, id, data, pending = false) {
  return { id, ref: doc(null, col, id), exists: () => data != null, data: () => clone(data), metadata: { hasPendingWrites: pending, fromCache: false } };
}
function runQuery(name, cs = []) {
  let rows = [...colMap(name).entries()];
  for (const c of cs) if (c.t === "where") rows = rows.filter(([, d]) => c.op === "==" ? d[c.field] === c.val : true);
  const ord = cs.find(c => c.t === "order");
  // 실제 Firestore처럼 orderBy 필드가 없는 문서는 결과에서 뺀다
  if (ord) rows = rows.filter(([, d]) => d[ord.field] !== undefined);
  if (ord) rows.sort((a, b) => String(a[1][ord.field]).localeCompare(String(b[1][ord.field])) * (ord.dir === "desc" ? -1 : 1));
  return rows.map(([id, d]) => snapOf(name, id, d));
}
export async function getDocs(q) {
  await rdelay();
  const docs = runQuery(q.name, q.cs);
  W.__readCount += Math.max(1, docs.length);
  return { docs, size: docs.length, empty: !docs.length };
}
export async function getDoc(ref) { await rdelay(); W.__readCount++; return snapOf(ref.col, ref.id, colMap(ref.col).get(ref.id) ?? null); }

// ── 리스너 ──
const listeners = new Set();
function fire(l, pending) {
  if (l.target.kind === "doc") {
    l.cb(snapOf(l.target.col, l.target.id, colMap(l.target.col).get(l.target.id) ?? null, pending));
  } else {
    const docs = runQuery(l.target.name, l.target.cs ?? []);
    // 실제 Firestore처럼 이 리스너가 직전에 받은 문서와 비교한 변경 목록 (첫 스냅샷은 전부 added)
    const prev = l.prev ?? new Map();
    const next = new Map(docs.map(d => [d.id, JSON.stringify(d.data())]));
    const changes = [];
    for (const d of docs) {
      const p = prev.get(d.id);
      if (p === undefined) changes.push({ type: "added", doc: d });
      else if (p !== next.get(d.id)) changes.push({ type: "modified", doc: d });
    }
    for (const id of prev.keys()) if (!next.has(id)) changes.push({ type: "removed", doc: snapOf(l.target.name, id, null) });
    l.prev = next;
    l.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: { hasPendingWrites: pending, fromCache: false } });
  }
}
function notify(col, pending) {
  for (const l of [...listeners]) {
    const c = l.target.kind === "doc" ? l.target.col : l.target.name;
    if (c === col) fire(l, pending);
  }
}
// window.__denyListen = ["budget_plans"] → 해당 컬렉션 리스너는 permission-denied
export function onSnapshot(target, cb, errCb) {
  const l = { target, cb, errCb };
  listeners.add(l);
  setTimeout(() => {
    if (!listeners.has(l)) return;
    if (W.__failReads) { const e = new Error("mock offline"); e.code = "unavailable"; listeners.delete(l); errCb?.(e); return; }
    if ((W.__denyListen ?? []).includes(target.kind === "doc" ? target.col : target.name)) { const e = new Error("denied"); e.code = "permission-denied"; listeners.delete(l); errCb?.(e); return; }
    const c = target.kind === "doc" ? target.col : target.name;
    W.__readCount += target.kind === "doc" ? 1 : Math.max(1, colMap(c).size);
    fire(l, false);
  }, W.__latency ?? 30);
  return () => listeners.delete(l);
}
W.__listenerCount = () => listeners.size;

function deepMerge(t, s) {
  for (const [k, v] of Object.entries(s)) {
    if (v === DEL) delete t[k];
    else if (v && typeof v === "object" && !Array.isArray(v) && t[k] && typeof t[k] === "object") deepMerge(t[k], v);
    else t[k] = clone(v);
  }
  return t;
}
function applySet(ref, data, opts) {
  const m = colMap(ref.col);
  logWrite(opts?.merge ? "merge" : (m.has(ref.id) ? "overwrite" : "create"), ref.col, ref.id);
  if (opts?.merge) m.set(ref.id, deepMerge(m.get(ref.id) ?? {}, data));
  else m.set(ref.id, clone(data));
}
function applyUpdate(ref, data) {
  const m = colMap(ref.col); const cur = m.get(ref.id);
  if (!cur) { const e = new Error("not-found: " + ref.col + "/" + ref.id); e.code = "not-found"; throw e; }
  logWrite("update", ref.col, ref.id);
  for (const [k, v] of Object.entries(data)) {
    const path = k.split("."); let o = cur;
    for (const p of path.slice(0, -1)) o = (o[p] ??= {});
    const last = path.at(-1);
    if (v === DEL) delete o[last]; else o[last] = clone(v);
  }
}
function applyDelete(ref) { logWrite("delete", ref.col, ref.id); colMap(ref.col).delete(ref.id); }

export async function addDoc(col, data) { await wdelay(); const id = autoId(); logWrite("create", col.name, id); colMap(col.name).set(id, clone(data)); notify(col.name, true); return { id }; }
export async function setDoc(ref, data, opts) { await wdelay(); applySet(ref, data, opts); notify(ref.col, true); }
export async function updateDoc(ref, data) { await wdelay(); applyUpdate(ref, data); notify(ref.col, true); }
export async function deleteDoc(ref) { await wdelay(); applyDelete(ref); notify(ref.col, true); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push([r.col, () => applySet(r, d, o)]),
    update: (r, d) => ops.push([r.col, () => applyUpdate(r, d)]),
    delete: r => ops.push([r.col, () => applyDelete(r)]),
    commit: async () => { await wdelay(); ops.forEach(([, f]) => f()); new Set(ops.map(([c]) => c)).forEach(c => notify(c, true)); },
  };
}

// 상대 기기의 쓰기 흉내 (__writes에는 남기지 않는다)
W.__remote = (col, id, data, merge = false) => {
  if (data == null) colMap(col).delete(id);
  else if (merge) colMap(col).set(id, deepMerge(colMap(col).get(id) ?? {}, clone(data)));
  else colMap(col).set(id, clone(data));
  notify(col, false);
};
W.__store = store;
W.__resetStore = (data = seed()) => { load(data); W.__writes.length = 0; W.__readCount = 0; };
