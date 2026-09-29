# 모션 검수·개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서의 모션 원칙·타이밍 기준·교정 12항목·시그니처 효과 6가지를 구현한다.

**Architecture:** 모든 모션 로직은 `js/motion.js`(다른 앱 모듈 import 없음) 한 파일에 모으고, 화면·모달은 새 함수
(`rollNumber`, `animateNextRender`/`captureLayout`/`playLayout`, `highlightRows`, `setupDragReorder`, `revealTheme`,
`haptic`, `setupTouchFeedback`)를 부른다. CSS는 `style.css` 모션 절에서 토큰·키프레임·동작 줄이기를 관리한다.
검증은 저장소 밖 목업(Firebase를 가짜 모듈로 바꾼 사본)에서 브라우저 체크 스크립트로 한다.

**Tech Stack:** 바닐라 ES 모듈(빌드 없음), CSS `@keyframes`·`linear()` 스프링, Web Animations API, View Transitions API(있을 때만),
Firebase Firestore 10.12 실시간 리스너(`docChanges()`).

**Spec:** `docs/superpowers/specs/2026-09-30-motion-polish-design.md`

## Global Constraints

- 기능·데이터 불변. 새 외부 라이브러리 없음.
- `js/motion.js`는 다른 앱 모듈을 import하지 않는다.
- `requestAnimationFrame`에 기대지 않는다: 시작 상태는 `offsetWidth`로 확정, 끝 처리는 `finished`/`transitionend` + 안전 타이머.
- 연속·반복 애니메이션은 `transform`·`opacity`·`clip-path`만. `transition: all` 금지.
- 모든 길이·곡선은 설계 문서 '타이밍 기준' 표의 값 그대로. `--ease-out` = `cubic-bezier(0.22, 1, 0.36, 1)`.
- 색은 토큰만. 예외: `--accent-fill` 위의 흰 체크 표시 `#fff`(흰 글씨 버튼과 같은 기존 예외).
- Firestore 값은 `escapeHtml()` — `data-flip-key`도 포함.
- 주석·UI 문자열은 한국어. 터치 기기 누름 영역 44px 유지.
- 모션 함수 내부 오류는 try/catch → `console.warn` → 최종 상태. 저장·렌더 흐름을 막지 않는다.
- 동작 줄이기는 설계 문서 '동작 줄이기 정책' 그대로.

## Review Focus

1. 자리 수·부호가 바뀌는 금액 굴림(999,000→1,000,000, +→−, 0→값): 최종 문자열이 정확하고 새 자리만 페이드 → Task 7 `rollEdge`.
2. 연달아 두 번 다시 그리기(정렬 연타, 저장 직후 상대 변경): 유령 행·인라인 변형이 남지 않음 → Task 8 `twiceRender`.
3. 스크롤된 목록·전체 기간 수백 행: 화면 안 행만(최대 60), 유령이 원래 자리에 뜸 → Task 8 `scrolled`·`bulk`.
4. 드래그 중 `pointercancel`(스크롤·시스템 제스처): 들린 상태가 남지 않고 그 순간 순서로 반영 → Task 12 `cancel`.
5. 테마 버튼 연타·전환 중 조작: `theme-switching`이 남지 않고 최종 테마 = 저장값 → Task 10 `doubleToggle`.

---

## 검증 방식 (모든 작업 공통)

- 저장소에는 테스트 도구가 없다. 목업은 세션 스크래치패드에 있다:
  `<scratchpad>` = `C:\Users\y1kk3\AppData\Local\Temp\claude\C--Users-y1kk3-OneDrive-Documents-Git-Couple-Budget\ad2897cd-2770-4cdc-b0dc-e9ce82bf8250\scratchpad`.
- 코드를 고칠 때마다 `bash "<scratchpad>/sync-mock.sh"` → Browser 창 목업 탭(`http://localhost:8010/`, launch 설정
  `couple-budget-mock`)을 다시 불러온다. URL 변형: `?reduce=1`(JS 쪽 동작 줄이기), `?user=2`.
- 체크는 `<scratchpad>/mock/__checks/tNN-*.js`(default export = async 함수, `{ pass, failures, info }` 반환).
  실행: javascript_tool에서 `await __check("tNN-name")`. "FAIL"/"pass"는 이 반환값의 `pass`.
- Browser 창은 대개 숨겨져 `document.hidden === true`이고 rAF·애니메이션 진행이 멈춘다. 체크는 애니메이션이
  만들어졌는지를 `getAnimations()`로 보고, 끝 상태는 `__settle()`로 확인한다. `document.hidden`을 보는 코드는 `__visible()`.
- 체크마다 적힌 뷰포트로 `resize_window`를 먼저 맞춘다(기본 1280×900).

---

### Task 1: 검증 도구 (저장소 밖, 커밋 없음)

**Files:**
- Modify: `<scratchpad>/mock/__mock/firestore.js` — `fire()`의 컬렉션 스냅샷에 `docChanges()`
- Create: `<scratchpad>/mock/__mock/checks.js`
- Modify: `<scratchpad>/sync-mock.sh` — 목업 `index.html`의 `<head>` 바로 뒤에 `<script type="module" src="/__mock/checks.js"></script>` 삽입
- Create: `<scratchpad>/mock/__checks/t01-harness.js`
- Modify: `.claude/launch.json` — `couple-budget-mock` 구성(포트 8010, `<scratchpad>/mock/tools/serve.ps1`) 추가 (gitignore 대상)

