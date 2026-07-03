// ================================================================
// js/constants.js — 상수 및 카테고리 설정
// ================================================================

// 파스텔 톤 팔레트 — 채도·명도를 비슷하게 맞춰 차트/점 표시가 조화롭게 보이도록.
export const CATEGORIES = {
  expense: [
    { id: "food",      name: "식비",     color: "#f4a261" },
    { id: "transport", name: "교통",     color: "#7fb3d5" },
    { id: "housing",   name: "주거",     color: "#b39ddb" },
    { id: "rent",      name: "월세",     color: "#f2a6c2" },
    { id: "mgmt",      name: "관리비",   color: "#c9a48c" },
    { id: "health",    name: "의료/건강", color: "#86c7a1" },
    { id: "shopping",  name: "쇼핑",     color: "#ef9a9a" },
    { id: "culture",   name: "문화/여가", color: "#80cbc4" },
    { id: "sub",       name: "구독",     color: "#9fa8da" },
    { id: "beauty",    name: "미용",     color: "#ffab91" },
    { id: "edu",       name: "교육",     color: "#90caf9" },
    { id: "etc",       name: "기타",     color: "#b0bec5" },
  ],
  income: [
    { id: "salary",   name: "월급",   color: "#81c784" },
    { id: "extra",    name: "부수입", color: "#7fb3d5" },
    { id: "transfer", name: "이체",   color: "#b39ddb" },
    { id: "etc_in",   name: "기타",   color: "#b0bec5" },
  ]
};

export function getCategoryInfo(id, type) {
  const list = type === "income" ? CATEGORIES.income : CATEGORIES.expense;
  return list.find(c => c.id === id) ?? { name: id, color: "#95a5a6" };
}
