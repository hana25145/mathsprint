import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addFriend, searchUsersByPrefix, type UserProfile } from "@/firebase";

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
      const data = await searchUsersByPrefix(q);
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

  const onAddFriend = async (uid: string) => {
    try {
      await addFriend(uid);
    } catch (e) {
      // 실패해도 UI는 유지 (필요시 토스트 연결)
      console.error(e);
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
        <Button
          onClick={doSearch}
          disabled={loading}
          className="text-xs h-8 px-3 whitespace-nowrap bg-black text-white hover:bg-black/90"
        >
          {loading ? "검색중..." : "검색"}
        </Button>
        </div>

        {/* 에러 메시지 */}
        {error && <div className="text-[--accent] text-xs">{error}</div>}

        {/* 결과 목록 */}
        <ul className="space-y-2 text-sm">
          {rows.map((u) => (
            <li key={u.uid} className="flex items-center justify-between gap-2">
              <span className="truncate max-w-[60%]">
                {u.name}#{u.tag}
              </span>

              <div className="flex items-center gap-2">
                {/* 프로필 열람 링크 */}
                <Link
                  to={`/user/${u.uid}`}
                  className="h-8 px-2 inline-flex items-center rounded-md border border-[--border] bg-[--card] text-[--fg] hover:bg-[--muted] text-xs"
                  aria-label={`${u.name} 프로필 열람`}
                >
                  열람
                </Link>

              </div>
            </li>
          ))}

          {!loading && rows.length === 0 && (
            <div className="text-[--fg]/60 text-xs">검색 결과 없음</div>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
