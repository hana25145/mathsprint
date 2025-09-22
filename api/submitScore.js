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
    const { authToken, score, levelMax, durationSec, mode } = req.body;

    console.log("📩 Incoming payload:", { authToken: !!authToken, score, levelMax, durationSec, mode });

    if (!authToken) {
      console.error("❌ Missing authToken");
      return res.status(401).json({ error: "로그인 토큰 없음" });
    }

    // 1. Firebase Auth 토큰 검증
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(authToken);
      console.log("✅ Token decoded:", decoded.uid);
    } catch (err) {
      console.error("❌ Token verification failed:", err);
      return res.status(401).json({ error: "토큰 검증 실패" });
    }

    const uid = decoded.uid;

    // 2. 기본 검증
    if (!["TIMED", "HARD", "ENDLESS"].includes(mode)) {
      console.error("❌ Invalid mode:", mode);
      return res.status(400).json({ error: "잘못된 mode" });
    }

    if (!Number.isFinite(score)) {
      console.error("❌ Invalid score:", score);
      return res.status(400).json({ error: "비정상 점수" });
    }

    // 3. Firestore 기록
    const doc = {
      uid,
      score,
      levelMax,
      durationSec,
      mode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("scores").add(doc);
    console.log("✅ Score saved:", ref.id);

    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("🔥 Uncaught server error:", e);
    return res.status(500).json({ error: "서버 에러", details: e.message });
  }
}
