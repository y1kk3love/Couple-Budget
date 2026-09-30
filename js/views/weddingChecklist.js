// ================================================================
// js/views/weddingChecklist.js — 결혼 체크리스트 세그먼트
// wedding.js(셸)가 세그먼트 컨테이너를 넘겨 호출한다.
// ================================================================

import state from "../state.js";
import { escapeHtml, showToast, showConfirm, runWrite } from "../utils.js";
import { WEDDING_PERIODS } from "../constants.js";
import { toggleWeddingTask, seedWeddingChecklist, fetchWeddingTasks } from "../weddingDb.js";
import { renderWeddingView } from "./wedding.js";
import { openWeddingTaskModal } from "../modals/weddingModal.js";
import { haptic, reducedMotion } from "../motion.js";

// 체크한 순간 그 행의 상자가 톡 튀며 차고, 체크 표시와 취소선이 그려진다(.m-pop). 저장을 기다리지 않는다 —
// 예전엔 저장·재조회 두 번의 왕복 뒤 다시 그리며 효과를 붙여서, 먼저 보이던 체크가 꺼졌다 다시 그려졌다.
// 효과 도중 다시 그려지면 새 행이 같은 지점부터 이어서 그린다(--pop-at 음수 지연). 누른 시각을 기억해 둔다.
const POP_MS = 480; // 가장 긴 조각: 상자 420ms, 체크 60ms 뒤 280ms, 취소선 80ms 뒤 300ms
const popping = new Map(); // taskId → 누른 시각 (performance.now)

function popStyle(id) {
  const at = popping.get(id);
  if (at == null) return null;
  const elapsed = Math.round(performance.now() - at);
  // 동작 줄이기에선 페이드가 다시 재생되지 않게 이어 그리지 않는다
  if (elapsed >= POP_MS || reducedMotion()) { popping.delete(id); return null; }
  return `--pop-at:-${elapsed}ms`;
}

export function renderChecklistSegment(container) {
  const tasks = state.wedding.tasks;

  if (!tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">📋</span>
        <p>아직 할 일이 없어요</p>
        <div class="wd-empty-actions">
          <button class="save-btn" id="wdSeedBtn">표준 체크리스트 불러오기</button>
          <button class="filter-reset-btn" id="wdTaskAddBtn">직접 추가</button>
        </div>
      </div>`;
  } else {
    const done = tasks.filter(t => t.done).length;
    const pct  = Math.round(done / tasks.length * 100);

    const groups = WEDDING_PERIODS.map(p => {
      const list = tasks.filter(t => t.period === p.id);
      if (!list.length) return "";
      const rows = list.map(t => {
        const pop = t.done ? popStyle(t.id) : null;
        return `
        <div class="wd-task-row ${t.done ? "done" : ""}${pop ? " m-pop" : ""}"${pop ? ` style="${pop}"` : ""} data-task-id="${escapeHtml(t.id)}" data-flip-key="${escapeHtml(t.id)}" role="button" tabindex="0">
          <label class="wd-task-chk-hit"><input type="checkbox" class="wd-task-chk" data-chk-id="${escapeHtml(t.id)}" ${t.done ? "checked" : ""} aria-label="완료 표시" /><svg class="chk-mark" viewBox="0 0 22 22" aria-hidden="true"><path pathLength="1" d="M6.2 11.4l3.2 3.2 6.6-7"/></svg></label>
          <span class="wd-task-title"><span class="strike">${escapeHtml(t.title)}</span></span>
          ${t.memo ? `<span class="wd-task-memo">${escapeHtml(t.memo)}</span>` : ""}
        </div>`;
      }).join("");
      const gDone = list.filter(t => t.done).length;
      return `
        <div class="list-group">
          <div class="list-date-header"><span>${p.label}</span><span>${gDone}/${list.length}</span></div>
          ${rows}
        </div>`;
    }).join("");

    container.innerHTML = `
      <div class="wd-progress">
        <div class="wd-budget-line"><span>진행률</span><span><strong>${done}/${tasks.length}</strong> (${pct}%)</span></div>
        <div class="pbar"><div class="pfill" style="width:${pct}%;background:var(--accent)"></div></div>
      </div>
      ${groups}
      <button class="add-fixed-btn" id="wdTaskAddBtn">+ 할 일 추가</button>`;
  }

  // ── 바인딩 ──────────────────────────────────────────────────

  container.querySelector("#wdSeedBtn")?.addEventListener("click", async e => {
    const btn = e.currentTarget;
    if (!(await showConfirm("표준 결혼 준비 체크리스트를 불러올까요?", { confirmText: "불러오기", danger: false }))) return;
    let seeded = false;
    if (!(await runWrite(btn, async () => { seeded = await seedWeddingChecklist(); }, "불러오기"))) return;
    if (!seeded) showToast("상대가 이미 체크리스트를 만들어 두었어요 — 최신 목록을 불러왔어요");
    await fetchWeddingTasks();
    renderWeddingView();
  });

  container.querySelector("#wdTaskAddBtn")?.addEventListener("click", () => openWeddingTaskModal(null));

  // 체크박스를 감싼 넓은 누름 영역(label) — 누르면 체크가 바뀌고, 행 클릭(수정 모달)으로는 번지지 않는다
  container.querySelectorAll(".wd-task-chk-hit").forEach(hit =>
    hit.addEventListener("click", e => e.stopPropagation())
  );
  container.querySelectorAll(".wd-task-chk").forEach(chk => {
    chk.addEventListener("click", e => e.stopPropagation()); // 행 클릭(수정 모달)과 분리
    chk.addEventListener("change", async () => {
      const id = chk.dataset.chkId;
      const on = chk.checked;
      const row = chk.closest(".wd-task-row");
      // 누른 순간 바로 보인다 (저장이 실패하면 아래에서 되돌린다)
      row.classList.toggle("done", on);
      row.classList.remove("m-pop");
      if (on) {
        popping.set(id, performance.now());
        void row.offsetWidth; // 같은 행을 다시 체크해도 효과가 처음부터
        row.classList.add("m-pop");
        haptic(10); // 완료할 때만 짧게 (안드로이드)
      } else {
        popping.delete(id);
      }
      try {
        await toggleWeddingTask(id, on);
      } catch (err) {
        console.error("체크 저장 실패:", err);
        showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
        popping.delete(id);
        chk.checked = !on; // 실패 시 원상 복구
        row.classList.toggle("done", !on);
        row.classList.remove("m-pop");
        return;
      }
      await fetchWeddingTasks();
      renderWeddingView();
    });
  });

  container.querySelectorAll(".wd-task-row").forEach(row =>
    row.addEventListener("click", () => {
      const t = state.wedding.tasks.find(x => x.id === row.dataset.taskId);
      if (t) openWeddingTaskModal(t);
    })
  );
}
