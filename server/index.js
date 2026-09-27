import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, addDays, todayStr, getStreaks, isScheduled, habitJson, userTimezone } from './db.js';

const app = express();
app.use(express.json());
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const sign = id => jwt.sign({ sub: id }, SECRET, { expiresIn: '30d' });
const auth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try { req.userId = jwt.verify(token, SECRET).sub; next(); }
  catch { res.status(401).json({ error: 'Unauthorized' }); }
};
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime());
const taskJson = t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.due_date });

function pctFor(row, userId, from, to) {
  const rows = db.prepare('SELECT date, status FROM habit_completions WHERE habit_id=? AND user_id=? AND date>=? AND date<=?').all(row.id, userId, from, to);
  const rec = new Map(rows.map(r => [r.date, r.status]));
  let sched = 0, done = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isScheduled(row, d)) continue;
    sched++;
    if (rec.get(d) === 'COMPLETED') done++;
  }
  return sched ? Math.round((done / sched) * 100) : 0;
}

function monthHistory(row, userId) {
  const today = todayStr(userTimezone(userId));
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const recs = db.prepare('SELECT date, status FROM habit_completions WHERE habit_id=? AND user_id=?').all(row.id, userId);
  const rec = new Map(recs.map(r => [r.date, r.status]));
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

// ---- AUTH ----
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
  const em = email.toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(em)) return res.status(409).json({ error: 'Email already registered' });
  const info = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)').run(name.trim(), em, bcrypt.hashSync(password, 10));
  const user = { id: info.lastInsertRowid, name: name.trim(), email: em };
  res.status(201).json({ token: sign(user.id), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
  if (!row || !bcrypt.compareSync(password || '', row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign(row.id), user: { id: row.id, name: row.name, email: row.email } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const row = db.prepare('SELECT id,name,email FROM users WHERE id=?').get(req.userId);
  res.json({ user: row });
});

// ---- HABITS ----
app.get('/api/habits', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM habits WHERE user_id=? AND status!=? ORDER BY id').all(req.userId, 'ARCHIVED');
  res.json({ habits: rows.map(r => ({ ...habitJson(r), streak: getStreaks(r, req.userId) })) });
});

app.post('/api/habits', auth, (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const sched = b.schedule || {};
  const type = sched.type === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
  const days = Array.isArray(sched.daysOfWeek) ? sched.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  const start = validDate(sched.startDate) ? sched.startDate : todayStr();
  const priority = ['HIGH', 'MEDIUM', 'LOW'].includes(b.priority) ? b.priority : 'MEDIUM';
  const color = typeof b.color === 'string' && b.color ? b.color : '#D97706';
  const info = db.prepare('INSERT INTO habits (user_id,name,color,priority,schedule_type,days_of_week,start_date) VALUES (?,?,?,?,?,?,?)')
    .run(req.userId, name, color, priority, type, JSON.stringify(days), start);
  res.status(201).json(habitJson(db.prepare('SELECT * FROM habits WHERE id=?').get(info.lastInsertRowid)));
});

const getHabit = (req, res) => {
  const row = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) { res.status(404).json({ error: 'Habit not found' }); return null; }
  return row;
};

app.get('/api/habits/:id', auth, (req, res) => {
  const row = getHabit(req, res);
  if (!row) return;
  const today = todayStr(userTimezone(req.userId));
  const streaks = getStreaks(row, req.userId);
  res.json({
    habit: habitJson(row),
    stats: {
      currentStreak: streaks.current,
      bestStreak: streaks.best,
      weekPct: pctFor(row, req.userId, addDays(today, -6), today),
      monthPct: pctFor(row, req.userId, today.slice(0, 8) + '01', today),
      allTimePct: pctFor(row, req.userId, row.start_date, today),
    },
    history: monthHistory(row, req.userId),
  });
});