**Interfaces — Produces (페이지 전역, 앱보다 먼저 로드):**
- `__check(name): Promise<{pass, failures, info}>` — `/__checks/${name}.js?${Date.now()}`를 import해 default 실행
- `__expect(): { ok(cond: boolean, msg: string): void, done(info?): {pass, failures, info} }`
- `__visible()`(`document.hidden`→false, `visibilityState`→"visible"), `__wait(ms)`, `__settle()`(30ms 대기 → 유한 애니메이션 전부 `finish()` → 30ms), `__go(view)`(`.sidebar [data-view=view]` 클릭 후 300ms)
- `__listenersLog: {type, target: "document"|"window", options}[]` — `EventTarget.prototype.addEventListener`를 감싸 기록
- `__vibrations: (number|number[])[]` — `navigator.vibrate`를 기록용으로 대체(true 반환)
- `__animateCalls: {target, keyframes, options}[]` — `Element.prototype.animate`를 감싸 기록(원래 동작 유지)
- 목업 컬렉션 스냅샷의 `docChanges(): {type: "added"|"modified"|"removed", doc}[]` — 리스너별 직전 문서(JSON 문자열)와 비교, 첫 스냅샷은 전부 `added`

- [ ] **Step 1: `t01-harness.js` 작성** — 단언: 위 전역이 모두 있다. `import("/__mock/firestore.js")`의 `onSnapshot(collection(null, "t01col"), cb)` 등록 → `__remote("t01col", "a", {v: 1})` → 마지막 스냅샷 `docChanges()`가 `[{type: "added", doc.id: "a"}]` → `__remote("t01col", "a", {v: 2}, true)` → `"modified"` → `__remote("t01col", "a", null)` → `"removed"`.
- [ ] **Step 2: 실행 → FAIL** (`__check` 없음)
- [ ] **Step 3: 구현** 후 `sync-mock.sh` 실행, `preview_start couple-budget-mock`
- [ ] **Step 4: `await __check("t01-harness")` → pass**
- [ ] **Step 5: 커밋 없음** (저장소 변경 없음)

---

### Task 2: 타이밍 토큰·즉시 출발 퇴장·토스트·세그먼트 엄지·`transition: all`

**Files:**
- Modify: `style.css` — 모션 토큰 `:root`(49-58행), `button:active` 규칙(151행), `.modal` 등장(626행), 모바일 시트(1187행), 모션 절 `m-pop-in/out`·`.is-closing` 규칙(1264-1297행), `.seg-thumb`(1349행), `.toast.toast-out`(1362행), `transition: all` 5곳(230·607·732·783·889행)
- Modify: `js/motion.js` — `CLOSE_MS` 220 → 240
- Modify: `js/utils.js` — `showToast` 표시 2200 → 3000ms, 사라짐 타이머 200 → 180ms
- Create: `<scratchpad>/mock/__checks/t02-timing.js`

**Interfaces — Produces:** CSS 토큰 `--dur-press: 90ms`, `--dur-nav: 260ms`, `--dur-sheet: 480ms`(모션 토큰 블록).

- [ ] **Step 1: `t02-timing.js` 작성** — 단언:
  - 모든 스타일 규칙(`@media` 안 포함) 중 `style.transition`에 단독 키워드 `all`이 있는 것 0개.
  - `--dur-press`·`--dur-nav`·`--dur-sheet` 계산값이 `90ms`·`260ms`·`480ms`.
  - (1280×900) 목록 화면 `.seg-thumb`의 `transitionDuration`이 `0.3s`로 시작. `#addTxBtn` 클릭 → `#txModal > .modal`의 `animationName` `m-pop-in`, `animationDuration` `0.28s`. `#modalClose` 클릭 직후 `m-pop-out`, `0.16s`, `animationTimingFunction` `cubic-bezier(0.22, 1, 0.36, 1)`.
  - `showToast("t")` 뒤 2900ms에 `#toast`가 `hidden`·`toast-out` 둘 다 아님, 3300ms에 `hidden`.
  - (375×812, 별도 실행 `await __check("t02-timing")`에서 `innerWidth <= 768`이면 이 분기) `#mobAddBtn` 클릭 → 시트 `animationDuration` `0.48s`, 닫기 직후 `m-sheet-down`, `0.24s`, 같은 ease-out 곡선.
- [ ] **Step 2: 실행 → FAIL** (transition all 5곳, 토큰 없음, `0.38s` 등)
- [ ] **Step 3: 구현** — 값은 설계 표 그대로:
  - `m-pop-in`: `from { opacity: 0; transform: scale(0.96) translateY(6px) }`, `.modal`에 280ms `--ease-spring`.
  - `m-pop-out`: `to { opacity: 0; transform: scale(0.97) }`, 팝업·확인창 퇴장 160ms `--ease-out`.
  - 모바일 시트: 열기 `var(--dur-sheet)` `--ease-sheet`, 닫기 240ms `--ease-out`. 배경막 사라짐 200ms.
  - 토스트 사라짐 180ms `--ease-out`. `.seg-thumb` 전환 300ms(transform·width·height).
  - `button:active, [role="button"]:active`의 `90ms` → `var(--dur-press)`.
  - `transition: all` 5곳: 그 선택자의 `:hover`·`.active`·`.drag-over` 규칙이 실제로 바꾸는 속성(배경·글자색·테두리색)만 0.15s로 나열하고, `button` 요소면 `transform var(--dur-base) var(--ease-spring)`를 덧붙여 누름 스프링을 지킨다.
- [ ] **Step 4: 두 뷰포트에서 `await __check("t02-timing")` → pass**
- [ ] **Step 5: 커밋** `style: 모션 타이밍 토큰·즉시 출발 퇴장·토스트 3초·transition all 정리`

---

### Task 3: 눌림 피드백 — 아이폰 `:active`, 탭 하이라이트, 행 음영

