import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const uid = req.query?.uid;
    const mode = req.query?.mode;
    if (!uid || !mode) return res.status(200).json({ best: 0 });

    const db = await getDb();
    const row = await db.collection("scores")
      .find({ uid, mode })
      .sort({ score: -1 })
      .limit(1)
      .next();

    res.status(200).json({ best: row ? (row.score || 0) : 0 });
  } catch (err) {
    console.error("scores/best error:", err);
    res.status(500).json({ error: "scores_best_failed", message: String(err?.message || err) });
  }
}
