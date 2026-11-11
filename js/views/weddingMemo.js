// ================================================================
// js/views/weddingMemo.js — 결혼 메모장 세그먼트
// 공유 메모 하나 — settings/wedding 문서의 memo 필드에 통째로 저장.
// 통째로 저장하므로, 저장 직전에 서버본을 다시 읽어 화면에 그린 뒤로 상대가
// 고쳤는지 확인한다. 고쳤으면 덮어쓸지 묻고, 취소하면 두 내용을 합쳐 보여준다.
// ================================================================

import state from "../state.js";
import { showToast, showConfirm, escapeHtml, runWrite } from "../utils.js";
import { saveWeddingConfig, fetchWeddingConfig, readWeddingMemo } from "../weddingDb.js";

// 화면에 그린 시점의 메모 — 저장 직전 서버본과 비교하는 기준
let baseMemo = "";
// 저장하지 않은 입력 — 다른 세그먼트·탭에 다녀와도(화면을 다시 그린다) 쓰던 글이 남도록 들고 있는다.
// 예전에는 긴 메모를 쓰다 하단 탭을 잘못 누르면 저장 전 내용이 조용히 사라졌다.
// base: 쓰기 시작할 때의 서버 메모 — 그 뒤 상대가 고쳤는지는 저장할 때 이 값으로 가린다
let draft = null; // { text, base }

// 로그아웃 때 비운다 (app.resetSessionUI) — 같은 브라우저에서 상대가 로그인해 내 초안을 보지 않게
export function resetMemoDraft() { draft = null; }

export function renderMemoSegment(container) {
  const memo = state.wedding.config?.memo ?? "";
  if (draft && draft.text === memo) draft = null; // 서버 내용과 같아졌으면 초안이 아니다
  baseMemo = draft ? draft.base : memo;

  container.innerHTML = `
    <div class="wd-memo-card">
      <textarea id="wdMemoText" class="wd-memo-text"
        placeholder="자유롭게 적어두세요 — 두 사람 모두 보고 수정할 수 있어요">${escapeHtml(memo)}</textarea>
      <div class="wd-memo-actions">
        <span class="wd-memo-hint">${draft ? "저장하지 않은 내용이 있어요 — 저장을 눌러야 반영됩니다" : "저장을 눌러야 상대에게도 반영됩니다"}</span>
        <button class="save-btn" id="wdMemoSaveBtn">저장</button>
      </div>
    </div>`;

  const textarea = container.querySelector("#wdMemoText");
  // 초안은 value로만 되살린다 — 그린 내용(defaultValue)은 서버 메모라, "입력 중" 판단(hasUnsavedInput)이
  // 계속 참이어서 상대의 실시간 변경이 이 화면을 다시 그려 덮지 않는다
  if (draft) textarea.value = draft.text;
  textarea.addEventListener("input", () => {
    draft = textarea.value === (state.wedding.config?.memo ?? "") ? null : { text: textarea.value, base: baseMemo };
  });

  container.querySelector("#wdMemoSaveBtn").addEventListener("click", async e => {
    const text = textarea.value;
    let partnerMemo = null; // 덮어쓰기를 취소했을 때 합칠 상대 메모

    const ok = await runWrite(e.currentTarget, async () => {
      const server = await readWeddingMemo();
      if (server !== baseMemo && server !== text &&
          !(await showConfirm(
            "그 사이 상대가 메모를 수정했어요.\n덮어쓰면 상대가 쓴 내용이 사라져요.\n취소하면 두 내용을 합쳐서 보여드려요.",
            { confirmText: "덮어쓰기" }))) {
        partnerMemo = server;
        return;
      }
      await saveWeddingConfig({ memo: text });
    });
    if (!ok) return;

    await fetchWeddingConfig(); // 다른 기기에서 바뀐 내용과 어긋나지 않게 재조회
    if (partnerMemo !== null) {
      // 아직 저장하지 않은 상태 — 상대 메모 아래에 내가 쓰던 내용을 붙여 두고 직접 정리하게 한다
      baseMemo = partnerMemo;
      textarea.value = `${partnerMemo}\n\n──── 내가 쓰던 내용 ────\n${text}`;
      draft = { text: textarea.value, base: partnerMemo };
      showToast("상대 메모와 합쳤어요. 정리한 뒤 저장해주세요");
      return;
    }
    baseMemo = text;
    draft = null;
    textarea.defaultValue = text; // 저장한 내용이 이제 기준 — "입력 중"으로 남아 실시간 반영을 막지 않게
    container.querySelector(".wd-memo-hint").textContent = "저장을 눌러야 상대에게도 반영됩니다";
    showToast("메모를 저장했습니다");
  });
}