**Files:**
- Modify: `js/motion.js` — `setupTouchFeedback()` 추가
- Modify: `js/app.js` — import, 파일 끝 부트스트랩의 `setupSegmentThumbs(); setupSheetDrag();` 옆에서 호출
- Modify: `style.css` — `html { -webkit-tap-highlight-color: transparent; }`, 1137-1145행 눌림 규칙 분리
- Create: `<scratchpad>/mock/__checks/t03-press.js`

**Interfaces — Produces:** `setupTouchFeedback(): void` — document에 빈 `touchstart` 리스너(`{ passive: true }`) 한 번.

- [ ] **Step 1: `t03-press.js` 작성** — 단언:
  - `__listenersLog.some(l => l.type === "touchstart" && l.target === "document" && l.options?.passive === true)`.
  - `getComputedStyle(document.documentElement).webkitTapHighlightColor === "rgba(0, 0, 0, 0)"`.
  - 선택자에 `.tx-item:active`가 있는 규칙: `background`에 `var(--surface-hover)`, `transform`은 비었거나 `none`. 같은 규칙에 `.fixed-item:active`·`.cd-row:active`·`.cat-bar-item.clickable:active`·`.cal-cell:active`.
  - `.budget-card:active`·`.mc-col:active` 규칙은 `transform: scale(0.98)`. `.cal-cell.empty:active`는 음영·변형 없음.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `fix: 아이폰에서도 눌림 효과가 보이도록 — 행은 배경 음영, 기본 탭 하이라이트 끔`

---

### Task 4: 스켈레톤 반짝임을 합성 단계로

**Files:**
- Modify: `style.css` — 1376-1398행(스켈레톤·로그인 대기 버튼)
- Create: `<scratchpad>/mock/__checks/t04-skeleton.js`

- [ ] **Step 1: `t04-skeleton.js` 작성** — 단언: `@keyframes m-shimmer` 텍스트에 `transform` 있고 `background-position` 없음. 임시 `<span class="skeleton">`의 `animationName === "none"`, `getComputedStyle(el, "::after").animationName === "m-shimmer"`. `.login-screen.auth-pending .google-btn::after` 규칙 존재. 어떤 `@keyframes`에도 `background-position` 없음.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현** — `.skeleton { position: relative; overflow: hidden; background: var(--surface2) }`, `::after`는 `inset: 0`의 그라데이션(transparent → `--surface3` → transparent)을 `translateX(-100%)` → `translateX(100%)`로 1.4s linear 무한. 로그인 대기 버튼도 같은 `::after`(버튼에 `position: relative; overflow: hidden`), 글자·아이콘 숨김은 유지.
- [ ] **Step 4: pass** — `?authDelay=15000&signedOut=1`로 대기 버튼이 스켈레톤으로 보이는지 스크린샷 1장
- [ ] **Step 5: 커밋** `perf: 스켈레톤 반짝임을 transform으로 — 매 프레임 다시 그리기 제거`

---

### Task 5: 화면 등장·월 이동 — 짧게, 연타 생략, 끝난 뒤 정리, 첫 로그인

**Files:**
- Modify: `js/motion.js` — `playEntrance`, `slideLabel`
- Modify: `js/app.js` — `let firstEntrance = false`: `initApp()`에서 `pendingEntrance = 0` 옆에서 켜고, `renderAll()`은 `playEntrance(view, pendingEntrance, { first: firstEntrance })` 뒤 끈다
- Modify: `style.css` — 1304-1341행
- Create: `<scratchpad>/mock/__checks/t05-entrance.js`

**Interfaces — Produces:** `playEntrance(view: HTMLElement, dir: -1|0|1 = 0, { first = false } = {}): void`, `slideLabel(el: HTMLElement, dir: -1|0|1): void`.
- 탭 등장: 새 키프레임 `m-rise-sm`(`from { opacity: 0; transform: translateY(6px) }`) 200ms `--ease-out`, 지연 `var(--i) × 20ms`, JS가 `--i = min(순번, 6)`.
- 첫 로그인: `.view.entering.first` → 현행 `m-rise` 480ms, 지연 `var(--i) × 28ms`, `--i` 상한 14.
- 월 이동: `m-slide-next/prev`를 24px로. `.view.entering.dir-*`와 `.month-label.label-*` 모두 `var(--dur-nav)` `--ease-out`.
- 막대 450ms, 지연 `calc(min(var(--i, 0), 6) * 20ms + 60ms)`. 월별 막대 420ms, 지연 `calc(var(--c, 0) * 30ms + 40ms)`. 도넛 500ms, 지연 60ms.
- 정리: 클래스를 붙이고 `offsetWidth`로 확정한 뒤, `view.getAnimations({ subtree: true })` 중 `animationName`이 `m-rise`·`m-rise-sm`·`m-slide-next`·`m-slide-prev`·`m-bar-grow`·`m-col-grow`·`m-donut`인 것의 `finished`를 모두 기다려 `entering`·`first`·`dir-*`를 걷는다. 1200ms 안전 타이머. 호출마다 새 토큰 — 이전 호출의 정리가 새 등장을 걷지 않게.
- 연타: `dir !== 0`인데 뷰에 `entering`과 `dir-*`가 아직 있으면 클래스만 걷고 새로 재생하지 않는다. `slideLabel`은 라벨에 재생 중인 애니메이션(`getAnimations().length`)이 있으면 클래스만 걷는다.

