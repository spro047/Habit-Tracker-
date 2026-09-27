import postgres from 'postgres';

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || 'postgres://postgres:postgres@localhost:5432/habbit';
export const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 5 });

await sql`CREATE TABLE IF NOT EXISTS users(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
await sql`CREATE TABLE IF NOT EXISTS habits(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#D97706',
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  schedule_type TEXT NOT NULL DEFAULT 'DAILY' CHECK (schedule_type IN ('DAILY','WEEKLY')),
  days_of_week TEXT NOT NULL DEFAULT '[]',
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
await sql`CREATE TABLE IF NOT EXISTS habit_completions(
  id BIGSERIAL PRIMARY KEY,
  habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED','SKIPPED')),
  UNIQUE(habit_id, date)
)`;
await sql`CREATE TABLE IF NOT EXISTS tasks(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

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

export async function userTimezone(userId) {
  const rows = await sql`SELECT timezone FROM users WHERE id = ${userId}`;
  return rows[0]?.timezone || 'Asia/Kolkata';
}

export const isScheduled = (habit, dateStr) => {
  if (dateStr < habit.start_date) return false;
  if (habit.schedule_type === 'DAILY') return true;
  return safeJson(habit.days_of_week, []).includes(new Date(dateStr + 'T00:00:00Z').getUTCDay());
};

export async function getStreaks(habit, userId) {
  const today = todayStr(await userTimezone(userId));
  const rows = await sql`SELECT date::text AS date, status FROM habit_completions WHERE habit_id = ${habit.id} AND user_id = ${userId}`;
  const rec = new Map(rows.map(r => [r.date, r.status]));
  let current = 0;
  for (let d = today; d >= habit.start_date; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    const s = rec.get(d);
    if (s === 'COMPLETED') current++;
    else if (s !== 'SKIPPED') break;
  }
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