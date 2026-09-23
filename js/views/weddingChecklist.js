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
      const rows = list.map(t => `
        <div class="wd-task-row ${t.done ? "done" : ""}" data-task-id="${t.id}" role="button" tabindex="0">
          <input type="checkbox" class="wd-task-chk" data-chk-id="${t.id}" ${t.done ? "checked" : ""} aria-label="완료 표시" />
          <span class="wd-task-title">${escapeHtml(t.title)}</span>
          ${t.memo ? `<span class="wd-task-memo">${escapeHtml(t.memo)}</span>` : ""}
        </div>`).join("");
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

  container.querySelectorAll(".wd-task-chk").forEach(chk => {
    chk.addEventListener("click", e => e.stopPropagation()); // 행 클릭(수정 모달)과 분리
    chk.addEventListener("change", async () => {
      try {
        await toggleWeddingTask(chk.dataset.chkId, chk.checked);
      } catch (err) {
        console.error("체크 저장 실패:", err);
        showToast("저장에 실패했습니다. 네트워크를 확인해주세요");
        chk.checked = !chk.checked; // 실패 시 원상 복구
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
