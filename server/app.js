import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt, tag } from './enc.js';
import { db, oid, addDays, todayStr, getStreaks, isScheduled, habitJson, userTimezone, decryptHabit } from './db.js';

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
const PRIO = { HIGH: 0, MEDIUM: 1, LOW: 2 };

async function pctFor(row, userId, from, to) {
  const recs = await db.collection('habit_completions').find({ habitId: row._id, userId }).toArray();
  const rec = new Map();
  for (const r of recs) {
    const date = decrypt(r.date);
    const status = decrypt(r.status);
    if (date >= from && date <= to) rec.set(date, status);
  }
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
  const recs = await db.collection('habit_completions').find({ habitId: row._id, userId }).toArray();
  const rec = new Map();
  for (const r of recs) rec.set(decrypt(r.date), decrypt(r.status));
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
  const id = oid(req.params.id);
  const row = id ? await db.collection('habits').findOne({ _id: id, userId: req.userId }) : null;
  if (!row) { res.status(404).json({ error: 'Habit not found' }); return null; }
  return decryptHabit(row);
};

// ---- AUTH ----
app.post('/api/auth/register', ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
  const em = email.toLowerCase();
  if (await db.collection('users').findOne({ email: em })) return res.status(409).json({ error: 'Email already registered' });
  const r = await db.collection('users').insertOne({
    name: name.trim(), email: em, passwordHash: bcrypt.hashSync(password, 10), timezone: 'Asia/Kolkata', createdAt: new Date(),
  });
  const user = { id: r.insertedId.toString(), name: name.trim(), email: em };
  res.status(201).json({ token: sign(user.id), user });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const row = await db.collection('users').findOne({ email: (email || '').toLowerCase() });
  if (!row || !bcrypt.compareSync(password || '', row.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });
  const user = { id: row._id.toString(), name: row.name, email: row.email };
  res.json({ token: sign(user.id), user });
}));

app.get('/api/auth/me', auth, ah(async (req, res) => {
  const u = await db.collection('users').findOne({ _id: oid(req.userId) }, { projection: { name: 1, email: 1 } });
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: { id: u._id.toString(), name: u.name, email: u.email } });
}));

// ---- HABITS ----
app.get('/api/habits', auth, ah(async (req, res) => {
  const rows = await db.collection('habits').find({ userId: req.userId, status: { $ne: 'ARCHIVED' } }).sort({ _id: 1 }).toArray();
  const habits = [];
  for (const r of rows) {
    const h = decryptHabit(r);
    habits.push({ ...habitJson(h), streak: await getStreaks(h, req.userId) });
  }
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
  const r = await db.collection('habits').insertOne({
    userId: req.userId,
    name: encrypt(name),
    description: encrypt(''),
    color: encrypt(color),
    priority: encrypt(priority),
    scheduleType: encrypt(type),
    daysOfWeek: encrypt(JSON.stringify(days)),
    startDate: encrypt(start),
    status: 'ACTIVE',
    createdAt: new Date(),
  });
  const row = await db.collection('habits').findOne({ _id: r.insertedId });
  res.status(201).json(habitJson(decryptHabit(row)));
}));

app.get('/api/habits/:id', auth, ah(async (req, res) => {
  const row = await getHabit(req, res);
  if (!row) return;
  const tz = await userTimezone(req.userId);
  const today = todayStr(tz);
  const streaks = await getStreaks(row, req.userId);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const monday = addDays(today, -(dow === 0 ? 6 : dow - 1));
  const sunday = addDays(monday, 6);
  const month = +today.slice(5, 7);
  const monthEnd = `${today.slice(0, 7)}-${String(new Date(+today.slice(0, 4), month, 0).getDate()).padStart(2, '0')}`;
  res.json({
    habit: habitJson(row),
    stats: {
      currentStreak: streaks.current,
      bestStreak: streaks.best,
      weekPct: await pctFor(row, req.userId, monday, sunday),
      monthPct: await pctFor(row, req.userId, today.slice(0, 8) + '01', monthEnd),
    },
    history: await monthHistory(row, req.userId),
  });
}));

