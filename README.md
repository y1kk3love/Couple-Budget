# 💑 우리 가계부 (Couple Budget)

커플/부부를 위한 공유 가계부 웹 앱입니다. Firebase를 기반으로 두 사람이 수입·지출을 함께 관리하며, 한 사람이 입력하거나 고친 내용은 상대 화면에 **새로고침 없이 바로** 반영됩니다.

---

## 주요 기능

### 거래 내역 관리
- 수입/지출 항목 추가, 수정, 삭제 — 카테고리는 색 점이 있는 칩으로 한 번에 선택
- 카테고리 분류 (지출 12개, 수입 4개), 고정/변동 구분 태그
- **내용** 칸이 목록·달력에 보이는 이름이 됨 (비우면 카테고리 이름)
- 한 거래의 카테고리를 바꾸면 같은 이름의 거래 전체(전 기간)에 함께 적용
- 작성자 기록 — 누가 입력했는지 목록과 통계(사람별 지출)에 표시
- 월별 데이터 자동 분리

### 화면 구성 (6가지 뷰)

| 뷰 | 설명 |
|---|---|
| **달력** | 월간 달력으로 날짜별 수입·지출 한눈에 확인. 날짜를 누르면 그날 기존 내역과 함께 추가 창 |
| **목록** | 이번 달/전체 기간 전환, 날짜·금액·카테고리·이름 정렬, 이름·카테고리·금액·날짜 필터 |
| **통계** | 최근 6개월 카테고리별 지출 비교, 카테고리별 지출, 고정비 vs 변동비, 수입 vs 지출, 사람별 지출 |
| **고정비** | 매월 반복되는 수입/지출 항목 관리. 적용 시작 월과 매월 반영 일자 지정 |
| **예산안** | 1인당 월급 배정 계획표. 도넛 차트로 항목별 배분·잔여 확인 (월과 무관) |
| **결혼** | 결혼 준비 전용 장부 — D-day, 예산·지출(부담 주체·정산), 일정, 체크리스트, 업체 비교, 메모 (월과 무관) |

### 요약 바
월 화면 상단에 **이번달 잔액 / 예산 / 수입·지출 / 누적 잔액** 네 카드를 표시합니다.
- **예산**: 월 지출 예산 대비 남은 금액과 진행 막대 (80% 이상 주황, 초과 시 빨강). 카드를 눌러 설정하며, "이번 달에만 적용"으로 특정 달만 다른 예산을 둘 수 있습니다
- **누적 잔액**: 이전 달까지의 잔액을 포함한 합계
- 휴대폰에서는 가로로 넘겨 보는 카드이며, 예산 카드가 둘째 칸이라 바로 보입니다

### 고정비 자동 반영
- 고정비 항목은 달을 열 때마다 그 달의 거래로 자동 기록됩니다 (두 사람이 동시에 열어도 중복 없음)
- 고정비를 고치면 **이번 달부터** 반영되고, 지난 달 기록은 그대로 보존됩니다
- 자동 기록된 거래를 지우면 그 달만 "건너뜀"으로 남고, 다른 달로 옮기면 원래 달은 건너뜀 처리됩니다
- 고정비를 삭제하면 이번 달까지의 기록은 남고 다음 달부터 기록되지 않습니다

### 결혼 준비 탭

일상 가계부와 **완전히 분리된** 결혼 준비 전용 공간입니다 (월별 통계·누적 잔액에 영향 없음).

- **D-day 헤더**: 결혼식 날짜 카운트다운 + 총예산(항목 계획 합계) 대비 지출 진행률 + 사람별 부담 요약 + 외부 검증 시트 바로가기(선택)
- **예산**: 항목별 계획 금액·부담 주체(나/상대/공동)·결제 내역(계약금/중도금/잔금)과 결제별 정산 금액, 계획 대비 사용률
- **일정**: 체촌·옷 픽업 같은 약속을 미니 달력·D-n 목록으로 관리, 같은 달이면 메인 화면 배너와 달력 마커로 알림
- **체크리스트**: 표준 결혼 준비 순서(D-12개월~식후) 템플릿 제공, 시기별 진행률
- **업체**: 후보 업체 견적 비교, 확정 시 예산 항목에 견적가 자동 반영
- **메모**: 두 사람이 함께 쓰는 공유 메모장
- 결혼 탭에서 + 버튼은 보고 있는 세그먼트의 항목(예산 항목·일정·할 일·업체)을 추가합니다
- 상대가 그 사이 같은 항목이나 메모를 고쳤다면, 저장 전에 덮어쓸지 묻습니다

### 실시간 동기화
- 로그인 동안 두 사람의 변경이 서로의 화면에 바로 반영됩니다
- 입력 중인 화면(필터, 예산안 수정, 메모 등)은 덮어쓰지 않고, 다음 동작 때 최신 내용으로 바뀝니다

