import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 배포 경로는 환경변수로만: github.io/저장소명 → "/wannago-tour-planner/", 자체 도메인 → "/"
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: { sourcemap: false },
  };
});