- [ ] **Step 1: `t05-entrance.js` 작성** — 단언(1280×900):
  - `__go("calendar"); __settle(); __go("stats")` 직후 `#view-stats`의 등장 애니메이션은 모두 `m-rise-sm`이고 `max(delay + duration) <= 320`. `m-bar-grow`는 duration 450.
  - `__wait(1000)` 뒤에도 `#view-stats.entering` 유지(900ms 고정 정리 아님), `__settle()` + 50ms 뒤 제거.
  - 달력에서 `#nextMonth` 클릭 → 250ms 뒤 `#view-calendar.entering.dir-next`, `m-slide-next` duration 260. 곧바로 한 번 더 → 250ms 뒤 `entering` 없고 `m-slide-*` 애니메이션 없음. 라벨도 두 번째에는 새 애니메이션 없음. 끝나면 `__settle()`, `#prevMonth` 두 번으로 복귀.
  - 결혼: `__remote("wedding_items", "t05-"+i, {name: "t05 "+i, category: "etc_w", planned: 100000, payer: "both", payments: [{label: "x", amount: 50000, date: "2026-09-01"}], order: 100+i})` 14개 → `__go("wedding")` → 1000ms 뒤에도 `#view-wedding.entering`. 끝나면 `__remote(…, null)` 14개.
  - 첫 로그인: `__loginAs(null)` → `__loginAs("minsu@example.com")` → 300ms 뒤 `#view-calendar.entering.first`, 등장 애니메이션 `m-rise`, duration 480.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**, `?reduce=1`에서 `__go("stats")` 뒤 `#view-stats`에 `entering` 없음
- [ ] **Step 5: 커밋** `feat: 탭 전환 0.32초·월 이동 0.26초 — 연타 생략, 애니메이션이 끝난 뒤 정리`

---

### Task 6: 시트 끌기 — 배경막 요소, 높이 1회 측정, 손가락 속도 이어 닫기

**Files:**
- Modify: `js/motion.js` — `openOverlay`(배경막 보장), `resetSheet`, `setupSheetDrag`
- Modify: `js/utils.js` — `showConfirm` 오버레이 템플릿 맨 앞에 `<div class="modal-scrim"></div>`
- Modify: `style.css` — 1273-1285행(`::before` 배경막 → `.modal-scrim`)
- Create: `<scratchpad>/mock/__checks/t06-sheet.js`

**Interfaces — Produces:**
- `.modal-scrim`: 오버레이 첫 자식 `div`. CSS `.modal-overlay > .modal-scrim { position: absolute; inset: 0; background: var(--overlay); pointer-events: none; animation: m-fade-in var(--dur-base) ease backwards; }`, `.modal-overlay.is-closing > .modal-scrim { animation: m-fade-out 200ms ease forwards; }`. `::before` 규칙과 `--scrim` 변수는 삭제.
- 끌기: 시작 시 `height = sheet.offsetHeight` 한 번. 이동마다 `scrim.style.opacity = max(0, 1 − dy / height)`. 닫기 판정은 현행 그대로.
- 휙 닫기: `d = clamp(4.5 × (height − dy) / max(속도, 0.01), 160, 280)`ms. `transform ${d}ms cubic-bezier(0.22, 1, 0.36, 1)`로 `translateY(105%)`, 배경막 `opacity ${d}ms` → 0, `d`ms 뒤 현행처럼 `data-dismissed` + `.modal-close` 클릭.
- 되돌아감: `transform 360ms var(--ease-spring)`, 배경막 인라인 투명도·전환 제거.

- [ ] **Step 1: `t06-sheet.js` 작성** — 단언(375×812):
  - `#mobAddBtn` 클릭 → `#txModal > .modal-scrim` 존재, 그 `pointerEvents === "none"`, `getComputedStyle(#txModal, "::before").content === "none"`, `document.elementFromPoint(10, 10) === #txModal`.
  - `__settle()` → 제목줄 `pointerdown`(y=300) → 20ms 간격 `pointermove` 5번(y=360까지): 도중 `scrim.style.opacity < 1`이고 `#txModal.style.getPropertyValue("--scrim") === ""` → 120ms 멈춤 → `pointerup` → `sheet.style.transition`에 `360ms`, `sheet.style.transform === ""`.
  - 다시 `pointerdown`(300) → 8ms 간격 3번에 y=420 → 곧바로 `pointerup` → `sheet.style.transition`이 `/transform (\d+)ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/`이고 160 ≤ d ≤ 280, `sheet.style.transform === "translateY(105%)"`. `d + 80`ms 뒤 `#txModal.hidden`.
  - `showConfirm("t")` 오버레이에 `.modal-scrim`. 오버레이 자신에 `click` 디스패치 → 약속이 `false`로 해결.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `feat: 시트를 휙 내리면 손가락 속도 그대로 닫힘 — 배경막을 실제 요소로`

---

### Task 7: 자리마다 굴러가는 금액 — `rollNumber`

**Files:**
- Modify: `js/motion.js` — `rollNumber` 추가, `animateCount` 삭제
- Modify: `js/app.js`(요약 카드 호출부 251행·import), `js/views/plan.js`(54행·import), `js/views/wedding.js`(111행·import)
- Modify: `style.css` — `.sr-only`, `.roll`, `.roll-d`, `.roll-s`, `.roll-c`
- Create: `<scratchpad>/mock/__checks/t07-roll.js`

**Interfaces — Produces:** `rollNumber(el: HTMLElement, key: string, to: number, format: (n: number) => string): void` — 인자와 key별 마지막 값 기억은 `animateCount`와 같다(처음 값은 0에서).
- 자리 대응(설계 §시그니처 1): `ns = format(to)`, `os = format(from)`. `ns`의 i번째 숫자는 `os[os.length − (ns.length − i)]`와 짝. 위로(`to ≥ from`): 시작 = 이전, 끝 = 새(더 작으면 +10). 아래로: 시작 = 이전 + 10, 끝 = 새(더 크면 그대로, 아니면 +10). 짝이 없으면 시작 = 끝 = 새이고 그 자리 opacity 0→1(300ms). 띠 `translateY(${−칸 × 5}%)`, 520ms `cubic-bezier(0.22, 1, 0.36, 1)`.
- DOM: `<span class="sr-only">최종</span><span class="roll" aria-hidden="true">`. 숫자 = `<span class="roll-d"><span class="roll-s">` + `<i>0</i>`…`<i>9</i>` 두 번 + `</span></span>`, 그 밖 = `<span class="roll-c">글자</span>`.
- 580ms 뒤 `el.textContent = 최종`(요소별 토큰이 같을 때만). 즉시 최종: 같은 값, `reducedMotion()`, `document.hidden`, 유한하지 않은 값.
- CSS: `.sr-only`(1px `clip` 패턴, `.cal-sign`과 같은 방식), `.roll { display: inline-flex; vertical-align: top; user-select: none }`, `.roll-d, .roll-c, .roll-s > i { display: block; height: 1.2em; height: 1lh; font-style: normal }`, `.roll-d { overflow: hidden; -webkit-mask-image/mask-image: linear-gradient(transparent, #000 15%, #000 85%, transparent) }`, `.roll-s { display: flex; flex-direction: column }`.

