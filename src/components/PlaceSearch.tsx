// 구글 장소 검색(Places API New의 자동완성 요소). place_id와 좌표만 받아 씁니다.
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../lib/maps';
import { mapsConfigured } from '../env';

export interface PickedPlace {
  name: string;
  lat: number;
  lng: number;
  place_id: string;
}

export default function PlaceSearch({ onPick, placeholder }: { onPick: (p: PickedPlace) => void; placeholder?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mapsConfigured) return;
    let el: HTMLElement | null = null;
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const places = (await google.maps.importLibrary('places')) as any;
        if (cancelled || !host.current) return;
        el = new places.PlaceAutocompleteElement({ types: ['(cities)'] }) as HTMLElement;
        el.setAttribute('placeholder', placeholder ?? '도시 검색');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        el.addEventListener('gmp-select', async (ev: any) => {
          const place = ev.placePrediction.toPlace();
          await place.fetchFields({ fields: ['displayName', 'location', 'id'] });
          pickRef.current({
            name: place.displayName ?? '',
            lat: place.location.lat(),
            lng: place.location.lng(),
            place_id: place.id,
          });
        });
        host.current.appendChild(el);
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      el?.remove();
    };
  }, [placeholder]);

  if (!mapsConfigured) return <p className="small muted">구글 지도 키가 없어 장소 검색 대신 직접 입력해요.</p>;
  if (failed) return <p className="small note">장소 검색을 불러오지 못했어요. 직접 입력해 주세요.</p>;
  return <div ref={host} className="place-search" />;
}
