// ================================================================
// js/constants.js — 상수 및 카테고리 설정
// ================================================================

// 파스텔 투톤 팔레트 — 팬톤 파스텔 배색(Double Cream·Meadow Mist·Ballad Blue·Ballerina·
// Soft Pink·Buttercream·Silver Birch)의 색상을 따르되, 원본은 흰 카드 대비 1.1~1.6:1이라
// 흰 카드에서 보이도록 명도를 한 단계 낮추고 채도를 조금 올렸다 (OKLCH로 계산).
// 채도가 낮은 파스텔은 색상 차이만으로는 잘 안 갈라져서, 정의 순서대로 밝은 톤·짙은 톤을
// 번갈아 둔다 — 통계 누적 막대에서 맞닿는 이웃이 명도로도 구분된다. 지출 빨강(--expense)과
// 헷갈리지 않게 빨강은 쓰지 않는다. 순서를 바꾸면 이웃 대비를 다시 확인할 것.
export const CATEGORIES = {
  expense: [
    { id: "food",      name: "식비",     color: "#fac7b1" }, // 밝음 · 피치 (Soft Pink)
    { id: "transport", name: "교통",     color: "#92b6d5" }, // 짙음 · 블루 (Ballad Blue)
    { id: "housing",   name: "주거",     color: "#d2c6f1" }, // 밝음 · 라벤더
    { id: "rent",      name: "월세",     color: "#abc093" }, // 짙음 · 세이지 (Meadow Mist)
    { id: "mgmt",      name: "관리비",   color: "#f5c5d8" }, // 밝음 · 핑크 (Ballerina)
    { id: "health",    name: "의료/건강", color: "#8ec3c0" }, // 짙음 · 아쿠아
    { id: "shopping",  name: "쇼핑",     color: "#f6e09f" }, // 밝음 · 크림 옐로 (Double Cream)
    { id: "culture",   name: "문화/여가", color: "#aba6d4" }, // 짙음 · 페리윙클
    { id: "sub",       name: "구독",     color: "#bbe3c8" }, // 밝음 · 민트
    { id: "beauty",    name: "미용",     color: "#caa2c5" }, // 짙음 · 오키드
    { id: "edu",       name: "교육",     color: "#bde1f3" }, // 밝음 · 스카이
    { id: "etc",       name: "기타",     color: "#c5c5b9" }, // 그레이지 (Silver Birch)
  ],
  income: [
    { id: "salary",   name: "월급",   color: "#abc093" },
    { id: "extra",    name: "부수입", color: "#92b6d5" },
    { id: "transfer", name: "이체",   color: "#aba6d4" },
    { id: "etc_in",   name: "기타",   color: "#c5c5b9" },
  ]
};

// 사람별 지출 카드 등 사용자 구분용 색 — 카테고리 색과 같은 '데이터 색'이라
// 테마와 무관하게 고정 (JS/HTML 템플릿에 hex를 흩뿌리지 않도록 여기서만 정의)
// [0] 첫 번째 계정 블루 · [1] 두 번째 계정 핑크 · [2] 함께(작성자 없음) 그레이지 · [3] 그 밖
export const OWNER_COLORS = ["#92b6d5", "#e3abc3", "#c5c5b9", "#abc093"];

export function getCategoryInfo(id, type) {
  const list = type === "income" ? CATEGORIES.income : CATEGORIES.expense;
  return list.find(c => c.id === id) ?? { name: id, color: "#c5c5b9" };
}

// ── 결혼 준비 탭 ──────────────────────────────────────────────

// 결혼 준비 예산 카테고리 — 지출 카테고리와 같은 '데이터 색' (테마 무관)
export const WEDDING_CATEGORIES = [
  { id: "venue",     name: "예식장",         color: "#f5c5d8" },
  { id: "sdm",       name: "스드메",         color: "#d2c6f1" },
  { id: "jewelry",   name: "예물·예단",      color: "#f6e09f" },
  { id: "attire",    name: "한복·예복",      color: "#92b6d5" },
  { id: "honeymoon", name: "신혼여행",       color: "#8ec3c0" },
  { id: "appliance", name: "혼수·가전",      color: "#abc093" },
  { id: "house",     name: "신혼집",         color: "#eed7ba" }, // Buttercream
  { id: "invite",    name: "청첩장·식전영상", color: "#aba6d4" },
  { id: "flower",    name: "부케·꽃장식",    color: "#fac7b1" },
  { id: "etc_w",     name: "기타",           color: "#c5c5b9" },
];

export function getWeddingCategory(id) {
  return WEDDING_CATEGORIES.find(c => c.id === id) ?? { id, name: id ?? "기타", color: "#c5c5b9" };
}

// 체크리스트 시기 그룹 — 배열 순서가 곧 표시 순서
export const WEDDING_PERIODS = [
  { id: "d12_9", label: "D-12~9개월" },
  { id: "d8_6",  label: "D-8~6개월" },
  { id: "d5_4",  label: "D-5~4개월" },
  { id: "d3_2",  label: "D-3~2개월" },
  { id: "d1",    label: "D-1개월" },
  { id: "dweek", label: "D-week" },
  { id: "dday",  label: "D-day" },
  { id: "after", label: "식후" },
];

// 표준 결혼 준비 체크리스트 — '불러오기' 버튼으로 시딩 (문서 ID tpl_<index> 고정, 멱등)
export const WEDDING_CHECKLIST_TEMPLATE = [
  { title: "상견례",                      period: "d12_9" },
  { title: "결혼식 날짜·예산 협의",        period: "d12_9" },
  { title: "예식장 투어·계약",             period: "d12_9" },
  { title: "스드메 계약",                  period: "d12_9" },
  { title: "신혼집 예산·지역 결정",        period: "d12_9" },
  { title: "신혼집 계약",                  period: "d8_6" },
  { title: "신혼여행지 결정·항공 예약",    period: "d8_6" },
  { title: "웨딩 촬영 컨셉 결정",          period: "d8_6" },
  { title: "예물·예단 협의",               period: "d8_6" },
  { title: "드레스 투어",                  period: "d8_6" },
  { title: "웨딩 촬영",                    period: "d5_4" },
  { title: "한복·예복 맞춤",               period: "d5_4" },
  { title: "혼수·가전 리스트 작성",        period: "d5_4" },
  { title: "청첩장 시안 결정",             period: "d5_4" },
  { title: "본식 스냅·DVD 예약",           period: "d5_4" },
  { title: "청첩장 인쇄·발송 시작",        period: "d3_2" },
  { title: "식전 영상 제작",               period: "d3_2" },
  { title: "혼수·가전 구매",               period: "d3_2" },
  { title: "부케·꽃장식 결정",             period: "d3_2" },
  { title: "사회자·주례·축가 섭외",        period: "d3_2" },
  { title: "청첩장 모임",                  period: "d1" },
  { title: "최종 하객 인원 확인",          period: "d1" },
  { title: "식순·좌석 배치 확정",          period: "d1" },
  { title: "메이크업 리허설",              period: "d1" },
  { title: "예식장 최종 미팅",             period: "dweek" },
  { title: "피부 관리·컨디션 조절",        period: "dweek" },
  { title: "축의금 접수 담당 지정",        period: "dweek" },
  { title: "결혼식 물품 준비 (방명록 등)", period: "dweek" },
  { title: "결혼식 🎉",                    period: "dday" },
  { title: "축의금 정산",                  period: "dday" },
  { title: "신혼여행",                     period: "after" },
  { title: "혼인신고",                     period: "after" },
  { title: "감사 인사·답례",               period: "after" },
  { title: "축의금 내역 정리",             period: "after" },
];
