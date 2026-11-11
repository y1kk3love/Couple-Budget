// firebase-auth 흉내 — 바로 첫 번째 계정으로 로그인된다
//  ?user=2        두 번째 계정으로
//  ?signedOut=1   로그인 화면에서 시작 (버튼을 누르면 로그인)
//  ?authDelay=ms  세션 복원이 늦는 상황 (로그인 버튼 잠금 확인용)
//  window.__loginAs(email|null) : 다른 계정으로 로그인/로그아웃한 것처럼 인증 콜백 호출
const params = new URLSearchParams(globalThis.location?.search ?? "");
const who = params.get("user") === "2" ? "jieun@example.com" : "minsu@example.com";
let cb = null;
export function getAuth() { return {}; }
export class GoogleAuthProvider {}
export async function signInWithPopup() { globalThis.__popupCalls = (globalThis.__popupCalls ?? 0) + 1; cb?.({ email: who }); return { user: { email: who } }; }
export async function signOut() { cb?.(null); }
export function onAuthStateChanged(auth, fn) {
  cb = fn;
  setTimeout(() => fn(params.get("signedOut") === "1" ? null : { email: who }), Number(params.get("authDelay")) || 0);
  return () => {};
}
globalThis.__loginAs = email => cb?.(email ? { email } : null);
