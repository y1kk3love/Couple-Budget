// ================================================================
// js/constants.js — 상수 및 카테고리 설정
// ================================================================

export const CATEGORIES = {
  expense: [
    { id: "food",      name: "식비",     color: "#e67e22" },
    { id: "transport", name: "교통",     color: "#2980b9" },
    { id: "housing",   name: "주거",     color: "#8e44ad" },
    { id: "health",    name: "의료/건강", color: "#27ae60" },
    { id: "shopping",  name: "쇼핑",     color: "#e74c3c" },
    { id: "culture",   name: "문화/여가", color: "#16a085" },
    { id: "sub",       name: "구독",     color: "#2c3e50" },
    { id: "beauty",    name: "미용",     color: "#d35400" },
    { id: "edu",       name: "교육",     color: "#1abc9c" },
    { id: "etc",       name: "기타",     color: "#95a5a6" },
  ],
  income: [
    { id: "salary",   name: "월급",   color: "#1a7a55" },
    { id: "extra",    name: "부수입", color: "#2980b9" },
    { id: "transfer", name: "이체",   color: "#8e44ad" },
    { id: "etc_in",   name: "기타",   color: "#95a5a6" },
  ]
};

export function getCategoryInfo(id, type) {
  const list = type === "income" ? CATEGORIES.income : CATEGORIES.expense;
  return list.find(c => c.id === id) ?? { name: id, color: "#95a5a6" };
}
