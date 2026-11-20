import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { createTour, deleteTour, duplicateTour, listTours } from '../lib/api';
import type { Tour } from '../lib/types';

export default function TourList() {
  const { session, isAdmin, financeAccess } = useAuth();
  const me = session!.user.id;
  const nav = useNavigate();
  const [tours, setTours] = useState<Tour[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    if (!confirm(`'${t.name}' 투어를 삭제할까요? 되돌릴 수 없어요.`)) return;
    await deleteTour(t.id).catch((e) => alert(e.message));
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
            <div className="row between">
              <Link to={`/tours/${t.id}`} className="tour-name">{t.name}</Link>
              <span className={`badge ${t.status === 'final' ? 'final' : ''}`}>{t.status === 'final' ? '확정' : '초안'}</span>
            </div>
            <p className="muted small clamp">{t.concept || '컨셉 미입력'}</p>
            <p className="small">
              {t.depart_date ? `출발 ${t.depart_date}` : '출발일 미정'} · 최소 {t.min_pax}명
            </p>
            <div className="row gap">
              <Link to={`/tours/${t.id}`} className="button small">열기</Link>
              <button className="small" onClick={() => dup(t.id)}>복제</button>
              {(t.created_by === me || isAdmin) && (
                <button className="small danger" onClick={() => remove(t)}>삭제</button>
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
    </div>
  );
}
