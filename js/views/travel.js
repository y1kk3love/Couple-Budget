// ================================================================
// js/views/travel.js — 후쿠오카 여행 플랜 B (지도 + 타임라인)
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
    color: "#6366f1",
    items: [
      { time: "11:00", name: "후쿠오카 공항 도착", desc: "하카타역 지하철 5분 → 체크인", coords: [33.5852, 130.4508] },
      { time: "12:00", name: "Good Up Coffee", desc: "브런치", coords: [33.5897, 130.4180] },
      { time: "14:00", name: "텐진 지하상가 + 다이묘 골목", desc: "산책 & 쇼핑", coords: [33.5901, 130.3983] },
      { time: "18:30", name: "우나기 온다이메 키쿠가와", desc: "장어 요리", coords: [33.5895, 130.3950], booking: true },
    ],
  },
  {
    label: "DAY 2",
    date: "4/18 토",
    theme: "이토시마 버스투어",
    color: "#10b981",
    items: [
      { time: "08:40", name: "하카타역 출발", desc: "B코스 버스투어 (이토시마)", coords: [33.5902, 130.4197] },
      { time: "10:00", name: "미야지다케 신사", desc: "이토시마 명소", coords: [33.7084, 130.5419] },
      { time: "11:20", name: "이온몰 이토시마", desc: "자유 점심", coords: [33.5437, 130.1875] },
      { time: "14:30", name: "소금공방 롯탄", desc: "소금푸딩 맛집", coords: [33.5461, 130.1882] },
      { time: "15:40", name: "후티미가우라 부부바위", desc: "천국의 그네", coords: [33.5370, 130.1797] },
      { time: "18:00", name: "하카타역 귀환", desc: "", coords: [33.5902, 130.4197] },
      { time: "19:00", name: "모츠나베 라쿠텐치 텐진점", desc: "곱창전골", coords: [33.5898, 130.3988], booking: true },
    ],
  },
  {
    label: "DAY 3",
    date: "4/19 일",
    theme: "우미노나카미치",
    color: "#f59e0b",
    items: [
      { time: "09:00", name: "Cafe del Sol", desc: "팬케이크 브런치 (다이묘)", coords: [33.5925, 130.3952] },
      { time: "10:30", name: "우미노나카미치 해변공원", desc: "자전거 대여 · 꽃밭 · 카피바라 동물원", coords: [33.6415, 130.4240] },
      { time: "13:00", name: "공원 내 점심", desc: "", coords: null },
      { time: "16:30", name: "텐진 귀환", desc: "", coords: [33.5901, 130.3983] },
      { time: "18:00", name: "돈키호테 + 드럭스토어", desc: "쇼핑", coords: [33.5898, 130.3990] },
      { time: "19:30", name: "하카타 로바타 피셔맨", desc: "이자카야", coords: [33.5887, 130.4007], booking: true },
    ],
  },
  {
    label: "DAY 4",
    date: "4/20 월",
    theme: "귀국",
    color: "#8b5cf6",
    items: [
      { time: "07:00", name: "기상 + 체크아웃", desc: "S-peria Hotel Hakata", coords: [33.5895, 130.4175] },
      { time: "07:30", name: "호텔 근처 카페/편의점", desc: "아침", coords: null },
      { time: "08:30", name: "하카타역 → 공항", desc: "지하철 5분", coords: [33.5902, 130.4197] },
      { time: "09:00", name: "수속 + 면세점", desc: "", coords: [33.5852, 130.4508] },
      { time: "10:50", name: "출발", desc: "7C1474 FUK→ICN", coords: null },
    ],
  },
];

let activeDay = 0;
let leafletMap = null;
let routeLayer = null;
let markerGroup = null;

export function renderTravelView() {
  const el = document.getElementById("view-travel");
  el.innerHTML = buildView();

  el.querySelectorAll(".travel-day-tab").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      activeDay = i;
      el.querySelectorAll(".travel-day-tab").forEach((b, j) =>
        b.classList.toggle("active", j === i)
      );
      el.querySelector(".travel-day-content").innerHTML = buildTimelineHTML(DAYS[activeDay]);
      updateMap(DAYS[activeDay]);
    });
  });

  // 지도는 DOM 렌더 후 초기화
  setTimeout(() => initMap(), 50);
}

// ── 전체 뷰 HTML ──────────────────────────────────────────────

