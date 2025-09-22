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

    // 🔑 Firebase ID 토큰 검증
    const decoded = await admin.auth().verifyIdToken(authToken);
    const uid = decoded.uid;

    // 🧑 사용자 프로필 가져오기
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const name = userData?.name || "익명";
    const tag = userData?.tag || "0000";

    // 📌 scores 컬렉션 기록
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

    // 📌 leaders 문서 ID = {mode}_{opCat}_{uid}
    const leaderId = `${mode}_${opCat}_${uid}`;
    const leaderRef = db.collection("leaders").doc(leaderId);

    await db.runTransaction(async (t) => {
      const snap = await t.get(leaderRef);
      const prevBest = snap.exists ? snap.data().best || 0 : 0;

      if (score > prevBest) {
        // 최고 점수 갱신
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
        // 최고 점수 갱신은 없지만 updatedAt 업데이트
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
