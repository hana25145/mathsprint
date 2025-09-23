// src/firebase.ts
import {
  initializeApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  getDocs,
  runTransaction,
  Timestamp
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
// ─────────────────────────────────────────────────────────────
// 0) Firebase 초기화
// Vite 기준 환경변수; 다른 빌드면 적절히 바꿔주세요.
const firebaseConfig = {
  apiKey: "AIzaSyAsAjWFNqsGWWrwClBtpws6gIxF7XQc3dA",
  authDomain: "mathsprint-584a1.firebaseapp.com",
  projectId: "mathsprint-584a1",
  storageBucket: "mathsprint-584a1.firebasestorage.app",
  messagingSenderId: "613519706886",
  appId: "1:613519706886:web:77fcaaa686cff63796ac87",
  measurementId: "G-WZ67GRGMR0"
};
export async function updateUserName(uid: string, newName: string) {
  const ref = doc(db, "users", uid); // UserProfile이 들어있는 컬렉션
  await updateDoc(ref, { name: newName });
}
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- API_BASE 분기 ---
const VERCEL_ORIGIN = "https://mathsprint-ochre.vercel.app";

function resolveApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;

  // Firebase Hosting → Vercel API 사용
  if (h.endsWith(".web.app") || h.endsWith(".firebaseapp.com")) {
    return VERCEL_ORIGIN;
  }
  // 그 외(localhost, vercel 등) → same-origin
  return "";
}

export const API_BASE = resolveApiBase();

// 디버그 로그 (배포 후 콘솔에서 확인 가능)
if (typeof window !== "undefined") {
  console.info("[API_BASE]", API_BASE || "(same-origin)", "from", window.location.origin);
}

// ─────────────────────────────────────────────────────────────
// 1) 타입
export type UserProfile = {
  uid: string;
  name: string;     // 닉네임
  tag: string;      // 4자리 태그
  best?: number;    // 최고 점수
  createdAt?: any;
};

export type Friend = { uid: string };

// ─────────────────────────────────────────────────────────────
// 2) 인증
export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
  // 로그인 직후 프로필 보장
  await ensureUserProfile();
}

export async function logout() {
  await signOut(auth);
}

