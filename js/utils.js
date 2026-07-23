// ================================================================
// js/utils.js — 공통 유틸리티 함수
// ================================================================

import state from "./state.js";

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

/** 사용자 입력 문자열을 innerHTML에 안전하게 넣기 위해 HTML 특수문자 이스케이프.
 *  거래 이름·메모·CSV 가맹점명처럼 사용자/외부에서 들어온 값을 출력할 때 사용. */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
export function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 토스트 알림 표시 */
let toastTimer = null;
export function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer); // 연속 호출 시 이전 타이머가 새 토스트를 조기에 숨기는 것 방지
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2200);
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

/** 이메일 → 표시 이름. 예산안에 설정한 표시 이름이 있으면 그것을,
 *  없으면 이메일 아이디 부분을 사용한다. (목록 작성자 태그, 사람별 통계) */
export function ownerName(email) {
  if (!email) return "";
  const plan = state.budgetPlans?.find(p => p.id === email);
  return plan?.name || email.split("@")[0];
}

/** 네이티브 confirm() 대체 — 토스식 확인 다이얼로그.
 *  사용: if (!(await showConfirm("삭제할까요?", { confirmText: "삭제" }))) return; */
export function showConfirm(message, { confirmText = "확인", danger = true } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-box">
        <p class="confirm-msg">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel">취소</button>
          <button type="button" class="confirm-ok${danger ? " danger" : ""}">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const done = ok => { overlay.remove(); resolve(ok); };
    overlay.querySelector(".confirm-cancel").addEventListener("click", () => done(false));
    overlay.querySelector(".confirm-ok").addEventListener("click", () => done(true));
    overlay.addEventListener("click", e => { if (e.target === overlay) done(false); });
    document.body.appendChild(overlay);
  });
}

/** 2차원 배열을 CSV 파일로 다운로드. BOM을 붙여 엑셀에서 한글이 깨지지 않게 한다. */
export function downloadCSV(filename, rows) {
  const esc = v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv  = "\uFEFF" + rows.map(r => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 빈 상태 HTML 반환 — 토스식 이모지 + 부드러운 문구 */
export function emptyStateHTML(msg, emoji = "🧾") {
  return `
    <div class="empty-state">
      <span class="empty-emoji">${emoji}</span>
      <p>${msg}</p>
    </div>`;
}
