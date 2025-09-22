import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const uid = req.query?.uid;
    if (!uid) return res.status(400).json({ error: "missing_uid" });

    const db = await getDb();
    const user = await db.collection("users").findOne({ uid });
    if (!user) return res.status(404).json({ error: "User not found" });

    const scores = await db.collection("scores").find({ uid }).toArray();

    const best = scores.length ? Math.max(...scores.map(s => s.score || 0)) : 0;
    const gamesPlayed = scores.length;
    const avgScore = gamesPlayed ? scores.reduce((sum, s) => sum + (s.score || 0), 0) / gamesPlayed : 0;
    const totalCorrect = scores.reduce((sum, s) => sum + (s.correctTotal || 0), 0);

    res.status(200).json({ ...user, best, gamesPlayed, avgScore, totalCorrect });
  } catch (err) {
    console.error("users/[uid] error:", err);
    res.status(500).json({ error: "user_profile_failed", message: String(err?.message || err) });
  }
}
