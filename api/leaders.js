import { getDb } from "./lib/db.js";

export default async function handler(req, res) {
  try {
    const q = req.query ?? {};
    const mode = q.mode ?? "TIMED";
    const opCat = q.opCat ?? "ALL";
    const limit = Number(q.limit ?? 10);

    const db = await getDb();
    const rows = await db.collection("leaders")
      .find({ mode, opCat })
      .sort({ best: -1 })
      .limit(limit)
      .toArray();

    res.status(200).json(rows);
  } catch (err) {
    console.error("leaders error:", err);
    res.status(500).json({ error: "leaders_failed", message: String(err?.message || err) });
  }
}
