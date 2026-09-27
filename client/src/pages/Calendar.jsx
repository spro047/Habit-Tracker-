import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading } from '../components.jsx';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const heat = pct => {
  if (pct >= 76) return 'bg-success text-white';
  if (pct >= 51) return 'bg-primary text-white';
  if (pct >= 26) return 'bg-secondary text-ink';
  if (pct >= 1) return 'bg-secondary/40 text-ink';
  return 'bg-white text-ink/40';
};

export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setDays(null);
    api(`/api/calendar/month?year=${year}&month=${month}`)
      .then(d => setDays(d.days))
      .catch(e => setErr(e.message));
  }, [year, month]);

  const shift = d => {
    let m = month + d;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
  };

  if (err) return <div className="neo-card p-4 text-danger font-bold uppercase">{err}</div>;
  if (!days) return <Loading />;

  const first = new Date(year, month, 1).getDay();
  const offset = first === 0 ? 6 : first - 1;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" className="neo-btn neo-btn--white text-xs" onClick={() => shift(-1)} aria-label="Previous month">
          ←
        </button>
        <h1 className="font-display text-2xl">
          {MONTHS[month]} {year}
        </h1>
        <button type="button" className="neo-btn neo-btn--white text-xs" onClick={() => shift(1)} aria-label="Next month">
          →
        </button>
      </div>
      <div className="neo-card p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-bold uppercase text-ink/50">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`e${i}`} aria-hidden="true" />
          ))}
          {days.map(d => {
            const isToday = d.date === today;
            return (
              <div
                key={d.date}
                className={`border-[3px] border-ink p-1 h-14 flex flex-col ${heat(d.pct)} ${isToday ? 'ring-4 ring-secondary' : ''}`}
                title={`${d.date}: ${d.completed}/${d.scheduled} completed`}
              >
                <span className="text-xs font-bold">{d.date.slice(8)}</span>
                {d.scheduled > 0 && <span className="text-[9px] font-bold uppercase mt-auto">{d.completed}/{d.scheduled}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
        <span className="neo-tag bg-white">0%</span>
        <span className="neo-tag bg-secondary/40">1–25%</span>
        <span className="neo-tag bg-secondary">26–50%</span>
        <span className="neo-tag bg-primary">51–75%</span>
        <span className="neo-tag bg-success">76–100%</span>
      </div>
    </div>
  );
}