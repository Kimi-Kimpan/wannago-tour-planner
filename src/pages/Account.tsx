import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export default function Account() {
  const { profile, session, aal, isAdmin } = useAuth();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function setPassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : '비밀번호를 저장했어요.');
    setPw('');
  }

  return (
    <div className="page narrow">
      <h1>내 계정</h1>
      <div className="card">
        <p>
          {profile?.display_name} · {session?.user.email}
        </p>
        <p className="muted">
          역할: {isAdmin ? '관리자' : '트래블리더'} {isAdmin && `· 2단계 인증 ${aal === 'aal2' ? '완료' : '전'}`}
        </p>
      </div>
      <form className="card" onSubmit={setPassword}>
        <h2>비밀번호 설정·변경</h2>
        <p className="muted small">초대 메일로 처음 들어왔다면 여기서 비밀번호를 만들어 두세요.</p>
        <input type="password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="10자 이상" autoComplete="new-password" />
        <button className="primary" disabled={pw.length < 10}>저장</button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}
