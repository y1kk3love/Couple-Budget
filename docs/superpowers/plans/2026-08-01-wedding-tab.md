# 결혼 준비 탭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커플 가계부에 기존 장부와 완전 분리된 "결혼" 탭(예산·체크리스트·업체·하객 4세그먼트)을 4단계로 출시한다.

**Architecture:** 뷰 셸(`js/views/wedding.js`)이 D-day 헤더와 세그먼트 전환을 담당하고, 세그먼트별 렌더 모듈(`weddingChecklist/Vendors/Guests.js`)이 자기 컨테이너를 채운다. Firestore 접근은 `js/weddingDb.js`에 격리(기존 `db.js`의 캐시·월 스코프와 무관). 데이터는 탭 최초 진입 시 1회 로드.

**Tech Stack:** 바닐라 ES 모듈, Firebase Firestore 10.12.0 (CDN), 프레임워크 없음.

## Global Constraints (스펙에서 복사)

- 기존 가계부와 **완전 분리** — `transactions`·집계 캐시·`loadAllData()`를 건드리지 않는다.
- 지출액은 `payments` 합계로 파생. 별도 저장 금지.
- 색은 CSS 토큰만, 데이터 색은 constants.js에만. 클릭형 요소는 `role="button" tabindex="0"`.
- 쓰기는 try/catch + 성공 후 모달 닫기. UI 문자열·주석은 한국어.
- 모든 사용자 문자열 출력은 `escapeHtml()`. 금액은 `fmtMoney()`/`fmtMoneyShort()`.
- 검증: 태스크마다 `node --check`(아래 명령), 단계마다 브라우저 스모크(콘솔 에러 0 + 스텁 렌더).
- 문법 검사 명령 (프로젝트 루트, Git Bash):
  ```bash
  S=/tmp/wsyntax; mkdir -p $S; ok=1; for f in js/*.js js/views/*.js js/modals/*.js; do cp "$f" "$S/$(echo $f|tr / _).mjs"; node --check "$S/$(echo $f|tr / _).mjs" || ok=0; done; [ $ok = 1 ] && echo ALL-PASS
  ```

---

## 1단계 — 탭 신설 + 설정 + 예산 세그먼트

### Task 1: 상수·상태·보안 규칙

**Files:**
- Modify: `js/constants.js` (끝에 추가)
- Modify: `js/state.js` (state 객체에 필드 추가)
- Modify: `firestore.rules` (budget_plans 블록 뒤)

**Interfaces:**
- Produces: `WEDDING_CATEGORIES`, `getWeddingCategory(id)`, `state.wedding`

- [ ] **Step 1: constants.js에 결혼 카테고리 추가**

```js
// 결혼 준비 예산 카테고리 — 지출 카테고리와 같은 '데이터 색' (테마 무관)
export const WEDDING_CATEGORIES = [
  { id: "venue",     name: "예식장",         color: "#f272b6" },
  { id: "sdm",       name: "스드메",         color: "#9b7df0" },
  { id: "jewelry",   name: "예물·예단",      color: "#ff9e45" },
  { id: "attire",    name: "한복·예복",      color: "#4da3f5" },
  { id: "honeymoon", name: "신혼여행",       color: "#35c08e" },
  { id: "appliance", name: "혼수·가전",      color: "#2fb8ac" },
  { id: "house",     name: "신혼집",         color: "#c29063" },
  { id: "invite",    name: "청첩장·식전영상", color: "#7a85f0" },
  { id: "flower",    name: "부케·꽃장식",    color: "#ff8a66" },
  { id: "etc_w",     name: "기타",           color: "#9aa5b1" },
];

export function getWeddingCategory(id) {
  return WEDDING_CATEGORIES.find(c => c.id === id) ?? { id, name: id ?? "기타", color: "#9aa5b1" };
}
```

- [ ] **Step 2: state.js에 결혼 상태 추가** (`budgetPlans: [],` 다음 줄)

```js
  // 결혼 준비 탭 (settings/wedding + wedding_* 컬렉션) — 월과 무관, 탭 진입 시 로드
  wedding: { config: null, items: [], tasks: [], vendors: [], guests: [], loadError: false },
```

