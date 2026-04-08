// ================================================================
// js/views/travel.js — 후쿠오카 여행 플랜 B
// ================================================================

const TRIP_INFO = {
  dates: "2026.04.17(금) — 04.20(월) · 3박 4일",
  hotel: "S-peria Hotel Hakata (하카타역 도보 4분)",
  flight: "제주항공 7C1403 ICN→FUK 09:30 / 7C1474 FUK→ICN 10:50",
};

const DAYS = [
  {
    label: "DAY 1",
    date: "4/17 금",
    theme: "도착 + 텐진",
    items: [
      { time: "11:00", name: "후쿠오카 공항 도착", desc: "하카타역 지하철 5분 → 체크인", mapId: "ChIJrQFpQhaQQTURtx9OWEZ_5hY" },
      { time: "12:00", name: "Good Up Coffee", desc: "브런치", mapId: "ChIJP4S1jZ6RQTURCzsnvmr-Bq0" },
      { time: "14:00", name: "텐진 지하상가 + 다이묘 골목", desc: "산책 & 쇼핑", mapId: null },
      { time: "18:30", name: "우나기 온다이메 키쿠가와", desc: "장어 요리", mapId: "ChIJw2DR91WRQTUR-yTE5yhDFqU", booking: true },
    ],
  },
  {
    label: "DAY 2",
    date: "4/18 토",
    theme: "이토시마 버스투어",
    items: [
      { time: "08:40", name: "하카타역 출발", desc: "B코스 버스투어 (이토시마)", mapId: "ChIJdbP55seRQTURkIu5RT0r4i4" },
      { time: "10:00", name: "미야지다케 신사", desc: "이토시마 명소", mapId: "ChIJGz8RUW_qQTURcYNImsZqXxE" },
      { time: "11:20", name: "이온몰", desc: "자유 점심", mapId: null },
      { time: "14:30", name: "소금공방 롯탄", desc: "소금푸딩 맛집", mapId: "ChIJpch_5JHdQTURHgKfbH49C-4" },
      { time: "15:40", name: "후티미가우라 부부바위", desc: "천국의 그네", mapId: "ChIJdZijMN3uQTURZk1DiKqs-Uc" },
      { time: "18:00", name: "하카타역 귀환", desc: "", mapId: "ChIJdbP55seRQTURkIu5RT0r4i4" },
      { time: "19:00", name: "모츠나베 라쿠텐치 텐진점", desc: "곱창전골", mapId: "ChIJ___8H46RQTURLusiwCoEPo0", booking: true },
    ],
  },
  {
    label: "DAY 3",
    date: "4/19 일",
    theme: "우미노나카미치",
    items: [
      { time: "09:00", name: "Cafe del Sol", desc: "팬케이크 브런치 (다이묘)", mapId: "ChIJMbdaxIWRQTURjUaGge-dDkU" },
      { time: "10:30", name: "우미노나카미치 해변공원", desc: "자전거 대여 · 꽃밭 · 카피바라 동물원", mapId: "ChIJaQp6H7KNQTURjzG7SoOP370" },
      { time: "13:00", name: "공원 내 점심", desc: "", mapId: null },
      { time: "16:30", name: "텐진 귀환", desc: "", mapId: null },
      { time: "18:00", name: "돈키호테 + 드럭스토어", desc: "쇼핑", mapId: "ChIJj9iUqoWRQTURWnFERWGSVHg" },
      { time: "19:30", name: "하카타 로바타 피셔맨", desc: "이자카야", mapId: "ChIJMY6uv4SRQTURE0SATIzygJg", booking: true },
    ],
  },
  {
    label: "DAY 4",
    date: "4/20 월",
    theme: "귀국",
    items: [
      { time: "07:00", name: "기상 + 체크아웃", desc: "", mapId: null },
      { time: "07:30", name: "호텔 근처 카페/편의점", desc: "아침", mapId: null },
      { time: "08:30", name: "하카타역 → 공항", desc: "지하철 5분", mapId: "ChIJdbP55seRQTURkIu5RT0r4i4" },
      { time: "09:00", name: "수속 + 면세점", desc: "", mapId: "ChIJrQFpQhaQQTURtx9OWEZ_5hY" },
      { time: "10:50", name: "출발", desc: "7C1474 FUK→ICN", mapId: null },
    ],
  },
];

let activeDay = 0;

export function renderTravelView() {
  const el = document.getElementById("view-travel");
  el.innerHTML = buildView();

  el.querySelectorAll(".travel-day-tab").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      activeDay = i;
      el.querySelector(".travel-day-content").innerHTML = buildDayHTML(DAYS[activeDay]);
      el.querySelectorAll(".travel-day-tab").forEach((b, j) =>
        b.classList.toggle("active", j === i)
      );
    });
  });
}

function buildView() {
  return `
    <div class="travel-wrap">
      <div class="travel-header">
        <div class="travel-title">후쿠오카 여행 <span class="travel-plan-badge">Plan B</span></div>
        <div class="travel-meta">
          <div class="travel-meta-row">
            <span class="travel-meta-icon">📅</span>
            <span>${TRIP_INFO.dates}</span>
          </div>
          <div class="travel-meta-row">
            <span class="travel-meta-icon">🏨</span>
            <span>${TRIP_INFO.hotel}</span>
          </div>
          <div class="travel-meta-row">
            <span class="travel-meta-icon">✈️</span>
            <span>${TRIP_INFO.flight}</span>
          </div>
        </div>
        <div class="travel-booking-notice">
          ⚠️ 예약 필수 — 우나기 키쿠가와 · 모츠나베 라쿠텐치 · 하카타 로바타 피셔맨
        </div>
      </div>

      <div class="travel-day-tabs">
        ${DAYS.map((d, i) => `
          <button class="travel-day-tab${i === activeDay ? " active" : ""}">
            <span class="tab-label">${d.label}</span>
            <span class="tab-date">${d.date}</span>
          </button>
        `).join("")}
      </div>

      <div class="travel-day-content">
        ${buildDayHTML(DAYS[activeDay])}
      </div>
    </div>`;
}

function buildDayHTML(day) {
  return `
    <div class="travel-day-theme">${day.theme}</div>
    <div class="travel-timeline">
      ${day.items.map((item, idx) => `
        <div class="travel-item">
          <div class="travel-time">${item.time}</div>
          <div class="travel-dot-wrap">
            <div class="travel-dot${item.booking ? " booking" : ""}"></div>
            ${idx < day.items.length - 1 ? '<div class="travel-line"></div>' : ""}
          </div>
          <div class="travel-info">
            <div class="travel-name">
              ${item.name}
              ${item.booking ? '<span class="travel-booking-badge">예약 필수</span>' : ""}
            </div>
            ${item.desc ? `<div class="travel-desc">${item.desc}</div>` : ""}
            ${item.mapId ? `<a class="travel-map-link" href="https://www.google.com/maps/search/?api=1&query=a&query_place_id=${item.mapId}" target="_blank" rel="noopener">지도 보기 →</a>` : ""}
          </div>
        </div>
      `).join("")}
    </div>`;
}
