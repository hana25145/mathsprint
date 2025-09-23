// src/MathSprint.tsx — with BIN(2진수 변환) mode integrated
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Heart, HelpCircle, RotateCcw, Play, Flame, Binary } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import AuthButton from "@/components/AuthButton";
import Leaderboard from "@/components/Leaderboard";
import SearchUser from "@/components/SearchUser";
import MyPage from "@/components/MyPage";
import { ensureUserProfile } from "./firebase";
import { submitScoreSafe } from "./firebase";

// ─────────────────────────────────────────────────────────────
// Types / utils
// ─────────────────────────────────────────────────────────────
export type BaseMode = "TIMED" | "HARD" | "ENDLESS";
export type Mode = BaseMode | "BIN";                     // ★ BIN 추가
export type Op = "+" | "-" | "×" | "÷";

// 연산형 문제와 BIN 변환형 문제를 유니온으로 관리
type ArithProblem = { kind: "ARITH"; a: number; b: number; op: Op; answer: number };
type BinProblem   = { kind: "BIN"; question: string; answer: string; direction: "DEC2BIN" | "BIN2DEC" };
export type Problem = ArithProblem | BinProblem;

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

const START_TIME = 60;
const START_TIME_HARD = 300;
const TIME_CAP = 10000000;

const OP_SCORE_MULT: Record<Op, number> = { "×": 1.30, "÷": 1.15, "-": 1.05, "+": 1.00 };
const TIME_ON_CORRECT_BASE: Record<Op, number> = { "×": 2, "÷": 2, "-": 1, "+": 1 };

// ─────────────────────────────────────────────────────────────
// Timer / scoring
// ─────────────────────────────────────────────────────────────
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
    bonus += Math.min(3, Math.max(0, Math.floor((d - 2) / 2)));
  }
  if (typeof streak === "number" && streak > 0) {
    bonus += Math.min(2, Math.floor(streak / 5));
  }
  if (cur < 10) bonus += 1;

  if (mode === "HARD") bonus = Math.max(0, Math.floor(bonus * 5));
  return Math.min(TIME_CAP, cur + bonus);
}

// 연산형 문제용 점수
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

// BIN 변환형 문제 점수(간단: 길이·방향으로 가중)
function scoreForBIN(level: number, streak: number, q: BinProblem) {
  const len = q.direction === "DEC2BIN"
    ? q.answer.length                      // 2진수 자리수
    : (q.question.replace(/\(2\).*/, "").length); // BIN2DEC일 때 입력 2진 문자열 길이
  const base = 8 + Math.floor(level * 1.2) + Math.min(10, streak);
  const dirFactor = q.direction === "DEC2BIN" ? 1.15 : 1.00;
  const lenFactor = 1 + Math.min(0.20, Math.max(0, (len - 3) * 0.04));
  return Math.round(base * dirFactor * lenFactor);
}

function isTimerMode(m: Mode) {
  // BIN은 일반 타이머(TIMED)와 유사하게 동작하게 설정
  return m === "TIMED" || m === "HARD" || m === "BIN";
}