function buildView() {
  return `
    <div class="travel-wrap">
      <div class="travel-header">
        <div class="travel-title">후쿠오카 여행 <span class="travel-plan-badge">Plan B</span></div>
        <div class="travel-meta">
          <div class="travel-meta-row"><span class="travel-meta-icon">📅</span><span>${TRIP_INFO.dates}</span></div>
          <div class="travel-meta-row"><span class="travel-meta-icon">🏨</span><span>${TRIP_INFO.hotel}</span></div>
          <div class="travel-meta-row"><span class="travel-meta-icon">✈️</span><span>${TRIP_INFO.flight}</span></div>
        </div>
        <div class="travel-booking-notice">
          ⚠️ 예약 필수 — 우나기 키쿠가와 · 모츠나베 라쿠텐치 · 하카타 로바타 피셔맨
        </div>
      </div>

      <div class="travel-day-tabs">
        ${DAYS.map((d, i) => `
          <button class="travel-day-tab${i === activeDay ? " active" : ""}" style="${i === activeDay ? `--tab-color:${d.color}` : ""}">
            <span class="tab-label">${d.label}</span>
            <span class="tab-date">${d.date}</span>
          </button>
        `).join("")}
      </div>

      <div id="travelMap" class="travel-map"></div>

      <div class="travel-day-content">
        ${buildTimelineHTML(DAYS[activeDay])}
      </div>
    </div>`;
}

// ── 타임라인 HTML ─────────────────────────────────────────────

function buildTimelineHTML(day) {
  return `
    <div class="travel-day-theme">${day.theme}</div>
    <div class="travel-timeline">
      ${day.items.map((item, idx) => `
        <div class="travel-item">
          <div class="travel-time">${item.time}</div>
          <div class="travel-dot-wrap">
            <div class="travel-dot${item.booking ? " booking" : ""}" style="${item.coords ? `background:${day.color}` : ""}"></div>
            ${idx < day.items.length - 1 ? '<div class="travel-line"></div>' : ""}
          </div>
          <div class="travel-info">
            <div class="travel-name">
              ${item.coords ? `<span class="travel-seq" style="background:${day.color}">${idx + 1}</span>` : ""}
              ${item.name}
              ${item.booking ? '<span class="travel-booking-badge">예약 필수</span>' : ""}
            </div>
            ${item.desc ? `<div class="travel-desc">${item.desc}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>`;
}

// ── Leaflet 지도 ──────────────────────────────────────────────

function initMap() {
  const el = document.getElementById("travelMap");
  if (!el) return;

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    routeLayer = null;
    markerGroup = null;
  }

  leafletMap = L.map("travelMap", { zoomControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(leafletMap);

  markerGroup = L.layerGroup().addTo(leafletMap);
  updateMap(DAYS[activeDay]);
}

function updateMap(day) {
  if (!leafletMap) return;

  // 기존 레이어 제거
  if (routeLayer) { leafletMap.removeLayer(routeLayer); routeLayer = null; }
  markerGroup.clearLayers();

  const stops = day.items.filter(item => item.coords);
  if (stops.length === 0) return;

  const coords = stops.map(item => item.coords);

  // 경로선
  routeLayer = L.polyline(coords, {
    color: day.color,
    weight: 3,
    opacity: 0.75,
    dashArray: "8, 5",
  }).addTo(leafletMap);

  // 마커
  stops.forEach((item, idx) => {
    const isBooking = item.booking;
    const bg = isBooking ? "#ef4444" : day.color;

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        background:${bg}; color:#fff;
        width:30px; height:30px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:13px; font-weight:700;
        border:2.5px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
      ">${idx + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -18],
    });

    const marker = L.marker(item.coords, { icon }).addTo(markerGroup);
    marker.bindPopup(`
      <div style="min-width:150px; font-family:system-ui,sans-serif">
        <div style="font-weight:600; font-size:14px; margin-bottom:4px">${item.name}</div>
        <div style="font-size:12px; color:#888">${item.time}</div>
        ${item.desc ? `<div style="font-size:12px; margin-top:5px; color:#555">${item.desc}</div>` : ""}
        ${isBooking ? `<div style="font-size:11px; color:#ef4444; margin-top:5px; font-weight:600">⚠️ 예약 필수</div>` : ""}
      </div>
    `, { maxWidth: 220 });
  });

  leafletMap.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
}
