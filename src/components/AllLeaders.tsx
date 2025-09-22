// src/components/AllLeaders.tsx
import * as React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Mode = "TIMED" | "HARD";
type OpCat = "ALL" | "ADD" | "SUB" | "MUL" | "DIV";

const MODE_LABEL: Record<Mode, string> = { TIMED: "일반(60초)", HARD: "하드(60초)" };
const OPCAT_LABEL: Record<OpCat, string> = { ALL: "전체 연산자", ADD: "+", SUB: "−", MUL: "×", DIV: "÷" };

type RowView = { uid: string; name: string; tag?: string; best: number };

export default function AllLeaders() {
  const [sp, setSp] = useSearchParams();
  const [mode, setMode] = React.useState<Mode>((sp.get("mode") as Mode) || "TIMED");
  const [opCat, setOpCat] = React.useState<OpCat>((sp.get("op") as OpCat) || "ALL");

  const PAGE = 50;
  const [rows, setRows] = React.useState<RowView[]>([]);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);

  const loadData = async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leaders?mode=${mode}&opCat=${opCat}&skip=${reset ? 0 : page * PAGE}&limit=${PAGE}`);
      const data: RowView[] = await res.json();
      if (reset) {
        setRows(data);
        setPage(1);
      } else {
        setRows((prev) => [...prev, ...data]);
        setPage((p) => p + 1);
      }
      if (data.length < PAGE) setExhausted(true);
      else setExhausted(false);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    setSp({ mode, op: opCat }, { replace: true });
    loadData(true);
  }, [mode, opCat]);

  return (
    <Card className="rounded-2xl shadow-md bg-white overflow-hidden">
      <CardHeader className="flex items-center justify-between px-4 py-3 bg-slate-50">
        <CardTitle className="text-base font-semibold tracking-tight">전체 리더보드</CardTitle>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white shadow-sm hover:bg-slate-100 transition"
        >
          ← 게임으로
        </Link>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* 필터 */}
        <div className="flex flex-wrap gap-2">
          {(["TIMED", "HARD"] as Mode[]).map((m) => (
            <Button key={m} onClick={() => setMode(m)} variant={mode === m ? "default" : "outline"}>
              {MODE_LABEL[m]}
            </Button>
          ))}
          <div className="mx-1 h-8 w-px bg-slate-200" />
          {(["ALL", "ADD", "SUB", "MUL", "DIV"] as OpCat[]).map((c) => (
            <Button key={c} onClick={() => setOpCat(c)} variant={opCat === c ? "default" : "outline"}>
              {OPCAT_LABEL[c]}
            </Button>
          ))}
        </div>

        {/* 표 */}
        <div className="rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="grid grid-cols-[64px_1fr_120px] px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50">
            <div>#</div>
            <div>닉네임</div>
            <div className="text-right">최고점</div>
          </div>
          <div className="divide-y">
            {rows.map((r, i) => (
              <div key={r.uid + i} className="grid grid-cols-[64px_1fr_120px] px-3 py-2 text-sm">
                <div className="tabular-nums text-slate-400">{i + 1}</div>
                <div className="truncate">{r.name}{r.tag ? `#${r.tag}` : ""}</div>
                <div className="text-right font-semibold tabular-nums">{r.best}</div>
              </div>
            ))}
            {!rows.length && !loading && (
              <div className="px-3 py-6 text-sm text-slate-500">아직 기록이 없습니다.</div>
            )}
          </div>
        </div>

        {/* 더 보기 */}
        <div className="flex justify-center">
          {!exhausted ? (
            <Button onClick={() => loadData()} disabled={loading}>
              {loading ? "불러오는 중..." : "더 보기"}
            </Button>
          ) : (
            <div className="text-xs text-slate-500">모든 기록을 불러왔습니다.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
