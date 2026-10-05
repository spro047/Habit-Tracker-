import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, GoalForm, Confirm, ProgressBar, Loading, Empty } from '../components.jsx';

export default function Goals({ onChanged }) {
  const [goals, setGoals] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [err, setErr] = useState('');

  const load = () =>
    api('/api/goals')
      .then(d => setGoals(d.goals))
      .catch(e => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  const toggleToday = async g => {
    if (g.todayChecked) await api(`/api/goals/${g.id}/checkin`, { method: 'DELETE' });
    else await api(`/api/goals/${g.id}/checkin`, { method: 'POST' });
    load();
    onChanged();
  };
  const toggleDay = async (g, date, checked) => {
    if (checked) await api(`/api/goals/${g.id}/checkin`, { method: 'DELETE', body: { date } });
    else await api(`/api/goals/${g.id}/checkin`, { method: 'POST', body: { date } });
    load();
    onChanged();
  };
  const save = async (id, data) => {
    await api(`/api/goals/${id}`, { method: 'PATCH', body: data });
    setEditing(null);
    load();
    onChanged();
  };
  const removeGoal = async id => {
    await api(`/api/goals/${id}`, { method: 'DELETE' });
    setConfirmDel(null);
    load();
    onChanged();
  };

  if (err) return <div className="neo-card p-4 text-danger font-bold uppercase">{err}</div>;
  if (!goals) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl">GOALS</h1>
        <button type="button" className="neo-btn neo-btn--green text-xs py-1" onClick={() => setShowNew(true)}>
          + NEW GOAL
        </button>
      </div>

      {goals.length === 0 && <Empty text="No goals yet. Create your first." />}

      <div className="space-y-3">
        {goals.map(g => (
          <div key={g.id} className="neo-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-lg truncate">{g.title.toUpperCase()}</p>
              <span className={`neo-tag ${g.achieved ? 'bg-success text-white' : 'bg-secondary'}`}>
                {g.achieved ? 'ACHIEVED' : g.status}
              </span>
            </div>
            <p className="text-xs font-bold uppercase text-ink/50 mt-1">
              {g.checkedDays}/{g.totalDays} DAYS · {g.daysLeft} LEFT
            </p>
            <div className="mt-2">
              <ProgressBar pct={g.pct} color={g.achieved ? '#059669' : '#D97706'} />
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {g.days.map(d =>
                d.future ? (
                  <span
                    key={d.date}
                    className="w-4 h-4 border-2 border-ink text-[9px] font-bold flex items-center justify-center bg-card text-ink/20"
                    title={`${d.date}: upcoming`}
                  >
                    ·
                  </span>
                ) : (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => toggleDay(g, d.date, d.checked)}
                    aria-label={`${d.checked ? 'Uncheck' : 'Check in'} ${d.date}`}
                    title={`${d.date}: ${d.checked ? 'checked in' : 'not checked in'}`}
                    className={`w-4 h-4 border-2 border-ink text-[9px] font-bold flex items-center justify-center cursor-pointer ${d.checked ? 'bg-success text-white' : 'bg-danger text-white'}`}
                  >
                    {d.checked ? '✓' : '✗'}
                  </button>
                )
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                className={`neo-btn text-xs ${g.todayChecked ? 'neo-btn--white' : 'neo-btn--green'}`}
                onClick={() => toggleToday(g)}
              >
                {g.todayChecked ? 'UNDO TODAY' : 'CHECK IN TODAY'}
              </button>
              <button type="button" className="neo-tag bg-card cursor-pointer" onClick={() => setEditing(g)}>
                EDIT
              </button>
              <button type="button" className="neo-tag bg-card cursor-pointer" onClick={() => setConfirmDel(g)}>
                DELETE
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <Modal title="NEW GOAL" onClose={() => setShowNew(false)}>
          <GoalForm
            onSubmit={async data => {
              await api('/api/goals', { method: 'POST', body: data });
              setShowNew(false);
              load();
              onChanged();
            }}
            onCancel={() => setShowNew(false)}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="EDIT GOAL" onClose={() => setEditing(null)}>
          <GoalForm initial={editing} submitLabel="SAVE" onSubmit={data => save(editing.id, data)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {confirmDel && (
        <Confirm
          title={`DELETE ${confirmDel.title.toUpperCase()}?`}
          message="This permanently removes the goal and all its check-ins."
          onConfirm={() => removeGoal(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
