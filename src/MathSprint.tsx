// src/MathSprint.tsx — clean rewrite (TIMED/HARD=timer, ENDLESS=lives)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Heart, HelpCircle, RotateCcw, Play, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import AuthButton from "@/components/AuthButton";
import Leaderboard from "@/components/Leaderboard";
import SearchUser from "@/components/SearchUser";
import MyPage from "@/components/MyPage";
import { ensureUserProfile, submitScore } from "./firebase";
import { submitScoreSafe } from "./firebase";

// ─────────────────────────────────────────────────────────────
// Types / utils
// ─────────────────────────────────────────────────────────────
export type Mode = "TIMED" | "HARD" | "ENDLESS";
export type Op = "+" | "-" | "×" | "÷";
export type Problem = { a: number; b: number; op: Op; answer: number };

const OP_LIST: Op[] = ["+", "-", "×", "÷"];
const ri = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const digits = (n: number) => Math.max(1, Math.floor(Math.log10(Math.abs(n))) + 1);
const randDigits = (d: number) => {
  const D = Math.max(1, d);
  const min = 10 ** (D - 1);
  const max = 10 ** D - 1;
  return ri(min, max);
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

// ─────────────────────────────────────────────────────────────
// Timer / scoring
// ─────────────────────────────────────────────────────────────
const START_TIME = 60;
const START_TIME_HARD = 300;
const TIME_CAP = 150;

const OP_SCORE_MULT: Record<Op, number> = { "×": 1.30, "÷": 1.15, "-": 1.05, "+": 1.00 };
const TIME_ON_CORRECT_BASE: Record<Op, number> = { "×": 2, "÷": 2, "-": 1, "+": 1 };

function addTimeOnCorrect(
  op: Op,
  cur: number,
  ans?: number,
  streak?: number,
  mode?: Mode
) {
  let bonus = TIME_ON_CORRECT_BASE[op] ?? 0;

  if (typeof ans === "number") {
    const d = digits(ans);
    bonus += Math.min(3, Math.max(0, Math.floor((d - 2) / 2))); // 자리수 보정
  }
  if (typeof streak === "number" && streak > 0) {
    bonus += Math.min(2, Math.floor(streak / 5)); // 스트릭 보정
  }
  if (cur < 10) bonus += 1; // 위기 구간 보정

  // 하드는 약간 짜게(난이도 상향)
  if (mode === "HARD") bonus = Math.max(0, Math.floor(bonus * 5));

  return Math.min(TIME_CAP, cur + bonus);
}

function scoreFor(level: number, op: Op, streak: number, ans?: number) {
  const base = 6 + Math.floor(level * 1.3) + Math.min(10, streak);
  const d = ans != null ? digits(ans) : 2;
  const hi = 10 ** d - 1;
  const within = ans != null ? Math.min(1, ans / hi) : 0.5;
  const digitFactor = 1 + 0.18 * (d - 1);
  const withinFactor = 0.85 + 0.30 * within;
  const opFactor = OP_SCORE_MULT[op] ?? 1;
  return Math.round(base * opFactor * digitFactor * withinFactor);
}

function isTimerMode(m: Mode) {
  return m === "TIMED" || m === "HARD";
}

// ─────────────────────────────────────────────────────────────
// Problem generators
//   - Normal(TIMED): 기존 감각 유지 (덧·뺄 쉬움, ÷는 2..12, ×는 균형/1자리 보정)
//   - Hard(HARD): 큰 수 위주, ÷ 제수 11..99, × 큰수×큰수, 타이머 모드
//   - Endless는 생성 동일, 규칙만 lives
// ─────────────────────────────────────────────────────────────

// Normal helpers (부드러운 난이도)
function targetAddNormal(level: number) { return Math.floor(20 + 12 * level); }
function targetSubNormal(level: number) { return Math.floor(20 + 10 * level); }
function targetMulNormal(level: number) { return Math.floor(120 + 60 * level); }

function makeAdditionEasyByAns(A: number): Problem {
  const a = ri(1, Math.min(99, A - 1));
  const b = A - a;
  return { a, b, op: "+", answer: A };
}
function makeSubtractionEasyByAns(A: number): Problem {
  const b = ri(1, Math.min(99, A));
  const a = A + b;
  return { a, b, op: "-", answer: A };
}
function makeDivisionEasyByAns(A: number): Problem {
  const k = ri(2, 12);
  return { a: A * k, b: k, op: "÷", answer: A };
}
async function submitScoreToServer(payload: any) {
  const res = await fetch("/api/submitScore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("서버 점수 제출 실패");
  return res.json();
}
// dAns 자리의 "정답"이 나오도록 a+b를 구성하되,
// 대부분의 자리에서 a_i + b_i + carry_in >= 10이 되게 만들어 난도↑
function makeAdditionHardWithCarries(dAns: number): Problem {
  const n = Math.max(2, dAns);
  const carryDensity = 0.75; // 몇 % 칸에서 carry를 강제할지

  // 최상위 자릿수(맨 왼쪽)는 '넘치지 않게' 만들어 dAns 자릿수 유지
  // 하위 자릿수는 carry 발생을 많이 유도
  let carry = 0;
  const a: number[] = [];
  const b: number[] = [];

  for (let i = 0; i < n; i++) {
    const top = i === n - 1;
    if (top) {
      // 최상위는 a+b+carry < 10이 되도록 만들어서 결과가 정확히 n자리로 끝나게
      const maxTop = 9 - carry - 1;                 // 여유 1 남김
      const ai = ri(1, Math.max(1, Math.min(8, maxTop)));
      const bi = ri(0, Math.max(0, maxTop - ai));
      a.push(ai); b.push(bi);
      carry = 0;                                    // 넘치지 않음
    } else {
      const forceCarry = Math.random() < carryDensity;
      if (forceCarry) {
        // (ai + bi + carry) >= 10 보장
        const target = ri(10, 17);
        const ai = ri(1, 9);
        const bi = Math.min(9, target - ai - carry);
        a.push(ai); b.push(bi);
        carry = 1;
      } else {
        // carry 없이
        const ai = ri(0, 9);
        const bi = ri(0, Math.max(0, 9 - ai - carry));
        a.push(ai); b.push(bi);
        carry = 0;
      }
    }
  }

  // 숫자 조립 (LSB→MSB 로 만들었으니 뒤집기)
  const build = (ds: number[]) => Number(ds.map((x, i) => ds[i]).reverse().join(""));
  const A = build(a), B = build(b);
  const S = A + B;

  // 안전장치: 자릿수 보정
  if (String(S).length !== n) {
    // 맞지 않으면 간단 합성으로 폴백
    const sum = randDigits(dAns);
    const small = ri(1, Math.min(99, sum - 1));
    return { a: small, b: sum - small, op: "+", answer: sum };
  }
  return { a: A, b: B, op: "+", answer: S };
}
// a - b = R (정답 자릿수 = dAns).
// 각 자리에서 R_i + b_i + borrow_in >= 10 이 되도록 b_i를 잡아 borrow를 유발.
function makeSubtractionHardWithBorrows(dAns: number): Problem {
  const n = Math.max(2, dAns);
  const borrowDensity = 0.75;

  // 정답 R 을 먼저 결정 (n자리)
  const R = randDigits(n);
  const rd = String(R).split("").reverse().map(Number); // LSB→

  let borrow = 0;
  const a: number[] = [];
  const b: number[] = [];

  for (let i = 0; i < n; i++) {
    const top = i === n - 1;
    if (top) {
      // 최상위는 borrow 발생시키지 않음 → 음수/자릿수 붕괴 방지
      const bi = ri(0, Math.max(0, 9 - rd[i] - borrow - 1)); // 여유 1
      const sum = rd[i] + bi + borrow;
      const ai = sum;                  // top 에서는 10 넘어가지 않게 설계
      a.push(ai); b.push(bi);
      borrow = 0;
    } else {
      const forceBorrow = Math.random() < borrowDensity;
      if (forceBorrow) {
        // R_i + b_i + borrow >= 10 유도 → 해당 자리에서 borrow 발생
        const target = ri(10, 17);
        const bi = Math.min(9, target - rd[i] - borrow);
        const ai = (rd[i] + bi + borrow) - 10;  // 0..9
        a.push(ai); b.push(bi);
        borrow = 1;
      } else {
        const bi = ri(0, Math.max(0, 9 - rd[i] - borrow));
        const ai = rd[i] + bi + borrow;         // < 10
        a.push(ai); b.push(bi);
        borrow = 0;
      }
    }
  }

  const build = (ds: number[]) => Number(ds.map((x) => x).reverse().join(""));
  const A = build(a), B = build(b), Rchk = A - B;

  if (Rchk !== R || String(R).length !== n) {
    // 폴백: "큰 수 - 작은 수" 간단 버전(정답 자릿수 유지)
    const diff = randDigits(dAns);
    const sub = ri(1, Math.min(99, diff));
    return { a: diff + sub, b: sub, op: "-", answer: diff };
  }
  return { a: A, b: B, op: "-", answer: R };
}

// ─────────────────────────────────────────────
// 1) 레벨→정답 자릿수(dAns) 공통 기준 (HARD 전용)
//    예: Lv1→3자리, Lv2→4자리, … (원하면 계단식/완만 조정 가능)
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// 2) dAns를 강제하는 연산별 빌더들 (정답/결과 자릿수 통일)
// ─────────────────────────────────────────────
function makeAdditionWithAnsDigits(dAns: number): Problem {
  const sum = randDigits(dAns);
  // 계산 쉬움 유지를 위해 작은 수 + 큰 수
  const a = ri(1, Math.min(99, sum - 1));
  const b = sum - a;
  return { a, b, op: "+", answer: sum };
}

function makeSubtractionWithAnsDigits(dAns: number): Problem {
  const diff = randDigits(dAns);
  const b = ri(1, Math.min(99, diff)); // 작은 수 빼기
  const a = diff + b;
  return { a, b, op: "-", answer: diff };
}

function makeDivisionWithAnsDigits(dAns: number, hard: boolean): Problem {
  // 몫의 자릿수를 dAns로 강제
  const q = randDigits(dAns);
  const divisor = hard ? ri(11, 99) : ri(2, 12); // 하드는 제수 크게
  const dividend = q * divisor;                   // 항상 나누어떨어지게
  return { a: dividend, b: divisor, op: "÷", answer: q };
}

function makeMultiplicationWithAnsDigits(dAns: number, level: number, hardBias = false): Problem {
  // 곱의 자릿수 = dAns 를 만족하도록 인수 자릿수 da+db ~= dAns
  // (정확히 맞추려고 da+db 또는 da+db-1 케이스를 시도)
  for (let tries = 0; tries < 80; tries++) {
    let da: number, db: number;
    if (hardBias) {
      // 하드: 두 인수 균형(큰수×큰수) + 최소 자릿수 바닥선
      const minDigit = Math.max(2, Math.floor(dAns / 2)); // 너무 작은 인수 방지
      da = ri(minDigit, Math.max(minDigit, Math.floor(dAns / 2)));
      db = Math.max(1, dAns - da + (Math.random() < 0.5 ? 0 : -1));
    } else {
      // 노말: 한쪽 1자리 허용(쉬움)
      const forceSmall = level < 10;
      if (forceSmall) {
        da = 1;
        db = Math.max(1, dAns - da + (Math.random() < 0.5 ? 0 : -1));
      } else {
        da = ri(1, Math.max(1, dAns - 1));
        db = Math.max(1, dAns - da + (Math.random() < 0.5 ? 0 : -1));
      }
    }
    const a = randDigits(da);
    const b = randDigits(db);
    const A = a * b;
    if (digits(A) === dAns) return { a, b, op: "×", answer: A };
  }
  // 마지막 안전망: 정답 A의 약수로 구성
  const A = randDigits(dAns);
  for (let f = 2; f <= 999; f++) if (A % f === 0) return { a: A / f, b: f, op: "×", answer: A };
  return makeAdditionWithAnsDigits(dAns);
}

// ─────────────────────────────────────────────
// 3) HARD 모드 생성기: 한 레벨에 하나의 dAns를 공통 사용
// ─────────────────────────────────────────────
// 하드 생성기 안에서 + / - 만 교체 사용
function genProblemHard(level: number, enabled: Record<Op, boolean>): Problem {
  const dAns = dAnsForHard(level);
  const ops = (["+","-","×","÷"] as Op[]).filter((o) => enabled[o]);
  const op = ops.length ? pick(ops) : "+";

  switch (op) {
    case "+": return makeAdditionHardWithCarries(dAns);
    case "-": return makeSubtractionHardWithBorrows(dAns);

    case "÷": {
      // 이전에 너랑 맞춘 "쉬운 버전" 또는 "복합(몫+제수) 버전" 중 원하는 걸 유지
      // (여기선 쉬운 쪽 예시)
      const q = randDigits(dAns);
      const divisorDigits = level <= 2 ? 1 : (level <= 5 ? 2 : Math.min(3, dAns));
      const divisor = randDigits(divisorDigits);
      return { a: q * divisor, b: divisor, op: "÷", answer: q };
    }

    case "×":
    default: {
      // 곱셈은 기존 하드 로직 유지(균형 큰수×큰수). dAns는 위 곡선 사용
      return makeMultiplicationWithAnsDigits(Math.max(2, dAns), level, /*hardBias=*/true);
    }
  }
}


function randWithDigits(digits: number): number {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 레벨에 따른 총 자리수 목표치
function targetDiv(level: number): number {
  // 예시: 레벨 ↑ → 총 자리수 합 증가
  return Math.max(2, Math.floor(0.4 * level)); 
  // 레벨 1에서 3, 레벨 10쯤 9, 이런 식으로
}

function genDivision(level: number) {
  const total = targetDiv(level);

  // 가능한 분할 후보 [(dividendDigits, divisorDigits), ...]
  const candidates: [number, number][] = [];
  for (let divDigits = 1; divDigits < total; divDigits++) {
    const dvdDigits = total - divDigits;
    if (dvdDigits >= divDigits) {
      candidates.push([dvdDigits, divDigits]);
    }
  }

  // 후보 중 랜덤 선택
  const [dvdDigits, divDigits] = candidates[Math.floor(Math.random() * candidates.length)];

  const divisor = randWithDigits(divDigits);
  const quotient = randWithDigits(Math.max(1, dvdDigits - divDigits)); // 몫 자리수 대략 맞추기
  const dividend = divisor * quotient;

  return { a: dividend, b: divisor, op: "÷" as const, answer: quotient };
}


// ── 덧/뺄/곱 타깃 규모(상한 없음, 완만 증가) ────────────────
// 기존 targetAdd/targetSub/targetMul 교체

function targetAdd(level: number) {
  const L = Math.max(1, level);
  // 더 빠르게 성장, 별도 하한 제거
  return Math.floor(6 + 8.0 * Math.pow(L, 1.60));
}
function targetSub(level: number) {
  const L = Math.max(1, level);
  return Math.floor(6 + 7.5 * Math.pow(L, 1.58));
}
function targetMul(level: number) {
  const L = Math.max(1, level);
  // 곱셈도 체감 올리되 폭주는 방지
  return Math.floor(8 + 6.5 * Math.pow(L, 1.50));
}
export type OpSym = "+" | "-" | "×" | "÷";
// Normal: 기존 감각
export function genProblemNormal(level: number, enabled: Record<OpSym, boolean>): Problem {
  const ops = OP_LIST.filter((o) => enabled[o]);
  const op = pick(ops);

  switch (op) {
    case "÷":
      return genDivision(level);

// genProblem 내부 +, - 분기 교체

    case "+": {
      const T = targetAdd(level);
      // 하한 제거: 0.80~1.20로 키우고, 1 미만만 방지
      const lo = Math.max(1, Math.floor(T * 0.80));
      const hi = Math.max(lo, Math.floor(T * 1.20));
      const sum = ri(lo, hi);
      const a = ri(1, Math.max(1, sum - 1));
      const b = sum - a;
      return { a, b, op: "+", answer: a + b };
    }

    case "-": {
      const T = targetSub(level);
      const lo = Math.max(1, Math.floor(T * 0.80));
      const hi = Math.max(lo, Math.floor(T * 1.20));
      const diff = ri(lo, hi);
      // a >= b, 음수 방지만 보장(하한 최소화)
      const wiggle = Math.max(0, Math.floor(diff * 0.30));
      const a = diff + ri(0, wiggle);
      const b = a - diff;
      return { a, b, op: "-", answer: a - b };
    }

      case "×": {
        const T = targetMul(level);
        // 인수는 √T 근방, 범위 0.80~1.30로 확대
        const root = Math.max(2, Math.floor(Math.sqrt(Math.max(2, T))));
        const aLo = Math.max(2, Math.floor(root * 0.80));
        const aHi = Math.max(aLo, Math.floor(root * 1.30));
        const a = ri(aLo, aHi);

        const bEst = Math.max(2, T / a);
        const bLo = Math.max(2, Math.floor(bEst * 0.80));
        const bHi = Math.max(bLo, Math.floor(bEst * 1.30));
        const b = ri(bLo, bHi);

        return { a, b, op: "×", answer: a * b };
      }

  }
}
// ✅ HARD 전용: 레벨 → 몫 자릿수(dAns)
//   이전: Lv1=3 → 시작이 빡셈
//   변경: Lv1=2 로 완화, 이후 매 레벨 +1 (상한 9)
// 아주 완만하게: Lv1~3=2자리, Lv4~6=3자리, Lv7~9=4자리 ...
function dAnsForHard(level: number) {
  if (level <= 3) return 4;
  if (level <= 6) return 5;
  if (level <= 9) return 6;
  return 6 + Math.floor((level - 9) / 2); // 상한 7자리
}


// ✅ HARD 전용: 나눗셈 생성 (몫 자릿수 + 제수 자릿수 + 피제수 자릿수 상한)
function makeDivisionHard(level: number, dAns: number): Problem {
  const L = Math.max(1, level);
  const q = randDigits(dAns); // 몫

  // 1) 제수 자릿수 범위: 낮은 레벨은 작게, 서서히 증가
  //    (동일 레벨 내 과도한 큰 제수 방지)
  function divisorDigitsRange(L: number, dq: number): [number, number] {
    if (L <= 1) return [1, 1];        // Lv1: 1자리
    if (L <= 3) return [1, 2];        // Lv2-3: 1~2자리
    if (L <= 5) return [2, 3];        // Lv4-5: 2~3자리
    if (L <= 7) return [3, 4];        // Lv6-7: 3~4자리
    // 이후: 몫 자릿수도 함께 커지니 제수 상한도 서서히 확대
    const lo = Math.min(dq, 3 + Math.floor((L - 7) / 2));
    const hi = Math.min(dq + Math.floor((L - 7) / 2), lo + 2);
    return [Math.max(1, lo), Math.max(lo, hi)];
  }

  const [divLo, divHi] = divisorDigitsRange(L, dAns);

  // 중앙값 주변에 가중치를 두는 자릿수 샘플러(중간 크기 제수를 더 자주 뽑음)
  const pickDivDigits = (lo: number, hi: number) => {
    const mid = (lo + hi) / 2;
    const bag: number[] = [];
    for (let d = lo; d <= hi; d++) {
      const w = 1 / (1 + Math.abs(d - mid));         // 1, 1/2, 1/3 ...
      const copies = Math.max(1, Math.round(w * 6)); // 가중치
      for (let i = 0; i < copies; i++) bag.push(d);
    }
    return pick(bag);
  };

  // 2) 피제수(= q * divisor)의 자릿수 상한: 낮은 레벨에서는 작게 제한
  //    Lv1: ≤4자리, Lv2-3: ≤5자리, Lv4-5: ≤6자리, Lv6-7: ≤7자리, ...
  const dividendCap = 3 + Math.ceil((L + 1) / 2); // 4,5,5,6,6,7,7,8,...

  // 3) 샘플링 루프: (몫 자릿수=dAns) + (제수 자릿수 범위) + (피제수 자릿수 상한) 모두 만족
  for (let tries = 0; tries < 60; tries++) {
    const divDigits = pickDivDigits(divLo, divHi);
    const divisor = randDigits(divDigits);
    const dividend = q * divisor;
    if (digits(dividend) <= dividendCap) {
      return { a: dividend, b: divisor, op: "÷", answer: q };
    }
  }

  // 4) 폴백: 상한을 조금 완화해서라도 반드시 하나 생성
  const divDigits = Math.min(divHi, Math.max(divLo, divLo + 1));
  const divisor = randDigits(divDigits);
  const dividend = q * divisor;
  return { a: dividend, b: divisor, op: "÷", answer: q };
}

// Hard: 더 큰 수, 균형 곱셈, 큰 제수 ÷, 타이머 모드
// Problem factory: 모드별 라우팅
function makeProblem(mode: Mode, level: number, enabled: Record<Op, boolean>) {
  return mode === "HARD" ? genProblemHard(level, enabled) : genProblemNormal(level, enabled);
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function MathSprint() {
  const [mode, setMode] = useState<Mode>("TIMED");
  const [opsEnabled, setOpsEnabled] = useState<Record<Op, boolean>>({ "+": true, "-": true, "×": true, "÷": true });

  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(1);
  const [problem, setProblem] = useState<Problem>(() => makeProblem("TIMED", 1, { "+": true, "-": true, "×": true, "÷": true }));

  const [timeLeft, setTimeLeft] = useState(START_TIME); // TIMED/HARD
  const [lives, setLives] = useState(0);                // ENDLESS
  const [score, setScore] = useState(0);
  const [lastGain, setLastGain] = useState(0);
  const [streak, setStreak] = useState(0);
  const [streakMax, setStreakMax] = useState(0);
  const [levelMax, setLevelMax] = useState(1);
  const [correctThisLevel, setCorrectThisLevel] = useState(0);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem("mathsprint_best") || 0));
  const [value, setValue] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [flash, setFlash] = useState<"none" | "ok" | "bad">("none");
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);
  const [startAt, setStartAt] = useState<number | null>(null);

  // Ensure profile
  useEffect(() => { ensureUserProfile().catch(() => {}); }, []);

  // Timer tick — TIMED & HARD 공통
  useEffect(() => {
    if (!running || !isTimerMode(mode)) return;
    const id = setInterval(() => setTimeLeft((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running, mode]);

  // Game over by timer / lives
  useEffect(() => { if (running && isTimerMode(mode) && timeLeft <= 0) endGame(); }, [running, mode, timeLeft]);
  useEffect(() => { if (running && mode === "ENDLESS" && lives <= 0) endGame(); }, [running, mode, lives]);
  useEffect(() => { if (running) inputRef.current?.focus(); }, [running, problem]);

  const NEXT_PER_LEVEL = 3;
  const progress = useMemo(
    () => (isTimerMode(mode) ? (timeLeft / START_TIME) * 100 : (lives / 3) * 100),
    [mode, timeLeft, lives]
  );
  const levelProgress = useMemo(() => (correctThisLevel / NEXT_PER_LEVEL) * 100, [correctThisLevel]);

  function startGame() {
    submittedRef.current = false;
    setScore(0); setLastGain(0); setStreak(0); setStreakMax(0);
    setLevel(1); setLevelMax(1);
    setCorrectThisLevel(0); setCorrectTotal(0);
    setProblem(makeProblem(mode, 1, opsEnabled));
    setValue(""); setShowHint(false); setFlash("none");
    setStartAt(Date.now());

    if (isTimerMode(mode)) {
      setTimeLeft(mode === "HARD" ? START_TIME_HARD : START_TIME);
      setLives(0);
    } else {
      setLives(3);
      setTimeLeft(0);
    }

    setRunning(true);
  }

function endGame() {
  setRunning(false);

  if (!submittedRef.current) {
    submittedRef.current = true;
    const durationSec = startAt ? Math.round((Date.now() - startAt) / 1000) : 0;

    const activeOps = OP_LIST.filter((op) => opsEnabled[op]);
    const opCat = activeOps.length === 4 ? "ALL" : activeOps.length === 1
      ? ({ "+":"ADD","-":"SUB","×":"MUL","÷":"DIV"} as const)[activeOps[0]]
      : "MIXED";

submitScoreToServer({
  score,
  mode,
  levelMax,
  streakMax,
  correctTotal,
  durationSec,
  opCat
}).then(res => console.log("ok", res))
  .catch(err => console.error("score submit failed", err));
  }}
  function levelUp() {
    setLevel((lv) => { const nxt = lv + 1; setLevelMax((m) => Math.max(m, nxt)); return nxt; });
    setCorrectThisLevel(0);
    if (isTimerMode(mode)) {
      setTimeLeft((t) => addTimeOnCorrect(problem.op, t, problem.answer, streak, mode));
    }
  }

  function flashMark(kind: "ok" | "bad") {
    setFlash(kind);
    setTimeout(() => setFlash("none"), 180);
  }

  function submit() {
    if (!running) return;
    const n = Number(value.trim());
    const correct = Number.isFinite(n) && n === problem.answer;

    if (correct) {
      const add = scoreFor(level, problem.op, streak, n);
      setScore((s) => s + add);
      setLastGain(add);
      setStreak((s) => { const ns = s + 1; setStreakMax((m) => Math.max(m, ns)); return ns; });
      setCorrectTotal((c) => c + 1);
      setCorrectThisLevel((c) => { const next = c + 1; if (next >= NEXT_PER_LEVEL) levelUp(); return next >= NEXT_PER_LEVEL ? 0 : next; });
      setProblem(makeProblem(mode, level, opsEnabled));
      setValue("");
      setShowHint(false);
      flashMark("ok");
    } else {
      setStreak(0);
      if (mode === "ENDLESS") {
        setLives((hp) => { const left = hp - 1; if (left <= 0) endGame(); return left; });
      }
      setLastGain(0);
      flashMark("bad");
      setValue("");
      inputRef.current?.focus();
    }
  }

  // ───────────────────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">수학 스프린트</h1>
          <div className="flex items-center gap-3 text-sm">
            <AuthButton />
            <Button variant="outline" className="gap-2" onClick={startGame}>
              <Play className="h-4 w-4" /> 시작
            </Button>
          </div>
        </header>

        {/* Main */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left: game */}
          <div className="md:col-span-2 space-y-6">
            {!running && (
              <Card>
                <CardHeader><CardTitle>게임 설정</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">모드</div>
                    <div className="flex gap-2">
                      <Button variant={mode === "TIMED" ? "default" : "outline"} onClick={() => setMode("TIMED")}>일반</Button>
                      <Button variant={mode === "HARD" ? "default" : "destructive"} onClick={() => setMode("HARD")} className="gap-1">
                        <Flame className="h-4 w-4" /> 하드
                      </Button>
                      <Button variant={mode === "ENDLESS" ? "default" : "outline"} onClick={() => setMode("ENDLESS")}>엔드리스 (❤️×3)</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">연산</div>
                    <div className="grid grid-cols-4 gap-2">
                      {OP_LIST.map((k) => (
                        <Button key={k} variant={opsEnabled[k] ? "default" : "outline"} onClick={() => setOpsEnabled((o) => ({ ...o, [k]: !o[k] }))}>
                          {k}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">최소 1개 이상 선택되어야 합니다.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* HUD */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-xs text-slate-500">점수</div>
                    <div className="text-2xl font-bold">{score}</div>
                    {lastGain > 0 && <div className="text-xs text-emerald-600 font-semibold">+{lastGain}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">연속 정답</div>
                    <div className="text-2xl font-bold">{streak}</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{isTimerMode(mode) ? "남은 시간" : "남은 생명"}</span>
                    <span>
                      {isTimerMode(mode)
                        ? `${timeLeft}s`
                        : (
                          <span className="inline-flex items-center gap-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <Heart key={i} className={`h-4 w-4 ${i < lives ? "fill-current" : "opacity-20"}`} />
                            ))}
                          </span>
                        )}
                    </span>
                  </div>
                  <Progress value={progress} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>레벨</span><span className="font-semibold">Lv.{level}</span>
                  </div>
                  <Progress value={levelProgress} />
                  <div className="mt-1 text-[11px] text-slate-500">다음 레벨까지 {Math.max(0, NEXT_PER_LEVEL - correctThisLevel)}문제</div>
                </CardContent>
              </Card>
            </div>

            {/* Problem card */}
            <Card className={`transition-all ${flash === "ok" ? "ring-2 ring-emerald-400" : flash === "bad" ? "ring-2 ring-rose-400" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setShowHint((v) => !v)} title="힌트">
                    <HelpCircle className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={startGame} title="다시 시작">
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-6 py-6">
                  <div className="rounded-2xl bg-white p-6 text-6xl font-extrabold shadow-md">
                    {problem.a} <span className="text-slate-600">{problem.op}</span> {problem.b} <span className="text-slate-600">=</span>
                  </div>
                  <div className="flex w-full max-w-md items-center gap-2">
                    <Input
                      ref={inputRef}
                      inputMode="numeric"
                      placeholder="정답 입력 후 Enter"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                      disabled={!running}
                      className="h-12 text-lg"
                    />
                    <Button className="h-12 px-6" onClick={submit} disabled={!running}>
                      확인 <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                  {!running && (
                    <div className="text-center text-sm text-slate-500">
                      <strong>시작</strong>을 누르면 게임이 시작됩니다. 하드 모드는 60초 타이머로 진행되며, 엔드리스는 생명 3개로 진행됩니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="text-center text-xs text-slate-500">Hana Academy Seoul, 제작자 이진형</div>
          </div>

          {/* Right: sidebar */}
          <div className="space-y-6">
            <Leaderboard />
            <SearchUser />
          </div>
        </div>
      </div>
    </div>
  );
}
