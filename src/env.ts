// 모든 주소·키는 환경변수로만 (회사 환경으로 옮길 때 값만 바꾸면 됨)
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  mapsKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
  mapId: import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined,
  // PDF용 정지 지도(Maps Static API)는 지도 유형이 'Static'인 Map ID를 따로 씀. 없으면 기본 스타일
  staticMapId: import.meta.env.VITE_GOOGLE_STATIC_MAP_ID as string | undefined,
};

export const missingEnv = (['supabaseUrl', 'supabaseKey'] as const).filter((k) => !env[k]);
export const mapsConfigured = Boolean(env.mapsKey && env.mapId);

// 로그인 링크·초대 메일이 돌아올 주소 (배포 경로 포함)
export const appUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;
