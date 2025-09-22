import { getDb } from "../lib/db.js";

export default async function handler(req, res) {
  const prefix = req.query?.prefix;
  if (!prefix) return res.status(200).json([]);

  const db = await getDb();
  const rows = await db.collection("users")
    .find({
      $or: [
        { name: { $regex: prefix, $options: "i" } },
        { tag: { $regex: prefix, $options: "i" } }
      ]
    })
    .limit(20)
    .toArray();

  res.status(200).json(rows);
}
