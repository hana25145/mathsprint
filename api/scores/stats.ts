import { getDb } from "../lib/db.js";

function round(num, digits = 1) {
  return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
}

export default async function handler(req, res) {
  const { uid, mode } = req.query;
  if (!uid || !mode) {
    return res.status(200).json({
      games: 0, bestRecent: 0, avg: 0, p90: 0,
      prLevel: 0, prStreak: 0,
      apmAvg: 0, apmBest: 0,
      totalCorrect: 0,
    });
  }

  const db = await getDb();
  const rows = await db.collection("scores")
    .find({ uid, mode })
    .sort({ ts: -1 })
    .limit(50)
    .toArray();

  const games = rows.length;
  const scores = rows.map(r => r.score || 0);

  const bestRecent = games > 0 ? Math.max(...scores) : 0;
  const avg = games ? scores.reduce((a, b) => a + b, 0) / games : 0;

  const sorted = [...scores].sort((a, b) => a - b);
  const p90 = games > 0 ? sorted[Math.floor(games * 0.9) - 1] ?? sorted[games - 1] : 0;

  const prLevel = rows.reduce((m, r) => Math.max(m, r.levelMax || 0), 0);
  const prStreak = rows.reduce((m, r) => Math.max(m, r.streakMax || 0), 0);

  const apms = rows.map(r => (r.correctTotal || 0) / ((r.durationSec || 60) / 60));
  const apmAvg = apms.length ? apms.reduce((a, b) => a + b, 0) / apms.length : 0;
  const apmBest = apms.length ? Math.max(...apms) : 0;

  const totalCorrect = rows.reduce((sum, r) => sum + (r.correctTotal || 0), 0);

  res.status(200).json({
    games,
    bestRecent,
    avg: round(avg),
    p90,
    prLevel,
    prStreak,
    apmAvg: round(apmAvg),
    apmBest: round(apmBest),
    totalCorrect,
  });
}
