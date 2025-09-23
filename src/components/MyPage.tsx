// src/components/MyPage.tsx
import * as React from "react";
import { useParams } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  auth,
  subscribeUserProfile,
  subscribeFriends,
  fetchUserProfile,
  db,
} from "@/firebase";
import type { UserProfile, Friend } from "@/firebase";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import MyStats from "@/components/mystats";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";

/* ─────────────────────────────────────────────────────────────
   모드 타입 (★ BIN 추가)
───────────────────────────────────────────────────────────── */
type Mode = "TIMED" | "HARD" | "BIN";

/* ─────────────────────────────────────────────────────────────
   최고점 (ALL only)
───────────────────────────────────────────────────────────── */
function useBestAll(uid: string | null | undefined, mode: Exclude<Mode, "BIN">) {
  const [best, setBest] = React.useState<number>(0);
  React.useEffect(() => {
    if (!uid) return;
    const qy = query(
      collection(db, "scores"),
      where("uid", "==", uid),
      where("mode", "==", mode),
      where("opCat", "==", "ALL"),
      orderBy("score", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const doc = snap.docs[0];
      setBest(doc ? Number((doc.data() as any).score ?? 0) : 0);
    });
    return () => unsub();
  }, [uid, mode]);
  return best;
}

/* ─────────────────────────────────────────────────────────────
   최고점 (★ BIN 전용: opCat='BIN')
───────────────────────────────────────────────────────────── */
function useBestBIN(uid: string | null | undefined) {
  const [best, setBest] = React.useState<number>(0);
  React.useEffect(() => {
    if (!uid) return;
    const qy = query(
      collection(db, "scores"),
      where("uid", "==", uid),
      where("mode", "==", "BIN"),
      where("opCat", "==", "BIN"),
      orderBy("score", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const d = snap.docs[0];
      setBest(d ? Number((d.data() as any).score ?? 0) : 0);
    });
    return () => unsub();
  }, [uid]);
  return best;
}

/* ─────────────────────────────────────────────────────────────
   상세 통계: 최근 50판(ALL) 집계 (원본 유지)
───────────────────────────────────────────────────────────── */
type ScoreAgg = {
  score: number;
  levelMax?: number;
  streakMax?: number;
  correctTotal?: number;
  durationSec?: number;
  createdAt?: any;  // Firestore Timestamp (프로젝트 기존 필드)
  opCat?: string;
};

async function fetchRecentFallback(uid: string, mode: Exclude<Mode, "BIN">, n = 50) {
  try {
    const s = await getDocs(
      query(
        collection(db, "scores"),
        where("uid", "==", uid),
        where("mode", "==", mode),
        limit(n * 3)
      )
    );
    const rows = s.docs.map((d) => d.data() as ScoreAgg);
    const filtered = rows.filter((r) => (r.opCat ?? "ALL") === "ALL");
    filtered.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    return filtered.slice(0, n);
  } catch (e) {
    console.error("[useModeStats fallback] getDocs error", e);
    return [] as ScoreAgg[];
  }
}

