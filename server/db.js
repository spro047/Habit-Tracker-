import Database from 'better-sqlite3';

export const db = new Database('data.db');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS habits(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#D97706',
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('HIGH','MEDIUM','LOW')),
  schedule_type TEXT NOT NULL DEFAULT 'DAILY' CHECK(schedule_type IN ('DAILY','WEEKLY')),
  days_of_week TEXT NOT NULL DEFAULT '[]',
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS habit_completions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','SKIPPED')),
  UNIQUE(habit_id, date)
);
CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('HIGH','MEDIUM','LOW')),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DONE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export const safeJson = (s, fb) => {
  try { return JSON.parse(s); } catch { return fb; }
};

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const todayStr = (tz = 'Asia/Kolkata') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const userTimezone = userId =>
  db.prepare('SELECT timezone FROM users WHERE id=?').get(userId)?.timezone || 'Asia/Kolkata';

export const isScheduled = (habit, dateStr) => {
  if (dateStr < habit.start_date) return false;
  if (habit.schedule_type === 'DAILY') return true;
  return safeJson(habit.days_of_week, []).includes(new Date(dateStr + 'T00:00:00Z').getUTCDay());
};

// Single source of truth: schedule + completion records. Everything derived, never stored.
export function getStreaks(habit, userId) {
  const today = todayStr(userTimezone(userId));
  const rows = db.prepare('SELECT date, status FROM habit_completions WHERE habit_id=? AND user_id=?').all(habit.id, userId);
  const rec = new Map(rows.map(r => [r.date, r.status]));

  // current: walk back from today over scheduled days. SKIPPED keeps streak alive but isn't counted. First MISSED breaks.
  let current = 0;
  for (let d = today; d >= habit.start_date; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    const s = rec.get(d);
    if (s === 'COMPLETED') current++;
    else if (s !== 'SKIPPED') break;
  }

  // best: longest run of consecutive COMPLETED scheduled days. SKIPPED or MISSED resets the run.
  let best = 0, run = 0;
  for (let d = habit.start_date; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(habit, d)) continue;
    if (rec.get(d) === 'COMPLETED') { run++; if (run > best) best = run; }
    else run = 0;
  }
  return { current, best };
}

export const habitJson = r => ({
  id: r.id,
  name: r.name,
  description: r.description,
  color: r.color,
  priority: r.priority,
  schedule: { type: r.schedule_type, daysOfWeek: safeJson(r.days_of_week, []), startDate: r.start_date },
  status: r.status,
});