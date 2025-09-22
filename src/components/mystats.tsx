// src/components/mystats.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { db } from "../firebase"; // ← 프로젝트 경로에 맞게 확인
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  FirestoreError,
} from "firebase/firestore";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/* ──────────────────────────────────────────────
   Firestore 문서 타입 (ts = Timestamp 사용)
──────────────────────────────────────────────── */
type FireTs =
  | { toMillis?: () => number; toDate?: () => Date }
  | { seconds?: number; nanoseconds?: number };

type ScoreDoc = {
  uid: string;
  mode: "TIMED" | "HARD" | string;
  opCat?: string; // "ALL" 기대 (없으면 ALL로 간주)
  score: number;
  ts?: FireTs;    // ✅ 서버 Timestamp 필드
};

/* ──────────────────────────────────────────────
   Timestamp → ms 안전 변환 (없으면 null)
──────────────────────────────────────────────── */
function tsToMillis(ts?: FireTs): number | null {
  const anyTs = ts as any;
  if (!anyTs) return null;
  if (typeof anyTs.toMillis === "function") return Number(anyTs.toMillis());
  if (typeof anyTs.seconds === "number")
    return anyTs.seconds * 1000 + Math.floor((anyTs.nanoseconds ?? 0) / 1e6);
  return null;
}

/* ──────────────────────────────────────────────
   폴백 로더 (orderBy 없이 긁고 클라에서 정렬/필터)
──────────────────────────────────────────────── */
async function fetchFallback(uid: string, mode: string, n = 300) {
  try {
    const snap = await getDocs(
      query(collection(db, "scores"), where("uid", "==", uid), where("mode", "==", mode), limit(n))
    );
    return snap.docs.map((d) => d.data() as ScoreDoc);
  } catch (e) {
    console.warn("[mystats] fetchFallback error:", e);
    return [] as ScoreDoc[];
  }
}

/* ──────────────────────────────────────────────
   핵심 훅: “게임 간 등간격” 라인 시리즈
   - 정렬은 ts 오름차순으로만 사용 (표시 간격은 등간격)
   - 시간 정보(ts)가 없는 문서는 그래프에서 제외
   - 서버쿼리 실패/빈결과 시 폴백 사용
   - 결과 형태: { label: "1|2|3...", t: ms, y: score }
──────────────────────────────────────────────── */
function useEqualStepSeries(uid: string | null | undefined, mode: "TIMED" | "HARD") {
  const [series, setSeries] = React.useState<Array<{ label: string; t: number; y: number }>>([]);

  React.useEffect(() => {
    if (!uid) return;

    const qMain = query(
      collection(db, "scores"),
      where("uid", "==", uid),
      where("mode", "==", mode),
      orderBy("ts", "desc"), // 최신부터 (인덱스 필요 가능)
      limit(300)
    );

    const unsub = onSnapshot(
      qMain,
      async (snap) => {
        let rows = snap.docs.map((d) => d.data() as ScoreDoc);

        // 서버 필터에서 빠질 가능성을 고려해 폴백
        if (rows.length === 0) {
          rows = await fetchFallback(uid, mode, 300);
        }

        // 클라에서 카테고리 필터 (없으면 ALL 취급)
        rows = rows.filter((r) => (r.opCat ?? "ALL") === "ALL");

        // ts 있는 것만 사용 → 오름차순 정렬 → 등간격 라벨 부여
        const sorted = rows
          .map((r) => {
            const t = tsToMillis(r.ts);
            return t ? { t, y: Number(r.score ?? 0) } : null;
          })
          .filter((p): p is { t: number; y: number } => !!p)
          .sort((a, b) => a.t - b.t);

        const mapped = sorted.map((p, idx) => ({
          label: String(idx + 1), // 등간격 카테고리 라벨
          t: p.t,                 // 툴팁용 실제 시간(ms)
          y: p.y,
        }));

        setSeries(mapped);
      },
      async (_err: FirestoreError) => {
        // onSnapshot 실패 시 폴백 경로
        let rows = await fetchFallback(uid, mode, 300);
        rows = rows.filter((r) => (r.opCat ?? "ALL") === "ALL");

        const sorted = rows
          .map((r) => {
            const t = tsToMillis(r.ts);
            return t ? { t, y: Number(r.score ?? 0) } : null;
          })
          .filter((p): p is { t: number; y: number } => !!p)
          .sort((a, b) => a.t - b.t);

        const mapped = sorted.map((p, idx) => ({
          label: String(idx + 1),
          t: p.t,
          y: p.y,
        }));

        setSeries(mapped);
      }
    );

    return () => unsub();
  }, [uid, mode]);

  return series;
}

/* ──────────────────────────────────────────────
   라인 차트 (등간격 카테고리 x축)
──────────────────────────────────────────────── */
function ScoreLine({
  series,
  title,
}: {
  series: Array<{ label: string; t: number; y: number }>;
  title: string;
}) {
  if (!series.length) {
    return (
      <div>
        <div className="mb-1 text-xs text-slate-500">{title}</div>
        <div className="text-sm text-slate-500">최근 기록이 없습니다.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-xs text-slate-500">{title}</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="3 3" />

          {/* ✅ 등간격 카테고리 축 */}
          <XAxis dataKey="label" />

          <YAxis dataKey="y" />
          <Tooltip
            // 라벨은 등간격 인덱스, 실제 시간은 payload.t 에서 표시
            labelFormatter={(_label, payload) => {
              const p = payload?.[0]?.payload as any;
              return new Date(p?.t ?? 0).toLocaleString("ko-KR", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
            }}
          />
          <Line type="monotone" dataKey="y" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ──────────────────────────────────────────────
   메인: TIMED / HARD 두 그래프 (등간격)
   - TIMED 문제/로직은 건드리지 않고 조회/표시만 담당
──────────────────────────────────────────────── */
export default function MyStats({ uid }: { uid: string }) {
  const timedSeries = useEqualStepSeries(uid, "TIMED");
  const hardSeries = useEqualStepSeries(uid, "HARD");

  return (
    <Card>
      <CardHeader>
        <CardTitle>최근 게임 점수</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ScoreLine series={timedSeries} title="일반 모드 (TIMED) — ALL" />
        <ScoreLine series={hardSeries} title="하드 모드 (HARD) — ALL" />
      </CardContent>
    </Card>
  );
}