- [ ] **Step 3: firestore.rules에 결혼 컬렉션 4개 추가** (budget_plans 블록 뒤)

```
    // 결혼 준비 (예산 항목 / 체크리스트 / 업체 / 하객)
    match /wedding_items/{docId}   { allow read, write: if isAllowed(); }
    match /wedding_tasks/{docId}   { allow read, write: if isAllowed(); }
    match /wedding_vendors/{docId} { allow read, write: if isAllowed(); }
    match /wedding_guests/{docId}  { allow read, write: if isAllowed(); }
```

- [ ] **Step 4: 문법 검사 → ALL-PASS 확인, 커밋** `feat: 결혼 탭 1/6 — 상수·상태·rules`

### Task 2: js/weddingDb.js — 설정·예산 항목 CRUD

**Files:**
- Create: `js/weddingDb.js`

**Interfaces:**
- Consumes: `state.wedding`, firebase `db`
- Produces: `fetchWeddingConfig()`, `saveWeddingConfig({date,totalBudget})`, `fetchWeddingItems()`, `saveWeddingItem(data,id?)`, `deleteWeddingItem(id)`, `itemSpent(item)→number`, `weddingTotals(items)→{planned,spent,byPayer:{}}`

- [ ] **Step 1: 파일 작성**

```js
// ================================================================
// js/weddingDb.js — 결혼 준비 탭 Firestore 읽기/쓰기
// 기존 db.js와 분리 — 월 스코프·집계 캐시와 무관한 독립 장부.
// fetch는 rules 미게시 시에도 앱이 죽지 않도록 오류를 삼키고
// state.wedding.loadError로 표시한다 (budget_plans와 같은 전략).
// ================================================================

import { db } from "../firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import state from "./state.js";

// ── 설정 (settings/wedding) ───────────────────────────────────
export async function fetchWeddingConfig() {
  try {
    const snap = await getDoc(doc(db, "settings", "wedding"));
    state.wedding.config = snap.exists() ? snap.data() : null;
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingConfig(data) {
  await setDoc(doc(db, "settings", "wedding"), data, { merge: true });
  state.wedding.config = { ...(state.wedding.config ?? {}), ...data };
}

// ── 예산 항목 (wedding_items) ─────────────────────────────────
export async function fetchWeddingItems() {
  try {
    const snap = await getDocs(collection(db, "wedding_items"));
    state.wedding.items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch { state.wedding.loadError = true; }
}

export async function saveWeddingItem(data, id = null) {
  if (id) await updateDoc(doc(db, "wedding_items", id), data);
  else    await addDoc(collection(db, "wedding_items"), data);
}

export async function deleteWeddingItem(id) {
  await deleteDoc(doc(db, "wedding_items", id));
}

// ── 파생 합계 (payments가 유일한 지출 원본) ───────────────────
export function itemSpent(item) {
  return (item.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
}

export function weddingTotals(items) {
  const totals = { planned: 0, spent: 0, byPayer: {} };
  for (const it of items) {
    const spent = itemSpent(it);
    totals.planned += it.planned || 0;
    totals.spent   += spent;
    const key = it.payer ?? "both";
    totals.byPayer[key] = (totals.byPayer[key] ?? 0) + spent;
  }
  return totals;
}
```

- [ ] **Step 2: 문법 검사 → ALL-PASS, 커밋** `feat: 결혼 탭 2/6 — weddingDb 설정·항목 CRUD`

### Task 3: 내비게이션·마크업·스타일

**Files:**
- Modify: `index.html` — 사이드바 nav(예산안 버튼 뒤), 모바일 탭(예산안 뒤), `#view-plan` 뒤에 `<div id="view-wedding" class="view"></div>`, `</body>` 앞 모달 2개
- Modify: `style.css` — `.mobile-tabs` grid 7칸 + 결혼 탭 스타일 블록

**Interfaces:**
- Produces: DOM id — `view-wedding`, `weddingSettingsModal`(`wdDate`,`wdTotalBudget`,`wdSettingsSave`,`wdSettingsClose`), `weddingItemModal`(`wdItemTitle`,`wdItemId`,`wdItemName`,`wdItemCategory`,`wdItemPlanned`,`wdItemPayer`,`wdItemMemo`,`wdPayments`,`wdPayAdd`,`wdItemSave`,`wdItemDelete`,`wdItemClose`)

