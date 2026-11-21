// Google Maps 불러오기 (공식 dynamic import 방식, 추가 패키지 없음)
import { env } from '../env';
import type { Stop } from './types';

declare global {
  interface Window {
    __gmapsReady?: () => void;
  }
}

let loading: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (!env.mapsKey) return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY가 없어요'));
  if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    window.__gmapsReady = () => resolve();
    const params = new URLSearchParams({
      key: env.mapsKey!,
      v: 'weekly',
      loading: 'async',
      language: 'ko',
      region: 'KR',
      callback: '__gmapsReady',
    });
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('구글 지도 스크립트를 불러오지 못했어요'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const BRAND = { purple: '#7123F3', lavender: '#F0ECFF' };

// PDF용 정지 지도 (Maps Static API, 같은 Map ID 스타일)
export function staticMapUrl(stops: Stop[], size = { w: 640, h: 420 }): string | null {
  if (!env.mapsKey) return null;
  const pts = [...stops].sort((a, b) => a.position - b.position).filter((s) => s.lat !== null && s.lng !== null);
  if (pts.length === 0) return null;
  const parts: string[] = [
    `size=${size.w}x${size.h}`,
    'scale=2',
    'language=ko',
    `key=${encodeURIComponent(env.mapsKey)}`,
  ];
  if (env.staticMapId) parts.push(`map_id=${encodeURIComponent(env.staticMapId)}`);
  const color = '0x7123F3';
  parts.push(`path=${encodeURIComponent(`color:${color}ff|weight:4|${pts.map((p) => `${p.lat},${p.lng}`).join('|')}`)}`);
  let n = 0;
  for (const p of pts) {
    if (p.kind === 'stay' && p.nights > 0) {
      n += 1;
      const label = n <= 9 ? String(n) : String.fromCharCode(64 + n - 9); // 1~9, 그다음 A, B...
      parts.push(`markers=${encodeURIComponent(`color:${color}|label:${label}|${p.lat},${p.lng}`)}`);
    } else {
      parts.push(`markers=${encodeURIComponent(`size:tiny|color:${color}|${p.lat},${p.lng}`)}`);
    }
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${parts.join('&')}`;
}
