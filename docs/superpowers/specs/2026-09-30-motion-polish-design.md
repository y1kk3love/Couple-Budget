# 모션 검수·개선 설계 (2026-09-30)

## 목적

2026-09에 넣은 iOS·토스 스타일 모션(`js/motion.js`, `style.css` 모션 절)을 검수하고, 잘 만든 웹 사례를
참고해 다듬는다. 톤(토스·iOS)은 유지하되 더 빠르고, 손에 붙고, 끊김 없게 만든다. 기능과 데이터는 바꾸지 않는다.

성공 기준:
- 자주 하는 동작(탭 전환, 월 이동)은 0.3초 안에 끝난다.
- 폰에서 누르고 끄는 반응이 즉각적이다. 아이폰에서도 눌림 효과가 보인다.
- 저사양 폰에서도 매 프레임 다시 그리기가 없다.
- '동작 줄이기'에서는 움직임 없이 짧은 페이드만 남는다.

## 확정된 요구사항 (사용자 Q&A)

- 사용 기기: 아이폰(Safari), 안드로이드(갤럭시 등), PC 브라우저 **모두**.
- 범위: **B. 교정 + 시그니처** — 검수에서 찾은 교정 전부 + 웹 사례에서 빌려 온 효과 6가지.
- 타이밍 기준표(아래)와 교정 항목: 그대로 승인.
- 시그니처 효과 6가지: 미리보기를 눌러 본 뒤 그대로 승인.
- 구조·검증 계획: 그대로 승인.

## 참고 자료 (2026-09-30 조사)

- 토스: 인터랙션 글 toss.tech/article/interaction, SLASH 23 Rally(공용 모션 라이브러리 — bezier·spring 두 계열만),
  TDS 문서 tossmini-docs.toss.im/tds-mobile (버튼 누름 = 어두운 겹, 토스트 3000ms·버튼 있으면 5000ms)
- Emil Kowalski: emilkowal.ski/ui/great-animations, you-dont-need-animations, building-a-drawer-component,
  building-a-toast-component / github.com/emilkowalski/vaul, sonner (시트 500ms `cubic-bezier(0.32,0.72,0,1)`,
  25% 또는 0.4px/ms에서 닫힘, 토스트 400ms)
- Rauno Freiberg, Invisible Details of Interaction Design: rauno.me/craft/interaction-design
- Apple: HIG Motion, WWDC23 "Animate with springs"(10158), WWDC18 "Designing Fluid Interfaces"(803)
  — 자주 하는 동작엔 모션 자제, 제스처 속도를 이어받는 스프링, 동작 줄이기 = 축 이동을 페이드로
- Material 3 모션 토큰: m3.material.io/styles/motion/easing-and-duration/tokens-specs (나가는 전환은 더 짧게)
- NN/g: nngroup.com/articles/animation-duration (100~400ms, 500ms부터 "끌린다", 자주 할수록 짧게)
- 성능: motion.dev/blog/web-animation-performance-tier-list (transform·opacity·clip-path만 합성 단계)
- 동작 줄이기: web.dev/articles/prefers-reduced-motion, WCAG 2.3.3 (색·투명도 변화는 "움직임"이 아님)
- 숫자: NumberFlow — number-flow.barvian.me, github.com/barvian/number-flow (자리별 0~9 띠, 오른쪽 정렬 키, 추세 방향 회전)
- 목록: FLIP — aerotwist.com/blog/flip-your-animations, AutoAnimate — auto-animate.formkit.com (이동 250ms, 추가 scale .98)
- View Transitions: developer.chrome.com/docs/web-platform/view-transitions/same-document,
  bram.us/2025/01/29/view-transitions-page-interactivity, 테마 원형 전환 akashhamirwasia.com
- iOS `:active`: MDN `:active` 호환성 표 — touchstart 리스너가 없으면 iOS Safari는 `:active`를 적용하지 않는다

## 모션 원칙

