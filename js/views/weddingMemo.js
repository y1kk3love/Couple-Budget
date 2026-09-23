// ================================================================
// js/views/weddingMemo.js — 결혼 메모장 세그먼트
// 공유 메모 하나 — settings/wedding 문서의 memo 필드에 통째로 저장.
// 두 사람이 동시에 고치면 마지막 저장이 이긴다 (payments와 같은 트레이드오프).
// ================================================================

import state from "../state.js";
import { showToast, escapeHtml, runWrite } from "../utils.js";
import { saveWeddingConfig, fetchWeddingConfig } from "../weddingDb.js";

export function renderMemoSegment(container) {
  const memo = state.wedding.config?.memo ?? "";

  container.innerHTML = `
    <div class="wd-memo-card">
      <textarea id="wdMemoText" class="wd-memo-text"
        placeholder="자유롭게 적어두세요 — 두 사람 모두 보고 수정할 수 있어요">${escapeHtml(memo)}</textarea>
      <div class="wd-memo-actions">
        <span class="wd-memo-hint">저장을 눌러야 상대에게도 반영됩니다</span>
        <button class="save-btn" id="wdMemoSaveBtn">저장</button>
      </div>
    </div>`;

  container.querySelector("#wdMemoSaveBtn").addEventListener("click", async e => {
    const text = container.querySelector("#wdMemoText").value;
    if (!(await runWrite(e.currentTarget, () => saveWeddingConfig({ memo: text })))) return;
    showToast("메모를 저장했습니다");
    await fetchWeddingConfig(); // 다른 기기에서 바뀐 내용과 어긋나지 않게 재조회
  });
}
