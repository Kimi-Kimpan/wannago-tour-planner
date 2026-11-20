// 관리자 2단계 인증(TOTP). 인증 전에는 매출·비용이 DB에서 아예 내려오지 않아요.
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export default function Mfa({ onSkip }: { onSkip: () => void }) {
  const { refresh } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
      } else {
        // 미완료 등록이 남아 있으면 정리 후 새로 등록
        for (const f of data.all.filter((f) => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
        const en = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `planner-${Date.now()}` });
        if (en.error) setMsg(en.error.message);
        else {
          setFactorId(en.data.id);
          setQr(en.data.totp.qr_code);
          setSecret(en.data.totp.secret);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) return setMsg('코드가 맞지 않아요. 인증 앱의 최신 6자리를 넣어 주세요.');
    await refresh();
  }

  return (
    <div className="center-page">
      <form className="card login" onSubmit={verify}>
        <h1>관리자 2단계 인증</h1>
        <p className="muted">매출·마진은 2단계 인증을 마친 관리자에게만 보여요.</p>
        {loading && <p>불러오는 중…</p>}
        {qr && (
          <>
            <p>인증 앱(Google Authenticator, 1Password 등)으로 QR을 찍어 등록하세요.</p>
            <img src={qr} alt="2단계 인증 QR" className="qr" />
            <p className="small muted">QR이 안 되면 키 직접 입력: <code>{secret}</code></p>
          </>
        )}
        <label>
          6자리 코드
          <input inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </label>
        <button className="primary" disabled={code.trim().length !== 6}>확인</button>
        <button type="button" className="ghost" onClick={onSkip}>
          나중에 (매출 화면 없이 계속)
        </button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}
