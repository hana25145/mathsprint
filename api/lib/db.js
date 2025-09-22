import { MongoClient } from "mongodb";

let client = null;
let dbPromise = null;

export async function getDb() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("Missing MONGO_URL env");

  if (!client) client = new MongoClient(uri);
  if (!dbPromise) {
    dbPromise = client.connect().then(c => c.db("mathsprint")); // v5: 중복 connect 안전
  }
  return dbPromise;
}