1. **빈도에 맞춘 길이.** 자주(탭·월 이동·세그먼트·정렬) ≤ 0.3초 또는 페이드, 가끔(시트·팝업·토스트·목록 변화)은 표준,
   드문 순간(첫 로그인, 체크 완료)만 여유 있게.
2. **들어올 땐 감속, 나갈 땐 더 짧게.** 입장은 `--ease-out`/`--ease-sheet`/`--ease-spring`. 퇴장은 입장보다 짧고
   즉시 출발하는 `--ease-out`. 천천히 출발하는 ease-in은 쓰지 않는다 (Emil — M3는 가속 퇴장을 권하지만,
   이 앱의 퇴장은 작은 요소라 누른 직후의 무반응이 더 거슬린다).
3. **제스처는 손가락 속도를 이어받는다.** 놓는 순간의 속도에서 끊김 없이 이어서 끝난다.
4. **끊을 수 있다.** 연타해도 처음부터 다시 재생하지 않고, 애니메이션이 입력을 막지 않는다.
5. **동작 줄이기 = 움직임을 페이드로.** 이동·확대는 `--dur-fast` 페이드로 바꾼다. 색 변화(반짝임)는 유지한다.
6. **합성 단계 속성만 계속 움직인다.** 반복·연속 애니메이션은 `transform`·`opacity`·`clip-path`만.
   매 프레임 다시 그리는 속성(`background-position` 등)이나 큰 하위 트리의 CSS 변수를 매 이동마다 바꾸지 않는다.

## 타이밍 기준

| 동작 | 지금 | 바꾼 뒤 |
|---|---|---|
| 누름 들어감 / 복귀 | 90ms ease-out / 250ms 스프링 | 유지 (`--dur-press` 토큰화) |
| 탭 전환 등장 | 480ms, 12px, 28ms 간격, 최대 14 (끝까지 872ms) | 200ms, 6px 상승+페이드, 20ms 간격, 최대 6 (끝까지 320ms) |
| 첫 로그인 등장 | 탭 전환과 같음 | 현행 유지(480ms, 12px, 28ms, 최대 14) — `.entering.first` |
| 월 이동 (내용·라벨) | 420ms / 360ms, 32px | 260ms(`--dur-nav`), 24px 슬라이드+페이드. 진행 중 재요청이면 생략 |
| 막대(`.pfill`) 등장 | 700ms, 지연 i×28+120 | 450ms, 지연 min(i,6)×20+60 |
| 월별 막대(`.mc-stack`) | 650ms, 지연 c×45+80 | 420ms, 지연 c×30+40 |
| 예산안 도넛 | 800ms, 지연 150 | 500ms, 지연 60 |
| 등장 정리 | 900ms 고정 타이머 | 등장 애니메이션이 모두 끝난 뒤(안전 타이머 1200ms) |
| 세그먼트 엄지 | 420ms 스프링 | 300ms 스프링 |
| 시트 열기 | 480ms `--ease-sheet` | 유지 (Vaul 500ms) |
| 시트 닫기 (버튼·Esc) | 220ms `--ease-in` | 240ms `--ease-out` |
| 시트 닫기 (휙 내림) | 220ms `--ease-in` | clamp(4.5×남은 거리÷놓을 때 속도, 160, 280)ms, `--ease-out` — 시작 속도 ≥ 손가락 속도 |
| 시트 되돌아감 | 420ms 스프링 | 360ms 스프링 |
| 배경막 | 들어옴 250ms / 나감 220ms | 250ms / 200ms |
| PC 팝업 열기 / 닫기 | 380ms 스프링, scale .94 / 200ms ease-in | 280ms 스프링, scale .96+6px / 160ms `--ease-out`, scale .97 |
| 확인창 열기 / 닫기 | 260ms / 200ms ease-in | 260ms 유지 / 160ms `--ease-out` |
| 토스트 | 등장 420ms 스프링, 표시 2200ms, 사라짐 200ms ease-in | 등장 유지, 표시 3000ms(TDS), 사라짐 180ms `--ease-out` |
| 서랍(모바일 사이드바) | 400ms `--ease-sheet` | 유지 |
| 금액 굴리기 | 카운트업 650ms | 자리별 520ms `--ease-out`, 새 자리 페이드 300ms |
| 목록 자리 이동 | 없음(순간이동) | 이동 280ms `--ease-out`, 추가 240ms(opacity 0·scale .98→1), 삭제 200ms(페이드·scale .98) |
| 상대 변경 반짝임 | 없음 | 1600ms (`--accent-bg` → 투명) |
| 저장 반짝임 | 1400ms | 유지 |
| 테마 원형 전환 | 없음(즉시, 일부 요소만 150ms 색 전환) | 480ms `cubic-bezier(0.4,0,0.2,1)` |
| 체크 | 체크박스 pop 480ms | 상자 pop 420ms `--ease-bounce`, 체크 그리기 280ms(+60ms), 취소선 300ms(+80ms) |
| 드래그 정렬 | 반투명(.55), 행이 툭툭 이동 | 들기 150ms(scale 1.02+그림자), 비켜남 180ms, 놓기 250ms 스프링 |

