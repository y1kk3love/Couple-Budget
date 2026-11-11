// 목업용 firebase.js — 저장소 루트의 firebase.js 자리에 대신 들어간다 (tools/mock/index.html의 import map).
// 실제 프로젝트 설정·허용 계정을 쓰지 않으므로 이 페이지는 실제 데이터에 닿을 수 없다.
import { initializeApp } from "./sdk-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "./sdk-auth.js";
import { getFirestore } from "./sdk-firestore.js";

export const firebaseConfig = { projectId: "mock" };
export const ALLOWED_EMAILS = ["minsu@example.com", "jieun@example.com"];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };
