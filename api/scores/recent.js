import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const uid = req.query?.uid;
    const mode = req.query?.mode ?? "TIMED";
    const limit = Number(req.query?.limit ?? 50);
    if (!uid) return res.status(200).json([]);

    const db = await getDb();
    const rows = await db.collection("scores")
      .find({ uid, mode, opCat: "ALL" })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();

    res.status(200).json(rows);
  } catch (err) {
    console.error("scores/recent error:", err);
    res.status(500).json({ error: "scores_recent_failed", message: String(err?.message || err) });
  }
}
