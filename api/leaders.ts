import { getDb } from "./lib/db.js";

export default async function handler(req, res) {
  const { mode = "TIMED", opCat = "ALL", limit = 10 } = req.query;

  const db = await getDb();
  const rows = await db.collection("leaders")
    .find({ mode, opCat })
    .sort({ best: -1 })
    .limit(Number(limit))
    .toArray();

  res.status(200).json(rows);
}
