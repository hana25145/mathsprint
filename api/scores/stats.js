import { getDb } from "../lib/db.js";

function round(n, d = 1) { return Math.round(n * 10 ** d) / 10 ** d; }

export default async function handler(req, res) {
  try {
    const uid = req.query?.uid;
    const mode = req.query?.mode;
    const opCat = req.query?.opCat;
    if (!uid || !mode) {
      return res.status(200).json({
        games: 0, bestRecent: 0, avg: 0, p90: 0,
        prLevel: 0, prStreak: 0, apmAvg: 0, apmBest: 0, totalCorrect: 0,
      });
    }

    // 🔑 오직 ALL일 때만 DB 접근
    if ((opCat ?? "").toUpperCase() !== "ALL") {
      return res.status(200).json({
        games: 0, bestRecent: 0, avg: 0, p90: 0,
        prLevel: 0, prStreak: 0, apmAvg: 0, apmBest: 0, totalCorrect: 0,
      });
    }

    const db = await getDb();
    const rows = await db.collection("scores")
      .find({ uid, mode, opCat: "ALL" })
      .sort({ ts: -1 })
      .limit(50)
      .toArray();

    const games = rows.length;
    const scores = rows.map(r => r.score || 0);
    const bestRecent = games ? Math.max(...scores) : 0;
    const avg = games ? scores.reduce((a, b) => a + b, 0) / games : 0;

    const sorted = scores.slice().sort((a, b) => a - b);
    const p90 = games ? (sorted[Math.floor(games * 0.9) - 1] ?? sorted[games - 1]) : 0;

    const prLevel  = rows.reduce((m, r) => Math.max(m, r.levelMax  || 0), 0);
    const prStreak = rows.reduce((m, r) => Math.max(m, r.streakMax || 0), 0);

    const apms = rows.map(r => (r.correctTotal || 0) / ((r.durationSec || 60) / 60));
    const apmAvg  = apms.length ? apms.reduce((a, b) => a + b, 0) / apms.length : 0;
    const apmBest = apms.length ? Math.max(...apms) : 0;

    const totalCorrect = rows.reduce((s, r) => s + (r.correctTotal || 0), 0);

    res.status(200).json({
      games, bestRecent, avg: round(avg), p90,
      prLevel, prStreak, apmAvg: round(apmAvg), apmBest: round(apmBest),
      totalCorrect,
    });
  } catch (err) {
    console.error("scores/stats error:", err);
    res.status(500).json({ error: "scores_stats_failed", message: String(err?.message || err) });
  }
}