// ─────────────────────────────────────────────────────────────
// 3) 유저 프로필 보장
// - users/{uid} 문서가 없으면 생성
export async function ensureUserProfile() {
  const u = auth.currentUser;
  if (!u) return;

  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const name =
    u.displayName?.trim() ||
    u.email?.split("@")[0] ||
    "사용자";
  const tag = (Math.floor(1000 + Math.random() * 9000)).toString(); // 1000~9999

  const profile: UserProfile = {
    uid: u.uid,
    name,
    tag,
    best: 0,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
}

// ─────────────────────────────────────────────────────────────
// 4) 점수 제출
// - users/{uid}.best 갱신(더 크면)
// - scores 컬렉션에 기록 추가(선택)
// firebase.ts (기존 submitScore를 아래처럼 확장)
export type ScoreMeta = {
  mode?: "TIMED" | "ENDLESS";
  opCat?: "ALL" | "ADD" | "SUB" | "MUL" | "DIV" | "MIXED"; // MIXED는 랭킹 제외
  levelMax?: number;
  streakMax?: number;
  correctTotal?: number;
  durationSec?: number;
};

// 랭킹 대상 여부
function eligibleForLeaderboard(opCat?: string) {
  return opCat === "ALL" || opCat === "ADD" || opCat === "SUB" || opCat === "MUL" || opCat === "DIV";
}

// 세그먼트별 상위 10 구독
export function subscribeTop10Segment(
  mode: "TIMED" | "ENDLESS",
  opCat: "ALL" | "ADD" | "SUB" | "MUL" | "DIV",
  cb: (rows: { name: string; tag?: string; score: number }[]) => void
) {
  const qy = query(
    collection(db, "leaders"),
    where("mode", "==", mode),
    where("opCat", "==", opCat),
    orderBy("best", "desc"),
    limit(10)
  );
  return onSnapshot(qy, (snap) => {
    cb(
      snap.docs.map((d) => {
        const v: any = d.data();
        return { name: v.name, tag: v.tag, score: Number(v.best ?? 0) };
      })
    );
  });
}

// 점수 제출
export async function submitScore(rawScore: number, meta?: ScoreMeta) {
  const u = auth.currentUser;
  if (!u) return;
  const score = Number(rawScore) || 0;

  const userRef = doc(db, "users", u.uid);
  const has = await getDoc(userRef);
  if (!has.exists()) await ensureUserProfile();

  // users.best 갱신
  await runTransaction(db, async (tx) => {
    const cur = await tx.get(userRef);
    const prev = Number(cur.data()?.best ?? 0);
    if (score > prev) tx.update(userRef, { best: score });
  });
  const mode = meta?.mode;
  // 점수 히스토리
  await addDoc(collection(db, "scores"), {
    uid: u.uid,
    score,
    ts: serverTimestamp(),
    mode,
    ...(meta ?? {}),
  });

  // 세그먼트 리더보드 갱신 (ALL/단일 연산자만)

  const opCat = meta?.opCat;
  if (mode && eligibleForLeaderboard(opCat)) {
    const leadersId = `${mode}_${opCat}_${u.uid}`;
    const ref = doc(db, "leaders", leadersId);

    // 프로필 로드(표시용 이름/태그)
    const prof = (await getDoc(userRef)).data() as any;
    const name = prof?.name ?? "사용자";
    const tag = prof?.tag;

    await runTransaction(db, async (tx) => {
      const cur = await tx.get(ref);
      const prev = Number(cur.data()?.best ?? 0);
      if (score > prev) {
        tx.set(ref, {
          uid: u.uid,
          mode,
          opCat,
          best: score,
          name,
          tag,
          updatedAt: serverTimestamp(),
        });
      } else if (!cur.exists()) {
        // 최초 생성(0점이면 굳이 만들 필요는 없지만, 일관성 위해 생성)
        tx.set(ref, {
          uid: u.uid,
          mode,
          opCat,
          best: prev,
          name,
          tag,
          updatedAt: serverTimestamp(),
        });
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 5) 리더보드 Top10 (users.best 기준)
// Leaderboard.tsx는 {name, tag, score} 형태를 기대:contentReference[oaicite:5]{index=5}
export function subscribeTop10(
  cb: (rows: { name: string; tag?: string; score: number }[]) => void
) {
  const q = query(
    collection(db, "users"),
    orderBy("best", "desc"),
    limit(10)
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const v = d.data() as UserProfile;
      return {
        name: v.name,
        tag: v.tag,
        score: v.best ?? 0,
      };
    });
    cb(rows);
  });
}

// ─────────────────────────────────────────────────────────────
// 6) 마이페이지: 내 프로필/최고점/친구 목록
// MyPage.tsx는 아래 3개를 구독 호출:contentReference[oaicite:6]{index=6}
// - subscribeMyProfile(setMe)
// - subscribeMyBest(setBest)
// - subscribeFriends(setFriends)
export function subscribeMyProfile(cb: (me: UserProfile | null) => void) {
  const u = auth.currentUser;
  if (!u) return () => {};
  const ref = doc(db, "users", u.uid);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? (snap.data() as UserProfile) : null);
  });
}

export function subscribeMyBest(cb: (best: number) => void) {
  const u = auth.currentUser;
  if (!u) return () => {};
  const ref = doc(db, "users", u.uid);
  return onSnapshot(ref, (snap) => {
    cb((snap.data()?.best as number) ?? 0);
  });
}
// 특정 uid 프로필 구독
export function subscribeUserProfile(uid: string, cb: (profile: UserProfile | null) => void) {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      cb(snap.data() as UserProfile);
    } else {
      cb(null);
    }
  });
}

export function subscribeBestScore(uid: string, cb: (best: number) => void) {
  const q = query(
    collection(db, "scores"),
    where("uid", "==", uid),
    orderBy("score", "desc"),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) return cb(0);
    const doc = snap.docs[0].data() as { score?: number };
    cb(Number(doc.score ?? 0));
  });
}

// ALL 전용 최고점
export function subscribeBestScoreAll(uid: string, cb: (best: number|null)=>void) {
  const q = query(
    collection(db, "scores"),
    where("uid", "==", uid),
    where("opCat", "==", "ALL"),          // ✅ 전체 연산자만
    orderBy("score", "desc"),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) return cb(0);
    const doc = snap.docs[0].data() as { score?: number };
    cb(Number(doc.score ?? 0));
  });
}

