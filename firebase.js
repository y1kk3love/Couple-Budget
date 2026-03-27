// ================================================================
// firebase.js — Firebase 설정 파일
// ================================================================
// 아래 firebaseConfig 값을 본인의 Firebase 프로젝트 값으로 교체하세요.
// Firebase 콘솔 → 프로젝트 설정 → 앱 추가 → 웹 앱에서 확인할 수 있습니다.
// ================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ↓↓↓ 여기를 본인 Firebase 설정으로 교체 ↓↓↓
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ↑↑↑ 여기까지 교체 ↑↑↑

// 접근 허용 이메일 목록 — 본인과 파트너 이메일로 교체하세요
export const ALLOWED_EMAILS = [
  "your_email@gmail.com",        // ← 본인 이메일
  "partner_email@gmail.com"      // ← 파트너 이메일
];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };
