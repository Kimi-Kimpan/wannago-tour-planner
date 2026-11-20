import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import { missingEnv } from './env';
import App from './App';
import './styles.css';

// 초대·로그인 링크로 들어오면 주소의 토큰(#access_token=...)을 먼저 처리한 뒤
// 해시 라우터를 띄웁니다. (GitHub Pages에서 새로고침해도 404가 나지 않도록 HashRouter 사용)
async function boot() {
  if (missingEnv.length === 0) await supabase.auth.getSession();
  if (/[#&](access_token|error)=/.test(window.location.hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();
