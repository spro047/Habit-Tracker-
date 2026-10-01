import { useState } from 'react';

export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
export const PRIORITY_COLOR = {
  HIGH: 'bg-danger text-white',
  MEDIUM: 'bg-secondary text-ink',
  LOW: 'bg-success text-white',
};
export const COLORS = ['#D97706', '#F59E0B', '#059669', '#DC2626', '#8B5CF6', '#2563EB', '#0F172A', '#EC4899'];
export const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const WEEK_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const weeklyLabel = days => (days.length ? days.map(d => WEEK_NAMES[d]).join(' / ') : '—');

export function PriorityTag({ p }) {
  return <span className={`neo-tag ${PRIORITY_COLOR[p] || PRIORITY_COLOR.MEDIUM}`}>{p}</span>;
}

export function ProgressBar({ pct, color = '#059669' }) {
  const stripes = 'repeating-linear-gradient(90deg, rgba(15,23,42,.3) 0 4px, transparent 4px 8px)';
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="border-[3px] border-ink bg-white h-6 w-full" role="progressbar" aria-valuenow={w} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full" style={{ width: `${w}%`, background: `${stripes}, ${color}` }} />
    </div>
  );
}

export function CheckSquare({ checked, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={checked}
      className={`w-9 h-9 border-[3px] border-ink shrink-0 cursor-pointer flex items-center justify-center font-bold text-lg ${
        checked ? 'bg-success text-white' : 'bg-white'
      }`}
    >
      {checked ? '✓' : ''}
    </button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-ink/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="neo-card p-4 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">{title}</h2>
          <button type="button" className="neo-btn neo-btn--white text-sm px-2 py-0.5" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function HabitForm({ initial, onSubmit, onCancel, submitLabel = 'CREATE HABIT' }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || COLORS[0]);
  const [priority, setPriority] = useState(initial?.priority || 'MEDIUM');
  const [type, setType] = useState(initial?.schedule?.type || 'DAILY');
  const [days, setDays] = useState(initial?.schedule?.daysOfWeek || []);
  const [startDate, setStartDate] = useState(initial?.schedule?.startDate || new Date().toISOString().slice(0, 10));

  const toggleDay = d => setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort()));
  const dayNum = i => (i === 6 ? 0 : i + 1);

  const submit = e => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), color, priority, schedule: { type, daysOfWeek: type === 'WEEKLY' ? days : [], startDate } });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="neo-label" htmlFor="hname">NAME</label>
        <input id="hname" className="neo-input" value={name} onChange={e => setName(e.target.value)} placeholder="Study DSA" autoFocus required />
      </div>
      <div>
        <span className="neo-label">COLOR</span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={`w-9 h-9 border-[3px] cursor-pointer ${color === c ? 'border-ink shadow-[3px_3px_0_0_#0F172A] scale-110' : 'border-ink/30'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="neo-label">PRIORITY</span>
        <div className="flex gap-2">
          {PRIORITIES.map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={`neo-tag cursor-pointer ${priority === p ? PRIORITY_COLOR[p] : 'bg-white'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="neo-label">SCHEDULE</span>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setType('DAILY')} aria-pressed={type === 'DAILY'} className={`neo-tag cursor-pointer ${type === 'DAILY' ? 'bg-primary' : 'bg-white'}`}>
            DAILY
          </button>
          <button type="button" onClick={() => setType('WEEKLY')} aria-pressed={type === 'WEEKLY'} className={`neo-tag cursor-pointer ${type === 'WEEKLY' ? 'bg-primary' : 'bg-white'}`}>
            SELECTED DAYS
          </button>
        </div>
        {type === 'WEEKLY' && (
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d + i}
                type="button"
                onClick={() => toggleDay(dayNum(i))}
                aria-pressed={days.includes(dayNum(i))}
                className={`w-10 h-10 border-[3px] border-ink font-bold cursor-pointer ${days.includes(dayNum(i)) ? 'bg-ink text-bg' : 'bg-white'}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="neo-label" htmlFor="hstart">START DATE</label>
        <input id="hstart" type="date" className="neo-input" value={startDate} onChange={e => setStartDate(e.target.value)} required />
      </div>
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button type="button" className="neo-btn neo-btn--white flex-1" onClick={onCancel}>CANCEL</button>
        )}
        <button type="submit" className="neo-btn flex-1">{submitLabel}</button>
      </div>
    </form>
  );
}

export function TaskForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const submit = e => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), priority });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="neo-label" htmlFor="ttitle">TASK</label>
        <input id="ttitle" className="neo-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Complete project report" autoFocus required />
      </div>
      <div>
        <span className="neo-label">PRIORITY</span>
        <div className="flex gap-2">
          {PRIORITIES.map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={`neo-tag cursor-pointer ${priority === p ? PRIORITY_COLOR[p] : 'bg-white'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button type="button" className="neo-btn neo-btn--white flex-1" onClick={onCancel}>CANCEL</button>
        )}
        <button type="submit" className="neo-btn flex-1">ADD TASK</button>
      </div>
    </form>
  );
}

export function Loading() {
  return <div className="p-10 text-center font-bold uppercase tracking-widest">Loading…</div>;
}

export function Empty({ text }) {
  return <div className="neo-card p-6 text-center font-bold uppercase tracking-widest text-ink/50">{text}</div>;
}

export function Err({ msg }) {
  return msg ? <div role="alert" className="border-[3px] border-danger bg-danger text-white p-2 font-bold uppercase text-sm mb-3">{msg}</div> : null;
}