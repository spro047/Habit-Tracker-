import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql, addDays, todayStr, getStreaks, isScheduled, habitJson, userTimezone } from './db.js';

export const app = express();
app.use(express.json());
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const sign = id => jwt.sign({ sub: id }, SECRET, { expiresIn: '30d' });
const auth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try { req.userId = jwt.verify(token, SECRET).sub; next(); }
  catch { res.status(401).json({ error: 'Unauthorized' }); }
};
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime());
const taskJson = t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.due_date });
const HABIT_SELECT = 'id, name, description, color, priority, schedule_type, days_of_week, start_date::text AS start_date, status';

async function pctFor(row, userId, from, to) {
  const rows = await sql`SELECT date::text AS date, status FROM habit_completions WHERE habit_id = ${row.id} AND user_id = ${userId} AND date >= ${from} AND date <= ${to}`;
  const rec = new Map(rows.map(r => [r.date, r.status]));
  let sched = 0, done = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isScheduled(row, d)) continue;
    sched++;
    if (rec.get(d) === 'COMPLETED') done++;
  }
  return sched ? Math.round((done / sched) * 100) : 0;
}

async function monthHistory(row, userId) {
  const today = todayStr(await userTimezone(userId));
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const rows = await sql`SELECT date::text AS date, status FROM habit_completions WHERE habit_id = ${row.id} AND user_id = ${userId}`;
  const rec = new Map(rows.map(r => [r.date, r.status]));
  const out = [];
  for (let i = 0; i < 6; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const n = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= n; d++) {
      const date = `${key}-${String(d).padStart(2, '0')}`;
      days.push({ date, status: !isScheduled(row, date) ? 'NOT_SCHEDULED' : (rec.get(date) || 'MISSED') });
    }
    out.push({ month: key, days });
    if (--m === 0) { m = 12; y--; }
  }
  return out.reverse();
}

const getHabit = async (req, res) => {
  const rows = await sql`SELECT ${sql.unsafe(HABIT_SELECT)} FROM habits WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
  if (!rows.length) { res.status(404).json({ error: 'Habit not found' }); return null; }
  return rows[0];
};

// ---- AUTH ----
app.post('/api/auth/register', ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
  const em = email.toLowerCase();
  const exists = await sql`SELECT id FROM users WHERE email = ${em}`;
  if (exists.length) return res.status(409).json({ error: 'Email already registered' });
  const rows = await sql`INSERT INTO users (name, email, password_hash) VALUES (${name.trim()}, ${em}, ${bcrypt.hashSync(password, 10)}) RETURNING id, name, email`;
  const user = rows[0];
  res.status(201).json({ token: sign(user.id), user });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const rows = await sql`SELECT * FROM users WHERE email = ${(email || '').toLowerCase()}`;
  const row = rows[0];
  if (!row || !bcrypt.compareSync(password || '', row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign(row.id), user: { id: row.id, name: row.name, email: row.email } });
}));

app.get('/api/auth/me', auth, ah(async (req, res) => {
  const rows = await sql`SELECT id, name, email FROM users WHERE id = ${req.userId}`;
  res.json({ user: rows[0] });
}));

// ---- HABITS ----
app.get('/api/habits', auth, ah(async (req, res) => {
  const rows = await sql`SELECT ${sql.unsafe(HABIT_SELECT)} FROM habits WHERE user_id = ${req.userId} AND status != 'ARCHIVED' ORDER BY id`;
  const habits = [];
  for (const r of rows) habits.push({ ...habitJson(r), streak: await getStreaks(r, req.userId) });
  res.json({ habits });
}));

app.post('/api/habits', auth, ah(async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const sched = b.schedule || {};
  const type = sched.type === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
  const days = Array.isArray(sched.daysOfWeek) ? sched.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  const start = validDate(sched.startDate) ? sched.startDate : todayStr();
  const priority = ['HIGH', 'MEDIUM', 'LOW'].includes(b.priority) ? b.priority : 'MEDIUM';
  const color = typeof b.color === 'string' && b.color ? b.color : '#D97706';
  const rows = await sql`INSERT INTO habits (user_id, name, color, priority, schedule_type, days_of_week, start_date) VALUES (${req.userId}, ${name}, ${color}, ${priority}, ${type}, ${JSON.stringify(days)}, ${start}) RETURNING ${sql.unsafe(HABIT_SELECT)}`;
  res.status(201).json(habitJson(rows[0]));
}));

app.get('/api/habits/:id', auth, ah(async (req, res) => {
  const row = await getHabit(req, res);
  if (!row) return;
  const tz = await userTimezone(req.userId);
  const today = todayStr(tz);
  const streaks = await getStreaks(row, req.userId);
  res.json({
    habit: habitJson(row),
    stats: {
      currentStreak: streaks.current,
      bestStreak: streaks.best,
      weekPct: await pctFor(row, req.userId, addDays(today, -6), today),
      monthPct: await pctFor(row, req.userId, today.slice(0, 8) + '01', today),
      allTimePct: await pctFor(row, req.userId, row.start_date, today),
    },
    history: await monthHistory(row, req.userId),
  });
}));

app.patch('/api/habits/:id', auth, ah(async (req, res) => {
  const row = await getHabit(req, res);
  if (!row) return;
  const b = req.body || {};
  const sched = b.schedule || {};
  const sets = [];
  if (b.name !== undefined) sets.push(sql`name = ${String(b.name).trim()}`);
  if (b.color !== undefined) sets.push(sql`color = ${b.color}`);
  if (b.priority !== undefined) sets.push(sql`priority = ${b.priority}`);
  if (b.status !== undefined && ['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(b.status)) sets.push(sql`status = ${b.status}`);
  if (b.schedule) {
    if (sched.type !== undefined) sets.push(sql`schedule_type = ${sched.type === 'WEEKLY' ? 'WEEKLY' : 'DAILY'}`);
    if (Array.isArray(sched.daysOfWeek)) sets.push(sql`days_of_week = ${JSON.stringify(sched.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))}`);
    if (validDate(sched.startDate)) sets.push(sql`start_date = ${sched.startDate}`);
  }
  if (sets.length) await sql`UPDATE habits SET ${sql.join(sets, sql`, `)} WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
  const updated = await sql`SELECT ${sql.unsafe(HABIT_SELECT)} FROM habits WHERE id = ${req.params.id}`;
  res.json(habitJson(updated[0]));
}));