// 특정 uid 친구 구독
export function subscribeFriends(uid: string, cb: (friends: Friend[]) => void) {
  const q = query(collection(db, "friends"), where("owner", "==", uid));
  return onSnapshot(q, (snap) => {
    const arr: Friend[] = snap.docs.map((d) => d.data() as Friend);
    cb(arr);
  });
}
export async function addFriend(friendUid: string) {
  const u = auth.currentUser;
  if (!u) throw new Error("로그인이 필요합니다.");
  if (u.uid === friendUid) return; // 자기 자신 금지
  const ref = doc(db, "users", u.uid, "friends", friendUid);
  await setDoc(ref, { uid: friendUid });
}

export async function removeFriend(friendUid: string) {
  const u = auth.currentUser;
  if (!u) throw new Error("로그인이 필요합니다.");
  const ref = doc(db, "users", u.uid, "friends", friendUid);
  await setDoc(ref, { uid: friendUid, removedAt: serverTimestamp() }, { merge: true });
  // 완전 삭제하려면 deleteDoc(ref)
}

// ─────────────────────────────────────────────────────────────
// 7) 유저 검색 (닉네임 prefix)
// SearchUser.tsx는 name prefix 검색을 호출:contentReference[oaicite:7]{index=7}
export async function searchUsersByPrefix(term: string): Promise<UserProfile[]> {
  const t = term.trim();
  if (!t) return [];

  // Firestore prefix 검색: >= t AND <= t+\uf8ff
  const qUsers = query(
    collection(db, "users"),
    orderBy("name"),
    where("name", ">=", t),
    where("name", "<=", t + "\uf8ff"),
    limit(20)
  );
  const snap = await getDocs(qUsers);
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function fetchUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as { name: string; tag: string }) : null;
}
// ─────────────────────────────────────────────────────────────
// 8) (선택) 앱 전역에서 로그인 상태 변화 시 자동 ensure
onAuthStateChanged(auth, (u) => {
  if (u) ensureUserProfile().catch(() => {});
});
export function onAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export type ScoreRow = {
  score: number;
  ts: Date;           // 그래프용 JS Date
  mode?: string;      // (선택) 모드 저장 시 표시
};

// 마지막 N개 점수 실시간 구독 (최근 순)
export function subscribeMyScores(
  n: number,
  cb: (rows: ScoreRow[]) => void
) {
  const u = auth.currentUser;
  if (!u) return () => {};
  const db = getFirestore();
  const q = query(
    collection(db, "scores"),
    where("uid", "==", u.uid),
    orderBy("ts", "desc"),
    limit(n)
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const v = d.data() as any;
      const ts: Date =
        v.ts instanceof Timestamp ? v.ts.toDate() :
        typeof v.ts === "string" ? new Date(v.ts) : new Date();
      return { score: Number(v.score ?? 0), ts, mode: v.mode };
    });
    cb(rows);
  });
}
async function getIdTokenOrThrow(): Promise<string> {
  const user =
    auth.currentUser ??
    await new Promise<User | null>((resolve) => {   // ⬅️ 여기
      const unsub = onAuthStateChanged(
        auth,
        (u) => { unsub(); resolve(u); },
        () => { unsub(); resolve(null); }
      );
    });

  if (!user) throw new Error("로그인이 필요합니다.");
  return user.getIdToken();
}



export async function submitScoreSafe(payload: {
  score: number;
  mode: string;
  levelMax: number;
  streakMax: number;
  correctTotal: number;
  durationSec: number;
  opCat: string;
}) {
  let idToken = await getIdTokenOrThrow();

  const tryPost = async (token: string) => {
    const res = await fetch(`${API_BASE}/api/submitScore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, authToken: token }), // ⬅️ 서버가 기대하는 키
    });
    // 401이면 만료 토큰 가능성 → 한 번 강제 갱신 후 재시도
    if (res.status === 401) {
      throw new Error("401");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `submit failed: ${res.status}`);
    }
    return res.json();
  };

  try {
    return await tryPost(idToken);
  } catch (e: any) {
    if (e?.message === "401") {
      // 강제 갱신 후 1회 재시도
      const user = auth.currentUser;
      if (!user) throw new Error("로그인이 필요합니다.");
      idToken = await user.getIdToken(true);
      return await tryPost(idToken);
    }
    throw e;
  }
}