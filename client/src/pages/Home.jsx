import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.jsx';
import { ProgressBar, PriorityTag, CheckSquare, Loading, Empty } from '../components.jsx';

const FIRST_NAME = 'SHASHANK';

export default function Home({ refreshKey, onChanged }) {
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/dashboard/today')
      .then(setDash)
      .catch(e => setErr(e.message));
  }, [refreshKey]);

  if (err) return <div className="neo-card p-4 text-danger font-bold uppercase">{err}</div>;
  if (!dash) return <Loading />;

  const { greeting, progress, habits, tasks, bestStreak } = dash;
  const remaining = habits.filter(h => h.todayStatus === 'PENDING').length;

  const toggleHabit = async h => {
    if (h.todayStatus === 'COMPLETED') await api(`/api/habits/${h.id}/completion`, { method: 'DELETE' });
    else await api(`/api/habits/${h.id}/complete`, { method: 'POST' });
    onChanged();
  };
  const skipHabit = async h => {
    await api(`/api/habits/${h.id}/skip`, { method: 'POST' });
    onChanged();
  };
  const toggleTask = async t => {
    await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'DONE' ? 'OPEN' : 'DONE' } });
    onChanged();
  };
  const delTask = async t => {
    await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">
        {greeting},<br />
        <span className="text-primary">{FIRST_NAME}.</span>
      </h1>

      <section className="neo-card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">TODAY'S PROGRESS</h2>
          <span className="neo-tag bg-secondary">{progress.pct}%</span>
        </div>
        <div className="flex items-end gap-2 mt-2">
          <span className="font-display text-4xl">
            {progress.completed}
            <span className="text-ink/40"> / {progress.scheduled}</span>
          </span>
          <span className="font-bold uppercase text-xs mb-2 text-ink/60">COMPLETE</span>
        </div>
        <div className="mt-3">
          <ProgressBar pct={progress.pct} />
        </div>
        <div className="flex justify-between mt-2 text-xs font-bold uppercase">
          <span>{progress.remaining} remaining today</span>
          <span className={progress.vsYesterday >= 0 ? 'text-success' : 'text-danger'}>
            {progress.vsYesterday >= 0 ? '+' : ''}
            {progress.vsYesterday} vs yesterday
          </span>
        </div>
        {bestStreak > 0 && <p className="neo-tag bg-danger text-white mt-3">STREAK {bestStreak} DAYS</p>}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-lg">TODAY'S HIT LIST</h2>
          <span className="neo-tag bg-white">{String(remaining).padStart(2, '0')} REMAINING</span>
        </div>
        {habits.length === 0 && tasks.length === 0 && <Empty text="Nothing scheduled. Tap + to add." />}
        <div className="space-y-3">
          {habits.map(h => (
            <div key={h.id} className="neo-card p-3 flex items-center gap-3">
              <CheckSquare checked={h.todayStatus === 'COMPLETED'} onClick={() => toggleHabit(h)} label={`Complete ${h.name}`} />
              <button type="button" className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => navigate(`#/habit/${h.id}`)}>
                <p className="font-bold uppercase truncate">{h.name}</p>
                <p className="text-xs font-bold uppercase text-ink/50">
                  STREAK {h.streak.current} · {h.schedule.type === 'WEEKLY' ? 'SELECTED DAYS' : 'DAILY'}
                </p>
              </button>
              <PriorityTag p={h.priority} />
              <button type="button" className="neo-tag bg-white cursor-pointer" onClick={() => skipHabit(h)} aria-label={`Skip ${h.name}`}>
                SKIP
              </button>
            </div>
          ))}
          {tasks.map(t => (
            <div key={t.id} className="neo-card p-3 flex items-center gap-3">
              <CheckSquare checked={t.status === 'DONE'} onClick={() => toggleTask(t)} label={`Complete ${t.title}`} />
              <div className="min-w-0 flex-1">
                <p className={`font-bold uppercase truncate ${t.status === 'DONE' ? 'line-through text-ink/40' : ''}`}>{t.title}</p>
                <p className="text-xs font-bold uppercase text-ink/50">TASK</p>
              </div>
              <PriorityTag p={t.priority} />
              <button type="button" className="neo-tag bg-white cursor-pointer" onClick={() => delTask(t)} aria-label={`Delete ${t.title}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}