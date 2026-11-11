// 목업 시드 데이터 — 결정적 난수로 이번 달까지 6개월치 거래를 만든다 (오늘 날짜 기준이라 언제 열어도 "이번 달"이 차 있다)
// ?empty=1 이면 빈 계정
import { WEDDING_CHECKLIST_TEMPLATE } from "../../js/constants.js";
const A = "minsu@example.com", B = "jieun@example.com";
const empty = new URLSearchParams(globalThis.location?.search ?? "").get("empty") === "1";

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const MERCH = {
  food: [["스타벅스", 4500, 12000], ["배달의민족", 18000, 38000], ["이마트", 30000, 120000], ["김밥천국", 7000, 16000], ["GS25", 3000, 12000], ["맥도날드", 8000, 19000]],
  transport: [["카카오T", 6000, 24000], ["지하철", 1400, 1400], ["SK에너지", 50000, 80000]],
  shopping: [["쿠팡", 12000, 89000], ["무신사", 39000, 129000], ["다이소", 3000, 15000]],
  culture: [["CGV", 14000, 30000], ["교보문고", 12000, 42000]],
  health: [["온누리약국", 4000, 18000], ["연세정형외과", 12000, 45000]],
  beauty: [["올리브영", 9000, 48000], ["블루클럽", 12000, 12000]],
  etc: [["경조사비", 50000, 100000]],
};
const WEIGHTED = ["food", "food", "food", "food", "food", "transport", "transport", "shopping", "shopping", "culture", "health", "beauty", "etc"];