- [ ] **Step 1: 사이드바·모바일 탭 버튼** — 기존 `data-view="plan"` 버튼 복제 후 `data-view="wedding"`, 라벨 "결혼", 아이콘은 하트 SVG(로그인 로고의 path 재사용, width 16/20)

- [ ] **Step 2: 모달 마크업** — 기존 `budgetModal` 구조 복제. 설정 모달: `<input type="date" id="wdDate">` + 금액 입력(`amount-input-wrap` + `amount-presets data-target="wdTotalBudget"`, 프리셋 +1000만/+100만/+10만/지우기 → data-add 10000000/1000000/100000). 항목 모달: 이름 text·카테고리 select(`wdItemCategory`, JS가 채움)·계획액 number·부담 주체 select(`wdItemPayer`, JS가 채움)·메모 text·`<div id="wdPayments"></div>`(결제 내역, JS 렌더)·`+ 결제 기록` 버튼(`wdPayAdd`). 두 모달 다 `role="dialog" aria-modal="true" aria-labelledby` 지정.

- [ ] **Step 3: style.css** — `.mobile-tabs { grid-template-columns: repeat(7, 1fr); }` 수정 + 블록 추가:

```css
/* ── 결혼 준비 탭 ── */
.wd-header {
  background: var(--surface); border-radius: var(--radius-lg);
  padding: 1.25rem; box-shadow: var(--shadow-card); margin-bottom: 1rem;
  cursor: pointer; transition: background 0.15s, transform 0.12s ease;
}
.wd-header:hover { background: var(--surface-hover); }
.wd-dday { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.03em; color: var(--accent); font-family: var(--mono); }
.wd-date { font-size: 0.85rem; color: var(--text-2); margin-top: 2px; }
.wd-budget-line { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-2); margin: 10px 0 5px; }
.wd-payer-sum { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.78rem; color: var(--text-3); margin-top: 8px; }
.wd-payer-sum strong { color: var(--text-2); font-family: var(--mono); font-weight: 600; }
.wd-seg { margin-bottom: 1rem; }
.wd-item-plan { font-size: 0.75rem; color: var(--text-3); font-family: var(--mono); }
.wd-pay-row { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; padding: 6px 0; border-bottom: 1px solid var(--border); }
.wd-pay-row:last-child { border-bottom: none; }
.wd-pay-label { color: var(--text-2); min-width: 52px; }
.wd-pay-amt { margin-left: auto; font-family: var(--mono); font-weight: 600; }
.wd-pay-del { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 1rem; width: 28px; height: 28px; border-radius: 6px; }
.wd-pay-del:hover { color: var(--expense); }
.wd-pay-presets { display: flex; gap: 6px; margin-top: 6px; }
.wd-empty-note { font-size: 0.82rem; color: var(--text-3); padding: 8px 0; }
```

- [ ] **Step 4: 문법 검사(HTML 제외) + 커밋** `feat: 결혼 탭 3/6 — 내비·마크업·스타일`

### Task 4: js/views/wedding.js — 헤더 + 세그먼트 셸 + 예산 세그먼트

**Files:**
- Create: `js/views/wedding.js`
- Modify: `js/app.js` — import + `case "wedding": renderWeddingView(); break;`

**Interfaces:**
- Consumes: `fetchWeddingConfig/Items`, `itemSpent`, `weddingTotals`, `getWeddingCategory`, `ownerName`, `openWeddingSettingsModal/openWeddingItemModal`(Task 5 — 이 태스크에서는 import만 걸어두고 Task 5에서 파일 생성)
- Produces: `renderWeddingView()`, `dDayInfo(dateStr, today?)→{label,pretty}`, `invalidateWeddingLoad()`(모달이 저장 후 재로드 강제할 때), 모듈 변수 `segment`

- [ ] **Step 1: 뷰 작성** — 핵심 구조:

