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
  "http://localhost:5174"               // 로컬 다른 포트
];

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
    const { authToken, score, mode, levelMax, streakMax, correctTotal, durationSec, opCat } = req.body;

    if (!authToken) {
      return res.status(401).json({ error: "로그인 토큰 없음" });
    }

    // 🔑 Firebase ID 토큰 검증
    const decoded = await admin.auth().verifyIdToken(authToken);
    const uid = decoded.uid;

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

      if (score > prevBest) {
        t.set(
          leaderRef,
          {
            uid,
            best: score,
            mode,
            opCat,
            name,
            tag,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        t.set(
          leaderRef,
          {
            uid,
            best: prevBest,
            mode,
            opCat,
            name,
            tag,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("🔥 submitScore error:", e);
    return res.status(500).json({ error: "서버 에러", details: e.message });
  }
}