export function seed() {
  if (empty) return { transactions: {}, fixed_items: {}, settings: {}, budget_plans: {}, wedding_items: {}, wedding_tasks: {}, wedding_vendors: {}, wedding_events: {} };
  let s = 42;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rnd() * a.length)];

  const today = new Date();
  // 이번 달 포함 최근 6개월 (오래된 → 최신)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  const start = months[0];

  const tx = {};
  const fixed = {
    fx_rent:  { name: "월세",      amount: 800000,  type: "expense", category: "rent",   startYear: start.y, startMonth: start.m, day: 25 },
    fx_mgmt:  { name: "관리비",    amount: 152000,  type: "expense", category: "mgmt",   startYear: start.y, startMonth: start.m, day: 10 },
    fx_nf:    { name: "넷플릭스",  amount: 17000,   type: "expense", category: "sub",    startYear: start.y, startMonth: start.m, day: 5 },
    fx_phone: { name: "통신비",    amount: 89000,   type: "expense", category: "sub",    startYear: start.y, startMonth: start.m, day: 21 },
    fx_sal:   { name: "민수 월급", amount: 3200000, type: "income",  category: "salary", startYear: start.y, startMonth: start.m, day: 25 },
  };
  months.forEach(({ y, m }, idx) => {
    const isCurrent = idx === months.length - 1;
    const ym = `${y}-${pad(m)}`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = isCurrent ? today.getDate() : lastDay;
    // 지난 달은 고정비가 이미 반영된 상태로 (이번 달은 앱이 열릴 때 스스로 만든다)
    if (!isCurrent) for (const [id, f] of Object.entries(fixed)) {
      tx[`fixed_${id}_${ym}`] = { name: f.name, amount: f.amount, type: f.type, category: f.category, kind: "fixed", memo: f.name, date: `${ym}-${pad(Math.min(f.day, lastDay))}`, year: y, month: m, fromFixed: true, fixedId: id };
    }
    if (!isCurrent || today.getDate() >= 10) {
      tx[`inc_${ym}`] = { name: "지은 월급", memo: "지은 월급", amount: 2900000, type: "income", category: "salary", kind: "variable", date: `${ym}-10`, year: y, month: m, owner: B };
    }
    const n = 26 + Math.floor(rnd() * 14);
    for (let i = 0; i < n; i++) {
      const cat = pick(WEIGHTED);
      const [name, lo, hi] = pick(MERCH[cat]);
      const amount = Math.round((lo + rnd() * (hi - lo)) / 100) * 100;
      const d = 1 + Math.floor(rnd() * last);
      const r = rnd();
      const owner = r < 0.45 ? A : r < 0.9 ? B : undefined;
      const t = { name, memo: name, amount, type: "expense", category: cat, kind: "variable", date: `${ym}-${pad(d)}`, year: y, month: m };
      if (owner) t.owner = owner;
      tx[`v_${ym}_${i}`] = t;
    }
    if (idx % 2 && last >= 14) tx[`side_${ym}`] = { name: "중고거래", memo: "중고거래", amount: 45000, type: "income", category: "extra", kind: "variable", date: `${ym}-14`, year: y, month: m, owner: A };
  });
  // 긴 이름 + 특수문자 케이스 (이번 달 1일)
  const cur = months.at(-1);
  tx.long = { name: "스마트스토어 <아주 긴 가맹점 이름> 주식회사 온라인 결제", memo: "스마트스토어 <아주 긴 가맹점 이름> 주식회사 온라인 결제", amount: 1234500, type: "expense", category: "shopping", kind: "variable", date: `${cur.y}-${pad(cur.m)}-01`, year: cur.y, month: cur.m, owner: A };

  const tasks = {};
  WEDDING_CHECKLIST_TEMPLATE.forEach((t, i) => { tasks[`tpl_${i}`] = { title: t.title, period: t.period, done: i < 9, memo: i === 2 ? "A홀 계약 완료" : "", order: i }; });

  return {
    transactions: tx,
    fixed_items: fixed,
    settings: {
      budget: { amount: 1800000, months: {} },
      wedding: { date: ymd(addDays(today, 157)), memo: "예식장: A홀 확정 (식대 6.8만)\n드레스 투어 3곳 예약함\n- 청담 ○○\n- 신사 △△", sheetUrl: "https://docs.google.com/spreadsheets/d/example" },
    },
    budget_plans: {
      [A]: { owner: A, name: "민수", income: 3200000, items: [
        { name: "생활비 분담", amount: 900000 }, { name: "적금", amount: 1000000 }, { name: "결혼 자금", amount: 600000 },
        { name: "용돈", amount: 400000 }, { name: "보험", amount: 150000 }, { name: "통신비", amount: 89000 } ] },
      [B]: { owner: B, name: "지은", income: 2900000, items: [
        { name: "생활비 분담", amount: 900000 }, { name: "청약", amount: 100000 }, { name: "적금", amount: 800000 },
        { name: "결혼 자금", amount: 700000 }, { name: "용돈", amount: 500000 } ] },
    },
    wedding_items: {
      wi1: { name: "예식장", category: "venue", planned: 15000000, payer: "both", memo: "A홀", order: 0, vendorId: "wv1",
             payments: [{ label: "계약금", amount: 2000000, date: ymd(addDays(today, -150)), settledAmount: 1000000, settled: false }] },
      wi2: { name: "스드메", category: "sdm", planned: 3500000, payer: A, memo: "", order: 1, vendorId: null,
             payments: [{ label: "계약금", amount: 500000, date: ymd(addDays(today, -130)), settledAmount: 500000, settled: true }] },
      wi3: { name: "예물·예단", category: "jewelry", planned: 5000000, payer: B, memo: "", order: 2, vendorId: null, payments: [] },
      wi4: { name: "신혼여행", category: "honeymoon", planned: 6000000, payer: "both", memo: "발리 6박", order: 3, vendorId: null,
             payments: [{ label: "항공권", amount: 1800000, date: ymd(addDays(today, -80)), settledAmount: 0, settled: false }] },
      wi5: { name: "혼수·가전", category: "appliance", planned: 8000000, payer: "both", memo: "", order: 4, vendorId: null, payments: [] },
      wi6: { name: "청첩장", category: "invite", planned: 300000, payer: B, memo: "", order: 5, vendorId: null,
             payments: [{ label: "잔금", amount: 380000, date: ymd(addDays(today, -70)), settledAmount: 380000, settled: true }] },
    },
    wedding_tasks: tasks,
    wedding_vendors: {
      wv1: { category: "venue", name: "A홀", price: 15000000, contact: "02-123-4567", memo: "식대 6.8만, 보증인원 200", status: "chosen" },
      wv2: { category: "venue", name: "B웨딩홀", price: 13500000, contact: "", memo: "주차 협소", status: "candidate" },
      wv3: { category: "venue", name: "C컨벤션", price: 17000000, contact: "", memo: "", status: "candidate" },
      wv4: { category: "sdm", name: "청담 ○○ 패키지", price: 3200000, contact: "010-0000-0000", memo: "", status: "candidate" },
      wv5: { category: "sdm", name: "신사 △△", price: 3600000, contact: "", memo: "드레스 예쁨", status: "candidate" },
    },
    wedding_events: {
      we1: { title: "예식장 계약", date: ymd(addDays(today, -20)), time: "11:00", memo: "" },
      we2: { title: "드레스 투어", date: ymd(addDays(today, 3)), time: "14:00", memo: "청담 ○○" },
      we3: { title: "예복 가봉", date: ymd(addDays(today, 16)), time: null, memo: "" },
      we4: { title: "웨딩 촬영", date: ymd(addDays(today, 30)), time: "09:00", memo: "스튜디오 B" },
    },
  };
}