새 CSS 토큰: `--dur-press: 90ms`, `--dur-nav: 260ms`, `--dur-sheet: 480ms`. 그 밖의 값은 쓰는 곳에 직접 적고,
JS에서 쓰는 값은 `motion.js` 상수로 둔다.

## 교정 항목

1. **아이폰 눌림 효과.** `setupTouchFeedback()`이 document에 빈 `touchstart` 리스너(`{ passive: true }`)를 건다.
   `html { -webkit-tap-highlight-color: transparent; }` — 기본 회색·파란 탭 하이라이트가 자체 효과와 겹치지 않게.
2. **행 눌림은 배경 음영.** `.tx-item, .fixed-item, .cd-row, .cat-bar-item.clickable, .cal-cell`의 `:active`는
   `transform` 대신 `background: var(--surface-hover)`. 버튼(0.96)과 카드(`.budget-card`, `.mc-col` 0.98)는 축소 유지.
3. **탭 전환 등장 단축.** 위 표. `initApp()`의 첫 등장만 `.entering.first`로 현행 길이.
4. **월 이동 단축과 연타 처리.** 위 표. `playEntrance()`는 뷰에 방향 등장(`dir-next/prev`)이 진행 중이면 새로 재생하지
   않고 클래스를 걷어 즉시 전환한다. `slideLabel()`도 같은 규칙.
5. **시트 닫기가 손가락 속도를 잇는다.** 위 표의 계산식. `--ease-out`(`cubic-bezier(0.22,1,0.36,1)`)의 시작 기울기
   ≈ 4.5라 `4.5×거리÷시간`이 시작 속도가 된다. 되돌아감은 360ms 스프링.
6. **끄는 동안 다시 그리기 제거.** 시트 높이는 끌기 시작할 때 한 번만 잰다. 배경막을 `.modal-overlay::before`에서
   실제 요소 `.modal-scrim`(오버레이 첫 자식)으로 바꾸고, 끄는 동안 그 요소의 `style.opacity`만 바꾼다
   (지금은 오버레이의 `--scrim` 변수를 매 이동마다 바꿔 모달 전체 스타일을 다시 계산한다).
7. **퇴장은 즉시 출발.** 시트·팝업·확인창·토스트의 퇴장 곡선을 `--ease-out`으로, 길이는 위 표.
   `motion.js`의 `CLOSE_MS`는 240(가장 긴 퇴장).
8. **테마 전환 얼룩 제거.** `transition: all` 5곳(`.nav-btn`, `.add-fixed-btn`, `.type-btn/.kind-btn`,
   `.csv-drop-zone`, `.pe-add`)을 실제로 바뀌는 속성(background·color·border-color·transform)만으로.
   테마를 바꾸는 순간 `html.theme-switching`이 모든 전환을 끈다(아래 시그니처 4).
