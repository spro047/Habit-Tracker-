import { useState, useRef, useEffect } from 'react';

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
    <div className="border-[3px] border-ink bg-card h-6 w-full" role="progressbar" aria-valuenow={w} aria-valuemin={0} aria-valuemax={100}>
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
        checked ? 'bg-success text-white' : 'bg-card'
      }`}
    >
      {checked ? '✓' : ''}
    </button>
  );
}

const SCRATCH_META = {
  PENDING: { color: '#C8C8C8', label: 'SCRATCH', reveal: '·', revealCls: 'text-ink/40' },
  COMPLETED: { color: '#059669', label: 'DONE ✓', reveal: '✓', revealCls: 'text-success' },
  SKIPPED: { color: '#DC2626', label: 'SKIPPED ⊘', reveal: '⊘', revealCls: 'text-danger' },
};

export function ScratchCard({ status, onAction, label }) {
  const canvasRef = useRef(null);
  const movedRef = useRef(false);
  const doneRef = useRef(false);
  const lastSampleRef = useRef(0);
  const meta = SCRATCH_META[status] || SCRATCH_META.PENDING;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = meta.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(15,23,42,0.3)';
    ctx.lineWidth = 2;
    for (let x = -canvas.height; x < canvas.width + canvas.height; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, canvas.height);
      ctx.lineTo(x + canvas.height, 0);
      ctx.stroke();
    }
    ctx.fillStyle = status === 'PENDING' ? '#0F172A' : '#FFFFFF';
    ctx.font = '700 11px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.label, canvas.width / 2, canvas.height / 2);
    doneRef.current = false;
  }, [meta.color, meta.label, status]);

  const erase = (x, y) => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
  };

  const sampleProgress = () => {
    const canvas = canvasRef.current;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 16) {
      total++;
      if (data[i] === 0) clear++;
    }
    return clear / total;
  };

  const handleMove = e => {
    const canvas = canvasRef.current;
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    movedRef.current = true;
    erase(e.clientX - rect.left, e.clientY - rect.top);
    const now = Date.now();
    if (now - lastSampleRef.current > 120 && !doneRef.current && status === 'PENDING' && sampleProgress() > 0.4) {
      lastSampleRef.current = now;
      doneRef.current = true;
      onAction();
    }
  };

  return (
    <div className="relative w-[72px] h-[72px] shrink-0">
      <div
        className={`absolute inset-0 border-[3px] border-ink flex items-center justify-center font-display text-3xl bg-bg ${meta.revealCls}`}
        aria-hidden="true"
      >
        {meta.reveal}
      </div>
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        role="button"
        tabIndex={0}
        aria-label={label}
        className="absolute inset-0 w-[72px] h-[72px] cursor-pointer touch-none"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          movedRef.current = false;
          const rect = e.currentTarget.getBoundingClientRect();
          erase(e.clientX - rect.left, e.clientY - rect.top);
        }}
        onPointerMove={handleMove}
        onClick={() => {
          if (!movedRef.current) onAction();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAction();
          }
        }}
      />
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
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

const THEMES = [
  { id: 'classic', name: 'CLASSIC', colors: ['#FFFBEB', '#0F172A', '#D97706', '#059669', '#DC2626'] },
  { id: 'dark', name: 'DARK', colors: ['#0F172A', '#F1F5F9', '#F59E0B', '#10B981', '#EF4444'] },
  { id: 'ocean', name: 'OCEAN', colors: ['#EFF6FF', '#1E3A8A', '#F59E0B', '#059669', '#DC2626'] },
  { id: 'sunset', name: 'SUNSET', colors: ['#FFF7ED', '#7C2D12', '#EA580C', '#059669', '#DC2626'] },
  { id: 'matrix', name: 'MATRIX', colors: ['#052E16', '#D1FAE5', '#A3E635', '#22C55E', '#EF4444'] },
  { id: 'violet', name: 'VIOLET', colors: ['#FAF5FF', '#4C1D95', '#D97706', '#059669', '#DC2626'] },
];

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ht_theme');
    return THEMES.some(t => t.id === saved) ? saved : 'classic';
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...THEMES.map(t => `theme-${t.id}`));
    if (theme !== 'classic') root.classList.add(`theme-${theme}`);
    localStorage.setItem('ht_theme', theme);
  }, [theme]);
  return (
    <>
      <button type="button" className="neo-btn neo-btn--white text-xs py-1" onClick={() => setOpen(true)} aria-haspopup="dialog">
        THEME
      </button>
      {open && (
        <Modal title="PICK A THEME" onClose={() => setOpen(false)}>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                className={`border-[3px] border-ink p-2 cursor-pointer text-left ${theme === t.id ? 'bg-primary' : 'bg-card'}`}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                aria-pressed={theme === t.id}
              >
                <span className="font-bold uppercase text-xs">{t.name}</span>
                <span className="flex gap-1 mt-2" aria-hidden="true">
                  {t.colors.map(c => (
                    <span key={c} className="w-5 h-4 border-2 border-ink" style={{ background: c }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export function Confirm({ title = 'ARE YOU SURE?', message, confirmLabel = 'DELETE', onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="font-bold uppercase text-sm mb-4">{message}</p>
      <div className="flex gap-2">
        <button type="button" className="neo-btn neo-btn--red flex-1" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="neo-btn neo-btn--white flex-1" onClick={onCancel}>CANCEL</button>
      </div>
    </Modal>
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
              className={`w-9 h-9 border-[3px] cursor-pointer ${color === c ? 'border-ink shadow-[3px_3px_0_0_var(--color-ink)] scale-110' : 'border-ink/30'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="neo-label">PRIORITY</span>
        <div className="flex gap-2">
          {PRIORITIES.map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={`neo-tag cursor-pointer ${priority === p ? PRIORITY_COLOR[p] : 'bg-card'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="neo-label">SCHEDULE</span>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setType('DAILY')} aria-pressed={type === 'DAILY'} className={`neo-tag cursor-pointer ${type === 'DAILY' ? 'bg-primary' : 'bg-card'}`}>
            DAILY
          </button>
          <button type="button" onClick={() => setType('WEEKLY')} aria-pressed={type === 'WEEKLY'} className={`neo-tag cursor-pointer ${type === 'WEEKLY' ? 'bg-primary' : 'bg-card'}`}>
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
                className={`w-10 h-10 border-[3px] border-ink font-bold cursor-pointer ${days.includes(dayNum(i)) ? 'bg-ink text-bg' : 'bg-card'}`}
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

export function GoalForm({ initial, onSubmit, onCancel, submitLabel = 'CREATE GOAL' }) {
  const derived = initial
    ? initial.durationDays % 7 === 0 && initial.durationDays >= 7
      ? { unit: 'WEEKS', amount: initial.durationDays / 7 }
      : { unit: 'DAYS', amount: initial.durationDays }
    : { unit: 'WEEKS', amount: 2 };
  const [title, setTitle] = useState(initial?.title || '');
  const [unit, setUnit] = useState(derived.unit);
  const [amount, setAmount] = useState(derived.amount);
  const [startDate, setStartDate] = useState(initial?.startDate || new Date().toISOString().slice(0, 10));

  const amt = Number(amount) || 0;
  const durationDays = unit === 'WEEKS' ? amt * 7 : amt;

  const submit = e => {
    e.preventDefault();
    if (!title.trim()) return;
    if (durationDays < 1) return;
    onSubmit({ title: title.trim(), durationDays, startDate });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="neo-label" htmlFor="gname">TITLE</label>
        <input id="gname" className="neo-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="20 Pushups" autoFocus required />
      </div>
      <div>
        <span className="neo-label">DURATION</span>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setUnit('DAYS')} aria-pressed={unit === 'DAYS'} className={`neo-tag cursor-pointer ${unit === 'DAYS' ? 'bg-primary' : 'bg-card'}`}>
            DAYS
          </button>
          <button type="button" onClick={() => setUnit('WEEKS')} aria-pressed={unit === 'WEEKS'} className={`neo-tag cursor-pointer ${unit === 'WEEKS' ? 'bg-primary' : 'bg-card'}`}>
            WEEKS
          </button>
        </div>
        <input
          id="gamount"
          type="number"
          min="1"
          className="neo-input"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          aria-label="Duration amount"
          required
        />
        <p className="text-xs font-bold uppercase text-ink/50 mt-1">= {durationDays} DAYS</p>
      </div>
      <div>
        <label className="neo-label" htmlFor="gstart">START DATE</label>
        <input id="gstart" type="date" className="neo-input" value={startDate} onChange={e => setStartDate(e.target.value)} required />
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
            <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={`neo-tag cursor-pointer ${priority === p ? PRIORITY_COLOR[p] : 'bg-card'}`}>
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