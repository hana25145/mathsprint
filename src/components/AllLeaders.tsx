// src/components/AllLeaders.tsx
import * as React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db, subscribeUserProfile } from "@/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";

type Mode = "TIMED" | "HARD" | "BIN";                  // ★ BIN 추가
type OpCat = "ALL" | "ADD" | "SUB" | "MUL" | "DIV" | "BIN"; // ★ BIN 추가

const MODE_LABEL: Record<Mode, string> = {
  TIMED: "일반(60초)",
  HARD: "하드(60초)",
  BIN: "2진수 변환",                                      // ★ BIN 라벨
};
const OPCAT_LABEL: Record<OpCat, string> = {
  ALL: "전체 연산자",
  ADD: "+",
  SUB: "−",
  MUL: "×",
  DIV: "÷",
  BIN: "2진수",                                          // ★ BIN 라벨
};

type RowStored = { uid?: string; name?: string; tag?: string; best?: number };
type RowView = { uid?: string; name: string; tag?: string; best: number };

export default function AllLeaders() {
  const [sp, setSp] = useSearchParams();
  const [mode, setMode] = React.useState<Mode>((sp.get("mode") as Mode) || "TIMED");
  const [opCat, setOpCat] = React.useState<OpCat>((sp.get("op") as OpCat) || "ALL");

  const PAGE = 50;
  const [rows, setRows] = React.useState<RowView[]>([]);
  const [cursor, setCursor] = React.useState<DocumentSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);

  // ★ 쿼리에서 사용할 opCat( BIN 모드면 항상 "BIN")
  const effectiveOpCat: OpCat = mode === "BIN" ? "BIN" : opCat;

  React.useEffect(() => {
    // ★ URL 파라미터 동기화 (BIN 모드면 op=BIN 고정)
    setSp({ mode, op: effectiveOpCat }, { replace: true });

    (async () => {
      setLoading(true);
      setRows([]);
      setCursor(null);
      setExhausted(false);
      try {
        const q0 = query(
          collection(db, "leaders"),
          where("mode", "==", mode),
          where("opCat", "==", effectiveOpCat),
          orderBy("best", "desc"),
          limit(PAGE)
        );
        const s = await getDocs(q0);
        const r: RowView[] = s.docs.map((d) => {
          const v = d.data() as RowStored;
          return { uid: v.uid, name: v.name ?? "—", tag: v.tag, best: Number(v.best ?? 0) };
        });
        setRows(r);
        setCursor(s.docs.length ? s.docs[s.docs.length - 1] : null);
        setExhausted(s.docs.length < PAGE);
      } finally {
        setLoading(false);
      }
    })();
    // mode 또는 opCat가 바뀌면 재조회 (BIN에서는 effectiveOpCat이 항상 "BIN")
  }, [mode, opCat, effectiveOpCat, setSp]);

  const loadMore = async () => {
    if (loading || exhausted) return;
    setLoading(true);
    try {
      const baseQuery = [
        collection(db, "leaders"),
        where("mode", "==", mode),
        where("opCat", "==", effectiveOpCat),
        orderBy("best", "desc"),
      ] as const;

      const qMore = cursor
        ? query(...baseQuery, startAfter(cursor), limit(PAGE))
        : query(...baseQuery, limit(PAGE));

      const s = await getDocs(qMore);
      const r: RowView[] = s.docs.map((d) => {
        const v = d.data() as RowStored;
        return { uid: v.uid, name: v.name ?? "—", tag: v.tag, best: Number(v.best ?? 0) };
      });
      setRows((prev) => [...prev, ...r]);
      setCursor(s.docs.length ? s.docs[s.docs.length - 1] : cursor);
      if (s.docs.length < PAGE) setExhausted(true);
    } finally {
      setLoading(false);
    }
  };

  // 실시간 프로필 조인
  const uids = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.uid).filter(Boolean))) as string[],
    [rows]
  );
  const [profiles, setProfiles] = React.useState<Record<string, { name?: string; tag?: string }>>({});
  React.useEffect(() => {
    const unsubs: Array<() => void> = [];
    uids.forEach((uid) => {
      const u = subscribeUserProfile(uid, (p) => {
        setProfiles((prev) => ({ ...prev, [uid]: { name: p?.name, tag: p?.tag } }));
      });
      if (u) unsubs.push(u);
    });
    return () => unsubs.forEach((fn) => fn());
  }, [uids]);

  const view = rows.map((r) =>
    r.uid && profiles[r.uid]?.name
      ? { ...r, name: profiles[r.uid]!.name!, tag: profiles[r.uid]?.tag }
      : r
  );

  return (
    <Card className="rounded-2xl shadow-md bg-white overflow-hidden">
      <CardHeader className="flex items-center justify-between px-4 py-3 bg-slate-50">
        <CardTitle className="text-base font-semibold tracking-tight">전체 리더보드</CardTitle>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white shadow-sm hover:bg-slate-100 transition"
          title="게임으로 돌아가기"
        >
          ← 게임으로
        </Link>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* 필터 (디자인 유지) */}
        <div className="flex flex-wrap gap-2">
          {(["TIMED", "HARD", "BIN"] as Mode[]).map((m) => (           // ★ BIN 모드 버튼 추가
            <Button
              key={m}
              onClick={() => setMode(m)}
              variant={mode === m ? "default" : "outline"}
              className="h-8 rounded-md px-3 text-sm shadow-sm"
            >
              {MODE_LABEL[m]}
            </Button>
          ))}

          <div className="mx-1 h-8 w-px bg-slate-200" />

          {/* 연산자 필터: BIN 모드에서는 '2진수' 단일 버튼만 표시(디자인 동일) */}
          {mode !== "BIN" ? (
            (["ALL", "ADD", "SUB", "MUL", "DIV"] as OpCat[]).map((c) => (
              <Button
                key={c}
                onClick={() => setOpCat(c)}
                variant={effectiveOpCat === c ? "default" : "outline"}
                className="h-8 rounded-md px-3 text-sm shadow-sm"
              >
                {OPCAT_LABEL[c]}
              </Button>
            ))
          ) : (
            <Button
              key="BIN"
              variant="default"
              className="h-8 rounded-md px-3 text-sm shadow-sm"
              disabled
            >
              {OPCAT_LABEL.BIN}
            </Button>
          )}
        </div>

        {/* 표 */}
        <div className="rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="grid grid-cols-[64px_1fr_120px] px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50">
            <div>#</div>
            <div>닉네임</div>
            <div className="text-right">최고점</div>
          </div>

          <div className="divide-y">
            {view.map((r, i) => (
              <div
                key={(r.uid ?? r.name) + i}
                className="grid grid-cols-[64px_1fr_120px] px-3 py-2 text-sm"
              >
                <div className="tabular-nums text-slate-400">{i + 1}</div>
                <div className="truncate">
                  {r.name}
                  {r.tag ? `#${r.tag}` : ""}
                </div>
                <div className="text-right font-semibold tabular-nums">{r.best}</div>
              </div>
            ))}
            {!view.length && !loading && (
              <div className="px-3 py-6 text-sm text-slate-500">아직 기록이 없습니다.</div>
            )}
          </div>
        </div>

        {/* 더 보기 */}
        <div className="flex justify-center">
          {!exhausted ? (
            <Button onClick={loadMore} disabled={loading}>
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