```js
let segment = "budget";   // 현재 세그먼트 (재렌더 생존)
let loaded  = false;      // 최초 1회 로드 플래그

export function invalidateWeddingLoad() { loaded = false; }

export function dDayInfo(dateStr, today = new Date()) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((target - t0) / 86400000);
  const label = diff > 0 ? `D-${diff}` : diff === 0 ? "D-day 🎉" : `D+${-diff} 🎉`;
  const dow = "일월화수목금토"[target.getDay()];
  return { label, pretty: `${y}년 ${m}월 ${d}일 (${dow})` };
}

export function renderWeddingView() {
  const container = document.getElementById("view-wedding");
  if (!loaded) {
    container.innerHTML = `<p class="list-loading">결혼 준비 데이터를 불러오는 중…</p>`;
    Promise.all([fetchWeddingConfig(), fetchWeddingItems()]).then(() => {
      loaded = true;
      if (state.currentView === "wedding") renderWeddingView(); // 뷰 이탈 시 무시
    });
    return;
  }
  container.innerHTML = `${renderHeader()}${renderSegBar()}<div id="wdSegBody">${renderSegment()}</div>`;
  bindEvents(container);
}
```

renderHeader(): config 없으면 빈 상태 카드("결혼식 날짜를 설정해주세요", 클릭 → 설정 모달). 있으면 `dDayInfo` 히어로 + totalBudget 있을 때 `.pbar` 진행바(80% `--warn`, 초과 `--expense` — renderBudgetCard와 같은 규칙) + `weddingTotals().byPayer`를 `ownerName()`/"공동" 라벨로 요약. 헤더 클릭 → `openWeddingSettingsModal()`.

renderSegBar(): `.scope-toggle` 재사용 — 1단계에서는 `예산` 버튼만 활성, 나머지 3개는 `disabled` + "준비 중" title. renderSegment(): `segment === "budget"` → 예산 리스트(`.fixed-item` 스타일 행: 카테고리 색 점, 이름, payer `.tag`, `지출/계획` + `.pbar`), 마지막에 `.add-fixed-btn` "항목 추가". 행 클릭 → `openWeddingItemModal(item)`, 추가 → `openWeddingItemModal(null)`. 모든 행 `role="button" tabindex="0"`. `state.wedding.loadError`면 `.wd-empty-note`로 "규칙(rules) 게시가 필요할 수 있어요" 안내.

- [ ] **Step 2: app.js 연결** — import `renderWeddingView`, switch에 `case "wedding"` 추가.

- [ ] **Step 3: 문법 검사 → ALL-PASS, 커밋** `feat: 결혼 탭 4/6 — 뷰 셸·예산 세그먼트`

### Task 5: js/modals/weddingModal.js — 설정·항목 모달

**Files:**
- Create: `js/modals/weddingModal.js`
- Modify: `js/app.js` — 부트스트랩에 `setupWeddingModals()` 추가

**Interfaces:**
- Consumes: Task 2 CRUD, Task 3 DOM id, `showToast/showConfirm/setupAmountPresets/escapeHtml/fmtMoney`, `WEDDING_CATEGORIES`, `ALLOWED_EMAILS`, `ownerName`, `renderWeddingView`+`invalidateWeddingLoad`
- Produces: `setupWeddingModals()`, `openWeddingSettingsModal()`, `openWeddingItemModal(item|null)`

- [ ] **Step 1: 모달 로직 작성** — 항목 모달의 결제 내역은 모듈 변수 `draftPayments`(배열 복사본)로 관리: `renderPayments()`가 `#wdPayments`를 다시 그리고, 라벨 프리셋(계약금/중도금/잔금) 버튼 + prompt 없는 인라인 입력행(라벨 text·금액 number·날짜 date·추가 버튼), 행 삭제 버튼. 저장 시 `{...기본 필드, payments: draftPayments}`로 `saveWeddingItem`. payer select 옵션: 내 이메일/상대 이메일(`ownerName` 라벨)/`both`("공동"). 카테고리 select는 `WEDDING_CATEGORIES`로 채움. 신규 항목 `order`는 `state.wedding.items.length`. 삭제 버튼은 신규일 때 `hidden`. 모든 쓰기 try/catch + 성공 후 닫기 + `invalidateWeddingLoad(); renderWeddingView();` (재로드로 최신화).

- [ ] **Step 2: app.js 부트스트랩에 `setupWeddingModals()` 추가, 문법 검사, 커밋** `feat: 결혼 탭 5/6 — 설정·항목 모달`

