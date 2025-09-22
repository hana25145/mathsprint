// migrate_leaders.cjs
const admin = require("firebase-admin");
const { MongoClient } = require("mongodb");

// 🔑 Firestore 초기화
const serviceAccount = require("./serviceAccountKey.json"); // 네 Firebase 서비스 계정 키
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// 🔑 MongoDB 연결
const MONGO_URI = "mongodb+srv://has25145_db_user:7TuLt2QWjAnvcmP8@mathsprint.gbotl0h.mongodb.net/?retryWrites=true&w=majority&appName=mathsprint";
const client = new MongoClient(MONGO_URI);

async function migrateLeaders() {
  try {
    await client.connect();
    const mongoDb = client.db("mathsprint"); // 원하는 DB 이름
    const leadersCol = mongoDb.collection("leaders");

    const snapshot = await db.collection("leaders").get();
    console.log(`📊 leaders 문서 ${snapshot.size}개 발견`);

    let count = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      data._id = doc.id; // Firestore 문서 id를 MongoDB의 _id로 저장
      await leadersCol.updateOne(
        { _id: data._id },
        { $set: data },
        { upsert: true }
      );
      count++;
    }

    console.log(`✅ leaders: ${count}개 옮김`);
  } catch (err) {
    console.error("❌ 오류 발생:", err);
  } finally {
    await client.close();
  }
}

migrateLeaders();
