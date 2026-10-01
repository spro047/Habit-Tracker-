import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.jsx';
import { Modal, HabitForm, Confirm, PriorityTag, weeklyLabel, Loading, Empty } from '../components.jsx';

const CELL_COLORS = ['bg-card', 'bg-[#A7F3D0]', 'bg-[#34D399]', 'bg-[#059669]', 'bg-[#065F46]'];
const cellColor = pct => (pct >= 76 ? CELL_COLORS[4] : pct >= 51 ? CELL_COLORS[3] : pct >= 26 ? CELL_COLORS[2] : pct >= 1 ? CELL_COLORS[1] : CELL_COLORS[0]);

function YearHeatmap({ days }) {
  if (!days || days.length === 0) return null;
  const year = +days[0].date.slice(0, 4);
  const byDate = new Map(days.map(d => [d.date, d]));
  const total = days.reduce((s, d) => s + d.completed, 0);
  const today = new Date().toISOString().slice(0, 10);
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const cursor = new Date(Date.UTC(year, 0, 1 - jan1.getUTCDay()));
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const cells = [];
  for (let i = 0; i < 53 * 7; i++) {
    const date = cursor.toISOString().slice(0, 10);
    cells.push({ date, inYear: date >= first && date <= last, data: byDate.get(date) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return (
    <section className="neo-card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-lg">CONSISTENCY</h2>
        <span className="neo-tag bg-card">THIS YEAR</span>
      </div>
      <p className="font-display text-3xl mb-4">
        {total} <span className="text-sm font-bold uppercase text-ink/60">habits completed</span>
      </p>
      <div
        className="grid grid-flow-col grid-rows-7 [grid-auto-columns:minmax(0,1fr)] gap-[3px]"
        role="img"
        aria-label={`Yearly completion heatmap for ${year}: ${total} habits completed`}
      >
        {cells.map(c =>
          c.inYear ? (
            <div
              key={c.date}
              className={`w-full aspect-square border-2 border-ink ${cellColor(c.data?.pct ?? 0)} ${c.date === today ? 'ring-2 ring-secondary' : ''}`}
              title={`${c.date}: ${c.data?.completed ?? 0}/${c.data?.scheduled ?? 0} completed`}
            />
          ) : (
            <div key={c.date} className="w-full aspect-square" aria-hidden="true" />
          )
        )}
      </div>
      <div className="flex items-center justify-end gap-1 mt-3 text-[10px] font-bold uppercase text-ink/60">
        LESS
        {CELL_COLORS.map(c => (
          <span key={c} className={`w-3 h-3 border-2 border-ink ${c}`} />
        ))}
        MORE
      </div>
    </section>
  );
}

export default function Habits({ onChanged }) {
  const [habits, setHabits] = useState(null);
  const [yearDays, setYearDays] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [err, setErr] = useState('');

  const load = () =>
    Promise.all([api('/api/habits'), api('/api/calendar/year')])
      .then(([h, y]) => {
        setHabits(h.habits);
        setYearDays(y.days);
      })
      .catch(e => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  const save = async (id, data) => {
    await api(`/api/habits/${id}`, { method: 'PATCH', body: data });
    setEditing(null);
    load();
    onChanged();
  };
  const removeHabit = async id => {
    await api(`/api/habits/${id}`, { method: 'DELETE' });
    setConfirmDel(null);
    load();
    onChanged();
  };

  if (err) return <div className="neo-card p-4 text-danger font-bold uppercase">{err}</div>;
  if (!habits) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl">HABITS</h1>
        <button type="button" className="neo-btn neo-btn--green text-xs py-1" onClick={() => setShowNew(true)}>
          + NEW HABIT
        </button>
      </div>

      <YearHeatmap days={yearDays} />

      {habits.length === 0 && <Empty text="No habits yet. Create your first." />}
      <div className="space-y-3">
        {habits.map(h => (
          <div key={h.id} className="neo-card flex cursor-pointer" onClick={() => navigate(`#/habit/${h.id}`)}>
            <div className="w-2 shrink-0" style={{ background: h.color }} aria-hidden="true" />
            <div className="p-3 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg truncate">{h.name.toUpperCase()}</p>
                <PriorityTag p={h.priority} />
              </div>
              <p className="text-xs font-bold uppercase text-ink/50 mt-1">
                {h.schedule.type === 'DAILY' ? 'DAILY' : weeklyLabel(h.schedule.daysOfWeek)} · STREAK {h.streak.current} · BEST {h.streak.best}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="neo-tag bg-card cursor-pointer"
                  onClick={e => {
                    e.stopPropagation();
                    setEditing(h);
                  }}
                >
                  EDIT
                </button>
                <button
                  type="button"
                  className="neo-tag bg-card cursor-pointer"
                  onClick={e => {
                    e.stopPropagation();
                    setConfirmDel(h);
                  }}
                >
                  DELETE
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <Modal title="NEW HABIT" onClose={() => setShowNew(false)}>
          <HabitForm
            onSubmit={async data => {
              await api('/api/habits', { method: 'POST', body: data });
              setShowNew(false);
              load();
              onChanged();
            }}
            onCancel={() => setShowNew(false)}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="EDIT HABIT" onClose={() => setEditing(null)}>
          <HabitForm initial={editing} submitLabel="SAVE" onSubmit={data => save(editing.id, data)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {confirmDel && (
        <Confirm
          title={`DELETE ${confirmDel.name.toUpperCase()}?`}
          message="This permanently removes the habit and all its history."
          onConfirm={() => removeHabit(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}