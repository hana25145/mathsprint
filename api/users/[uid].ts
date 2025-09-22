import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  const { uid } = req.query;
  const db = await getDb();

  const user = await db.collection("users").findOne({ uid });
  if (!user) return res.status(404).json({ error: "User not found" });

  const scores = await db.collection("scores").find({ uid }).toArray();

  const best = scores.length ? Math.max(...scores.map(s => s.score || 0)) : 0;
  const gamesPlayed = scores.length;
  const avgScore = gamesPlayed
    ? scores.reduce((sum, s) => sum + (s.score || 0), 0) / gamesPlayed
    : 0;
  const totalCorrect = scores.reduce((sum, s) => sum + (s.correctTotal || 0), 0);

  res.status(200).json({ ...user, best, gamesPlayed, avgScore, totalCorrect });
}