- [ ] **Step 1: `t07-roll.js` 작성** — `__visible()` → `m = await import("/js/motion.js")`, `fmt = v => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toLocaleString("ko-KR") + "원"`, body에 붙인 새 `div`들로. 단언:
  - `m.rollNumber(a, "k", 1234000, fmt)` → `a .sr-only`가 `"+1,234,000원"`, `.roll[aria-hidden="true"]`, `.roll-d` 7개.
  - `m.rollNumber(b, "k", 1251500, fmt)` → `.roll-s`의 `style.transform`이 순서대로 `[1,2,5,11,5,0,0]`의 `translateY(-n*5%)`.
  - `m.rollNumber(c, "k", 987000, fmt)` → `[9,8,7,10,10,10]`.
  - `rollEdge`: key `"k2"`로 999000 → 1000000 — 새 `.roll-d` 7개 중 첫 칸만 인라인 opacity 전환. 50000 → −20000 — `.sr-only` `"-20,000원"`. key `"k3"` 첫 호출 0 → `.roll` 없음(즉시).
  - 580ms 뒤 `b.textContent === "+1,251,500원"`, `.roll` 없음.
  - `document.hidden`을 true로 돌린 뒤 호출 → 즉시 최종 텍스트.
  - 앱: `__go("calendar")`, `#nextMonth` 클릭, 250ms 뒤 `.sum-card.hero .val`에 `.roll`이 있거나 텍스트가 `COUNT_FORMATS.signed` 모양(`/^[+-]?[\d,]+원$/`).
  - `"animateCount" in m === false`.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현** — 세 호출부를 `rollNumber`로 교체
- [ ] **Step 4: pass**, `?reduce=1`에서 `rollNumber` 즉시 최종
- [ ] **Step 5: 커밋** `feat: 금액이 자리마다 굴러가며 바뀜 (토스·NumberFlow 방식)`

---

### Task 8: 목록 자리 이동 — `animateNextRender` / `captureLayout` / `playLayout`

**Files:**
- Modify: `js/motion.js` — 세 함수, `playEntrance` 시작 시 스위치 끔
- Modify: `js/views/list.js` — `.tx-item`(304행)에 `data-flip-key`, `renderListView()`에 캡처·재생, 정렬 키(226행)·방향(228행)·필터 적용(186행)·초기화(196행) 핸들러에서 `renderListView()` 바로 앞에 `animateNextRender()`
- Modify: `js/views/fixed.js`(46행 행, `renderFixedView`), `js/views/wedding.js`(239행 행, `renderWeddingView`), `js/views/weddingEvents.js`(93행), `js/views/weddingVendors.js`(33행), `js/views/weddingChecklist.js`(37행)
- Modify: `js/modals/txModal.js`, `js/modals/fixedModal.js`, `js/modals/weddingModal.js` — 저장·삭제 성공 뒤, 재조회를 마치고 `renderAll()`/`renderWeddingView()`를 부르기 바로 앞에 `animateNextRender()`
- Modify: `style.css` — `.view { position: relative }`
- Create: `<scratchpad>/mock/__checks/t08-layout.js`

**Interfaces — Produces:**
- `animateNextRender(): void` — 스위치를 켜고 `queueMicrotask`로 끈다(같은 동기 호출 안에서만 유효).
- `captureLayout(root: HTMLElement): Map<string, {rect: DOMRect, node: HTMLElement}> | null` — 스위치가 켜져 있고 동작 줄이기가 아닐 때만 `[data-flip-key]` 위치 기록, 스위치 끔.
- `playLayout(root: HTMLElement, snap: Map | null): void` — 같은 키: `translate(Δx, Δy)` → `none` 280ms. 새 키: `opacity 0, scale(0.98)` → 1 240ms. 없어진 키: 이전 노드를 `root`에 `position: absolute; top/left/width = 이전 rect − 현재 root rect; pointer-events: none; margin: 0`로 다시 붙여 opacity → 0, `scale(0.98)` 200ms 뒤 제거. 이징 `cubic-bezier(0.22, 1, 0.36, 1)`. 이전·새 rect가 둘 다 화면(위아래 100px 여유) 밖이면 제외, 최대 60개. 읽기를 모두 끝낸 뒤 쓴다.
- 행 속성: 기존 ID 속성 옆에 `data-flip-key="${escapeHtml(id)}"`. 이후 작업(9·11)이 이 속성을 쓴다.

