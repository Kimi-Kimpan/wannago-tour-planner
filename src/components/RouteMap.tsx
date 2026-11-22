// 워너고트립 스타일 루트 지도: 보라 원 번호 마커, 경유지는 속이 빈 작은 원,
// 버스는 실선, 기차·자유일 근교 여행은 점선. 바탕 스타일은 Map ID(클라우드 스타일)가 담당.
import { useEffect, useRef, useState } from 'react';
import { env, mapsConfigured } from '../env';
import { BRAND, loadGoogleMaps } from '../lib/maps';
import type { Stop } from '../lib/types';

const DASH = {
  strokeOpacity: 0,
  icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }],
};

function markerEl(kind: 'stay' | 'via' | 'nearby', label: string, sub?: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `gm-marker gm-${kind}`; // 'nearby' 같은 다른 화면의 클래스와 겹치지 않게 gm- 접두사
  const dot = document.createElement('div');
  dot.className = 'dot';
  if (kind === 'stay') dot.textContent = label;
  wrap.appendChild(dot);
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = kind === 'stay' ? `${sub ?? ''}` : label;
  wrap.appendChild(name);
  return wrap;
}

export default function RouteMap({ stops, height }: { stops: Stop[]; height?: number }) {
  // height를 안 주면 부모 높이를 꽉 채움(도시 목록 길이에 맞춰 늘어남)
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const lines = useRef<google.maps.Polyline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapsConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        await google.maps.importLibrary('marker');
        if (cancelled || !ref.current) return;
        mapRef.current = new Map(ref.current, {
          mapId: env.mapId,
          center: { lat: 50.5, lng: 10.5 },
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          clickableIcons: false,
        });
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const m of markers.current) m.map = null;
    for (const l of lines.current) l.setMap(null);
    markers.current = [];
    lines.current = [];

    const pts = [...stops].sort((a, b) => a.position - b.position).filter((s) => s.lat !== null && s.lng !== null);
    const bounds = new google.maps.LatLngBounds();
    let n = 0;
    pts.forEach((s, i) => {
      const pos = { lat: s.lat!, lng: s.lng! };
      bounds.extend(pos);
      const isStay = s.kind === 'stay' && s.nights > 0;
      if (isStay) n += 1;
      const m = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pos,
        title: s.name,
        content: isStay ? markerEl('stay', String(n), `${s.name} ${s.nights}박`) : markerEl('via', s.name),
        zIndex: isStay ? 10 : 5,
      });
      markers.current.push(m);

      // 이전 지점에서 이 지점까지의 선 (항공 도착은 선 없음)
      if (i > 0 && s.arrive_mode !== 'flight') {
        const prev = pts[i - 1];
        const line = new google.maps.Polyline({
          map,
          path: [{ lat: prev.lat!, lng: prev.lng! }, pos],
          strokeColor: BRAND.purple,
          strokeWeight: 4,
          geodesic: true,
          ...(s.arrive_mode === 'bus' || s.arrive_mode === 'car' ? { strokeOpacity: 0.9 } : DASH),
        });
        lines.current.push(line);
      }

      // 자유일 근교 옵션: 점선 + 작은 빈 원
      for (const nb of s.nearby ?? []) {
        if (nb.lat === null || nb.lat === undefined || nb.lng === null || nb.lng === undefined) continue;
        const npos = { lat: nb.lat, lng: nb.lng };
        bounds.extend(npos);
        lines.current.push(
          new google.maps.Polyline({ map, path: [pos, npos], strokeColor: BRAND.purple, strokeWeight: 2, geodesic: true, ...DASH }),
        );
        markers.current.push(
          new google.maps.marker.AdvancedMarkerElement({ map, position: npos, title: nb.name, content: markerEl('nearby', nb.name) }),
        );
      }
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
  }, [stops, ready]);

  if (!mapsConfigured)
    return (
      <div className="map-placeholder" style={height ? { height } : undefined}>
        구글 지도 키(VITE_GOOGLE_MAPS_API_KEY)와 Map ID(VITE_GOOGLE_MAP_ID)를 넣으면 여기에 지도가 나와요.
      </div>
    );
  return (
    <div className="map-wrap" style={height ? { height } : undefined}>
      <div ref={ref} className="map" />
      {error && <div className="map-error">{error}</div>}
      <div className="map-legend">
        <span><i className="l-solid" /> 버스</span>
        <span><i className="l-dash" /> 기차·근교 여행</span>
        <span><i className="l-via" /> 경유지</span>
      </div>
    </div>
  );
}
