// src/components/ui/skeleton.tsx
import * as React from "react";
import { cn } from "@/lib/utils"; // cn 함수가 없으면 아래 간단 버전 쓰세요.

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200 dark:bg-slate-700",
        className
      )}
      {...props}
    />
  );
}
