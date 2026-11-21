import { useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { missingEnv } from './env';
import Login from './pages/Login';
import Mfa from './pages/Mfa';
import Account from './pages/Account';
import TourList from './pages/TourList';
import TourEditor from './pages/TourEditor';
import PrintView from './pages/PrintView';
import ImportExport from './pages/ImportExport';

export default function App() {
  if (missingEnv.length) {
    return (
      <div className="center-page">
        <div className="card login">
          <h1>설정이 필요해요</h1>
          <p>환경변수가 비어 있어요: {missingEnv.join(', ')}</p>
          <p className="muted small">로컬은 .env.local, 배포는 GitHub 저장소 Secrets에 넣어 주세요. (README 참고)</p>
        </div>
      </div>
    );
  }
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  );
}

function Gate() {
  const { ready, session, profile, profileError, isAdmin, aal, signOut } = useAuth();
  const [mfaSkipped, setMfaSkipped] = useState(false);

  if (!ready) return <div className="center-page muted">불러오는 중…</div>;
  if (!session) return <Login />;
  if (!profile)
    return (
      <div className="center-page">
        <div className="card login">
          <h1>계정이 준비되지 않았어요</h1>
          <p className="muted">관리자에게 초대 상태를 확인해 달라고 요청해 주세요.</p>
          {profileError && <p className="small note">이유: {profileError} ({session.user.email})</p>}
          <button onClick={signOut}>로그아웃</button>
        </div>
      </div>
    );
  if (isAdmin && aal !== 'aal2' && !mfaSkipped) return <Mfa onSkip={() => setMfaSkipped(true)} />;

  return (
    <Routes>
      <Route path="/tours/:id/print" element={<PrintView />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}

function Shell() {
  const { profile, isAdmin, financeAccess, signOut } = useAuth();
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="logo">
          <span className="brand-mark small" /> 투어 루트 플래너
        </NavLink>
        <nav>
          <NavLink to="/" end>투어</NavLink>
          <NavLink to="/import">가져오기·내보내기</NavLink>
          <NavLink to="/account">내 계정</NavLink>
        </nav>
        <div className="who">
          <span className={`badge ${isAdmin ? 'admin' : ''}`}>
            {isAdmin ? (financeAccess ? '관리자' : '관리자(2단계 인증 전)') : '트래블리더'}
          </span>
          <span className="muted small">{profile?.display_name}</span>
          <button className="ghost small" onClick={signOut}>로그아웃</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TourList />} />
          <Route path="/tours/:id" element={<TourEditor />} />
          <Route path="/import" element={<ImportExport />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