### Task 6: 1단계 스모크·마무리

- [ ] **Step 1: 로컬 서버 + 브라우저** — 콘솔 에러 0 확인. 페이지 컨텍스트에서 스텁 렌더:

```js
const s = (await import('/js/state.js')).default;
const w = await import('/js/views/wedding.js');
s.currentView = "wedding";
s.wedding = { config: { date: "2027-05-22", totalBudget: 50000000 }, loadError: false,
  items: [{ id: "x", name: "예식장", category: "venue", planned: 15000000,
            payer: "both", payments: [{ label: "계약금", amount: 3000000, date: "2026-09-01" }], order: 0 }],
  tasks: [], vendors: [], guests: [] };
// loaded 플래그 우회를 위해 두 번 호출하지 말고, dDayInfo 단위 검증 + 헤더/행 DOM 검증
JSON.stringify([w.dDayInfo("2027-05-22", new Date(2026, 7, 1)).label]); // "D-294" 기대
```

- [ ] **Step 2: `dDayInfo` 경계값** — 당일 "D-day 🎉", 다음날 "D+1 🎉" 확인
- [ ] **Step 3: 커밋** `feat: 결혼 준비 탭 1단계 — 예산 세그먼트` (배포 포인트)

---

## 2단계 — 체크리스트 세그먼트

### Task 7: 시기·템플릿 상수 + tasks CRUD

**Files:**
- Modify: `js/constants.js`, `js/weddingDb.js`

**Interfaces:**
- Produces: `WEDDING_PERIODS`(id/label 8개: d12_9, d8_6, d5_4, d3_2, d1, dweek, dday, after), `WEDDING_CHECKLIST_TEMPLATE`(약 30개 `{title, period}` — 상견례부터 혼인신고까지 표준 순서), `fetchWeddingTasks()`(period 순서→order 정렬), `saveWeddingTask(data,id?)`, `deleteWeddingTask(id)`, `toggleWeddingTask(id,done)`, `seedWeddingChecklist()`

- [ ] **Step 1: 상수 작성** — 템플릿 항목(요약): d12_9 상견례·날짜/예산 협의·예식장 계약·스드메 계약·신혼집 지역 결정 / d8_6 신혼집 계약·신혼여행 예약·웨딩촬영 컨셉·예물예단 협의·드레스 투어 / d5_4 웨딩 촬영·한복예복 맞춤·혼수 리스트·청첩장 시안·본식 스냅 예약 / d3_2 청첩장 발송·식전영상·혼수 구매·부케 결정·사회자/축가 섭외 / d1 청첩장 모임·하객 인원 확인·식순 확정·메이크업 리허설 / dweek 예식장 최종 미팅·컨디션 관리·축의금 접수 담당·물품 준비 / dday 결혼식·축의금 정산 / after 신혼여행·혼인신고·감사 인사·축의금 정리
- [ ] **Step 2: CRUD 작성** — `seedWeddingChecklist()`는 `setDoc(doc(db,"wedding_tasks", \`tpl_${i}\`), {...tpl, done:false, memo:"", order:i})` 반복(멱등). fetch 정렬: period 인덱스 → order.
- [ ] **Step 3: 문법 검사, 커밋** `feat: 결혼 탭 — 체크리스트 상수·CRUD`

### Task 8: 체크리스트 세그먼트 뷰 + 할 일 모달

**Files:**
- Create: `js/views/weddingChecklist.js` — `renderChecklistSegment(container)` export
- Modify: `js/views/wedding.js`(세그바 활성화 + ensureLoaded에 fetch 추가 + segment 분기), `js/modals/weddingModal.js`(할 일 모달: `openWeddingTaskModal(task|null)` — 제목·시기 select·메모), `index.html`(weddingTaskModal 마크업)

- [ ] **Step 1: 세그먼트 렌더** — 상단 `.pbar` 전체 진행률(`done/전체`), `WEDDING_PERIODS` 순서로 그룹 헤더 + 할 일 행(체크박스, 제목 취소선, 클릭 → 수정 모달). 체크박스 변경 → `toggleWeddingTask` try/catch → 재로드·재렌더. 빈 상태: "표준 체크리스트 불러오기" 버튼(`showConfirm` 후 `seedWeddingChecklist`) + "직접 추가" 버튼.
- [ ] **Step 2: 스모크(스텁 tasks 렌더 + 진행률 수치 확인), 커밋** `feat: 결혼 준비 탭 2단계 — 체크리스트` (배포 포인트)

