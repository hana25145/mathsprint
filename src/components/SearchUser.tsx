// src/components/SearchUser.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type UserProfile = {
  uid: string;
  name: string;
  tag: string;
};

export default function SearchUser() {
  const [term, setTerm] = React.useState("");
  const [rows, setRows] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const doSearch = React.useCallback(async () => {
    const q = term.trim();
    if (!q) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/search?prefix=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("검색 실패");
      const data: UserProfile[] = await res.json();
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "검색 중 오류가 발생했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [term]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>유저 검색</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 검색 바 */}
        <div className="flex gap-2 text-xs">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="닉네임 일부를 입력"
            className="text-xs h-8"
            aria-label="닉네임 검색어"
          />
          <Button onClick={doSearch} disabled={loading} className="text-xs h-8 px-3 bg-black text-white">
            {loading ? "검색중..." : "검색"}
          </Button>
        </div>

        {/* 에러 메시지 */}
        {error && <div className="text-red-500 text-xs">{error}</div>}

        {/* 결과 목록 */}
        <ul className="space-y-2 text-sm">
          {rows.map((u) => (
            <li key={u.uid} className="flex items-center justify-between gap-2">
              <span className="truncate max-w-[60%]">{u.name}#{u.tag}</span>
              <Link
                to={`/user/${u.uid}`}
                className="h-8 px-2 inline-flex items-center rounded-md border text-xs"
              >
                열람
              </Link>
            </li>
          ))}
          {!loading && rows.length === 0 && (
            <div className="text-gray-500 text-xs">검색 결과 없음</div>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