9. **스켈레톤 반짝임을 합성 단계로.** `background-position` 애니메이션 대신 `::after`의 그라데이션을
   `translateX(-100% → 100%)`로. 로그인 대기 버튼(`.auth-pending .google-btn`)도 같은 방식.
10. **등장 정리 시점.** `playEntrance()`가 등장 클래스를 붙인 뒤 `view.getAnimations({ subtree: true })`의
    `finished`를 모두 기다렸다 걷는다. 숨은 탭 등으로 끝나지 않으면 1200ms 안전 타이머가 걷는다.
11. **세그먼트 엄지 300ms.**
12. **동작 줄이기 정책 재작성** — 아래 별도 절.

## 시그니처 효과

### 1. 자리마다 굴러가는 금액 — `rollNumber(el, key, to, format)`

- `animateCount`를 대체한다(같은 인자·같은 `data-count` 규약). 요약 카드 5개, 예산안 도넛 가운데, 결혼 총지출.
- `key`별 마지막 값을 기억해 이전 값 → 새 값. 처음 보이는 값은 0에서 굴러간다(현행과 같음).
- DOM: `el` 안을 `<span class="sr-only">최종 문자열</span><span class="roll" aria-hidden="true">…</span>`로 바꾼다.
  숫자 한 자리 = `.roll-d`(overflow hidden, 위아래 가장자리 mask 페이드) 안에 0~9를 두 번 쌓은 띠 `.roll-s`(20칸).
  숫자가 아닌 글자(부호·쉼표·원)는 `.roll-c` 고정. 칸 높이는 `1lh`라 끝난 뒤의 일반 텍스트와 높이가 같다
  (`lh` 단위가 없는 브라우저는 앞에 선언한 `1.2em`으로 — 값이 틀리면 띠 20칸이 한꺼번에 보이므로 대체값 필수).
- 자리 대응은 **오른쪽 정렬**(일의 자리끼리). 추세(새 값 ≥ 이전 값이면 위로, 아니면 아래로)에 따라 한 방향으로 돈다:
  위로는 시작=이전 숫자, 끝=새 숫자(작으면 +10), 아래로는 시작=이전+10, 끝=새 숫자(크면 그대로, 아니면 +10).
  띠 이동은 `translateY(-칸×5%)`.
- 새로 생긴 자리는 opacity 0→1(300ms). 사라진 자리는 그냥 없어진다.
- 시작 위치를 전환 없이 두고 `offsetWidth`로 스타일을 확정한 뒤 목표 위치로 전환한다(`requestAnimationFrame` 불사용).
- 520ms + 60ms 뒤 `el.textContent = 최종 문자열`로 되돌린다 — 복사·텍스트 읽기·다른 코드에 굴림용 DOM이 남지 않게.
  같은 요소를 그 사이 다시 굴리면 이전 복원 타이머는 무시된다(요소별 토큰).
- 값이 같거나, 동작 줄이기거나, `document.hidden`이거나, 값이 숫자가 아니면 바로 최종 문자열.

### 2. 목록 자리 이동 — `animateNextRender()`, `captureLayout(root)`, `playLayout(root, snap)`

- 행에 `data-flip-key="${escapeHtml(id)}"`: 목록(`.tx-item`), 고정비(`.fixed-item`), 결혼 예산·일정·체크리스트·업체 행.
- **내 조작 직후 한 번만** 켠다: 저장·삭제(tx·고정비·결혼 모달), 목록 정렬·필터 변경. 실시간 반영, 탭·월 이동,
  이번 달/전체 기간 전환, CSV 가져오기에는 켜지 않는다.
- 스위치는 **같은 동기 호출 안에서만 유효**하다: `animateNextRender()`는 다시 그리기 호출 바로 앞(모든 `await` 뒤)에
  부르고, 켜 둔 스위치는 마이크로태스크에서 저절로 꺼진다. 그래서 행이 없는 화면(달력·통계)에서 켠 스위치가
  남아 있다가, 나중에 다른 화면으로 넘어갈 때 오래된 위치에서 행을 움직이는 일이 없다.
