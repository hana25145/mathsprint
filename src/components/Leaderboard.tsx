// src/components/Leaderboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { db, subscribeUserProfile } from "@/firebase";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";
import { Link } from "react-router-dom";

type Mode = "TIMED" | "HARD";
type OpCat = "ALL" | "ADD" | "SUB" | "MUL" | "DIV";

const MODE_LABEL: Record<Mode, string> = { TIMED: "일반(60초)", HARD: "하드(60초)" };
const OPCAT_LABEL: Record<OpCat, string> = { ALL: "전체 연산자", ADD: "+", SUB: "−", MUL: "×", DIV: "÷" };

type RowStored = { uid?: string; name?: string; tag?: string; best?: number };
type RowView   = { uid?: string; name: string; tag?: string; score: number };

export function subscribeTop10SegmentSafe(
  mode: Mode,
  opCat: OpCat,
  cb: (rows: RowView[]) => void
) {
  const m = mode.toUpperCase() as Mode;
  const o = opCat.toUpperCase() as OpCat;

  const mainQ = query(
    collection(db, "leaders"),
    where("mode", "==", m),
    where("opCat", "==", o),
    orderBy("best", "desc"),
    limit(10)
  );

  const unsub = onSnapshot(
    mainQ,
    async (snap) => {
      const docs = snap.docs.map((d) => d.data() as RowStored);
      if (docs.length > 0) {
        const rows: RowView[] = docs.map((v) => ({
          uid: v.uid,
          name: v.name ?? "—",
          tag: v.tag,
          score: Number(v.best ?? 0),
        }));
        cb(rows);
        return;
      }
      try {
        const q2 = query(
          collection(db, "leaders"),
          where("mode", "==", m),
          where("opCat", "==", o),
          limit(50)
        );
        const s2 = await getDocs(q2);
        const rows2: RowView[] = s2.docs
          .map((d) => d.data() as RowStored)
          .map((v) => ({
            uid: v.uid,
            name: v.name ?? "—",
            tag: v.tag,
            score: Number(v.best ?? 0),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
        cb(rows2);
      } catch (e) {
        console.error("[leaders fallback getDocs error]", e);
        cb([]);
      }
    },
    (err) => console.error("[leaders onSnapshot error]", err)
  );
  return unsub;
}

export default function Leaderboard() {
  const [mode, setMode] = useState<Mode>("TIMED");
  const [opCat, setOpCat] = useState<OpCat>("ALL");
  const [rows, setRows] = useState<RowView[]>([]);

  useEffect(() => {
    const unsub = subscribeTop10SegmentSafe(mode, opCat, setRows);
    return () => unsub?.();
  }, [mode, opCat]);

  // 실시간 프로필 조인
  const uids = useMemo(
    () => Array.from(new Set(rows.map((r) => r.uid).filter(Boolean))) as string[],
    [rows]
  );
  const [profiles, setProfiles] = useState<Record<string, { name?: string; tag?: string }>>({});
  useEffect(() => {
    const subs: Array<() => void> = [];
    uids.forEach((uid) => {
      const u = subscribeUserProfile(uid, (p) => {
        setProfiles((prev) => ({ ...prev, [uid]: { name: p?.name, tag: p?.tag } }));
      });
      if (u) subs.push(u);
    });
    return () => subs.forEach((fn) => fn());
  }, [uids]);

  const view = rows.map((r) =>
    r.uid && profiles[r.uid]?.name
      ? { ...r, name: profiles[r.uid]!.name!, tag: profiles[r.uid]?.tag }
      : r
  );

  return (
    <Card className="rounded-2xl shadow-md bg-white overflow-hidden">
      {/* 헤더: 외곽선 제거, 톤만 분리 */}
      <CardHeader className="flex items-center justify-between px-4 py-3 bg-slate-50">
        <CardTitle className="text-base font-semibold tracking-tight">리더보드</CardTitle>
        <Link
          to={`/leaders?mode=${mode}&op=${opCat}`}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white shadow-sm hover:bg-slate-100 transition"
          title="전체 리더보드 보기"
        >
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
              className={`h-8 rounded-md px-3 text-sm shadow-sm ${
                mode === m ? "bg-slate-900 text-white" : "bg-white"
              }`}
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
              className={`h-8 rounded-md px-3 text-sm shadow-sm ${
                opCat === c ? "bg-slate-900 text-white" : "bg-white"
              }`}
            >
              {OPCAT_LABEL[c]}
            </button>
          ))}
        </div>

        {/* 리스트: 외곽선 없이 divide-y로만 구분 */}
        <ol className="mt-1 bg-white rounded-xl shadow-sm divide-y">
          {view.map((r, i) => (
            <li
              key={(r.uid ?? r.name) + i}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="truncate">
                <span className="mr-2 tabular-nums text-slate-400">{i + 1}.</span>
                {r.name}
                {r.tag ? `#${r.tag}` : ""}
              </span>
              <span className="font-semibold tabular-nums">{r.score}</span>
            </li>
          ))}
          {view.length === 0 && (
            <div className="px-3 py-6 text-sm text-slate-500">아직 기록이 없습니다.</div>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}
