import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  const { uid, mode } = req.query;
  if (!uid || !mode) return res.status(200).json({ best: 0 });

  const db = await getDb();
  const row = await db.collection("scores")
    .find({ uid, mode })
    .sort({ score: -1 })
    .limit(1)
    .next();

  res.status(200).json({ best: row ? row.score : 0 });
}
