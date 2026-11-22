import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { appUrl } from '../env';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg('로그인하지 못했어요. 이메일·비밀번호를 확인하거나 로그인 링크를 받아 보세요.');
  }

  async function withLink() {
    if (!email) return setMsg('이메일을 먼저 입력해 주세요.');
    setBusy(true);
    // shouldCreateUser: false → 초대받지 않은 이메일은 계정이 만들어지지 않음
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: appUrl() },
    });
    setBusy(false);
    setMsg(error ? '초대받은 이메일인지 확인해 주세요.' : '메일함에서 로그인 링크를 눌러 주세요.');
  }

  return (
    <div className="center-page">
      <form className="card login" onSubmit={withPassword}>
        <div className="brand-mark" />
        <h1>트래블 플래너</h1>
        <p className="muted">매드엑스컴퍼니 팀원 전용 · 초대받은 계정으로 로그인</p>
        <label>
          이메일
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="primary" disabled={busy || !password}>로그인</button>
        <button type="button" className="ghost" disabled={busy} onClick={withLink}>
          비밀번호 없이 로그인 링크 받기
        </button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}
