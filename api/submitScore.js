import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      ),
    });
    console.log("✅ Firebase Admin initialized");
  } catch (e) {
    console.error("❌ Firebase Admin init failed", e);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { authToken, score, mode, levelMax, streakMax, correctTotal, durationSec, opCat } = req.body;

    console.log("📩 Payload 수신:", { score, mode, levelMax, streakMax, correctTotal, durationSec, opCat });

    if (!authToken) {
      console.error("❌ Missing authToken");
      return res.status(401).json({ error: "로그인 토큰 없음" });
    }

    // 토큰 검증
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(authToken);
      console.log("✅ Token verified:", decoded.uid);
    } catch (err) {
      console.error("❌ Token verification failed:", err.message);
      return res.status(401).json({ error: "토큰 검증 실패", details: err.message });
    }

    const uid = decoded.uid;

    // 유효성 검사
    if (!["TIMED", "HARD", "ENDLESS"].includes(mode)) {
      return res.status(400).json({ error: "잘못된 mode" });
    }
    if (!Number.isFinite(score)) {
      return res.status(400).json({ error: "비정상 점수" });
    }

    // Firestore 기록
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

    try {
      console.log("📌 Firestore 기록 시도:", doc);
      const ref = await db.collection("scores").add(doc);
      console.log("✅ Firestore 기록 성공, ID:", ref.id);
      return res.status(200).json({ ok: true, id: ref.id });
    } catch (fireErr) {
      console.error("🔥 Firestore 쓰기 실패:", fireErr);
      return res.status(500).json({ error: "Firestore 쓰기 실패", details: fireErr.message });
    }
  } catch (e) {
    console.error("🔥 Uncaught server error:", e);
    return res.status(500).json({ error: "서버 에러", details: e.message });
  }
}
