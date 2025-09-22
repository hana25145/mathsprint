const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// ✅ region("us-central1") 추가
exports.submitScoreSafe = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const uid = context.auth.uid;

    // 기본 필드 파싱
    const score = Number(data.score);
    const mode = String(data.mode || "");
    const levelMax = Number(data.levelMax || 0);
    const streakMax = Number(data.streakMax || 0);
    const correctTotal = Number(data.correctTotal || 0);
    const durationSec = Number(data.durationSec || 0);
    const opCat = String(data.opCat || "ALL");

    // 1차 검증
    if (!["TIMED", "HARD", "ENDLESS"].includes(mode)) {
      throw new functions.https.HttpsError("invalid-argument", "잘못된 mode");
    }
    if (!Number.isFinite(score) || score < 0 || score > 1_000_000) {
      throw new functions.https.HttpsError("invalid-argument", "비정상 점수");
    }

    // 간단한 휴리스틱 flag
    let flagged = false;
    if (levelMax <= 1 && score > 1000) {
      flagged = true;
    }

    // 기록
    const doc = {
      uid,
      score,
      mode,
      levelMax,
      streakMax,
      correctTotal,
      durationSec,
      opCat,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      flagged,
    };

    const ref = await db.collection("scores").add(doc);
    return { ok: true, id: ref.id, flagged };
  });
