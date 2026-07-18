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
    { id: "shopping",  name: "쇼핑",     color: "#f56a6a" },
    { id: "culture",   name: "문화/여가", color: "#2fb8ac" },
    { id: "sub",       name: "구독",     color: "#7a85f0" },
    { id: "beauty",    name: "미용",     color: "#ff8a66" },
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

export function getCategoryInfo(id, type) {
  const list = type === "income" ? CATEGORIES.income : CATEGORIES.expense;
  return list.find(c => c.id === id) ?? { name: id, color: "#95a5a6" };
}