app.delete('/api/habits/:id', auth, ah(async (req, res) => {
  const r = await sql`UPDATE habits SET status = 'ARCHIVED' WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
  if (!r.count) return res.status(404).json({ error: 'Habit not found' });
  res.status(204).end();
}));

// ---- COMPLETIONS ----
const dateOf = req => validDate((req.body || {}).date) ? req.body.date : null;

app.post('/api/habits/:id/complete', auth, ah(async (req, res) => {
  const rows = await sql`SELECT id FROM habits WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
  if (!rows.length) return res.status(404).json({ error: 'Habit not found' });
  const date = dateOf(req) || todayStr(await userTimezone(req.userId));
  await sql`INSERT INTO habit_completions (habit_id, user_id, date, status) VALUES (${rows[0].id}, ${req.userId}, ${date}, 'COMPLETED') ON CONFLICT (habit_id, date) DO UPDATE SET status = 'COMPLETED'`;
  res.json({ status: 'COMPLETED' });
}));

app.post('/api/habits/:id/skip', auth, ah(async (req, res) => {
  const rows = await sql`SELECT id FROM habits WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
  if (!rows.length) return res.status(404).json({ error: 'Habit not found' });
  const date = dateOf(req) || todayStr(await userTimezone(req.userId));
  await sql`INSERT INTO habit_completions (habit_id, user_id, date, status) VALUES (${rows[0].id}, ${req.userId}, ${date}, 'SKIPPED') ON CONFLICT (habit_id, date) DO UPDATE SET status = 'SKIPPED'`;
  res.json({ status: 'SKIPPED' });
}));

app.delete('/api/habits/:id/completion', auth, ah(async (req, res) => {
  const date = dateOf(req) || todayStr(await userTimezone(req.userId));
  await sql`DELETE FROM habit_completions WHERE habit_id = ${req.params.id} AND user_id = ${req.userId} AND date = ${date}`;
  res.status(204).end();
}));

// ---- DASHBOARD ----
app.get('/api/dashboard/today', auth, ah(async (req, res) => {
  const tz = await userTimezone(req.userId);
  const today = todayStr(tz);
  const yest = addDays(today, -1);
  const rows = await sql`SELECT ${sql.unsafe(HABIT_SELECT)} FROM habits WHERE user_id = ${req.userId} AND status = 'ACTIVE'`;
  const todayRecs = await sql`SELECT habit_id, status FROM habit_completions WHERE user_id = ${req.userId} AND date = ${today}`;
  const yestDone = await sql`SELECT habit_id FROM habit_completions WHERE user_id = ${req.userId} AND date = ${yest} AND status = 'COMPLETED'`;
  const todayMap = new Map(todayRecs.map(r => [r.habit_id, r.status]));
  const habits = [];
  for (const r of rows) {
    if (!isScheduled(r, today)) continue;
    habits.push({ ...habitJson(r), todayStatus: todayMap.get(r.id) || 'PENDING', streak: await getStreaks(r, req.userId) });
  }
  const completed = habits.filter(h => h.todayStatus === 'COMPLETED').length;
  const scheduled = habits.length;
  const tasks = await sql`SELECT id, title, priority, status, due_date::text AS due_date FROM tasks WHERE user_id = ${req.userId} AND (due_date IS NULL OR due_date = ${today}) ORDER BY CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, id DESC`;
  const hour = +new Intl.DateTimeFormat('en', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date());
  res.json({
    date: today,
    greeting: hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING',
    progress: {
      scheduled,
      completed,
      remaining: scheduled - completed,
      pct: scheduled ? Math.round((completed / scheduled) * 100) : 0,
      vsYesterday: completed - yestDone.length,
    },
    habits,
    tasks: tasks.map(taskJson),
    bestStreak: Math.max(0, ...habits.map(h => h.streak.best)),
  });
}));

// ---- TASKS ----
app.post('/api/tasks', auth, ah(async (req, res) => {
  const { title, priority, dueDate } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const p = ['HIGH', 'MEDIUM', 'LOW'].includes(priority) ? priority : 'MEDIUM';
  const due = validDate(dueDate) ? dueDate : null;
  const rows = await sql`INSERT INTO tasks (user_id, title, priority, due_date) VALUES (${req.userId}, ${title.trim()}, ${p}, ${due}) RETURNING id, title, priority, status, due_date::text AS due_date`;
  res.status(201).json(taskJson(rows[0]));
}));

app.patch('/api/tasks/:id', auth, ah(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  if (b.status !== undefined) sets.push(sql`status = ${b.status === 'DONE' ? 'DONE' : 'OPEN'}`);
  if (b.title !== undefined) sets.push(sql`title = ${String(b.title).trim()}`);
  if (b.priority !== undefined) sets.push(sql`priority = ${b.priority}`);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const r = await sql`UPDATE tasks SET ${sql.join(sets, sql`, `)} WHERE id = ${req.params.id} AND user_id = ${req.userId} RETURNING id, title, priority, status, due_date::text AS due_date`;
  if (!r.length) return res.status(404).json({ error: 'Task not found' });
  res.json(taskJson(r[0]));
}));

app.delete('/api/tasks/:id', auth, ah(async (req, res) => {
  const r = await sql`DELETE FROM tasks WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
  if (!r.count) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
}));

