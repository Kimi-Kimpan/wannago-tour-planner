import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { createTour, deleteTour, duplicateTour, listTours } from '../lib/api';
import type { Tour } from '../lib/types';
import TourJsonModal from '../components/TourJsonModal';
import ConfirmButton from '../components/ConfirmButton';

export default function TourList() {
  const { session, isAdmin, financeAccess } = useAuth();
  const me = session!.user.id;
  const nav = useNavigate();
  const [tours, setTours] = useState<Tour[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tour | null>(null); // 'JSON으로 수정' 중인 투어

  const reload = () => listTours().then(setTours).catch((e) => setErr(e.message));
  useEffect(() => {
    void reload();
  }, []);

  async function newTour() {
    const t = await createTour(
      {
        name: '새 투어',
        concept: '',
        depart_date: null,
        min_pax: 10,
        fx_rates: { KRW: 1, EUR: 1500 },
        origin_label: '인천',
        return_overnight: true,
        itinerary: {},
        status: 'draft',
      },
      me,
    );
    nav(`/tours/${t.id}`);
  }

  async function dup(id: string) {
    const t = await duplicateTour(id, me, financeAccess);
    nav(`/tours/${t.id}`);
  }

  async function remove(t: Tour) {
    try {
      await deleteTour(t.id);
    } catch (e) {
      setErr((e as Error).message);
    }
    void reload();
  }

  const mine = tours?.filter((t) => t.created_by === me) ?? [];
  const team = tours?.filter((t) => t.created_by !== me) ?? [];

  const Section = ({ title, list }: { title: string; list: Tour[] }) => (
    <section>
      <h2>{title}</h2>
      {list.length === 0 && <p className="muted">아직 없어요.</p>}
      <div className="grid">
        {list.map((t) => (
          <div className="card tour-card" key={t.id}>
            <div className="tour-card-head">
              <Link to={`/tours/${t.id}`} className="tour-name">{t.name}</Link>
              <span className={`badge ${t.status === 'final' ? 'final' : ''}`}>{t.status === 'final' ? '확정' : '초안'}</span>
            </div>
            <p className="muted small clamp">{t.concept || '컨셉 미입력'}</p>
            <p className="small">
              {t.depart_date ? `출발 ${t.depart_date}` : '출발일 미정'} · 최소 {t.min_pax}명
            </p>
            <div className="row gap tour-card-actions">
              <Link to={`/tours/${t.id}`} className="button small">열기</Link>
              <button className="small" onClick={() => dup(t.id)}>복제</button>
              {(t.created_by === me || isAdmin) && (
                <>
                  <button className="small" title="Claude와 상의해 고친 JSON을 이 투어에 바로 적용" onClick={() => setEditing(t)}>수정</button>
                  <ConfirmButton className="small danger" confirmLabel="정말 삭제" onConfirm={() => remove(t)}>
                    삭제
                  </ConfirmButton>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="page">
      <div className="row between">
        <h1>투어</h1>
        <div className="row gap">
          <Link to="/import" className="button">루트 가져오기</Link>
          <button className="primary" onClick={newTour}>새 투어</button>
        </div>
      </div>
      {err && <p className="note error">{err}</p>}
      {!tours && !err && <p className="muted">불러오는 중…</p>}
      {tours && (
        <>
          <Section title="내 투어" list={mine} />
          <Section title="팀 투어" list={team} />
        </>
      )}
      {editing && (
        <TourJsonModal
          tour={editing}
          userId={me}
          isAdmin={isAdmin}
          financeAccess={financeAccess}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