### CSV 가져오기
- 신한카드 CSV 컬럼(날짜·가맹점·금액·구분·카테고리) 자동 인식, **EUC-KR 인코딩** 파일 기준
- 날짜 형식 자동 인식: `2026-09-01`, `2026.09.01`, `2026/09/01`, `2026. 9. 1`, `2026년 9월 1일`, `20260901` (시간이 붙어도 됨)
- 금액의 부호·소수점 인식 — 음수(`-15,000`, `(15,000)`)는 환불·취소로 보고 반대 방향(지출↔수입)으로 가져옴
- 날짜를 읽지 못한 행은 제외하고, 뒤집히거나 제외된 행 수를 미리보기에서 알려 줌
- 같은 파일을 다시 가져와도 중복되지 않음 (행 내용으로 문서 ID 결정)
- 드래그 앤 드롭 업로드, 미리보기 후 일괄 가져오기
- 신한카드 `.xls` 명세서는 `tools/convert-shinhan-xls.ps1`로 먼저 변환합니다 (Windows + Excel 필요). `excel/` 폴더의 `.xls`를 읽어 월별 CSV를 `excel/converted/`에 만듭니다

### CSV 내보내기
- 전체 기간 거래를 UTF-8(BOM) CSV로 저장 — 엑셀에서 한글이 깨지지 않음
- 휴대폰에서는 가져오기/내보내기가 왼쪽 위 메뉴(☰) 안에 있습니다

### 화면
- 토스 스타일 디자인, 다크 모드(시스템 설정 따름 + 헤더 버튼으로 전환)
- 휴대폰에서는 하단 탭과 바텀시트 입력창, 터치 기기의 누름 영역은 44px 이상
- 글씨 대비 WCAG AA(4.5:1) 기준 — 라이트·다크 모두

---

## 카테고리

### 지출 (12개)
라이트·다크 모두에서 또렷한 데이터 색을 씁니다. 빨강은 "지출"을 뜻하므로 카테고리 색으로 쓰지 않습니다.

| 카테고리 | 색상 |
|---|---|
| 식비 | 주황 |
| 교통 | 파랑 |
| 주거 | 보라 |
| 월세 | 핑크 |
| 관리비 | 브라운 |
| 의료/건강 | 초록 |
| 쇼핑 | 금색 |
| 문화/여가 | 청록 |
| 구독 | 연보라 |
| 미용 | 연두 |
| 교육 | 하늘 |
| 기타 | 회색 |

### 수입 (4개)
월급 / 부수입 / 이체 / 기타

---

## 기술 스택

- **프론트엔드:** 순수 JavaScript (ES 모듈), HTML5, CSS3 — 프레임워크·빌드 도구 없음
- **백엔드/DB:** Firebase Firestore (실시간 리스너)
- **인증:** Google OAuth (Firebase Auth)
- **폰트:** Pretendard (숫자는 자릿수 고정 `tabular-nums`)
- **배포:** GitHub Pages

---

## 시작하기

### 사전 준비
- Firebase 프로젝트 (무료 플랜 가능)
- Google 계정 2개 (커플 각각)
- 로컬 실행용 HTTP 서버 (ES 모듈이라 `file://`로는 열리지 않음)

### 설치 및 설정

**1. 저장소 클론**
```bash
git clone https://github.com/y1kk3love/couple-budget.git
cd couple-budget
```

