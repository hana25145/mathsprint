import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    ),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { authToken, score, mode, levelMax, streakMax, correctTotal, durationSec, opCat } = req.body;

    if (!authToken) {
      return res.status(401).json({ error: "로그인 토큰 없음" });
    }

    // 토큰 검증
    const decoded = await admin.auth().verifyIdToken(authToken);
    const uid = decoded.uid;

    // 점수 문서 (scores 컬렉션용)
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

    // 1. 모든 기록 저장 (scores)
    const ref = await db.collection("scores").add(doc);

    // 2. leaders 업데이트 (최고 점수 유지)
    const leaderRef = db.collection("leaders").doc(uid);
    await db.runTransaction(async (t) => {
      const snap = await t.get(leaderRef);
      if (!snap.exists || (snap.data().score ?? 0) < score) {
        t.set(
          leaderRef,
          {
            uid,
            score, // 최고 점수
            mode,
            ts: admin.firestore.FieldValue.serverTimestamp(),
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
