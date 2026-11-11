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
// 애니메이션이 끝나기를 기다리는 타이머에 속도 배수(style.css의 --motion-scale)를 곱한다.
// motion.js의 motionScale()과 같은 값이다 — 이 파일은 Node 테스트에서도 불러오므로 motion.js를 import하지 않고 직접 읽는다.
const motionMs = base => {
  try { return Math.round(base * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-scale")) || 1)); }
  catch { return base; }
};

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
    toastOutTimer = setTimeout(() => toast.classList.add("hidden"), motionMs(180));
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
 *  data-add: 현재값에 누적, data-clear: 빈 값으로 초기화.
 *  컨테이너에 한 번만 건다(위임) — 내역 창처럼 버튼을 나중에 다시 그려도 동작한다. */
export function setupAmountPresets(container) {
  const input = document.getElementById(container.dataset.target);
  if (!input) return;

  container.addEventListener("click", e => {
    const btn = e.target.closest(".preset-btn");
    if (!btn || !container.contains(btn)) return;
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
}

/** 금액을 읽기 쉽게 — 35000000 → "3,500만원", 1234500 → "123만 4,500원", 150000000 → "1억 5,000만원" */
export function fmtMoneyReading(n) {
  const v = Math.abs(Math.round(Number(n) || 0));
  const eok = Math.floor(v / 100_000_000), man = Math.floor((v % 100_000_000) / 10_000), rest = v % 10_000;
  const parts = [];
  if (eok)  parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man)  parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest || !parts.length) parts.push(rest.toLocaleString("ko-KR"));
  return parts.join(" ") + "원";
}

/** 금액 입력칸(input[data-money]) 아래에 읽기 표시를 단다.
 *  숫자 입력칸은 쉼표를 보여 주지 않아 35000000의 0을 눈으로 세야 했다.
 *  입력할 때마다, 그리고 창이 열릴 때(값을 코드로 채운 경우) 갱신한다. */
export function setupAmountHints() {
  const update = input => {
    const wrap = input.closest(".amount-input-wrap");
    if (!wrap) return;
    let hint = wrap.nextElementSibling?.classList.contains("amount-hint") ? wrap.nextElementSibling : null;
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "amount-hint";
      hint.setAttribute("aria-live", "polite");
      wrap.after(hint);
    }
    const v = parseInt(input.value) || 0;
    hint.textContent = v >= 1000 ? fmtMoneyReading(v) : "";
  };
  document.addEventListener("input", e => { if (e.target.matches?.("input[data-money]")) update(e.target); });
  // 창이 열릴 때 — .hidden이 빠지는 것을 보고, 값 채우기가 끝난 뒤(다음 작업) 갱신
  new MutationObserver(records => {
    for (const r of records) {
      if (!r.target.classList.contains("modal-overlay") || r.target.classList.contains("hidden")) continue;
      setTimeout(() => r.target.querySelectorAll("input[data-money]").forEach(update), 0);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
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
      setTimeout(() => overlay.remove(), motionMs(200));
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

// 선 아이콘 — 한 벌, 한 굵기(1.8). 색은 글자색(currentColor)을 따른다.
// 예전에는 이 자리에 이모지(💍 📄 🧾 ⚠️ …)를 썼는데, 기기마다 그림이 다르고 글자색·테마를 따르지 않아
// 화면에서 그것만 튀었다. 모양은 lucide 아이콘이고, ring(반지)만 같은 선 굵기로 직접 그렸다.
const ICONS = {
  ring:      '<circle cx="12" cy="15" r="6"/><path d="M9.5 3h5l2 3-4.5 3.5L7.5 6z"/>',
  receipt:   '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
  alert:     '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  checklist: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  building:  '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  wallet:    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  link:      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
/** 아이콘 SVG 문자열 — name은 ICONS의 키(코드가 정한 값만 넘긴다), size는 px */
export function icon(name, size = 16) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

/** 빈 상태 HTML 반환 — 조용한 선 아이콘 + 부드러운 문구 */
export function emptyStateHTML(msg, iconName = "receipt") {
  return `
    <div class="empty-state">
      <span class="empty-icon">${icon(iconName, 32)}</span>
      <p>${msg}</p>
    </div>`;
}
