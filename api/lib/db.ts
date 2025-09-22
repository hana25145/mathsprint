import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGO_URL!);

export async function getDb() {
  await client.connect(); // v5에서 여러 번 호출해도 안전
  return client.db("mathsprint");
}
