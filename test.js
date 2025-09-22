import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyAsAjWFNqsGWWrwClBtpws6gIxF7XQc3dA",
  authDomain: "mathsprint-584a1.firebaseapp.com",
  projectId: "mathsprint-584a1",
  storageBucket: "mathsprint-584a1.firebasestorage.app",
  messagingSenderId: "613519706886",
  appId: "1:613519706886:web:77fcaaa686cff63796ac87",
  measurementId: "G-WZ67GRGMR0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

(async () => {
  try {
    // 테스트 계정 로그인 (Firebase Authentication에 계정 등록해 둬야 함)
    await signInWithEmailAndPassword(auth, "test@example.com", "password123");

    // 점수 위조 시도
    await addDoc(collection(db, "scores"), { uid: "hacktest", score: 99999 });
    console.log("✅ 기록 성공 (이러면 규칙이 잘못된 것!)");
  } catch (err) {
    console.error("❌ 차단됨:", err.code, err.message);
  }
})();