---

## 3단계 — 업체 세그먼트

### Task 9: vendors CRUD + 세그먼트 뷰 + 모달 + 확정 연결

**Files:**
- Modify: `js/weddingDb.js` — `fetchWeddingVendors()`, `saveWeddingVendor(data,id?)`, `deleteWeddingVendor(id)`
- Create: `js/views/weddingVendors.js` — `renderVendorsSegment(container)`
- Modify: `js/modals/weddingModal.js`(`openWeddingVendorModal(vendor|null)` — 카테고리·이름·가격·연락처·메모), `js/views/wedding.js`, `index.html`(weddingVendorModal)

- [ ] **Step 1: 뷰** — 카테고리 필터 칩(`.sort-key-btn` 재사용, "전체" + WEDDING_CATEGORIES) + 업체 카드 리스트(이름, `fmtMoney` 가격, 연락처, 메모, `status==="chosen"`이면 `.tag.applied` "확정"). 카드 클릭 → 수정 모달.
- [ ] **Step 2: 확정 플로우** — 모달의 "이 업체로 확정" 버튼:
  1. `showConfirm("○○을(를) 확정할까요?")` → `saveWeddingVendor({...vendor, status:"chosen"}, id)`
  2. 같은 카테고리 예산 항목 존재 시 `showConfirm("예산 항목 '스드메'의 계획 금액을 이 견적(1,500만원)으로 바꿀까요?", {danger:false})` → `saveWeddingItem({planned: vendor.price, vendorId: id}, itemId)`
  3. 없으면 `showConfirm("'스드메' 예산 항목을 새로 만들까요?", {danger:false})` → `saveWeddingItem({name: 카테고리명, category, planned: price, payer: "both", payments: [], memo: 업체명, order: items.length, vendorId: id})`
- [ ] **Step 3: 스모크, 커밋** `feat: 결혼 준비 탭 3단계 — 업체 비교` (배포 포인트)

---

## 4단계 — 하객·축의금 + 문서

### Task 10: guests CRUD + 세그먼트 뷰 + 모달

**Files:**
- Modify: `js/weddingDb.js` — `fetchWeddingGuests()`, `saveWeddingGuest(data,id?)`, `deleteWeddingGuest(id)`
- Create: `js/views/weddingGuests.js` — `renderGuestsSegment(container)`
- Modify: `js/modals/weddingModal.js`(`openWeddingGuestModal(guest|null)` — 이름·측 select(두 이메일, `ownerName`+"측" 라벨)·관계 select(가족/친척/친구/직장/기타)·인원 number(기본 1)·축의금 number·메모), `js/views/wedding.js`, `index.html`(weddingGuestModal)

- [ ] **Step 1: 뷰** — 요약 카드(총 `count` 합, 측별 합, `gift` 합계) + 측 필터 칩 + 명단 행(이름, 관계 `.tag`, 인원, `fmtMoney` 축의금). 행 클릭 → 수정 모달.
- [ ] **Step 2: 스모크, 커밋** `feat: 결혼 준비 탭 4단계 — 하객·축의금`

### Task 11: 문서 갱신 + 최종 검증

- [ ] **Step 1: README** — 주요 기능에 결혼 준비 탭 추가, Firestore 구조에 `wedding_*` 4개 + `settings/wedding` 추가, rules 재게시 경고에 결혼 컬렉션 언급
- [ ] **Step 2: CLAUDE.md** — 모듈 레이아웃에 weddingDb/views/modals 추가, "결혼 준비 탭" 섹션(분리형 원칙, payments 파생, 탭 진입 로드, 멱등 시딩, rules 재게시)
- [ ] **Step 3: 전체 문법 검사 + 브라우저 스모크(4세그먼트 스텁 렌더, 다크모드 토글 확인), 커밋** `docs: 결혼 준비 탭 문서화` (최종 배포 포인트)
