// src/components/Leaderboard.tsx
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

type Mode = "TIMED" | "HARD";
type OpCat = "ALL" | "ADD" | "SUB" | "MUL" | "DIV";

const MODE_LABEL: Record<Mode, string> = { TIMED: "일반(60초)", HARD: "하드(60초)" };
const OPCAT_LABEL: Record<OpCat, string> = { ALL: "전체 연산자", ADD: "+", SUB: "−", MUL: "×", DIV: "÷" };

type RowView = { uid: string; name: string; tag?: string; best: number };

export default function Leaderboard() {
  const [mode, setMode] = useState<Mode>("TIMED");
  const [opCat, setOpCat] = useState<OpCat>("ALL");
  const [rows, setRows] = useState<RowView[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(`/api/leaders?mode=${mode}&opCat=${opCat}&limit=10`);
      const data: RowView[] = await res.json();
      setRows(data);
    };
    fetchData();
    const t = setInterval(fetchData, 5000); // 5초마다 갱신
    return () => clearInterval(t);
  }, [mode, opCat]);

  return (
    <Card className="rounded-2xl shadow-md bg-white overflow-hidden">
      <CardHeader className="flex items-center justify-between px-4 py-3 bg-slate-50">
        <CardTitle className="text-base font-semibold tracking-tight">리더보드</CardTitle>
        <Link to={`/leaders?mode=${mode}&op=${opCat}`} className="text-xs px-2 py-1 rounded-md bg-white shadow-sm">
          전체 보기
        </Link>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* 필터 */}
        <div className="flex gap-2">
          {(["TIMED", "HARD"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`h-8 rounded-md px-3 text-sm shadow-sm ${mode === m ? "bg-slate-900 text-white" : "bg-white"}`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(["ALL", "ADD", "SUB", "MUL", "DIV"] as OpCat[]).map((c) => (
            <button
              key={c}
              onClick={() => setOpCat(c)}
              className={`h-8 rounded-md px-3 text-sm shadow-sm ${opCat === c ? "bg-slate-900 text-white" : "bg-white"}`}
            >
              {OPCAT_LABEL[c]}
            </button>
          ))}
        </div>

        {/* 리스트 */}
        <ol className="mt-1 bg-white rounded-xl shadow-sm divide-y">
          {rows.map((r, i) => (
            <li key={r.uid + i} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="truncate">
                <span className="mr-2 tabular-nums text-slate-400">{i + 1}.</span>
                {r.name}{r.tag ? `#${r.tag}` : ""}
              </span>
              <span className="font-semibold tabular-nums">{r.best}</span>
            </li>
          ))}
          {rows.length === 0 && <div className="px-3 py-6 text-sm text-slate-500">아직 기록이 없습니다.</div>}
        </ol>
      </CardContent>
    </Card>
  );
}
