// src/components/mystats.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

type ScoreDoc = {
  score: number;
  ts: string; // MongoDB Date → ISO string
};

function useEqualStepSeries(uid: string | null | undefined, mode: "TIMED" | "HARD") {
  const [series, setSeries] = React.useState<Array<{ label: string; t: number; y: number }>>([]);

  React.useEffect(() => {
    if (!uid) return;
    (async () => {
      const res = await fetch(`/api/scores/recent?uid=${uid}&mode=${mode}&limit=300`);
      const rows: ScoreDoc[] = await res.json();

      const sorted = rows
        .map((r) => ({ t: new Date(r.ts).getTime(), y: r.score }))
        .sort((a, b) => a.t - b.t);

      const mapped = sorted.map((p, idx) => ({
        label: String(idx + 1),
        t: p.t,
        y: p.y,
      }));

      setSeries(mapped);
    })();
  }, [uid, mode]);

  return series;
}

function ScoreLine({ series, title }: { series: Array<{ label: string; t: number; y: number }>; title: string }) {
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
          <XAxis dataKey="label" />
          <YAxis dataKey="y" />
          <Tooltip
            labelFormatter={(_label, payload) => {
              const p = payload?.[0]?.payload as any;
              return new Date(p?.t ?? 0).toLocaleString("ko-KR");
            }}
          />
          <Line type="monotone" dataKey="y" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

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
