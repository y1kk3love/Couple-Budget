// Node 테스트 준비 — `npm test` (= node --import ./tests/setup.js --test "tests/*.test.js")
// 앱 모듈은 Firebase SDK를 https 주소로 가져오므로, 그 주소와 firebase.js를 tools/mock/의
// 가짜 모듈로 돌려 준다 (브라우저 목업의 import map과 같은 일). 실제 Firebase에는 닿지 않는다.
import { register } from "node:module";

globalThis.window = globalThis;
globalThis.location = { search: "", href: "http://localhost/" };
globalThis.__latency = 0; // 가짜 Firestore의 응답 지연 — 테스트에서 바꿔 가며 쓴다

register("./hooks.js", import.meta.url);
