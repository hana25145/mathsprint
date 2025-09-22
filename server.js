import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

// 🔑 MongoDB 연결
const client = new MongoClient("mongodb+srv://has25145_db_user:YUN17721772@mathsprint.gbotl0h.mongodb.net/?retryWrites=true&w=majority&appName=mathsprint");
await client.connect();
const db = client.db("mathsprint");

// ✅ 먼저 검색 라우트 정의
app.get("/api/users/search", async (req, res) => {
  const prefix = req.query.prefix;
  if (!prefix) return res.json([]);
  const rows = await db.collection("users")
    .find({
      $or: [
        { name: { $regex: prefix, $options: "i" } },
        { tag: { $regex: prefix, $options: "i" } }
      ]
    })
    .limit(20)
    .toArray();
  res.json(rows);
});

// ❌ 나중에 프로필 라우트 정의
app.get("/api/users/:uid", async (req, res) => {
  const uid = req.params.uid;

  const user = await db.collection("users").findOne({ uid });
  if (!user) return res.status(404).json({ error: "User not found" });

  // 해당 유저의 모든 점수 가져오기
  const scores = await db.collection("scores").find({ uid }).toArray();

  // 통계 계산
  const best = scores.length > 0 ? Math.max(...scores.map(s => s.score || 0)) : 0;
  const gamesPlayed = scores.length;
  const avgScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length
    : 0;
  const totalCorrect = scores.reduce((sum, s) => sum + (s.correctTotal || 0), 0);

  // 기존 user 문서 + 통계 필드 함께 반환
  res.json({
    ...user,
    best,
    gamesPlayed,
    avgScore,
    totalCorrect,
  });
});
app.get("/api/scores/best", async (req, res) => {
  const { uid, mode } = req.query;
  if (!uid || !mode) return res.json({ best: 0 });

  const row = await db.collection("scores")
    .find({ uid, mode })
    .sort({ score: -1 })
    .limit(1)
    .next();

  res.json({ best: row ? row.score : 0 });
});
function round(num, digits = 1) {
  return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
}

app.get("/api/scores/stats", async (req, res) => {
  const { uid, mode } = req.query;
  if (!uid || !mode) {
    return res.json({
      games: 0, bestRecent: 0, avg: 0, p90: 0,
      prLevel: 0, prStreak: 0,
      apmAvg: 0, apmBest: 0,
      totalCorrect: 0
    });
  }

  const rows = await db.collection("scores")
    .find({ uid, mode })
    .sort({ ts: -1 })
    .limit(50)
    .toArray();

  const games = rows.length;
  const scores = rows.map(r => r.score || 0);

  const bestRecent = games > 0 ? Math.max(...scores) : 0;
  const avg = games > 0 ? scores.reduce((a, b) => a + b, 0) / games : 0;

  const sorted = [...scores].sort((a, b) => a - b);
  const p90 = games > 0 ? sorted[Math.floor(games * 0.9) - 1] ?? sorted[games - 1] : 0;

  const prLevel = rows.reduce((max, r) => Math.max(max, r.levelMax || 0), 0);
  const prStreak = rows.reduce((max, r) => Math.max(max, r.streakMax || 0), 0);

  const apms = rows.map(r => (r.correctTotal || 0) / ((r.durationSec || 60) / 60));
  const apmAvg = apms.length > 0 ? apms.reduce((a, b) => a + b, 0) / apms.length : 0;
  const apmBest = apms.length > 0 ? Math.max(...apms) : 0;

  const totalCorrect = rows.reduce((sum, r) => sum + (r.correctTotal || 0), 0);

  res.json({
    games,
    bestRecent,
    avg: round(avg, 1),
    p90,
    prLevel,
    prStreak,
    apmAvg: round(apmAvg, 1),
    apmBest: round(apmBest, 1),
    totalCorrect,
  });
});

// leaders 컬렉션 문서 개수 확인용
app.get("/api/debug/leaders-count", async (req, res) => {
  try {
    const count = await db.collection("leaders").estimatedDocumentCount();
    res.json({ count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});


app.get("/api/leaders", async (req, res) => {
  try {
    const { mode = "TIMED", opCat = "ALL", limit = 10 } = req.query;

    const rows = await db.collection("leaders")
      .find({ mode, opCat })
      .sort({ best: -1 })   // 점수 높은 순
      .limit(Number(limit)) // 기본 10명
      .toArray();

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// ✅ 점수 기록 조회 (최근 n개)
app.get("/api/scores/recent", async (req, res) => {
  const { uid, mode = "TIMED", limit = 50 } = req.query;
  const rows = await db.collection("scores")
    .find({ uid, mode, opCat: "ALL" })
    .sort({ ts: -1 })
    .limit(Number(limit))
    .toArray();
  res.json(rows);
});




app.listen(3000, () => {
  console.log("✅ API 서버 실행: http://localhost:3000");
});