app.patch('/api/habits/:id', auth, ah(async (req, res) => {
  const row = await getHabit(req, res);
  if (!row) return;
  const b = req.body || {};
  const sched = b.schedule || {};
  const set = {};
  if (b.name !== undefined) set.name = encrypt(String(b.name).trim());
  if (b.color !== undefined) set.color = encrypt(b.color);
  if (b.priority !== undefined) set.priority = encrypt(b.priority);
  if (b.status !== undefined && ['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(b.status)) set.status = b.status;
  if (b.schedule) {
    if (sched.type !== undefined) set.scheduleType = encrypt(sched.type === 'WEEKLY' ? 'WEEKLY' : 'DAILY');
    if (Array.isArray(sched.daysOfWeek)) set.daysOfWeek = encrypt(JSON.stringify(sched.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)));
    if (validDate(sched.startDate)) set.startDate = encrypt(sched.startDate);
  }
  if (Object.keys(set).length) await db.collection('habits').updateOne({ _id: row._id, userId: req.userId }, { $set: set });
  const updated = await db.collection('habits').findOne({ _id: row._id });
  res.json(habitJson(decryptHabit(updated)));
}));

app.delete('/api/habits/:id', auth, ah(async (req, res) => {
  const id = oid(req.params.id);
  const r = await db.collection('habits').deleteOne({ _id: id, userId: req.userId });
  if (!r.deletedCount) return res.status(404).json({ error: 'Habit not found' });
  await db.collection('habit_completions').deleteMany({ habitId: id });
  res.status(204).end();
}));

// ---- COMPLETIONS ----
const dateOf = req => validDate((req.body || {}).date) ? req.body.date : null;

app.post('/api/habits/:id/complete', auth, ah(async (req, res) => {
  const id = oid(req.params.id);
  const row = id ? await db.collection('habits').findOne({ _id: id, userId: req.userId }, { projection: { _id: 1 } }) : null;
  if (!row) return res.status(404).json({ error: 'Habit not found' });
  const date = dateOf(req) || todayStr(await userTimezone(req.userId));
  const dateTag = tag(row._id, date);
  await db.collection('habit_completions').updateOne(
    { habitId: row._id, dateTag },
    { $set: { userId: req.userId, date: encrypt(date), dateTag, status: encrypt('COMPLETED') } },
    { upsert: true }
  );
  res.json({ status: 'COMPLETED' });
}));

app.post('/api/habits/:id/skip', auth, ah(async (req, res) => {
  const id = oid(req.params.id);
  const row = id ? await db.collection('habits').findOne({ _id: id, userId: req.userId }, { projection: { _id: 1 } }) : null;
  if (!row) return res.status(404).json({ error: 'Habit not found' });
  const date = dateOf(req) || todayStr(await userTimezone(req.userId));
  const dateTag = tag(row._id, date);
  await db.collection('habit_completions').updateOne(
    { habitId: row._id, dateTag },
    { $set: { userId: req.userId, date: encrypt(date), dateTag, status: encrypt('SKIPPED') } },
    { upsert: true }
  );
  res.json({ status: 'SKIPPED' });
}));

app.delete('/api/habits/:id/completion', auth, ah(async (req, res) => {
  const id = oid(req.params.id);
  const date = dateOf(req) || todayStr(await userTimezone(req.userId));
  await db.collection('habit_completions').deleteOne({ habitId: id, userId: req.userId, dateTag: tag(id, date) });
  res.status(204).end();
}));

// ---- DASHBOARD ----
app.get('/api/dashboard/today', auth, ah(async (req, res) => {
  const tz = await userTimezone(req.userId);
  const today = todayStr(tz);
  const yest = addDays(today, -1);
  const rows = await db.collection('habits').find({ userId: req.userId, status: 'ACTIVE' }).toArray();
  const allRecs = await db.collection('habit_completions').find({ userId: req.userId }).toArray();
  const todayMap = new Map();
  let yestDone = 0;
  for (const r of allRecs) {
    const date = decrypt(r.date);
    const status = decrypt(r.status);
    if (date === today) todayMap.set(r.habitId.toString(), status);
    if (date === yest && status === 'COMPLETED') yestDone++;
  }
  const habits = [];
  for (const r of rows) {
    const h = decryptHabit(r);
    if (!isScheduled(h, today)) continue;
    habits.push({ ...habitJson(h), todayStatus: todayMap.get(h._id.toString()) || 'PENDING', streak: await getStreaks(h, req.userId) });
  }
  const completed = habits.filter(h => h.todayStatus === 'COMPLETED').length;
  const scheduled = habits.length;
  const tasks = (await db.collection('tasks').find({ userId: req.userId }).toArray())
    .map(t => ({ ...t, title: decrypt(t.title), priority: decrypt(t.priority), dueDate: decrypt(t.dueDate), status: decrypt(t.status) }))
    .filter(t => !t.dueDate || t.dueDate === today)
    .sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || b.createdAt - a.createdAt)
    .map(t => ({ id: t._id.toString(), title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate }));
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
}));

