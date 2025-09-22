import { NextApiRequest, NextApiResponse } from "next";
import { connectDB } from "../../src/lib/mongo";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = await connectDB();
    const scores = db.collection("scores");

    const top = await scores
      .find({ mode: "TIMED" })
      .sort({ score: -1 })
      .limit(10)
      .toArray();

    res.json(top);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}
