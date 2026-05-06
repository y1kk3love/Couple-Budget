# 💑 우리 가계부 (Couple Budget)

커플/부부를 위한 공유 가계부 웹 앱입니다. Firebase를 기반으로 두 사람이 실시간으로 수입·지출을 함께 관리할 수 있습니다.

---

## 주요 기능

### 거래 내역 관리
- 수입/지출 항목 추가, 수정, 삭제
- 카테고리 분류 (지출 10개, 수입 4개)
- 고정/변동 구분 태그
- 메모 입력 지원
- 월별 데이터 자동 분리

### 화면 구성 (4가지 뷰)

| 뷰 | 설명 |
|---|---|
| **캘린더** | 월간 달력으로 날짜별 수입·지출 한눈에 확인. 날짜 클릭 시 항목 추가 |
| **목록** | 날짜 기준 최신순 정렬. 카테고리·종류·메모·금액 표시. 클릭 시 수정 |
| **통계** | 카테고리별 지출 비율, 고정/변동 비율, 수입 대비 지출 현황 시각화 |
| **고정비** | 매월 반복되는 수입/지출 항목 관리. 적용 시작 월 지정 가능 |

### 요약 바
매달 상단에 **수입 합계 / 지출 합계 / 이번 달 잔액 / 누적 잔액** 실시간 표시

### CSV 가져오기
- 신한카드 CSV 포맷 자동 인식
- 날짜 형식 자동 파싱 (YYYYMMDD, YYYY.MM.DD, YYYY-MM-DD)
- 미리보기 후 일괄 가져오기
- 드래그 앤 드롭 파일 업로드 지원

---

## 카테고리

### 지출 (10개)
| 카테고리 | 색상 |
|---|---|
| 식비 | 주황 |
| 교통 | 파랑 |
| 주거 | 보라 |
| 의료/건강 | 초록 |
| 쇼핑 | 빨강 |
| 문화/여가 | 청록 |
| 구독 | 어두운 색 |
| 미용 | 주황계열 |
| 교육 | 하늘 |
| 기타 | 회색 |

### 수입 (4개)
월급 / 부수입 / 이체 / 기타

---

## 기술 스택

- **프론트엔드:** 순수 JavaScript (ES6 모듈), HTML5, CSS3
- **백엔드/DB:** Firebase Firestore
- **인증:** Google OAuth (Firebase Auth)
- **폰트:** Pretendard (UI), DM Mono (숫자)
- **빌드 도구:** 없음 (별도 빌드 과정 불필요)

---

## 시작하기

### 사전 준비
- Firebase 프로젝트 (무료 플랜 가능)
- Google 계정 2개 (커플 각각)
- HTTP 서버 (로컬 실행 시)

### 설치 및 설정

**1. 저장소 클론**
```bash
git clone https://github.com/y1kk3love/couple-budget.git
cd couple-budget
```

**2. Firebase 프로젝트 생성**
1. [Firebase 콘솔](https://console.firebase.google.com)에서 새 프로젝트 생성
2. 웹 앱 추가 후 Firebase 설정값 복사
3. Firestore Database 생성 (테스트 모드로 시작)
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

Firebase 콘솔 → Firestore → 규칙 탭에서 `firestore.rules` 내용을 붙여넣고, 이메일 주소를 본인 것으로 수정 후 게시합니다.

**5. 로컬 실행**
```bash
# Python
python -m http.server 8000

# Node.js
npx http-server

# VS Code Live Server 확장 사용 가능
```
브라우저에서 `http://localhost:8000` 접속

### 배포

Firebase Hosting 또는 Netlify, Vercel, GitHub Pages 등 정적 호스팅 서비스 모두 사용 가능합니다.

```bash
# Firebase Hosting 사용 시
firebase deploy
```

---

## Firestore 데이터 구조

### `transactions` 컬렉션
```
{
  name:      string   // 항목 이름
  amount:    number   // 금액 (원)
  type:      string   // "income" | "expense"
  category:  string   // 카테고리 ID
  kind:      string   // "fixed" | "variable"
  memo:      string   // 메모 (선택)
  date:      string   // "YYYY-MM-DD"
  year:      number
  month:     number
  fromFixed: boolean  // 고정 항목에서 자동 생성 여부
  fixedId:   string   // 연결된 고정 항목 ID
}
```

### `fixed_items` 컬렉션
```
{
  name:       string  // 항목 이름
  amount:     number  // 월 금액
  type:       string  // "income" | "expense"
  category:   string  // 카테고리 ID
  startYear:  number  // 적용 시작 연도
  startMonth: number  // 적용 시작 월
}
```

---

## 보안

- 허용 이메일 2개만 접근 가능 (Firebase Auth + Firestore 규칙 이중 적용)
- 다른 사용자는 로그인 자체가 차단됨
- Firestore 보안 규칙으로 데이터 읽기/쓰기 모두 제한
