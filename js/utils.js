// ================================================================
// js/utils.js — 공통 유틸리티 함수
// ================================================================

/** 숫자를 한국 원화 형식으로 포맷 (예: 1,234,000) */
export function fmtMoney(n) {
  return Math.abs(n).toLocaleString("ko-KR");
}

/** 숫자를 축약 형식으로 포맷 (예: 1.2M, 500K) */
export function fmtMoneyShort(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return (abs / 1_000).toFixed(0) + "K";
  return abs.toLocaleString();
}

/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
export function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 토스트 알림 표시 */
export function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

/** 금액 입력 빠른 버튼 그룹(.amount-presets) 바인딩.
 *  컨테이너의 data-target 속성으로 input id를 지정.
 *  data-add: 현재값에 누적, data-clear: 빈 값으로 초기화. */
export function setupAmountPresets(container) {
  const targetId = container.dataset.target;
  const input    = document.getElementById(targetId);
  if (!input) return;

  container.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.add) {
        const cur = parseInt(input.value) || 0;
        input.value = cur + parseInt(btn.dataset.add);
      } else if (btn.dataset.clear) {
        input.value = "";
      }
      input.focus();
    });
  });
}

/** 빈 상태 HTML 반환 */
export function emptyStateHTML(msg) {
  return `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>${msg}</p>
    </div>`;
}