// ---- CALENDAR ----
app.get('/api/calendar/month', auth, ah(async (req, res) => {
  const now = todayStr(await userTimezone(req.userId));
  const year = parseInt(req.query.year, 10) || +now.slice(0, 4);
  const qm = parseInt(req.query.month, 10);
  const m = Number.isInteger(qm) && qm >= 0 && qm <= 11 ? qm : +now.slice(5, 7) - 1;
  const rows = await sql`SELECT ${sql.unsafe(HABIT_SELECT)} FROM habits WHERE user_id = ${req.userId} AND status = 'ACTIVE'`;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const key = `${year}-${String(m + 1).padStart(2, '0')}`;
  const start = `${key}-01`;
  const end = `${key}-${String(daysInMonth).padStart(2, '0')}`;
  const recs = await sql`SELECT habit_id, date FROM habit_completions WHERE user_id = ${req.userId} AND date >= ${start} AND date <= ${end} AND status = 'COMPLETED'`;
  const doneByDate = new Map();
  for (const r of recs) doneByDate.set(r.date, (doneByDate.get(r.date) || 0) + 1);
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${key}-${String(d).padStart(2, '0')}`;
    const scheduled = rows.filter(h => isScheduled(h, date)).length;
    const completed = doneByDate.get(date) || 0;
    days.push({ date, scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 });
  }
  res.json({ days });
}));

app.get('/api/calendar/year', auth, ah(async (req, res) => {
  const now = todayStr(await userTimezone(req.userId));
  const year = parseInt(req.query.year, 10) || +now.slice(0, 4);
  const rows = await sql`SELECT ${sql.unsafe(HABIT_SELECT)} FROM habits WHERE user_id = ${req.userId} AND status = 'ACTIVE'`;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const recs = await sql`SELECT habit_id, date FROM habit_completions WHERE user_id = ${req.userId} AND date >= ${start} AND date <= ${end} AND status = 'COMPLETED'`;
  const doneByDate = new Map();
  for (const r of recs) doneByDate.set(r.date, (doneByDate.get(r.date) || 0) + 1);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const scheduled = rows.filter(h => isScheduled(h, d)).length;
    const completed = doneByDate.get(d) || 0;
    days.push({ date: d, scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 });
  }
  res.json({ days });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});