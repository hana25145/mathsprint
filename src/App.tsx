import * as React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

// 페이지 컴포넌트들
import MathSprint from "@/MathSprint";
import MyPage from "@/components/MyPage";
import AllLeaders from "@/components/AllLeaders"; // ← 전체 리더보드 페이지 추가

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 p-6 flex flex-col">
        {/* 헤더 */}
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">수학 스프린트</h1>
          <nav className="flex gap-4">
            <Link to="/" className="text-slate-600 hover:underline">게임</Link>
            <Link to="/mypage" className="text-slate-600 hover:underline">마이페이지</Link>
            <Link to="/leaders" className="text-slate-600 hover:underline">리더보드 전체</Link>
          </nav>
        </header>

        {/* 메인 컨텐츠 */}
        <main className="flex-1 max-w-6xl mx-auto w-full">
          <Routes>
            {/* 홈 화면 → MathSprint */}
            <Route path="/" element={<MathSprint mode="TIMED" />} />
            {/* 내 마이페이지 */}
            <Route path="/mypage" element={<MyPage />} />
            {/* 친구/타인 마이페이지 열람 */}
            <Route path="/user/:uid" element={<MyPage />} />
            {/* 전체 리더보드 */}
            <Route path="/leaders" element={<AllLeaders />} />
          </Routes>
        </main>

        {/* 푸터 */}
        <footer className="mt-6 text-center text-sm text-slate-500">
          © 2025 Hana Academy Seoul, Jinhyoung Lee, All rights reserved.
        </footer>
      </div>
    </BrowserRouter>
  );
}
