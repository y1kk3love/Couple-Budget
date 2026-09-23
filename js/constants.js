// ================================================================
// js/constants.js — 상수 및 카테고리 설정
// ================================================================

// 토스 톤 팔레트 — 파스텔보다 채도를 한 단계 올려 차트가 또렷하게,
// 명도는 비슷하게 맞춰 점/도넛 표시가 라이트·다크 모두에서 조화롭게 보이도록.
export const CATEGORIES = {
  expense: [
    { id: "food",      name: "식비",     color: "#ff9e45" },
    { id: "transport", name: "교통",     color: "#4da3f5" },
    { id: "housing",   name: "주거",     color: "#9b7df0" },
    { id: "rent",      name: "월세",     color: "#f272b6" },
    { id: "mgmt",      name: "관리비",   color: "#c29063" },
    { id: "health",    name: "의료/건강", color: "#35c08e" },
    // 쇼핑은 빨강(#f56a6a)이었으나 지출 빨강(--expense)과 겹치고, 미용(코랄)·식비(주황)와
    // 월별 누적 막대에서 구분이 어려워 금색으로 — 미용은 연두로 (통계 색 정리)
    { id: "shopping",  name: "쇼핑",     color: "#e2b128" },
    { id: "culture",   name: "문화/여가", color: "#2fb8ac" },
    { id: "sub",       name: "구독",     color: "#7a85f0" },
    { id: "beauty",    name: "미용",     color: "#8bc34a" },
    { id: "edu",       name: "교육",     color: "#66c6ea" },
    { id: "etc",       name: "기타",     color: "#9aa5b1" },
  ],
  income: [
    { id: "salary",   name: "월급",   color: "#35c075" },
    { id: "extra",    name: "부수입", color: "#4da3f5" },
    { id: "transfer", name: "이체",   color: "#9b7df0" },
    { id: "etc_in",   name: "기타",   color: "#9aa5b1" },
  ]
};

// 사람별 지출 카드 등 사용자 구분용 색 — 카테고리 색과 같은 '데이터 색'이라
// 테마와 무관하게 고정 (JS/HTML 템플릿에 hex를 흩뿌리지 않도록 여기서만 정의)
export const OWNER_COLORS = ["#4da3f5", "#f272b6", "#9aa5b1", "#35c08e"];

export function getCategoryInfo(id, type) {
  const list = type === "income" ? CATEGORIES.income : CATEGORIES.expense;
  return list.find(c => c.id === id) ?? { name: id, color: "#95a5a6" };
}

// ── 결혼 준비 탭 ──────────────────────────────────────────────

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
