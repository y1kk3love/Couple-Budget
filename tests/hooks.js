// 모듈 주소 바꿔치기 (tests/setup.js가 등록) — Firebase SDK와 firebase.js → tools/mock/
const root = new URL("../", import.meta.url);
const SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js$/;
const realFirebase = new URL("firebase.js", root).href;
const mockFirebase = new URL("tools/mock/firebase.js", root).href;

export async function resolve(specifier, context, nextResolve) {
  const sdk = SDK.exec(specifier);
  if (sdk) return { url: new URL(`tools/mock/sdk-${sdk[1]}.js`, root).href, shortCircuit: true };
  const res = await nextResolve(specifier, context);
  if (res.url === realFirebase) return { ...res, url: mockFirebase };
  return res;
}
