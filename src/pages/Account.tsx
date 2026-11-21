import { useState, type FormEvent } from 'react';
import { updateDisplayName } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export default function Account() {
  const { profile, session, aal, isAdmin, refresh } = useAuth();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const hasPassword = Boolean(session?.user.user_metadata?.password_set);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    try {
      await updateDisplayName(session!.user.id, name.trim());
      await refresh();
      setNameMsg('이름을 저장했어요.');
    } catch (err) {
      setNameMsg((err as Error).message);
    }
  }

  async function setPassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw, data: { password_set: true } });
    if (!error) await refresh();
    setMsg(error ? error.message : '비밀번호를 저장했어요. 다음부터는 이메일과 비밀번호로 로그인하세요.');
    setPw('');
  }

  return (
    <div className="page narrow">
      <h1>내 계정</h1>
      <div className="card">
        <p className="strong">{profile?.display_name}</p>
        <p className="muted">
          로그인 아이디: {session?.user.email} {isAdmin && `· 관리자 2단계 인증 ${aal === 'aal2' ? '완료' : '전'}`}
        </p>
      </div>
      <form className="card" onSubmit={saveName}>
        <h2>표시 이름</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김한솔" />
        <button className="primary" disabled={!name.trim()}>저장</button>
        {nameMsg && <p className="note">{nameMsg}</p>}
      </form>
      <form className="card" onSubmit={setPassword}>
        <h2>{hasPassword ? '비밀번호 변경' : '비밀번호 만들기'}</h2>
        <p className="muted small">아이디는 이메일이에요. 비밀번호를 만들면 다음부터 메일 없이 이메일·비밀번호로 바로 로그인해요.</p>
        <input type="password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="10자 이상" autoComplete="new-password" />
        <button className="primary" disabled={pw.length < 10}>저장</button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}