- `renderListView`, `renderFixedView`, `renderWeddingView`는 `const snap = captureLayout(container)` →
  `innerHTML` → `playLayout(container, snap)`. `captureLayout`은 켜져 있을 때만 위치를 기록하고 스위치를 끈다.
  `playEntrance`도 스위치를 끈다(등장이 우선).
- 재생: 같은 키 = `translate(Δx,Δy)→none` 280ms, 새 키 = opacity 0·scale .98 → 1 240ms, 없어진 키 = 이전 노드를
  루트 안 절대 위치(`pointer-events:none`)에 다시 붙여 200ms 페이드 후 제거. 루트는 `position: relative`.
- 이전·새 위치가 화면(위아래 100px 여유) 밖인 행은 건너뛰고, 한 번에 최대 60개. 읽기를 모두 끝낸 뒤 쓴다.
- WAAPI(`element.animate`)라 CSS의 `:active` 변형과 겹쳐도 재생 중엔 애니메이션이 우선한다.

### 3. 상대가 바꾼 내역 반짝임 — `highlightRows(root, ids)`

- `db.js` `watchTransactions`와 `sync.js` `listen()`이 원격 스냅샷의 `docChanges()` 중 추가·수정 문서 ID를 모은다
  (첫 스냅샷, `hasPendingWrites`는 지금처럼 제외).
- `sync.js`가 120ms 모으는 동안 ID를 합쳐 `renderRemoteChange(ids)`로 넘기고, 뷰를 다시 그렸을 때만
  `highlightRows(view, ids)`가 `[data-flip-key]`가 일치하는 행에 `.m-remote`(1600ms 배경 `--accent-bg`→투명)를 붙인다.
- 입력 중이라 뷰를 다시 그리지 않은 경우, 삭제된 문서, 설정 문서는 반짝이지 않는다. 자리 이동도 하지 않는다.

### 4. 테마 원형 전환 — `revealTheme(originEl, update)`

- `theme.js` 클릭 처리: `revealTheme(btn, () => { writeSaved(…); applyTheme(); renderButton(btn); })`.
- `document.startViewTransition`이 있고, 동작 줄이기가 아니고, 문서가 보일 때:
  업데이트 콜백은 **동기**(`theme-switching` 켜고 → update → `offsetWidth` → 끄기).
  `ready` 뒤 `documentElement.animate({ clipPath: [circle(0 at x y), circle(r at x y)] }, { duration: 480,
  pseudoElement: "::view-transition-new(root)" })`, `r = hypot(max(x, W−x), max(y, H−y))`, x·y는 버튼 중심.
- CSS: `::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }`.
- 지원이 없거나 위 조건이 아니면 `theme-switching` 즉시 전환. `ready`/`finished`의 거부는 삼킨다.
- 지원: Chrome·Edge·Whale 111+, Safari 18+(iOS 18+), Firefox 144+, 삼성 인터넷 23+.
- 시스템 테마 변경(`matchMedia` change)은 원형 전환 없이 즉시.

### 5. 체크리스트 체크 — `weddingChecklist.js`

- 실제 `<input type="checkbox" class="wd-task-chk">`는 그대로(키보드·화면 낭독기 동일), `appearance: none`으로 네모를
  직접 그린다(20px, 터치 기기 22px, 둥근 모서리 6px, 테두리 `--border-strong`, 체크되면 `--accent-fill`).
  위에 `svg.chk-mark`(흰 체크, `pathLength="1"`, dasharray 1). 포커스는 입력의 `:focus-visible` 윤곽.
- 제목은 `<span class="wd-task-title"><span class="strike">…</span></span>` — 완료 줄은 `text-decoration` 대신
  안쪽 인라인 요소의 선 그라데이션(`box-decoration-break: clone`, 여러 줄도 줄마다).
