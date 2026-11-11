// 모든 앱·도구 스크립트의 문법 검사 — `node tools/check-syntax.js` (npm run check)
// package.json의 "type": "module" 덕분에 .js를 ES 모듈로 읽는다. 그게 없으면 Node는 .js를
// CommonJS로 보고, import/export가 있는 파일은 문법 오류가 있어도 --check를 그냥 통과시킨다.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dirs = ["", "js", "js/views", "js/modals", "tools", "tools/mock", "tools/mock/checks", "tests"];
const files = dirs.flatMap(d => readdirSync(root + d).filter(f => f.endsWith(".js")).map(f => (d ? d + "/" : "") + f));

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", root + f], { encoding: "utf8" });
  if (r.status !== 0) { failed++; console.error(`✗ ${f}\n${r.stderr}`); }
}
console.log(failed ? `${failed}개 파일에 문법 오류` : `문법 검사 통과 (${files.length}개 파일)`);
process.exit(failed ? 1 : 0);