app.patch('/api/habits/:id', auth, (req, res) => {
  const row = getHabit(req, res);
  if (!row) return;
  const b = req.body || {};
  const sched = b.schedule || {};
  const sets = [], vals = [];
  if (b.name !== undefined) { sets.push('name=?'); vals.push(String(b.name).trim()); }
  if (b.color !== undefined) { sets.push('color=?'); vals.push(b.color); }
  if (b.priority !== undefined) { sets.push('priority=?'); vals.push(b.priority); }
  if (b.status !== undefined && ['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(b.status)) { sets.push('status=?'); vals.push(b.status); }
  if (b.schedule) {
    if (sched.type !== undefined) { sets.push('schedule_type=?'); vals.push(sched.type === 'WEEKLY' ? 'WEEKLY' : 'DAILY'); }
    if (Array.isArray(sched.daysOfWeek)) { sets.push('days_of_week=?'); vals.push(JSON.stringify(sched.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))); }
    if (validDate(sched.startDate)) { sets.push('start_date=?'); vals.push(sched.startDate); }
  }
  if (sets.length) {
    vals.push(req.params.id, req.userId);
    db.prepare(`UPDATE habits SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...vals);
  }
  res.json(habitJson(db.prepare('SELECT * FROM habits WHERE id=?').get(req.params.id)));
});

app.delete('/api/habits/:id', auth, (req, res) => {
  const info = db.prepare('UPDATE habits SET status=? WHERE id=? AND user_id=?').run('ARCHIVED', req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Habit not found' });
  res.status(204).end();
});

// ---- COMPLETIONS ----
const dateOf = req => validDate((req.body || {}).date) ? req.body.date : null;

app.post('/api/habits/:id/complete', auth, (req, res) => {
  const row = db.prepare('SELECT id FROM habits WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Habit not found' });
  const date = dateOf(req) || todayStr(userTimezone(req.userId));
  db.prepare('INSERT INTO habit_completions (habit_id,user_id,date,status) VALUES (?,?,?,?) ON CONFLICT(habit_id,date) DO UPDATE SET status=?')
    .run(row.id, req.userId, date, 'COMPLETED', 'COMPLETED');
  res.json({ status: 'COMPLETED' });
});

app.post('/api/habits/:id/skip', auth, (req, res) => {
  const row = db.prepare('SELECT id FROM habits WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Habit not found' });
  const date = dateOf(req) || todayStr(userTimezone(req.userId));
  db.prepare('INSERT INTO habit_completions (habit_id,user_id,date,status) VALUES (?,?,?,?) ON CONFLICT(habit_id,date) DO UPDATE SET status=?')
    .run(row.id, req.userId, date, 'SKIPPED', 'SKIPPED');
  res.json({ status: 'SKIPPED' });
});

app.delete('/api/habits/:id/completion', auth, (req, res) => {
  const date = dateOf(req) || todayStr(userTimezone(req.userId));
  db.prepare('DELETE FROM habit_completions WHERE habit_id=? AND user_id=? AND date=?').run(req.params.id, req.userId, date);
  res.status(204).end();
});

// ---- DASHBOARD ----
app.get('/api/dashboard/today', auth, (req, res) => {
  const tz = userTimezone(req.userId);
  const today = todayStr(tz);
  const yest = addDays(today, -1);
  const rows = db.prepare('SELECT * FROM habits WHERE user_id=? AND status=?').all(req.userId, 'ACTIVE');
  const todayRecs = db.prepare('SELECT habit_id,status FROM habit_completions WHERE user_id=? AND date=?').all(req.userId, today);
  const yestDone = db.prepare('SELECT habit_id FROM habit_completions WHERE user_id=? AND date=? AND status=?').all(req.userId, yest, 'COMPLETED').length;
  const todayMap = new Map(todayRecs.map(r => [r.habit_id, r.status]));
  const habits = [];
  for (const r of rows) {
    if (!isScheduled(r, today)) continue;
    habits.push({ ...habitJson(r), todayStatus: todayMap.get(r.id) || 'PENDING', streak: getStreaks(r, req.userId) });
  }
  const completed = habits.filter(h => h.todayStatus === 'COMPLETED').length;
  const scheduled = habits.length;
  const tasks = db.prepare('SELECT id,title,priority,status,due_date FROM tasks WHERE user_id=? AND (due_date IS NULL OR due_date=?) ORDER BY CASE priority WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END, id DESC')
    .all(req.userId, today, 'HIGH', 'MEDIUM').map(taskJson);
  const hour = +new Intl.DateTimeFormat('en', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date());
  res.json({
    date: today,
    greeting: hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING',
    progress: {
      scheduled,
      completed,
      remaining: scheduled - completed,
      pct: scheduled ? Math.round((completed / scheduled) * 100) : 0,
      vsYesterday: completed - yestDone,
    },
    habits,
    tasks,
    bestStreak: Math.max(0, ...habits.map(h => h.streak.best)),
  });
});

// ---- TASKS ----
app.post('/api/tasks', auth, (req, res) => {
  const { title, priority, dueDate } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const p = ['HIGH', 'MEDIUM', 'LOW'].includes(priority) ? priority : 'MEDIUM';
  const due = validDate(dueDate) ? dueDate : null;
  const info = db.prepare('INSERT INTO tasks (user_id,title,priority,due_date) VALUES (?,?,?,?)').run(req.userId, title.trim(), p, due);
  res.status(201).json(taskJson(db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid)));
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.status !== undefined) { sets.push('status=?'); vals.push(b.status === 'DONE' ? 'DONE' : 'OPEN'); }
  if (b.title !== undefined) { sets.push('title=?'); vals.push(String(b.title).trim()); }
  if (b.priority !== undefined) { sets.push('priority=?'); vals.push(b.priority); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id, req.userId);
  const info = db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...vals);
  if (!info.changes) return res.status(404).json({ error: 'Task not found' });
  res.json(taskJson(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id)));
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  if (!info.changes) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

// ---- CALENDAR ----
app.get('/api/calendar/month', auth, (req, res) => {
  const now = todayStr(userTimezone(req.userId));
  const year = parseInt(req.query.year, 10) || +now.slice(0, 4);
  const qm = parseInt(req.query.month, 10);
  const m = Number.isInteger(qm) && qm >= 0 && qm <= 11 ? qm : +now.slice(5, 7) - 1;
  const rows = db.prepare('SELECT * FROM habits WHERE user_id=? AND status=?').all(req.userId, 'ACTIVE');
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const key = `${year}-${String(m + 1).padStart(2, '0')}`;
  const start = `${key}-01`;
  const end = `${key}-${String(daysInMonth).padStart(2, '0')}`;
  const recs = db.prepare('SELECT habit_id,date FROM habit_completions WHERE user_id=? AND date>=? AND date<=? AND status=?').all(req.userId, start, end, 'COMPLETED');
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
});

app.get('/api/calendar/year', auth, (req, res) => {
  const now = todayStr(userTimezone(req.userId));
  const year = parseInt(req.query.year, 10) || +now.slice(0, 4);
  const rows = db.prepare('SELECT * FROM habits WHERE user_id=? AND status=?').all(req.userId, 'ACTIVE');
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const recs = db.prepare('SELECT habit_id,date FROM habit_completions WHERE user_id=? AND date>=? AND date<=? AND status=?').all(req.userId, start, end, 'COMPLETED');
  const doneByDate = new Map();
  for (const r of recs) doneByDate.set(r.date, (doneByDate.get(r.date) || 0) + 1);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const scheduled = rows.filter(h => isScheduled(h, d)).length;
    const completed = doneByDate.get(d) || 0;
    days.push({ date: d, scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 });
  }
  res.json({ days });
});

app.listen(3001, () => console.log('Habbit Tracker API on http://localhost:3001'));