- 방금 체크한 행(`popTaskId`, 지금과 같은 1회 표시)만: 상자 pop(420ms `--ease-bounce`), 체크 그리기
  (`stroke-dashoffset` 1→0, 280ms, 60ms 뒤), 취소선 그리기(`background-size` 0→100%, 300ms, 80ms 뒤).
- 체크(해제는 제외) 성공 시 `haptic(10)`.

### 6. 드래그 정렬 — `setupDragReorder(container, { rowSelector, handleSelector, onDrop })`

- `plan.js`(예산안 편집 행)와 `wedding.js`(결혼 예산 행)에 따로 있던 포인터 드래그 코드를 대체한다.
  포인터 캡처 대신 document 리스너(행 재배치로 캡처가 풀리는 문제)는 그대로.
- 집을 때: `.drag-lift`(z-index·`--shadow-pop`·`--surface` 배경), `scale(1.02)`, `haptic(8)`.
- 움직일 때: 지금의 "중간점보다 위인 첫 행 앞" 규칙으로 DOM 위치를 바꾸되, 바꾸기 전후로 형제 행을 FLIP(180ms).
  잡은 행은 `translateY((포인터 Y − 시작 Y) − (현재 offsetTop − 시작 offsetTop)) scale(1.02)`로 손가락을 그대로 따라온다.
- 놓을 때: 250ms 스프링으로 제자리 → 끝나면(안전 타이머 300ms) 클래스·인라인 변형 제거 → `onDrop(현재 행 순서)`,
  `haptic(8)`. 예산안은 `syncDraft` + 다시 그리기, 결혼은 기존 순서 저장(`saveWeddingItemOrders`) + 다시 그리기.
- 동작 줄이기: 확대·형제 FLIP 없이 손가락 따라가기만.

## 구조

### `js/motion.js` 공개 함수

| 함수 | 상태 | 설명 |
|---|---|---|
| `reducedMotion()` | 유지 | |
| `openOverlay(o)` / `closeOverlay(o)` | 바뀜 | `.modal-scrim`이 없으면 첫 자식으로 만든다. `CLOSE_MS` 240 |
| `setupSheetDrag()` | 바뀜 | 높이 1회 측정, 배경막 요소 투명도, 속도 이어 닫기, 360ms 복귀 |
| `setupTouchFeedback()` | 새로 | iOS `:active`용 빈 passive touchstart |
| `haptic(pattern = 10)` | 새로 | `navigator.vibrate`가 있을 때만, 예외 무시 (아이폰 웹은 지원 없음) |
| `playEntrance(view, dir = 0, { first = false } = {})` | 바뀜 | 짧은 등장, 연타 생략, 끝난 뒤 정리, 레이아웃 스위치 끔 |
| `slideLabel(el, dir)` | 바뀜 | 진행 중이면 생략 |
| `rollNumber(el, key, to, format)` | 새로 | `animateCount` 대체 (`animateCount`는 삭제) |
| `animateWidth(el, key, pct)` | 유지 | |
| `animateNextRender()` / `captureLayout(root)` / `playLayout(root, snap)` | 새로 | 목록 자리 이동 |
| `highlightRows(root, ids)` | 새로 | 상대 변경 반짝임 |
| `setupDragReorder(container, opts)` | 새로 | 드래그 정렬 공용 |
| `revealTheme(originEl, update)` | 새로 | 테마 원형 전환 |
| `setupSegmentThumbs()` / `flash(el)` | 유지 | 엄지 길이는 CSS에서 300ms |

`motion.js`는 계속 다른 앱 모듈을 import하지 않는다.

### 파일별 연결 지점

- `js/app.js`: 부트스트랩에 `setupTouchFeedback()`. 첫 등장 `first` 플래그(`initApp`). 요약 카드 `rollNumber`.
  `renderRemoteChange(ids = new Set())` — 다시 그린 뒤 `highlightRows`.
