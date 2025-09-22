import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid, score, mode, levelMax, streakMax, correctTotal, durationSec, opCat } = req.body;

    if (!uid) return res.status(400).json({ error: "uid required" });
    if (typeof score !== "number" || score < 0) return res.status(400).json({ error: "invalid score" });

    const doc = {
      uid,
      score,
      mode,
      levelMax,
      streakMax,
      correctTotal,
      durationSec,
      opCat,
      createdAt: new Date(),
    };

    const ref = await db.collection("scores").add(doc);
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
}