function useModeStats(uid: string | null | undefined, mode: Exclude<Mode, "BIN">) {
  const [rows, setRows] = React.useState<ScoreAgg[]>([]);

  React.useEffect(() => {
    if (!uid) return;
    const qMain = query(
      collection(db, "scores"),
      where("uid", "==", uid),
      where("mode", "==", mode),
      where("opCat", "==", "ALL"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      qMain,
      async (snap) => {
        const data: ScoreAgg[] = [];
        snap.forEach((d) => data.push(d.data() as ScoreAgg));
        if (data.length === 0) {
          const fb = await fetchRecentFallback(uid, mode, 50);
          setRows(fb);
        } else {
          setRows(data);
        }
      },
      async (_err) => {
        const fb = await fetchRecentFallback(uid, mode, 50);
        setRows(fb);
      }
    );
    return () => unsub();
  }, [uid, mode]);

  return React.useMemo(() => {
    const games = rows.length;
    const scores = rows.map((r) => r.score);
    const bestRecent = scores.length ? Math.max(...scores) : 0;
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const p90 = scores.length
      ? Math.round([...scores].sort((a, b) => a - b)[Math.floor((scores.length - 1) * 0.9)])
      : 0;

    const prLevel = rows.reduce((m, r) => Math.max(m, r.levelMax ?? 0), 0);
    const prStreak = rows.reduce((m, r) => Math.max(m, r.streakMax ?? 0), 0);

    const withDur = rows.filter((r) => (r.durationSec ?? 0) > 0 && (r.correctTotal ?? 0) > 0);
    const apmList = withDur.map((r) => (60 * (r.correctTotal as number)) / (r.durationSec as number));
    const apmAvg = apmList.length ? Math.round((apmList.reduce((a, b) => a + b, 0) / apmList.length) * 10) / 10 : 0;
    const apmBest = apmList.length ? Math.round(Math.max(...apmList) * 10) / 10 : 0;

    const totalCorrect = rows.reduce((s, r) => s + (r.correctTotal ?? 0), 0);

    return { games, bestRecent, avg, p90, prLevel, prStreak, apmAvg, apmBest, totalCorrect };
  }, [rows]);
}

/* ─────────────────────────────────────────────────────────────
   ★ BIN 상세 통계: 최근 50판 (opCat='BIN', 시간필드는 ts 또는 createdAt 우선순위)
───────────────────────────────────────────────────────────── */
type ScoreAggBIN = {
  score: number;
  levelMax?: number;
  streakMax?: number;
  correctTotal?: number;
  durationSec?: number;
  createdAt?: any;
  ts?: any;
  opCat?: string;
};

async function fetchRecentFallbackBIN(uid: string, n = 50) {
  try {
    const s = await getDocs(
      query(collection(db, "scores"), where("uid", "==", uid), where("mode", "==", "BIN"), limit(n * 3))
    );
    const rows = s.docs.map((d) => d.data() as ScoreAggBIN);
    const filtered = rows.filter((r) => (r.opCat ?? "BIN") === "BIN");
    filtered.sort((a, b) => {
      const ta = a.ts?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
      const tb = b.ts?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    return filtered.slice(0, n);
  } catch (e) {
    console.error("[useBinStats fallback] getDocs error", e);
    return [] as ScoreAggBIN[];
  }
}

function useBinStats(uid: string | null | undefined) {
  const [rows, setRows] = React.useState<ScoreAggBIN[]>([]);

  React.useEffect(() => {
    if (!uid) return;
    const qMain = query(
      collection(db, "scores"),
      where("uid", "==", uid),
      where("mode", "==", "BIN"),
      where("opCat", "==", "BIN"),
      // 프로젝트에 따라 ts 또는 createdAt 인덱스가 있을 수 있음: ts 우선
      orderBy("ts", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      qMain,
      async (snap) => {
        let data: ScoreAggBIN[] = [];
        snap.forEach((d) => data.push(d.data() as ScoreAggBIN));
        if (data.length === 0) {
          data = await fetchRecentFallbackBIN(uid, 50);
        }
        setRows(data);
      },
      async (_err) => {
        const fb = await fetchRecentFallbackBIN(uid, 50);
        setRows(fb);
      }
    );
    return () => unsub();
  }, [uid]);

  return React.useMemo(() => {
    const games = rows.length;
    const scores = rows.map((r) => r.score);
    const bestRecent = scores.length ? Math.max(...scores) : 0;
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const p90 = scores.length
      ? Math.round([...scores].sort((a, b) => a - b)[Math.floor((scores.length - 1) * 0.9)])
      : 0;

    const prLevel = rows.reduce((m, r) => Math.max(m, r.levelMax ?? 0), 0);
    const prStreak = rows.reduce((m, r) => Math.max(m, r.streakMax ?? 0), 0);

    const withDur = rows.filter((r) => (r.durationSec ?? 0) > 0 && (r.correctTotal ?? 0) > 0);
    const apmList = withDur.map((r) => (60 * (r.correctTotal as number)) / (r.durationSec as number));
    const apmAvg = apmList.length ? Math.round((apmList.reduce((a, b) => a + b, 0) / apmList.length) * 10) / 10 : 0;
    const apmBest = apmList.length ? Math.round(Math.max(...apmList) * 10) / 10 : 0;

    const totalCorrect = rows.reduce((s, r) => s + (r.correctTotal ?? 0), 0);

    return { games, bestRecent, avg, p90, prLevel, prStreak, apmAvg, apmBest, totalCorrect };
  }, [rows]);
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function ModeStatsCards({
  mode,
  stats,
}: {
  mode: Mode;
  stats: ReturnType<typeof useModeStats> | ReturnType<typeof useBinStats>;
}) {
  const title =
    mode === "TIMED"
      ? "일반 (60초)"
      : mode === "HARD"
      ? "하드 (60초)"
      : "2진수 변환";

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600 font-semibold">
        {title} — 상세 통계 (최근 50판{mode === "BIN" ? "" : ", ALL"})
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="게임 수" value={stats.games} />
        <StatCard label="평균 점수" value={stats.avg} />
        <StatCard label="상위 10% 점수" value={stats.p90} />
        <StatCard label="최근 최고" value={stats.bestRecent} />
        <StatCard label="최고 레벨(PR)" value={stats.prLevel} />
        <StatCard label="최대 연속(PR)" value={stats.prStreak} />
        <StatCard label="평균 APM" value={stats.apmAvg} sub="분당 정답 수" />
        <StatCard label="최고 APM" value={stats.apmBest} sub="분당 정답 수" />
        <StatCard label="총 정답 수(50판)" value={stats.totalCorrect} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   닉네임 업데이트
───────────────────────────────────────────────────────────── */
async function updateUserName(uid: string, newName: string) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { name: newName });
}

/* ─────────────────────────────────────────────────────────────
   컴포넌트
───────────────────────────────────────────────────────────── */
export default function MyPage() {
  const { uid: paramUid } = useParams<{ uid?: string }>();

  const [user, setUser] = React.useState<User | null | undefined>(undefined);
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const selfUid = user?.uid ?? null;
  const targetUid = paramUid ?? selfUid;
  const isSelf = !paramUid || paramUid === selfUid;

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [friends, setFriends] = React.useState<Friend[]>([]);
  const [friendProfiles, setFriendProfiles] = React.useState<Record<string, { name: string; tag: string }>>({});

  React.useEffect(() => {
    if (!targetUid) return;
    const unsub = subscribeUserProfile(targetUid, setProfile);
    return () => unsub?.();
  }, [targetUid]);

  React.useEffect(() => {
    if (!targetUid) return;
    const unsub = subscribeFriends(targetUid, setFriends);
    return () => unsub?.();
  }, [targetUid]);

  React.useEffect(() => {
    async function loadProfiles() {
      const entries = await Promise.all(
        friends.map(async (f) => {
          const p = await fetchUserProfile(f.uid);
          return [f.uid, p] as const;
        })
      );
      setFriendProfiles(Object.fromEntries(entries.filter(([, v]) => v)));
    }
    if (friends.length) loadProfiles();
  }, [friends]);

  // 최고점 / 상세 통계
  const bestTimed = useBestAll(targetUid, "TIMED");
  const bestHard = useBestAll(targetUid, "HARD");
  const bestBin = useBestBIN(targetUid);                              // ★ BIN 최고점

  const statsTimed = useModeStats(targetUid, "TIMED");
  const statsHard = useModeStats(targetUid, "HARD");
  const statsBin = useBinStats(targetUid);                            // ★ BIN 상세통계

  const [editing, setEditing] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const canEdit = isSelf && !!selfUid;

  const onSaveName = async () => {
    if (!selfUid) return;
    const nm = newName.trim();
    if (!nm) return;
    try {
      await updateUserName(selfUid, nm);
      setEditing(false);
      setNewName("");
    } catch (e) {
      console.error(e);
    }
  };

  if (!paramUid && user === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>마이페이지</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-6 w-40 bg-[--muted] animate-pulse rounded" />
          <div className="h-6 w-32 bg-[--muted] animate-pulse rounded" />
          <div className="h-20 w-full bg-[--muted] animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!paramUid && !selfUid) {
    return <div className="text-sm text-[--fg]/60">로그인이 필요합니다.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSelf ? "마이페이지" : "사용자 프로필"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 계정(닉네임) */}
        <section>
          <div className="text-sm text-[--fg]/60">계정</div>

          {editing ? (
            <div className="mt-1 flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="새 닉네임"
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={onSaveName}>저장</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setNewName(""); }}>
                취소
              </Button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <div className="text-lg font-semibold">
                {profile ? `${profile.name}#${profile.tag}` : "—"}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditing(true); setNewName(profile?.name ?? ""); }}
                >
                  닉네임 변경
                </Button>
              )}
            </div>
          )}
        </section>

        {/* 최고 점수 (TIMED/HARD ALL + ★ BIN) */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 bg-white">
            <div className="text-xs text-slate-500">일반 (60초) — ALL</div>
            <div className="text-2xl font-extrabold tabular-nums">{bestTimed}</div>
          </div>
          <div className="rounded-lg border p-3 bg-white">
            <div className="text-xs text-slate-500">하드 (60초) — ALL</div>
            <div className="text-2xl font-extrabold tabular-nums">{bestHard}</div>
          </div>
          <div className="rounded-lg border p-3 bg-white">
            <div className="text-xs text-slate-500">2진수 변환 — BIN</div>
            <div className="text-2xl font-extrabold tabular-nums">{bestBin}</div>
          </div>
        </section>

        {/* 상세 통계 (최근 50판) */}
        <section className="space-y-4">
          <ModeStatsCards mode="TIMED" stats={statsTimed} />
          <ModeStatsCards mode="HARD"  stats={statsHard} />
          <ModeStatsCards mode="BIN"   stats={statsBin} />   {/* ★ BIN 카드 */}
        </section>

        {/* 추이 그래프 */}
        {targetUid && <MyStats uid={targetUid} />}
      </CardContent>
    </Card>
  );
}