- `js/theme.js`: 클릭 → `revealTheme`.
- `js/utils.js`: 토스트 3000ms·사라짐 180ms. `showConfirm` 오버레이 템플릿에 `.modal-scrim`, 닫힘 160ms.
- `js/db.js`: `watchTransactions`의 원격 콜백에 변경 ID 배열.
- `js/sync.js`: ID 모으기, `renderRemoteChange(ids)`.
- `js/views/list.js`: 행 `data-flip-key`, 렌더 전후 캡처·재생, 정렬·필터 핸들러에서 `animateNextRender()`.
- `js/views/fixed.js`, `js/views/wedding.js`: 행 `data-flip-key`, 캡처·재생. `wedding.js`는 `rollNumber`,
  `setupDragReorder`.
- `js/views/weddingEvents.js`, `weddingVendors.js`: 행 `data-flip-key`.
- `js/views/weddingChecklist.js`: 체크박스·취소선 마크업, `data-flip-key`, 체크 시 `haptic`.
- `js/views/plan.js`: `rollNumber`, `setupDragReorder`.
- `js/modals/txModal.js`, `fixedModal.js`, `weddingModal.js`: 저장·삭제 성공 뒤, 재조회(`await`)를 마치고
  다시 그리기(`renderAll`/`renderWeddingView`)를 부르기 **바로 앞**에서 `animateNextRender()`.
- `style.css`: 토큰, 탭 하이라이트, 행 음영, `transition: all` 정리, 등장·월 이동·차트 타이밍, `.modal-scrim`,
  퇴장 곡선, 스켈레톤, 세그먼트 엄지, 토스트, `.roll*`·`.sr-only`, `.m-remote`, 체크박스, `.drag-lift`,
  View Transitions, `.theme-switching`, 동작 줄이기 규칙.

## 동작 줄이기 정책

- CSS: `@media (prefers-reduced-motion: reduce)` 규칙을 **모션 절 맨 끝**으로 옮긴다(같은 이름의 `@keyframes`는
  뒤에 정의된 것이 이긴다).
  - 이동·확대 키프레임(`m-rise`, `m-slide-*`, `m-pop-*`, `m-alert-in`, `m-sheet-*`, `m-toast-*`,
    `m-bar-grow`, `m-col-grow`, `m-donut`, `m-check-pop`)을 **opacity만의 페이드로 다시 정의**하고,
    모든 애니메이션 길이 `var(--dur-fast)`, 지연 0.
  - 색만 바꾸는 `.m-flash`(1400ms)·`.m-remote`(1600ms)는 원래 길이 유지.
  - 스켈레톤 반짝임은 멈춘다(`animation: none`).
  - CSS 전환은 지금처럼 0.01ms.
- JS: `rollNumber` 즉시 최종값, `playLayout` 생략, `revealTheme` 즉시, 시트 끌기는 손가락을 따라가되
  놓은 뒤 전환은 CSS 규칙대로 즉시, 드래그 정렬은 따라가기만. 진동은 모션이 아니므로 유지.

## 오류·예외 처리

- 모션 함수(`rollNumber`, `playLayout`, `highlightRows`, `revealTheme`, 드래그 애니메이션)는 내부를 try/catch로 감싸
  실패하면 `console.warn` 후 최종 상태로 둔다 — 저장·렌더 흐름을 절대 막지 않는다.
- `requestAnimationFrame`에 기대지 않는다(숨은 탭·Browser 창에서 멈춤). 시작 상태는 `offsetWidth`로 확정하고,
  끝 처리는 `finished` 약속 + 안전 타이머.
- 기능이 없는 브라우저(`startViewTransition`, `element.animate`, `navigator.vibrate`)는 조용히 지금 방식으로.
- 굴림용 DOM은 끝나면 일반 텍스트로 되돌린다.

## 성능 규칙

- 연속·반복 애니메이션은 `transform`·`opacity`·`clip-path`만. `background-position`·`width` 애니메이션 추가 금지
  (세그먼트 엄지의 `width`·`height` 전환은 절대 위치의 작은 요소라 유지).
