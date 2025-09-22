import { getDb } from "./lib/db.js";

export default async function handler(req, res) {
  try {
    const q = req.query ?? {};
    const mode = q.mode ?? "TIMED";
    const opCat = q.opCat ?? "ALL";
    const limit = Number(q.limit ?? 10);

    const db = await getDb();

    // 1) leaders 가져오기
    const leaders = await db.collection("leaders")
      .find({ mode, opCat })
      .sort({ best: -1 })
      .limit(limit)
      .toArray();

    if (leaders.length === 0) {
      return res.status(200).json([]);
    }

    // 2) uid만 뽑아서 users 조회
    const uids = leaders.map(l => l.uid);
    const users = await db.collection("users")
      .find({ uid: { $in: uids } })
      .toArray();

    const userMap = {};
    users.forEach(u => { userMap[u.uid] = u.name; });

    // 3) 최신 닉네임 덧씌우기
    const enriched = leaders.map(l => ({
      ...l,
      name: userMap[l.uid] || l.name, // 최신 닉네임 없으면 기존 값
    }));

    res.status(200).json(enriched);
  } catch (err) {
    console.error("leaders error:", err);
    res.status(500).json({ error: "leaders_failed", message: String(err?.message || err) });
  }
}