- [ ] **Step 1: `t08-layout.js` 작성** — 단언(1280×900):
  - 모든 `#view-list .tx-item`에 `data-flip-key`.
  - 정렬: `__go("list"); __settle()` → `[data-sort-key="amount"]` 클릭 → `translate` 키프레임, duration 280인 애니메이션이 있는 행 ≥ 1.
  - 실시간: `__settle()` → `__remote("transactions", "t08r", {type: "expense", amount: 1000, category: "food", name: "t08", date: 이번 달 15일, year, month})` → 300ms 뒤 `translate`·opacity 키프레임 애니메이션 0개.
  - 탭 이동: `__go("calendar"); __go("list")` → FLIP 애니메이션 0개(등장만).
  - 스위치 만료: `m.animateNextRender(); await __wait(0); __go("calendar"); __go("list")` → FLIP 0개.
  - 추가: 모달로 새 거래 저장 → 새 키 행에 `opacity: 0` 시작, duration 240 애니메이션.
  - 삭제: 행 클릭 → 삭제 → 확인 → 260ms 뒤 `#view-list > [data-flip-key]` 유령이 `position: absolute`·`pointer-events: none`, `__settle()` 뒤 유령 0개.
  - `twiceRender`: 금액 정렬 클릭 → 곧바로 날짜 정렬 클릭 → `__settle()` → 유령 0개, 모든 행 `style.transform === ""`, 행 애니메이션 0개.
  - `scrolled`: `.view-container.scrollTop = 300` → 화면 안 행 하나의 rect 기록 → 삭제 → 유령의 `getBoundingClientRect().top`이 기록값 ±2px.
  - `bulk`: `__remote`로 이번 달 거래 300개 추가 → 전체 기간 → 금액 정렬 → FLIP 걸린 행 ≤ 60, 모두 `top`이 `−100 ~ innerHeight+100` 안. 추가 문서 정리.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**, `?reduce=1`에서 정렬 변경 FLIP 0개
- [ ] **Step 5: 커밋** `feat: 내가 저장·삭제·정렬하면 행이 새 자리로 미끄러짐 (FLIP)`

---

### Task 9: 상대가 바꾼 내역 반짝임

**Files:**
- Modify: `js/db.js` — `watchTransactions`(56-73행) 원격 콜백에 변경 ID
- Modify: `js/sync.js` — `scheduleRender`, `listen`
- Modify: `js/app.js` — `renderRemoteChange`
- Modify: `js/motion.js` — `highlightRows`
- Modify: `style.css` — `@keyframes m-remote`, `.m-remote`
- Create: `<scratchpad>/mock/__checks/t09-remote.js`

**Interfaces:**
- Consumes: `data-flip-key`(Task 8).
- Produces: `watchTransactions(onRemoteChange: (ids: string[]) => void)`. `sync.js` 내부 `scheduleRender(ids: Iterable<string> = [])`(120ms 동안 합침). `renderRemoteChange(ids: Set<string> = new Set()): void` — 뷰를 다시 그렸을 때만 `highlightRows`. `highlightRows(root: HTMLElement, ids: Iterable<string>): void` — `[data-flip-key]`가 일치하는 행에 `.m-remote`(다시 붙이면 재생, `animationend`에 제거).
- ID = `snap.docChanges()` 중 `type !== "removed"`인 `doc.id`. 문서 스냅샷·첫 스냅샷·`hasPendingWrites`는 없음.
- CSS: `@keyframes m-remote { 0%, 30% { background-color: var(--accent-bg); } }`, `.m-remote { animation: m-remote 1600ms ease-out; }`.

- [ ] **Step 1: `t09-remote.js` 작성** — 단언:
  - 목록에서 `__remote("transactions", id, {이번 달 지출})` → 300ms 뒤 그 행만 `.m-remote`(`#view-list .m-remote` 1개).
  - 같은 문서 merge 수정 → 그 행 다시 `.m-remote`.
  - 필터 패널을 열어 `#f-name`에 포커스하고 글자 입력 → 원격 추가 → 300ms 뒤 `.m-remote` 0개.
  - 내 모달 저장으로 추가한 행 → `.m-remote` 없음.
  - 결혼 예산에서 `__remote("wedding_items", …)` → 그 행 `.m-remote`. 고정비 화면에서 `__remote("fixed_items", …)` → 그 행 `.m-remote`. 추가 문서 정리.
- [ ] **Step 2: 실행 → FAIL** (Task 1의 `docChanges` 필요)
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `feat: 상대가 방금 추가·수정한 내역이 은은하게 반짝임`

---

### Task 10: 테마 원형 전환 — `revealTheme`

**Files:**
- Modify: `js/motion.js` — `revealTheme`
- Modify: `js/theme.js` — 클릭 처리(59-63행)를 `revealTheme(btn, () => { writeSaved(…); applyTheme(); renderButton(btn); })`로
- Modify: `style.css` — `::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }`, `.theme-switching *, .theme-switching *::before, .theme-switching *::after { transition: none !important; }`
- Create: `<scratchpad>/mock/__checks/t10-theme.js`

**Interfaces — Produces:** `revealTheme(originEl: HTMLElement, update: () => void): void`.
- 교체 = `html.classList.add("theme-switching")` → `update()` → `offsetWidth` → 클래스 제거(동기).
- `document.startViewTransition`이 있고, 동작 줄이기가 아니고, `!document.hidden`이면 `startViewTransition(교체)`. `ready` 뒤 `document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 480, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" })`. x·y = 버튼 중심, `r = Math.hypot(Math.max(x, innerWidth − x), Math.max(y, innerHeight − y))`. `ready`·`finished` 거부는 삼킨다.
- 그 밖에는 교체만.

- [ ] **Step 1: `t10-theme.js` 작성** — 단언:
  - (VT 없음·숨은 창) 테마 버튼 클릭 → `data-theme` 뒤바뀜, `html.theme-switching` 없음, 50ms 뒤 `document.getAnimations().filter(a => a instanceof CSSTransition).length === 0`.
  - (VT 흉내) `document.startViewTransition = cb => { cb(); return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} }; }`, `__visible()` → 클릭 → `__animateCalls` 중 `options.pseudoElement === "::view-transition-new(root)"`, `options.duration === 480`, `keyframes.clipPath[0]`이 `circle(0px at`로 시작.
  - `doubleToggle`: 연속 두 번 클릭 → 50ms 뒤 테마가 처음과 같고 `localStorage.theme`와 `data-theme`가 일치, `theme-switching` 없음.
  - (`?reduce=1`) VT 흉내가 불리지 않음.
  - 흉내와 `document.hidden`을 원래대로.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `feat: 테마 버튼에서 원형으로 번지는 다크/라이트 전환 (View Transitions)`