// ─────────────────────────────────────────────────────────────
// Problem generators (연산형 — 기존 로직 유지)
// ─────────────────────────────────────────────────────────────
function targetAdd(level: number) {
  const L = Math.max(1, level);
  return Math.floor(6 + 8.0 * Math.pow(L, 1.60));
}
function targetSub(level: number) {
  const L = Math.max(1, level);
  return Math.floor(6 + 7.5 * Math.pow(L, 1.58));
}
function targetMul(level: number) {
  const L = Math.max(1, level);
  return Math.floor(8 + 6.5 * Math.pow(L, 1.50));
}
function randWithDigits(d: number): number {
  const min = Math.pow(10, d - 1);
  const max = Math.pow(10, d) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function genDivision(level: number): ArithProblem {
  const total = Math.max(2, Math.floor(0.4 * level));
  const candidates: [number, number][] = [];
  for (let divDigits = 1; divDigits < total; divDigits++) {
    const dvdDigits = total - divDigits;
    if (dvdDigits >= divDigits) candidates.push([dvdDigits, divDigits]);
  }
  const [dvdDigits, divDigits] = candidates[Math.floor(Math.random() * candidates.length)];
  const divisor = randWithDigits(divDigits);
  const quotient = randWithDigits(Math.max(1, dvdDigits - divDigits));
  const dividend = divisor * quotient;
  return { kind: "ARITH", a: dividend, b: divisor, op: "÷", answer: quotient };
}
export function genProblemNormal(level: number, enabled: Record<Op, boolean>): ArithProblem {
  const ops = OP_LIST.filter((o) => enabled[o]);
  const op = pick(ops);
  switch (op) {
    case "÷": return genDivision(level);
    case "+": {
      const T = targetAdd(level);
      const lo = Math.max(1, Math.floor(T * 0.80));
      const hi = Math.max(lo, Math.floor(T * 1.20));
      const sum = ri(lo, hi);
      const a = ri(1, Math.max(1, sum - 1));
      const b = sum - a;
      return { kind: "ARITH", a, b, op: "+", answer: a + b };
    }
    case "-": {
      const T = targetSub(level);
      const lo = Math.max(1, Math.floor(T * 0.80));
      const hi = Math.max(lo, Math.floor(T * 1.20));
      const diff = ri(lo, hi);
      const wiggle = Math.max(0, Math.floor(diff * 0.30));
      const a = diff + ri(0, wiggle);
      const b = a - diff;
      return { kind: "ARITH", a, b, op: "-", answer: a - b };
    }
    case "×": {
      const T = targetMul(level);
      const root = Math.max(2, Math.floor(Math.sqrt(Math.max(2, T))));
      const aLo = Math.max(2, Math.floor(root * 0.80));
      const aHi = Math.max(aLo, Math.floor(root * 1.30));
      const a = ri(aLo, aHi);
      const bEst = Math.max(2, T / a);
      const bLo = Math.max(2, Math.floor(bEst * 0.80));
      const bHi = Math.max(bLo, Math.floor(bEst * 1.30));
      const b = ri(bLo, bHi);
      return { kind: "ARITH", a, b, op: "×", answer: a * b };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// BIN 변환 모드: 문제 생성기
//   - 레벨이 오를수록 10진수 범위↑, 2진 길이↑
//   - 절반은 DEC→BIN, 절반은 BIN→DEC
// ─────────────────────────────────────────────────────────────
function binBounds(level: number) {
  // 레벨 1: 0~31(5bit) → 이후 완만히 증가
  const maxDec = Math.min(1023, Math.floor(31 + level * 12)); // 상한 1023(10bit)
  return [0, maxDec] as const;
}
function genProblemBIN(level: number): BinProblem {
  const [lo, hi] = binBounds(level);
  const n = ri(lo, hi);
  if (Math.random() < 0.5) {
    // DEC → BIN
    return {
      kind: "BIN",
      question: `${n}`,
      answer: n.toString(2),
      direction: "DEC2BIN",
    };
  } else {
    // BIN → DEC
    const bin = n.toString(2);
    return {
      kind: "BIN",
      question: `${bin}(2)`,
      answer: String(n),
      direction: "BIN2DEC",
    };
  }
}


// ★ Lv→정답 자릿수 곡선(하드)
function dAnsForHard(level: number) {
  if (level <= 3) return 4;
  if (level <= 6) return 5;
  if (level <= 9) return 6;
  return 6 + Math.floor((level - 9) / 2); // 상한 7자리 정도
}

// ★ 덧셈: 자리올림(carry) 많이 생기도록
function makeAdditionHardWithCarries(dAns: number) {
  const n = Math.max(2, dAns);
  const carryDensity = 0.75;
  let carry = 0; const a: number[] = []; const b: number[] = [];
  for (let i = 0; i < n; i++) {
    const top = i === n - 1;
    if (top) {
      const maxTop = 9 - carry - 1;
      const ai = ri(1, Math.max(1, Math.min(8, maxTop)));
      const bi = ri(0, Math.max(0, maxTop - ai));
      a.push(ai); b.push(bi); carry = 0;
    } else {
      const forceCarry = Math.random() < carryDensity;
      if (forceCarry) {
        const target = ri(10, 17);
        const ai = ri(1, 9);
        const bi = Math.min(9, target - ai - carry);
        a.push(ai); b.push(bi); carry = 1;
      } else {
        const ai = ri(0, 9);
        const bi = ri(0, Math.max(0, 9 - ai - carry));
        a.push(ai); b.push(bi); carry = 0;
      }
    }
  }
  const build = (ds: number[]) => Number(ds.slice().reverse().join(""));
  const A = build(a), B = build(b), S = A + B;
  if (String(S).length !== n) {
    const sum = randDigits(dAns);
    const small = ri(1, Math.min(99, sum - 1));
    return { kind: "ARITH" as const, a: small, b: sum - small, op: "+", answer: sum };
  }
  return { kind: "ARITH" as const, a: A, b: B, op: "+", answer: S };
}

// ★ 뺄셈: 자리내림(borrow) 자주 유발
function makeSubtractionHardWithBorrows(dAns: number) {
  const n = Math.max(2, dAns), borrowDensity = 0.75;
  const R = randDigits(n);
  const rd = String(R).split("").reverse().map(Number);
  let borrow = 0; const a: number[] = []; const b: number[] = [];
  for (let i = 0; i < n; i++) {
    const top = i === n - 1;
    if (top) {
      const bi = ri(0, Math.max(0, 9 - rd[i] - borrow - 1));
      const sum = rd[i] + bi + borrow;
      const ai = sum; a.push(ai); b.push(bi); borrow = 0;
    } else {
      const forceBorrow = Math.random() < borrowDensity;
      if (forceBorrow) {
        const target = ri(10, 17);
        const bi = Math.min(9, target - rd[i] - borrow);
        const ai = (rd[i] + bi + borrow) - 10;
        a.push(ai); b.push(bi); borrow = 1;
      } else {
        const bi = ri(0, Math.max(0, 9 - rd[i] - borrow));
        const ai = rd[i] + bi + borrow;
        a.push(ai); b.push(bi); borrow = 0;
      }
    }
  }
  const build = (ds: number[]) => Number(ds.slice().reverse().join(""));
  const A = build(a), B = build(b), Rchk = A - B;
  if (Rchk !== R || String(R).length !== n) {
    const diff = randDigits(dAns); const sub = ri(1, Math.min(99, diff));
    return { kind: "ARITH" as const, a: diff + sub, b: sub, op: "-", answer: diff };
  }
  return { kind: "ARITH" as const, a: A, b: B, op: "-", answer: R };
}

// ★ 곱셈: 큰수×큰수 위주
function makeMultiplicationWithAnsDigits(dAns: number, level: number) {
  for (let tries = 0; tries < 80; tries++) {
    const minDigit = Math.max(2, Math.floor(dAns / 2));
    const da = ri(minDigit, Math.max(minDigit, Math.floor(dAns / 2)));
    const db = Math.max(1, dAns - da + (Math.random() < 0.5 ? 0 : -1));
    const a = randDigits(da), b = randDigits(db), A = a * b;
    if (digits(A) === dAns) return { kind: "ARith" as any, a, b, op: "×" as Op, answer: A };
  }
  const A = randDigits(dAns);
  for (let f = 2; f <= 999; f++) if (A % f === 0)
    return { kind: "ARITH" as const, a: Math.floor(A / f), b: f, op: "×", answer: A };
  // 실패시 덧셈으로 폴백
  const sum = randDigits(dAns); const x = ri(1, Math.min(99, sum - 1));
  return { kind: "ARITH" as const, a: x, b: sum - x, op: "+", answer: sum };
}

// ★ 나눗셈: 몫 자릿수 dAns 고정 + 제수/피제수 상한
function makeDivisionHard(level: number, dAns: number) {
  const q = randDigits(dAns);
  function randWithDigits(d: number) {
    const min = 10 ** (d - 1); const max = 10 ** d - 1;
    return ri(min, max);
  }
  function divDigitsRange(L: number, dq: number): [number, number] {
    if (L <= 1) return [1, 1];
    if (L <= 3) return [1, 2];
    if (L <= 5) return [2, 3];
    if (L <= 7) return [3, 4];
    const lo = Math.min(dq, 3 + Math.floor((L - 7) / 2));
    const hi = Math.min(dq + Math.floor((L - 7) / 2), lo + 2);
    return [Math.max(1, lo), Math.max(lo, hi)];
  }
  const [divLo, divHi] = divDigitsRange(level, dAns);
  const dividendCap = 3 + Math.ceil((level + 1) / 2);
  const pickDivDigits = (lo: number, hi: number) => {
    const mid = (lo + hi) / 2; const bag: number[] = [];
    for (let d = lo; d <= hi; d++) {
      const w = 1 / (1 + Math.abs(d - mid));
      const copies = Math.max(1, Math.round(w * 6));
      for (let i = 0; i < copies; i++) bag.push(d);
    }
    return pick(bag);
  };
  for (let t = 0; t < 60; t++) {
    const divDigits = pickDivDigits(divLo, divHi);
    const divisor = randWithDigits(divDigits);
    const dividend = q * divisor;
    if (digits(dividend) <= dividendCap)
      return { kind: "ARITH" as const, a: dividend, b: divisor, op: "÷", answer: q };
  }
  const divDigits = Math.min(divHi, Math.max(divLo, divLo + 1));
  const divisor = randWithDigits(divDigits);
  const dividend = q * divisor;
  return { kind: "ARITH" as const, a: dividend, b: divisor, op: "÷", answer: q };
}

// ★ 하드 모드 전용 문제 생성기
function genProblemHard(level: number, enabled: Record<Op, boolean>) {
  const dAns = dAnsForHard(level);
  const ops = (["+","-","×","÷"] as Op[]).filter((o) => enabled[o]);
  const op = ops.length ? pick(ops) : "+";
  switch (op) {
    case "+": return makeAdditionHardWithCarries(dAns);
    case "-": return makeSubtractionHardWithBorrows(dAns);
    case "×": return makeMultiplicationWithAnsDigits(Math.max(2, dAns), level);
    case "÷": return makeDivisionHard(level, dAns);
    default:  return makeAdditionHardWithCarries(dAns);
  }
}

// ──────────────────────────────
// 2) 모드 라우팅 교체
// ──────────────────────────────
function makeProblem(mode: Mode, level: number, enabled: Record<Op, boolean>): Problem {
  if (mode === "BIN")  return genProblemBIN(level);           // 기존 그대로
  if (mode === "HARD") return genProblemHard(level, enabled) as Problem; // ★ 여기!
  return genProblemNormal(level, enabled);
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

  const [timeLeft, setTimeLeft] = useState(START_TIME); // TIMED/HARD/BIN
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

  // Timer tick — TIMED/HARD/BIN
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
      // BIN은 TIMED와 동일한 초기 타임
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
      const opCat =
        mode === "BIN"
          ? "BIN"
          : activeOps.length === 4 ? "ALL"
          : activeOps.length === 1 ? ({ "+":"ADD","-":"SUB","×":"MUL","÷":"DIV"} as const)[activeOps[0]]
          : "MIXED";

      submitScoreSafe({
        score,
        mode,         // ★ BIN도 그대로 저장 → 리더보드에서 모드별 구분
        levelMax,
        streakMax,
        correctTotal,
        durationSec,
        opCat
      }).then(res => console.log("ok", res))
        .catch(err => console.error("score submit failed", err));
    }
  }

  function levelUp() {
    setLevel((lv) => { const nxt = lv + 1; setLevelMax((m) => Math.max(m, nxt)); return nxt; });
    setCorrectThisLevel(0);
    if (isTimerMode(mode) && problem.kind === "ARITH") {
      setTimeLeft((t) => addTimeOnCorrect(problem.op, t, problem.answer, streak, mode));
    } else if (isTimerMode(mode) && problem.kind === "BIN") {
      // BIN은 2진 길이에 따라 소량 보너스
      const len = problem.direction === "DEC2BIN" ? problem.answer.length : problem.question.split("(2)")[0].length;
      const bonus = Math.min(4, 1 + Math.floor(len / 4));
      setTimeLeft((t) => Math.min(TIME_CAP, t + bonus));
    }
  }

  function flashMark(kind: "ok" | "bad") {
    setFlash(kind);
    setTimeout(() => setFlash("none"), 180);
  }

  function submit() {
    if (!running) return;
    const raw = value.trim();

    if (problem.kind === "ARITH") {
      const n = Number(raw);
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
        if (mode === "ENDLESS") setLives((hp) => { const left = hp - 1; if (left <= 0) endGame(); return left; });
        setLastGain(0);
        flashMark("bad");
        setValue("");
        inputRef.current?.focus();
      }
      return;
    }

    // BIN: 문자열 정확 비교(대소문자 무관, 선행 0 허용)
    if (problem.kind === "BIN") {
      let userAns = raw.toLowerCase();
      let realAns = problem.answer.toLowerCase();

      // 선행 0 제거 비교(예: "00101" == "101")
      const strip0 = (s: string) => s.replace(/^0+(?=.)/, "");
      if (problem.direction === "DEC2BIN") {
        userAns = strip0(userAns);
        realAns = strip0(realAns);
        // 0/1만 허용
        if (!/^[01]+$/.test(userAns)) {
          // 오답 처리
          setStreak(0);
          if (mode === "ENDLESS") setLives((hp) => { const left = hp - 1; if (left <= 0) endGame(); return left; });
          setLastGain(0);
          flashMark("bad");
          setValue("");
          inputRef.current?.focus();
          return;
        }
      } else {
        // BIN→DEC: 숫자만
        if (!/^\d+$/.test(userAns)) {
          setStreak(0);
          if (mode === "ENDLESS") setLives((hp) => { const left = hp - 1; if (left <= 0) endGame(); return left; });
          setLastGain(0);
          flashMark("bad");
          setValue("");
          inputRef.current?.focus();
          return;
        }
      }

      const correct = userAns === realAns;

      if (correct) {
        const add = scoreForBIN(level, streak, problem);
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
        if (mode === "ENDLESS") setLives((hp) => { const left = hp - 1; if (left <= 0) endGame(); return left; });
        setLastGain(0);
        flashMark("bad");
        setValue("");
        inputRef.current?.focus();
      }
      return;
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
                    <div className="flex flex-wrap gap-2">
                      <Button variant={mode === "TIMED" ? "default" : "outline"} onClick={() => setMode("TIMED")}>일반</Button>
                      <Button variant={mode === "HARD" ? "default" : "destructive"} onClick={() => setMode("HARD")} className="gap-1">
                        <Flame className="h-4 w-4" /> 하드
                      </Button>
                      <Button variant={mode === "ENDLESS" ? "default" : "outline"} onClick={() => setMode("ENDLESS")}>엔드리스 (❤️×3)</Button>
                      {/* ★ BIN 모드 버튼 */}
                      <Button variant={mode === "BIN" ? "default" : "outline"} onClick={() => setMode("BIN")} className="gap-1">
                        <Binary className="h-4 w-4" /> 2진수 변환
                      </Button>
                    </div>
                  </div>

                  {/* 연산 선택은 BIN이 아닐 때만 노출 */}
                  {mode !== "BIN" && (
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
                  )}
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
                  {/* ★ BIN은 문자열 문제로 렌더링 */}
                  {problem.kind === "BIN" ? (
                    <div className="rounded-2xl bg-white p-6 text-4xl md:text-5xl font-extrabold shadow-md">
                      {problem.question}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-white p-6 text-6xl font-extrabold shadow-md">
                      {problem.a} <span className="text-slate-600">{problem.op}</span> {problem.b} <span className="text-slate-600">=</span>
                    </div>
                  )}

                  <div className="flex w-full max-w-md items-center gap-2">
                    <Input
                      ref={inputRef}
                      inputMode={problem.kind === "BIN" && problem.direction === "DEC2BIN" ? "text" : "numeric"}
                      placeholder={problem.kind === "BIN"
                        ? (problem.direction === "DEC2BIN" ? "정답 (예: 1101)" : "정답 (예: 13)")
                        : "정답 입력 후 Enter"}
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
                      <strong>시작</strong>을 누르면 게임이 시작됩니다. 하드/2진수 변환 모드는 타이머 방식으로 진행됩니다.
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
