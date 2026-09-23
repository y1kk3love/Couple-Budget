// ================================================================
// js/auth.js — 인증 (Google 로그인 / 로그아웃)
// ================================================================

import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, ALLOWED_EMAILS } from "../firebase.js";
import state from "./state.js";
import { showToast } from "./utils.js";
import { initApp, resetSessionUI } from "./app.js";
import { stopSync } from "./sync.js";

export function setupAuth() {
  // 로그인 버튼
  document.getElementById("googleLoginBtn").addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!ALLOWED_EMAILS.includes(result.user.email)) {
        await signOut(auth);
        showToast("접근 권한이 없습니다");
      }
    } catch {
      showToast("로그인에 실패했습니다");
    }
  });

  // 로그아웃 버튼
  document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

  // 인증 상태 감지
  onAuthStateChanged(auth, async user => {
    const isAllowed = user && ALLOWED_EMAILS.includes(user.email);

    document.getElementById("loginScreen").classList.toggle("hidden", isAllowed);
    document.getElementById("app").classList.toggle("hidden", !isAllowed);

    if (isAllowed) {
      state.currentUser = user;
      document.getElementById("sidebarUser").textContent = user.email;
      await initApp();
    } else {
      state.currentUser = null;
      stopSync(); // 로그아웃 — 실시간 리스너 해제 (다음 로그인 때 initApp이 다시 건다)
      resetSessionUI(); // 편집 중이던 예산안 초안·열린 모달 정리 (상대가 이어서 로그인할 수 있음)
    }
  });
}