---

### Task 11: 체크리스트 체크 그리기 + 안드로이드 진동

**Files:**
- Modify: `js/views/weddingChecklist.js` — 행 마크업(36-41행), 체크 처리(81-93행)
- Modify: `js/motion.js` — `haptic`
- Modify: `style.css` — `.wd-task-chk`·`.wd-task-title`(1006-1008행), 터치 크기(1251행), m-pop(1370-1373행)
- Create: `<scratchpad>/mock/__checks/t11-check.js`

**Interfaces — Produces:** `haptic(pattern: number | number[] = 10): void` — `navigator.vibrate`가 있을 때만, 예외 무시.
- 마크업: `<label class="wd-task-chk-hit"><input …기존…><svg class="chk-mark" viewBox="0 0 22 22" aria-hidden="true"><path pathLength="1" d="M6.2 11.4l3.2 3.2 6.6-7"/></svg></label>`. 제목은 `<span class="wd-task-title"><span class="strike">${escapeHtml(t.title)}</span></span>`.
- CSS: 입력 `appearance: none` 20px(터치 22px), 둥근 6px, 테두리 1.5px `--border-strong`, 체크 시 `--accent-fill` 배경·테두리. `.chk-mark`는 입력 위 절대 위치, `pointer-events: none`, 흰 선 굵기 2.4, `stroke-dasharray: 1`, 체크 안 됨 `stroke-dashoffset: 1`·체크됨 0. `.wd-task-chk:focus-visible` 윤곽.
- 완료 줄 `.strike`: `text-decoration: none`, `background: linear-gradient(currentColor, currentColor) 0 55% / 100% 1.5px no-repeat`, `box-decoration-break: clone`(+ `-webkit-`).
- `.m-pop`: 상자 `m-check-pop` 420ms `--ease-bounce`. `path`는 `m-check-draw`(dashoffset 1→0) 280ms 지연 60ms `backwards`. `.strike`는 `m-strike`(background-size 0→100%) 300ms 지연 80ms `backwards`.
- 체크(해제 아님) 저장 성공 뒤 `haptic(10)`.

- [ ] **Step 1: `t11-check.js` 작성** — 단언(1280×900, `__visible()`):
  - 결혼 → 체크리스트 세그먼트에서 체크 안 된 입력의 `appearance === "none"`, 같은 label 안에 `svg.chk-mark path[pathLength="1"]`.
  - 클릭 → 300ms 뒤 그 행 `.m-pop`, 행 애니메이션 이름에 `m-check-pop`·`m-check-draw`·`m-strike`, `__vibrations`가 `[10]`.
  - 다시 클릭(해제) → `__vibrations` 그대로.
  - 완료 행 `.strike`의 계산된 `textDecorationLine === "none"`, `backgroundSize`에 `100%`.
  - 행에 `data-flip-key`. 선택자 `.wd-task-chk:focus-visible` 규칙 존재.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `feat: 체크리스트 체크가 그려지듯 나타남, 안드로이드는 짧은 진동`

---

### Task 12: 드래그 정렬 공용화 — 들기·따라오기·비켜남

**Files:**
- Modify: `js/motion.js` — `setupDragReorder`
- Modify: `js/views/plan.js`(271-302행 대체), `js/views/wedding.js`(예산 행 드래그 292행 근처 대체)
- Modify: `style.css` — `.plan-edit-row.dragging`·`.fixed-item.dragging`(877-878·967-968행) → `.drag-lift`
- Create: `<scratchpad>/mock/__checks/t12-drag.js`

**Interfaces — Produces:** `setupDragReorder(container: HTMLElement, { rowSelector: string, handleSelector: string, onDrop: (rows: HTMLElement[]) => void }): void`.
- 손잡이 `pointerdown`(기본 동작 막음): 행에 `.drag-lift`, `scale(1.02)`, `haptic(8)`. 리스너는 현행처럼 document(포인터 캡처 안 씀).
- `pointermove`: 현행 규칙(포인터가 중간점보다 위인 첫 형제 앞, 없으면 맨 뒤)으로 DOM 이동. 이동 전후 형제를 FLIP(180ms, `--ease-out` 값). 잡은 행은 `translateY((y − 시작 y) − (offsetTop − 시작 offsetTop)) scale(1.02)`.
- `pointerup`·`pointercancel`: `transform 250ms var(--ease-spring)`으로 제자리 → `transitionend` 또는 300ms 뒤 클래스·인라인 제거 → `onDrop([...container.querySelectorAll(rowSelector)])`, `haptic(8)`.
- 예산안 `onDrop` = `syncDraft(container); renderPlanView();`. 결혼 `onDrop` = 현행 순서 저장(`saveWeddingItemOrders` + 재조회 + 다시 그리기)을 그대로 옮김.
- CSS: `.drag-lift { position: relative; z-index: 2; background: var(--surface); box-shadow: var(--shadow-pop); }`, 들어 올린 행 안은 현행처럼 `pointer-events: none`.
- 동작 줄이기: 확대·형제 FLIP 없이 따라가기만.

