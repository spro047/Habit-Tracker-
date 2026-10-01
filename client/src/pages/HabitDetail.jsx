import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.jsx';
import { Modal, HabitForm, Confirm, ProgressBar, PriorityTag, weeklyLabel, Loading } from '../components.jsx';

const DAY_GLYPH = { COMPLETED: '✓', SKIPPED: '⊘', MISSED: '✗', NOT_SCHEDULED: '·' };
const DAY_CLASS = {
  COMPLETED: 'bg-success text-white',
  SKIPPED: 'bg-secondary/50 text-ink',
  MISSED: 'bg-danger text-white',
  NOT_SCHEDULED: 'bg-white text-ink/30',
};

export default function HabitDetail({ id, onChanged }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');

  const load = () =>
    api(`/api/habits/${id}`)
      .then(setData)
      .catch(e => setErr(e.message));
  useEffect(() => {
    load();
  }, [id]);

  if (err) return <div className="neo-card p-4 text-danger font-bold uppercase">{err}</div>;
  if (!data) return <Loading />;

  const { habit, stats, history } = data;
  const save = async fields => {
    await api(`/api/habits/${id}`, { method: 'PATCH', body: fields });
    setEditing(false);
    load();
    onChanged();
  };
  const removeHabit = async () => {
    await api(`/api/habits/${id}`, { method: 'DELETE' });
    navigate('#/habits');
    onChanged();
  };

  return (
    <div className="space-y-5">
      <div className="neo-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase text-ink/50">HABIT</p>
            <h1 className="font-display text-3xl">{habit.name.toUpperCase()}</h1>
          </div>
          <PriorityTag p={habit.priority} />
        </div>
        <p className="neo-tag bg-danger text-white mt-3">STREAK {stats.currentStreak} DAYS</p>
        <p className="text-xs font-bold uppercase text-ink/50 mt-2">Best streak: {stats.bestStreak} days</p>
      </div>

      <section className="neo-card p-4 space-y-3">
        <h2 className="font-display text-lg">COMPLETION</h2>
        {[
          ['THIS WEEK', stats.weekPct],
          ['THIS MONTH', stats.monthPct],
        ].map(([label, pct]) => (
          <div key={label}>
            <div className="flex justify-between text-xs font-bold uppercase mb-1">
              <span>{label}</span>
              <span>{pct}%</span>
            </div>
            <ProgressBar pct={pct} />
          </div>
        ))}
      </section>

      <section className="neo-card p-4">
        <h2 className="font-display text-lg mb-3">HISTORY</h2>
        <div className="space-y-4">
          {history.map(h => (
            <div key={h.month}>
              <p className="text-xs font-bold uppercase text-ink/50 mb-1">{h.month}</p>
              <div className="flex flex-wrap gap-1">
                {h.days.map(d => (
                  <span
                    key={d.date}
                    className={`w-4 h-4 border-2 border-ink flex items-center justify-center text-[9px] font-bold ${DAY_CLASS[d.status]}`}
                    title={`${d.date}: ${d.status}`}
                  >
                    {DAY_GLYPH[d.status]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="neo-card p-4">
        <h2 className="font-display text-lg mb-2">SCHEDULE</h2>
        <p className="font-bold uppercase text-sm">{habit.schedule.type === 'DAILY' ? 'Every day' : weeklyLabel(habit.schedule.daysOfWeek)}</p>
        <p className="text-xs font-bold uppercase text-ink/50 mt-1">Started {habit.schedule.startDate}</p>
        <div className="flex gap-2 mt-3">
          <button type="button" className="neo-btn flex-1 text-xs" onClick={() => setEditing(true)}>
            EDIT
          </button>
          <button type="button" className="neo-btn neo-btn--red flex-1 text-xs" onClick={() => setConfirmDel(true)}>
            DELETE HABIT
          </button>
        </div>
      </section>

      {editing && (
        <Modal title="EDIT HABIT" onClose={() => setEditing(false)}>
          <HabitForm initial={habit} submitLabel="SAVE" onSubmit={save} onCancel={() => setEditing(false)} />
        </Modal>
      )}
      {confirmDel && (
        <Confirm
          title={`DELETE ${habit.name.toUpperCase()}?`}
          message="This permanently removes the habit and all its history."
          onConfirm={removeHabit}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  );
}