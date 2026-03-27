// ================================================================
// js/auth.js — 인증 (Google 로그인 / 로그아웃)
// ================================================================

import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, ALLOWED_EMAILS } from "../firebase.js";
import state from "./state.js";
import { showToast } from "./utils.js";
import { initApp } from "./app.js";

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
    }
  });
}