- 끄는 동안 레이아웃 읽기는 시작 시 한 번. FLIP은 읽기를 모두 끝낸 뒤 쓰기.
- 화면 밖 행은 애니메이션하지 않는다(최대 60개).
- `transition: all` 금지.

## 검증

목업 환경(스크래치패드의 `mock/`, Firebase 가짜 모듈)에서:
- 탭 전환 등장의 (지연+길이) 최댓값 ≤ 320ms, 첫 로그인은 현행.
- 월 이동 연타 시 진행 중 재생 생략, 라벨 동일.
- 막대·도넛이 정리 전에 끊기지 않음(결혼 예산 14행 이상).
- 시트: 휙 내림 → 계산된 길이·`--ease-out`, 느린 끌기 → 360ms 복귀, 끌기 중 `.modal-scrim` opacity만 변화.
- `rollNumber`: 끝난 뒤 `textContent === format(to)`, 굴리는 동안 `.sr-only`가 최종값, 동작 줄이기·숨은 탭에선 즉시.
- 목록: 정렬 변경·저장·삭제 시 해당 행의 애니메이션(이동/추가/삭제 유령) 생성, 실시간 반영·탭 이동에선 없음.
- 상대 변경(`window.__remote`) → 해당 행만 `.m-remote`.
- 테마: 원형 전환(보이는 창) 또는 즉시 전환(숨은 창·동작 줄이기)에서 모두 테마 적용, 전환 직후 색 전환 없음.
- 체크박스: 클릭·Space로 토글, 방금 체크한 행만 그리기 애니메이션.
- 드래그 정렬: 포인터 이벤트로 순서 변경 → 예산안 초안·결혼 순서 저장 반영.
- 동작 줄이기(`?reduce=1`): transform 애니메이션 없음, 페이드만.
- 정적 검사: `transition: all` 0곳, `background-position` 애니메이션 0곳.
- 회귀: 추가·수정·삭제, 저장 실패 시 모달 유지, 고정비 저장·삭제, 결혼 충돌 재로드, Esc, 로그아웃·재로그인,
  두 테마 글씨 대비 스캔.
- 실제 앱(포트 8000): 로그인 화면, 콘솔 오류 0.
- 소유자 확인(실기기): 아이폰 눌림 효과, 안드로이드 진동, 브라우저별 원형 전환.

## 범위 밖 (의도적으로 제외)

- 월 이동에 View Transitions(이전 달·새 달이 함께 이동): 조사 권고대로 JS 방식 유지 — 비동기 로드 중 화면이 얼어붙을 위험.
- 시트 뒤 화면 축소(Vaul 배경 축소): 선택 범위(B) 밖. 모달이 `#app` 바깥에 있고 본문은 `.view-container`만
  스크롤돼 구조 변경은 필요 없지만, iOS에서 `.app`의 `min-height: 100vh`와 실제 보이는 높이 차이로 하단 탭이
  흔들릴 수 있어 실기기 확인이 필요하다.
- 스크롤 연동 큰 제목 접힘: 파이어폭스 미지원, 효과 대비 복잡.
- 토스트 쌓기·밀어서 닫기: 한 번에 하나로 충분.
- 저장 버튼 로딩 점: 저장이 대개 즉시 끝나 깜빡임만 는다.
- NumberFlow CDN: 같은 방식을 직접 구현(의존성 없음).
- 아이폰 웹 진동 우회(`<input switch>` 요령): iOS 26.5부터 스크립트 클릭이 막혀 신뢰할 수 없다.
- 상대 변경 시 자리 이동: 읽던 화면이 스스로 움직이지 않도록 반짝임만.

## 문서 갱신

- `CLAUDE.md` Motion 절: 새 함수·규칙(레이아웃 스위치, `data-flip-key`, 원격 ID 경로, 동작 줄이기 정책,
  테마 전환, 드래그 공용 함수, 굴림 DOM 복원)으로 다시 쓴다.
- `README.md` 화면 항목의 모션 문장 갱신.
