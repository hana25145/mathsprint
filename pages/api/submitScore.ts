import { NextApiRequest, NextApiResponse } from "next";
import { connectDB } from "../../src/lib/mongo";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const db = await connectDB();
    const scores = db.collection("scores");

    const { uid, score, mode, levelMax, streakMax, correctTotal, durationSec, opCat } = req.body;

    // 간단 검증
    if (!uid || typeof score !== "number") {
      return res.status(400).json({ error: "invalid data" });
    }

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

    const result = await scores.insertOne(doc);
    res.json({ ok: true, id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}