- [ ] **Step 1: `t12-drag.js` 작성** — 단언:
  - 예산안 → 내 카드 수정 → 첫 행 손잡이 `pointerdown`(행 top+10) → 행 `.drag-lift`, `style.transform`에 `scale(1.02)`.
  - 셋째 행 아래끝−2로 `pointermove` → 형제 중 duration 180 애니메이션 ≥ 1.
  - `pointerup` → 400ms 뒤 첫 행 이름이 뒤쪽으로 이동, `.drag-lift` 없음, `__vibrations`가 `[8, 8]`.
  - `cancel`: 다시 잡고 이동 중 `pointercancel` → 400ms 뒤 `.drag-lift` 없음, 순서는 취소 순간 DOM 순서.
  - 결혼 예산: 같은 드래그 → `__store`의 `wedding_items` `order`가 새 화면 순서와 같음.
  - (`?reduce=1`) 이동 중 형제 애니메이션 0, `style.transform`에 `scale` 없음.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `feat: 드래그 정렬 — 들어 올린 행이 손가락을 따라오고 나머지가 비켜남`

---

### Task 13: 동작 줄이기 정책

**Files:**
- Modify: `style.css` — 166-175행 블록 삭제, 파일 맨 끝(모든 모션 키프레임 뒤)에 새 블록
- Create: `<scratchpad>/mock/__checks/t13-reduce.js`

새 `@media (prefers-reduced-motion: reduce)` 블록:
- `*, *::before, *::after { animation-duration: var(--dur-fast) !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; transition-delay: 0ms !important; }`
- `.m-flash { animation-duration: 1400ms !important; } .m-remote { animation-duration: 1600ms !important; }`
- `.skeleton::after, .login-screen.auth-pending .google-btn::after { animation: none !important; }`
- 같은 이름 opacity 전용 재정의: `m-rise`·`m-rise-sm`·`m-slide-next`·`m-slide-prev`·`m-pop-in`·`m-alert-in`·`m-sheet-up`·`m-toast-in`·`m-bar-grow`·`m-col-grow`·`m-donut`·`m-check-pop`·`m-check-draw`·`m-strike` → `from { opacity: 0 }`. `m-pop-out`·`m-sheet-down`·`m-toast-out` → `to { opacity: 0 }`. `m-toast-bump` → 빈 키프레임.

- [ ] **Step 1: `t13-reduce.js` 작성** — 단언: `prefers-reduced-motion` 미디어 규칙이 정확히 1개이고, 최상위 규칙 순서에서 모든 `@keyframes m-*`(`m-shimmer` 포함)보다 뒤. 그 안에 위 키프레임 이름이 전부 있고 각 `cssText`에 `transform`·`stroke`·`background-size`가 없음. `.m-flash` 1400ms·`.m-remote` 1600ms 규칙, 스켈레톤 `animation: none`.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
- [ ] **Step 4: pass**
- [ ] **Step 5: 커밋** `a11y: 동작 줄이기 — 움직임은 짧은 페이드로, 반짝임은 유지`

---

### Task 14: 문서·전체 회귀·실제 앱·배포

**Files:**
- Modify: `CLAUDE.md` — Motion 절 전체, 모듈 목록의 `motion.js` 줄
- Modify: `README.md` — 화면 항목의 모션 문장
- Create: `<scratchpad>/mock/__checks/t14-regression.js`, `<scratchpad>/mock/__checks/t14-contrast.js`

- [ ] **Step 1: 회귀 체크 작성**
  - `t14-regression.js`: 거래 추가(모달 저장) → `__store` 반영·행 표시. 수정. 삭제(확인) → 사라짐. `__failWrites = true`로 저장 → 모달 열린 채 토스트 `저장에 실패했습니다`. 고정비 추가·삭제. Esc로 모달 닫힘(`.is-closing` 거쳐 `hidden`). `__loginAs(null)` → 열린 모달 닫힘, 재로그인 → 달력. 결혼 항목 모달을 연 채 `__remote`로 같은 항목 수정 → 저장 → 확인창 → 취소 → 모달이 서버 값으로 다시 채워짐.
  - `t14-contrast.js`: 이전 대비 스캔을 파일로 — 두 테마 × 6화면 + 내역 모달, 측정 전 `document.getAnimations().forEach(a => { try { a.finish() } catch {} })`, 엄지 위 선택 버튼은 엄지 색을 배경으로. 전부 WCAG AA.
- [ ] **Step 2: 새 탭에서 `t02`~`t13`과 `t14-*` 전부 pass** (`?reduce=1` 변형 포함, 뷰포트별 분기 포함)
- [ ] **Step 3: 문서 갱신**
  - `CLAUDE.md` Motion 절을 새 규칙으로 다시 쓴다: 타이밍 토큰, `.modal-scrim`(`pointer-events: none`), 속도 이어 닫기, 짧은 등장과 `first`, 연타 생략, 끝난 뒤 정리, `rollNumber`와 굴림 DOM 복원, 레이아웃 스위치(마이크로태스크 만료)와 `data-flip-key`, 원격 ID 경로와 `highlightRows`, `revealTheme`(동기 콜백, `theme-switching`), `setupDragReorder`, `haptic`, `setupTouchFeedback`, 동작 줄이기 블록이 파일 맨 끝이어야 하는 이유.
  - 모듈 목록 `motion.js` 설명을 갱신한다.
  - `README.md` 화면 항목의 모션 문장을 갱신한다.
- [ ] **Step 4: 실제 앱** — `preview_start couple-budget`(포트 8000): 로그인 화면 표시, 콘솔 오류 0, `/js/motion.js` 200
- [ ] **Step 5: 커밋·배포**
  - 커밋: `docs: 모션 개선 반영 — CLAUDE.md Motion 절·README`
  - `main`으로 fast-forward 병합하고 푸시한 뒤, Pages가 `export function rollNumber`를 내려줄 때까지 확인한다.
  - 정리: 목업·실제 서버 종료, `launch.json` 원복, 뷰포트 원복.
