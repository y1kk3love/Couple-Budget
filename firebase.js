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
  apiKey: "AIzaSyCYyGyaRggQGG07B2wJq0T494HiVDiF1os",
  authDomain: "couple-budget-f732d.firebaseapp.com",
  projectId: "couple-budget-f732d",
  storageBucket: "couple-budget-f732d.firebasestorage.app",
  messagingSenderId: "394522478385",
  appId: "1:394522478385:web:75cc20bace344248bcd210"
};
// ↑↑↑ 여기까지 교체 ↑↑↑

// 접근 허용 이메일 목록 — 본인과 파트너 이메일로 교체하세요
export const ALLOWED_EMAILS = [
  "y1kk3love@gmail.com",        // ← 본인 이메일
];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };
