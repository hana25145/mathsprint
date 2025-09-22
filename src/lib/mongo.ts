import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);

let clientPromise: Promise<MongoClient>;

if (!global._mongoClientPromise) {
  clientPromise = client.connect();
  global._mongoClientPromise = clientPromise;
} else {
  clientPromise = global._mongoClientPromise;
}

export async function connectDB() {
  const client = await clientPromise;
  return client.db("mathsprint"); // 원하는 DB 이름
}

// 타입스크립트 보완 (globalThis에 캐시 붙이기)
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}
