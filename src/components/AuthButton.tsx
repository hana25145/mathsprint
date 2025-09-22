// src/components/AuthButton.tsx
import * as React from "react";
import { auth, loginGoogle, logout } from "@/firebase"; // firebase.ts에 있는 것
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "./ui/button";

export default function AuthButton() {
  const [user, setUser] = React.useState<null | { name: string }>(null);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ? { name: u.displayName || u.email || "사용자" } : null);
    });
    return () => unsub();
  }, []);

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">{user.name}</span>
        <Button variant="outline" onClick={logout}>로그아웃</Button>
      </div>
    );
  }
  return <Button onClick={loginGoogle}>Google로 로그인</Button>;
}