**2. Firebase 프로젝트 생성**
1. [Firebase 콘솔](https://console.firebase.google.com)에서 새 프로젝트 생성
2. 웹 앱 추가 후 Firebase 설정값 복사
3. Firestore Database 생성
4. Authentication → Google 로그인 방식 활성화

**3. `firebase.js` 설정**
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 접근 허용할 이메일 2개 입력
export const ALLOWED_EMAILS = [
  "you@gmail.com",
  "partner@gmail.com"
];
```

**4. Firestore 보안 규칙 적용**

Firebase 콘솔 → Firestore → 규칙 탭에 `firestore.rules` 내용을 붙여넣고, `isAllowed()` 안의 자리표시 이메일(`your_email@gmail.com`, `partner_email@gmail.com`)을 실제 두 이메일로 바꾼 뒤 게시합니다. 저장소의 파일은 자리표시 그대로 두고, 콘솔에 붙여넣을 때만 바꿉니다.

> ⚠️ **이메일은 두 곳에서 따로 관리됩니다.** `firebase.js`의 `ALLOWED_EMAILS`(클라이언트 차단)와 콘솔에 게시한 규칙의 `isAllowed()`(서버 차단)는 자동 동기화되지 않습니다. 사용자를 바꿀 때마다 **두 곳 모두** 갱신하세요. 규칙을 다시 붙여넣을 때 이메일 치환을 잊으면 두 사람 모두 접근이 막힙니다.

**5. Firestore 복합 인덱스 생성**

거래 조회 쿼리(`year` == + `month` == + `date` 내림차순 정렬)에 복합 인덱스가 필요합니다. Firebase 콘솔 → Firestore → 색인 탭에서 `transactions` 컬렉션에 아래 인덱스를 만들어 주세요:

| 필드 | 순서 |
|---|---|
| `year` | 오름차순 |
| `month` | 오름차순 |
| `date` | 내림차순 |

> 인덱스 없이 앱을 처음 실행하면 화면에 "Firestore 복합 색인이 없어요" 안내가 뜨고, 브라우저 콘솔에 `failed-precondition` 오류와 인덱스 생성 링크가 출력됩니다. 그 링크를 눌러 만들어도 됩니다.

**6. 로컬 실행**

Node·Python 없이 Windows PowerShell만으로 실행할 수 있는 정적 서버가 들어 있습니다:
```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8000
```
Node나 Python이 있다면 이것도 됩니다:
```bash
npx http-server -p 8000
python -m http.server 8000
```
브라우저에서 `http://localhost:8000` 접속

### 배포

**GitHub Pages**(브랜치에서 배포)로 서비스합니다. `main` 브랜치에 푸시하면 자동으로 다시 배포됩니다. 빌드가 멈추면 빈 커밋(`git commit --allow-empty`)을 푸시해 다시 시작할 수 있습니다.

정적 파일만 있으므로 Firebase Hosting, Netlify, Vercel 등 다른 정적 호스팅에도 그대로 올릴 수 있습니다.

---

## Firestore 데이터 구조

### `transactions` 컬렉션
```
{
  name:      string   // 목록에 보이는 이름 (입력창 "내용", 비우면 카테고리 이름)
  amount:    number   // 금액 (원, 양수)
  type:      string   // "income" | "expense"
  category:  string   // 카테고리 ID
  kind:      string   // "fixed" | "variable"
  memo:      string   // 입력창 "내용" 원문
  date:      string   // "YYYY-MM-DD"
  year:      number   // 월 조회용 — 반드시 date와 일치
  month:     number
  owner:     string   // 작성자 이메일 (선택 — 예전 기록·고정비 자동 기록에는 없음)
  fromFixed: boolean  // 고정비에서 자동 생성 여부
  fixedId:   string   // 연결된 고정비 ID
}
```
- 고정비 자동 기록은 문서 ID가 `fixed_<고정비ID>_<YYYY-MM>`로 정해져 있습니다
- 자동 기록을 삭제하면 문서를 지우지 않고 **건너뜀 표시** `{ skipped: true, fixedId, year, month, date, fromFixed: true }`로 덮어씁니다 (금액·이름 없음)
- CSV로 가져온 거래는 문서 ID가 `csv_<날짜>_<금액>_<가맹점 해시>_<순번>`입니다

### `fixed_items` 컬렉션
```
{
  name:       string  // 항목 이름
  amount:     number  // 월 금액
  type:       string  // "income" | "expense"
  category:   string  // 카테고리 ID
  startYear:  number  // 적용 시작 연도
  startMonth: number  // 적용 시작 월
  day:        number  // 매월 반영 일자 (1~31, 그 달 마지막 날로 맞춤, 기본 1)
}
```

### `settings` 컬렉션
```
settings/budget   { amount, months: { "YYYY-MM": amount } }   // 기본 월 예산 + 특정 달 전용 예산
settings/wedding  { date, memo, sheetUrl }                     // 결혼식 날짜, 공유 메모, 검증 시트 링크
```

### `budget_plans` 컬렉션 (문서 ID = 이메일)
```
{ owner, name(표시 이름, 선택), income, items: [{ name, amount }] }
```

### 결혼 준비 컬렉션

총예산은 저장하지 않고 항목 계획 금액의 합으로 계산합니다.

```
wedding_items   { name, category, planned, payer(이메일|"both"), payments:[{label,amount,date,settledAmount(정산된 금액),settled(전액 정산 여부)}], memo, order, vendorId }
wedding_tasks   { title, period(시기 그룹 ID), done, memo, order }
wedding_vendors { category, name, price, contact, memo, status("candidate"|"chosen") }
wedding_events  { title, date, time(선택), memo }   // 체촌·픽업 등 일정 — 메인 달력 마커·배너에도 사용
```

> ⚠️ 예산안·결혼 탭을 쓰려면 `firestore.rules`의 `budget_plans`·`wedding_*` 블록이 콘솔에 게시되어 있어야 합니다. 규칙을 예전에 붙여넣었다면 최신 파일로 다시 게시하세요. (`wedding_guests`는 하객 기능을 되살릴 수 있도록 규칙에만 남아 있습니다.)

---

## 보안

- 허용 이메일 2개만 접근 가능 (Firebase Auth + Firestore 규칙 이중 적용)
- 다른 사용자는 로그인 자체가 차단됨
- Firestore 보안 규칙으로 데이터 읽기/쓰기 모두 제한
- `firebase.js`의 Firebase 설정값은 공개 저장소에 그대로 있습니다 — 접근 제어는 설정값 비밀이 아니라 허용 이메일과 보안 규칙에 달려 있습니다
