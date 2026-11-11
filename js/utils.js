// ================================================================
// js/utils.js — 공통 유틸리티 함수
// ================================================================

import state from "./state.js";

/** 숫자를 한국 원화 형식으로 포맷 (예: 1,234,000) */
export function fmtMoney(n) {
  return Math.abs(n).toLocaleString("ko-KR");
}

/** 숫자를 한국식 축약 형식으로 포맷 (예: 1.5만, 125만, 1.2억) */
export function fmtMoneyShort(n) {
  const abs = Math.abs(n);
  // 10 미만은 소수 첫째 자리까지, 그 이상은 반올림 정수
  const short = (v, unit) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + unit;
  if (abs >= 100_000_000) return short(abs / 100_000_000, "억");
  if (abs >= 10_000) {
    const man = abs / 10_000;
    if (Math.round(man) >= 10_000) return short(abs / 100_000_000, "억"); // 9,999.6만 → 1억
    return short(man, "만");
  }
  return abs.toLocaleString("ko-KR");
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

/** 연·월 → "YYYY-MM" (고정비 결정적 문서 ID, 월별 예산 키 등에 쓰는 형식) */
export function ymKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
export function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 토스트 알림 표시 — 아래에서 스프링으로 떠오르고(.toast:not(.hidden)), 가라앉으며 사라진다(.toast-out).
 *  이미 떠 있는 동안 새 메시지가 오면 톡 튕겨(.toast-bump) 바뀐 것을 알린다.
 *  3초 동안 보인다 (토스 TDS 기준 — 2.2초는 긴 문장을 다 읽기 전에 사라졌다) */
let toastTimer = null;
let toastOutTimer = null;
export function showToast(msg) {
  const toast = document.getElementById("toast");
  const showing = !toast.classList.contains("hidden") && !toast.classList.contains("toast-out");
  toast.textContent = msg;
  clearTimeout(toastTimer); // 연속 호출 시 이전 타이머가 새 토스트를 조기에 숨기는 것 방지
  clearTimeout(toastOutTimer);
  toast.classList.remove("toast-out", "toast-bump");
  if (showing) {
    void toast.offsetWidth; // 같은 클래스를 다시 붙여도 애니메이션이 재생되도록
    toast.classList.add("toast-bump");
  } else {
    toast.classList.remove("hidden");
  }
  toastTimer = setTimeout(() => {
    toast.classList.add("toast-out");
    toastOutTimer = setTimeout(() => toast.classList.add("hidden"), 180);
  }, 3000);
}

/** 저장·삭제 버튼 공통 실행기.
 *  - 쓰기가 끝날 때까지 버튼을 잠가 연타로 인한 중복 저장을 막는다
 *  - 실패하면 콘솔 기록 + "<action>에 실패했습니다" 토스트
 *  - 성공 여부를 반환 → 호출부는 true일 때만 모달을 닫는다 (실패 시 입력 보존 규칙)
 *  ⚠ 잠금은 클릭 직후 동기적으로 걸려야 하므로 이 함수보다 앞에 await를 두지 말 것.
 *    (showConfirm처럼 화면 전체를 덮는 대기는 괜찮다 — 그동안 버튼을 누를 수 없다)
 *  사용: if (!(await runWrite(btn, () => saveX(data)))) return; */
export async function runWrite(button, write, action = "저장") {
  if (button?.disabled) return false;
  // 글자만 있는 버튼은 진행 중임을 글자로도 알린다 (흐려지기만 하면 눌렸는지 알기 어렵다)
  const label = button && !button.children.length ? button.textContent : null;
  if (button) {
    button.disabled = true;
    if (label !== null) button.textContent = `${action} 중…`;
  }
  // 연결이 끊겼거나 느리면 Firestore 쓰기는 서버가 확인할 때까지 끝나지 않는다. 예전에는 버튼만 흐려진 채
  // 아무 안내가 없어, 실패한 줄 알고 다시 입력하면 연결이 돌아왔을 때 두 건이 다 올라갔다.
  const SLOW_MSG = "연결이 느려요. 저장을 계속 시도하고 있어요 — 다시 입력하지 않아도 돼요";
  if (navigator.onLine === false) showToast("오프라인이에요. 연결되면 이어서 저장돼요 — 다시 입력하지 않아도 돼요");
  const slowTimer = setTimeout(() => {
    // 쓰기 도중 확인 창(상대가 고친 내용을 덮어쓸지 등)에 머무는 중이면 느린 게 아니다
    if (!document.querySelector(".confirm-overlay:not(.is-closing)")) showToast(SLOW_MSG);
  }, SLOW_WRITE_MS);
  try {
    await write();
    return true;
  } catch (err) {
    console.error(`${action} 실패:`, err);
    showToast(writeErrorMessage(err, action));
    return false;
  } finally {
    clearTimeout(slowTimer);
    if (button) {
      button.disabled = false;
      if (label !== null) button.textContent = label;
    }
  }
}
const SLOW_WRITE_MS = 7000;

// 실패 원인에 맞는 안내 — 예전에는 상대가 지운 항목을 저장할 때도 "네트워크를 확인"이라고 했다
function writeErrorMessage(err, action) {
  const code = String(err?.code ?? err?.message ?? "");
  if (/not-found/.test(code)) return `${action}하지 못했어요. 상대가 이미 지운 항목일 수 있어요`;
  if (/permission-denied|unauthenticated/.test(code)) return `${action} 권한이 없어요. 다시 로그인해 주세요`;
  return `${action}에 실패했습니다. 네트워크를 확인해주세요`;
}

/** 입력 검증 실패 — 안내만 띄우면 어느 칸인지 알 수 없어(키패드에 가려지기도 한다),
 *  그 칸에 포커스를 주고 빨간 테두리로 표시한다. 다시 입력하면 표시가 사라진다. */
export function invalidField(input, msg) {
  showToast(msg);
  if (!input) return;
  const clear = () => {
    input.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
    input.removeEventListener("input", clear);
    input.removeEventListener("change", clear);
  };
  input.classList.add("invalid");
  input.setAttribute("aria-invalid", "true");
  input.addEventListener("input", clear);
  input.addEventListener("change", clear);
  input.focus();
}

/** root 안에 사용자가 입력 중이거나 아직 반영하지 않은 값이 있는지.
 *  innerHTML로 그린 폼은 그릴 때의 값이 defaultValue/defaultChecked/defaultSelected로 남으므로,
 *  그것과 다르면 "입력 중"이다. 실시간 동기화가 화면을 다시 그려 입력을 날리지 않게 확인할 때 쓴다.
 *  끌어서 순서를 바꾸는 중인 행(.drag-lift)도 입력 중으로 본다 — 다시 그리면 손가락 아래 행이 사라진다. */
export function hasUnsavedInput(root) {
  if (root.querySelector(".drag-lift")) return true;
  return [...root.querySelectorAll("input, textarea, select")].some(el => {
    if (el === document.activeElement) return true;
    if (el.type === "checkbox" || el.type === "radio") return el.checked !== el.defaultChecked;
    if (el.tagName === "SELECT") {
      const def = [...el.options].findIndex(o => o.defaultSelected);
      return el.selectedIndex !== (def === -1 ? 0 : def);
    }
    return el.value !== el.defaultValue;
  });
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
      // 직접 입력한 것과 똑같이 알린다 — 금액 읽기 표시(setupAmountHints)와 "입력 중" 판단이 이 이벤트를 본다
      input.dispatchEvent(new Event("input", { bubbles: true }));
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
 *  사용: if (!(await showConfirm("삭제할까요?", { confirmText: "삭제" }))) return;
 *  altText를 주면 버튼이 셋이 되고(세로로 쌓임) 그 버튼은 "alt"를 돌려준다:
 *    true = 확인, "alt" = 다른 선택, false = 취소(Esc·배경 누르기 포함) */
export function showConfirm(message, { confirmText = "확인", cancelText = "취소", altText = null, danger = true } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay confirm-overlay";
    // .modal-scrim: 배경막 — 클릭은 통과해 아래 오버레이가 받는다(배경 누르면 취소)
    overlay.innerHTML = `
      <div class="modal-scrim"></div>
      <div class="confirm-box" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(message)}">
        <p class="confirm-msg">${escapeHtml(message)}</p>
        <div class="confirm-actions${altText ? " stacked" : ""}">
          <button type="button" class="confirm-cancel">${escapeHtml(cancelText)}</button>
          ${altText ? `<button type="button" class="confirm-alt">${escapeHtml(altText)}</button>` : ""}
          <button type="button" class="confirm-ok${danger ? " danger" : ""}">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const prevFocus = document.activeElement;
    let settled = false;
    const done = ok => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      // 결과는 바로 돌려주고, 창은 작아지며 사라진 뒤 제거한다 (.is-closing — style.css 모션)
      overlay.classList.add("is-closing");
      setTimeout(() => overlay.remove(), 200);
      if (prevFocus instanceof HTMLElement) prevFocus.focus(); // 원래 위치로 포커스 복원
      resolve(ok);
    };
    // Esc → 취소 (capture 단계에서 가로채 app.js의 전역 Esc 핸들러보다 먼저 처리)
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.querySelector(".confirm-cancel").addEventListener("click", () => done(false));
    overlay.querySelector(".confirm-ok").addEventListener("click", () => done(true));
    overlay.querySelector(".confirm-alt")?.addEventListener("click", () => done("alt"));
    overlay.addEventListener("click", e => { if (e.target === overlay) done(false); });
    document.body.appendChild(overlay);
    overlay.querySelector(".confirm-ok").focus(); // Enter로 바로 확인 가능
  });
}

/** 글자 내용을 파일로 내려받기 */
export function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 2차원 배열을 CSV 파일로 다운로드. BOM을 붙여 엑셀에서 한글이 깨지지 않게 한다. */
export function downloadCSV(filename, rows) {
  const esc = v => {
    let s = String(v ?? "");
    // 엑셀 수식 주입 방지 — 수식으로 해석될 수 있는 선행 문자는 텍스트로 고정
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  downloadFile(filename, "\uFEFF" + rows.map(r => r.map(esc).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

/** 빈 상태 HTML 반환 — 토스식 이모지 + 부드러운 문구 */
export function emptyStateHTML(msg, emoji = "🧾") {
  return `
    <div class="empty-state">
      <span class="empty-emoji">${emoji}</span>
      <p>${msg}</p>
    </div>`;
}
