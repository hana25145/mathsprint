// src/components/MyPage.tsx
import * as React from "react";
import { useParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MyStats from "@/components/mystats";

type Mode = "TIMED" | "HARD";

type UserProfile = {
  uid: string;
  name: string;
  tag: string;
  best?: number;
};

type Stats = {
  games: number;
  bestRecent: number;
  avg: number;
  p90: number;
  prLevel: number;
  prStreak: number;
  apmAvg: number;
  apmBest: number;
  totalCorrect: number;
};

async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const res = await fetch(`/api/users/${uid}`);
  if (!res.ok) return null;
  return await res.json();
}

async function fetchBest(uid: string, mode: Mode): Promise<number> {
  const res = await fetch(`/api/scores/best?uid=${uid}&mode=${mode}`);
  if (!res.ok) return 0;
  const data = await res.json();
  return data.best ?? 0;
}

async function fetchStats(uid: string, mode: Mode): Promise<Stats> {
  const res = await fetch(`/api/scores/stats?uid=${uid}&mode=${mode}`);
  if (!res.ok) return {
    games: 0, bestRecent: 0, avg: 0, p90: 0, prLevel: 0, prStreak: 0,
    apmAvg: 0, apmBest: 0, totalCorrect: 0
  };
  return await res.json();
}

async function updateUserName(uid: string, newName: string) {
  await fetch(`/api/users/${uid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
}

export default function MyPage() {
  const { uid: paramUid } = useParams<{ uid?: string }>();
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [bestTimed, setBestTimed] = React.useState(0);
  const [bestHard, setBestHard] = React.useState(0);
  const [statsTimed, setStatsTimed] = React.useState<Stats | null>(null);
  const [statsHard, setStatsHard] = React.useState<Stats | null>(null);

  const [editing, setEditing] = React.useState(false);
  const [newName, setNewName] = React.useState("");

  React.useEffect(() => {
    if (!paramUid) return;
    (async () => {
      const p = await fetchProfile(paramUid);
      setProfile(p);
      if (p) {
        const [bt, bh, st, sh] = await Promise.all([
          fetchBest(p.uid, "TIMED"),
          fetchBest(p.uid, "HARD"),
          fetchStats(p.uid, "TIMED"),
          fetchStats(p.uid, "HARD"),
        ]);
        setBestTimed(bt);
        setBestHard(bh);
        setStatsTimed(st);
        setStatsHard(sh);
      }
    })();
  }, [paramUid]);

  const onSaveName = async () => {
    if (!profile) return;
    const nm = newName.trim();
    if (!nm) return;
    try {
      await updateUserName(profile.uid, nm);
      setProfile({ ...profile, name: nm });
      setEditing(false);
      setNewName("");
    } catch (e) {
      console.error(e);
    }
  };

  if (!profile) return <div className="text-sm text-gray-500">프로필을 불러오는 중...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{paramUid ? "사용자 프로필" : "마이페이지"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 계정 */}
        <section>
          <div className="text-sm text-gray-500">계정</div>
          {editing ? (
            <div className="mt-1 flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="새 닉네임"
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={onSaveName}>저장</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>취소</Button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <div className="text-lg font-semibold">{profile.name}#{profile.tag}</div>
              <Button size="sm" variant="outline" onClick={() => {
                setEditing(true);
                setNewName(profile.name);
              }}>
                닉네임 변경
              </Button>
            </div>
          )}
        </section>

        {/* 최고 점수 */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3 bg-white">
            <div className="text-xs text-slate-500">일반 (60초) — ALL</div>
            <div className="text-2xl font-extrabold tabular-nums">{bestTimed}</div>
          </div>
          <div className="rounded-lg border p-3 bg-white">
            <div className="text-xs text-slate-500">하드 (60초) — ALL</div>
            <div className="text-2xl font-extrabold tabular-nums">{bestHard}</div>
          </div>
        </section>

        {/* 상세 통계 */}
        {statsTimed && (
          <section className="space-y-4">
            <ModeStatsCards mode="TIMED" stats={statsTimed} />
            {statsHard && <ModeStatsCards mode="HARD" stats={statsHard} />}
          </section>
        )}

        {/* 추이 그래프 */}
        <MyStats uid={profile.uid} />
      </CardContent>
    </Card>
  );
}

function ModeStatsCards({ mode, stats }: { mode: Mode; stats: Stats }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-600 font-semibold">
        {mode === "TIMED" ? "일반 (60초)" : "하드 (60초)"} — 상세 통계 (최근 50판, ALL)
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

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