// ---- TASKS ----
app.post('/api/tasks', auth, ah(async (req, res) => {
  const { title, priority, dueDate } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const p = ['HIGH', 'MEDIUM', 'LOW'].includes(priority) ? priority : 'MEDIUM';
  const due = validDate(dueDate) ? dueDate : null;
  const r = await db.collection('tasks').insertOne({
    userId: req.userId, title: encrypt(title.trim()), priority: encrypt(p), dueDate: due ? encrypt(due) : null, status: encrypt('OPEN'), createdAt: new Date(),
  });
  const row = await db.collection('tasks').findOne({ _id: r.insertedId });
  res.status(201).json({ id: row._id.toString(), title: decrypt(row.title), priority: decrypt(row.priority), status: decrypt(row.status), dueDate: row.dueDate ? decrypt(row.dueDate) : null });
}));

app.patch('/api/tasks/:id', auth, ah(async (req, res) => {
  const b = req.body || {};
  const set = {};
  if (b.status !== undefined) set.status = encrypt(b.status === 'DONE' ? 'DONE' : 'OPEN');
  if (b.title !== undefined) set.title = encrypt(String(b.title).trim());
  if (b.priority !== undefined) set.priority = encrypt(b.priority);
  if (!Object.keys(set).length) return res.status(400).json({ error: 'Nothing to update' });
  const r = await db.collection('tasks').findOneAndUpdate({ _id: oid(req.params.id), userId: req.userId }, { $set: set }, { returnDocument: 'after' });
  if (!r) return res.status(404).json({ error: 'Task not found' });
  res.json({ id: r._id.toString(), title: decrypt(r.title), priority: decrypt(r.priority), status: decrypt(r.status), dueDate: r.dueDate ? decrypt(r.dueDate) : null });
}));

app.delete('/api/tasks/:id', auth, ah(async (req, res) => {
  const r = await db.collection('tasks').deleteOne({ _id: oid(req.params.id), userId: req.userId });
  if (!r.deletedCount) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
}));

// ---- CALENDAR ----
app.get('/api/calendar/month', auth, ah(async (req, res) => {
  const now = todayStr(await userTimezone(req.userId));
  const year = parseInt(req.query.year, 10) || +now.slice(0, 4);
  const qm = parseInt(req.query.month, 10);
  const m = Number.isInteger(qm) && qm >= 0 && qm <= 11 ? qm : +now.slice(5, 7) - 1;
  const rows = await db.collection('habits').find({ userId: req.userId, status: 'ACTIVE' }).toArray();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const key = `${year}-${String(m + 1).padStart(2, '0')}`;
  const start = `${key}-01`;
  const end = `${key}-${String(daysInMonth).padStart(2, '0')}`;
  const allRecs = await db.collection('habit_completions').find({ userId: req.userId }).toArray();
  const doneByDate = new Map();
  for (const r of allRecs) {
    if (decrypt(r.status) !== 'COMPLETED') continue;
    const date = decrypt(r.date);
    if (date >= start && date <= end) doneByDate.set(date, (doneByDate.get(date) || 0) + 1);
  }
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${key}-${String(d).padStart(2, '0')}`;
    const scheduled = rows.filter(h => isScheduled(decryptHabit(h), date)).length;
    const completed = doneByDate.get(date) || 0;
    days.push({ date, scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 });
  }
  res.json({ days });
}));

app.get('/api/calendar/year', auth, ah(async (req, res) => {
  const now = todayStr(await userTimezone(req.userId));
  const year = parseInt(req.query.year, 10) || +now.slice(0, 4);
  const rows = await db.collection('habits').find({ userId: req.userId, status: 'ACTIVE' }).toArray();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const allRecs = await db.collection('habit_completions').find({ userId: req.userId }).toArray();
  const doneByDate = new Map();
  for (const r of allRecs) {
    if (decrypt(r.status) !== 'COMPLETED') continue;
    const date = decrypt(r.date);
    if (date >= start && date <= end) doneByDate.set(date, (doneByDate.get(date) || 0) + 1);
  }
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const scheduled = rows.filter(h => isScheduled(decryptHabit(h), d)).length;
    const completed = doneByDate.get(d) || 0;
    days.push({ date: d, scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 });
  }
  res.json({ days });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});