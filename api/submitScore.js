import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    ),
  });
}

const db = admin.firestore();

// 허용할 도메인 목록
const allowedOrigins = [
  "https://mathsprint-ochre.vercel.app", // Vercel 배포
  "http://localhost:5173",              // 로컬 개발
  "http://localhost:5174",
  "https://mathsprint-584a1.web.app",
  "https://mathsprint-584a1.firebaseapp.com",           // 로컬 다른 포트
];

// ⬇️ 환경변수로 밴 목록 관리(쉼표 구분). 비워두면 효과 없음.
const BANNED_EMAILS = new Set([
  "jinhyung110@gmail.com",
  "has_25038@hana.hs.kr",
  "wqq69320@gmail.com",
  "wbk0107@gmail.com"
].map(s => s.toLowerCase()));
const BANNED_DOMAINS = new Set(
  (process.env.BANNED_DOMAINS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

export default async function handler(req, res) {
  const origin = req.headers.origin;

  // ✅ 허용된 origin에만 CORS 헤더 부여
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ CORS preflight 요청 처리
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ✅ 차단 로직
  if (!allowedOrigins.includes(origin)) {
    console.warn("❌ 차단된 Origin 요청:", origin);
    return res.status(403).json({ error: "Forbidden origin" });
  }

  // ✅ 실제 POST 처리
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      authToken, score, mode, levelMax, streakMax, correctTotal, durationSec, opCat
    } = req.body;

    if (!authToken) {
      return res.status(401).json({ error: "로그인 토큰 없음" });
    }

    // 🔑 Firebase ID 토큰 검증
    const decoded = await admin.auth().verifyIdToken(authToken);
    const uid = decoded.uid;
    const email = (decoded.email || "").toLowerCase();
    const domain = email.split("@")[1] || "";

    // 🚫 이메일/도메인 밴 체크 (로그인 성공이어도 서버에서 차단)
    if (email && (BANNED_EMAILS.has(email) || BANNED_DOMAINS.has(domain))) {
      // (선택) 재로그인 방지를 위해 계정 비활성화 + 토큰 무효화
      try {
        await admin.auth().updateUser(uid, { disabled: true });
        await admin.auth().revokeRefreshTokens(uid);
      } catch (e) {
        console.warn("ban-side-effect failed:", e?.message);
      }
      return res.status(403).json({ error: "banned" });
    }

    // 🧑 사용자 프로필
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const name = userData?.name || "익명";
    const tag = userData?.tag || "0000";

    // 📌 scores 저장
    const doc = {
      uid,
      score,
      mode,
      levelMax,
      streakMax,
      correctTotal,
      durationSec,
      opCat,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection("scores").add(doc);

    // 📌 leaders 저장 (ID: mode_opCat_uid)
    const leaderId = `${mode}_${opCat}_${uid}`;
    const leaderRef = db.collection("leaders").doc(leaderId);

    await db.runTransaction(async (t) => {
      const snap = await t.get(leaderRef);
      const prevBest = snap.exists ? snap.data().best || 0 : 0;

      t.set(
        leaderRef,
        {
          uid,
          best: score > prevBest ? score : prevBest,
          mode,
          opCat,
          name,
          tag,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("🔥 submitScore error:", e);
    return res.status(500).json({ error: "서버 에러", details: e.message });
  }
}
