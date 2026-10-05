import { MongoClient, ObjectId } from 'mongodb';
import { decrypt } from './enc.js';

const url = process.env.MONGO_URL;
if (!url) throw new Error('MONGO_URL environment variable is required');

export const client = new MongoClient(url, { appName: 'habbit-tracker', monitorCommands: true, maxPoolSize: 5, minPoolSize: 1 });
await client.connect();
export const db = client.db('habbit');

await db.collection('users').createIndex({ email: 1 }, { unique: true });
await db.collection('auth_attempts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 });
await db.collection('habit_completions').createIndex({ habitId: 1, dateTag: 1 }, { unique: true })
  .catch(() => console.warn('dateTag index deferred: legacy completions present, run migrate-encrypt.js'));
await db.collection('habit_completions').createIndex({ userId: 1 });
await db.collection('habits').createIndex({ userId: 1 });
await db.collection('tasks').createIndex({ userId: 1 });
await db.collection('goals').createIndex({ userId: 1 });
await db.collection('goal_checkins').createIndex({ goalId: 1, dateTag: 1 }, { unique: true }).catch(() => console.warn('goal dateTag index deferred'));
await db.collection('goal_checkins').createIndex({ userId: 1 });

export const oid = id => {
  try { return new ObjectId(id); } catch { return null; }
};

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const todayStr = (tz = 'Asia/Kolkata') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function userTimezone(userId) {
  const u = await db.collection('users').findOne({ _id: oid(userId) });
  return u?.timezone || 'Asia/Kolkata';
}

export const isScheduled = (habit, dateStr) => {
  if (dateStr < habit.startDate) return false;
  if (habit.scheduleType === 'DAILY') return true;
  return (habit.daysOfWeek || []).includes(new Date(dateStr + 'T00:00:00Z').getUTCDay());
};

export function calcStreaks(habit, rec, today) {
  let current = 0;
  for (let d = today; d >= habit.startDate; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    const s = rec.get(d);
    if (s === 'COMPLETED') current++;
    else if (s !== 'SKIPPED') break;
  }
  let best = 0, run = 0;
  for (let d = habit.startDate; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(habit, d)) continue;
    if (rec.get(d) === 'COMPLETED') { run++; if (run > best) best = run; }
    else run = 0;
  }
  return { current, best };
}

export async function getStreaks(habit, userId, today = todayStr()) {
  const recs = await db.collection('habit_completions').find({ habitId: habit._id, userId }).toArray();
  return calcStreaks(habit, new Map(recs.map(r => [decrypt(r.date), decrypt(r.status)])), today);
}

const parseDays = v => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return []; }
  }
  return [];
};

export const decryptHabit = r => ({
  ...r,
  name: decrypt(r.name),
  description: decrypt(r.description),
  color: decrypt(r.color),
  priority: decrypt(r.priority),
  scheduleType: decrypt(r.scheduleType),
  daysOfWeek: parseDays(decrypt(r.daysOfWeek)),
  startDate: decrypt(r.startDate),
});

export const habitJson = r => ({
  id: r._id.toString(),
  name: r.name,
  description: r.description,
  color: r.color,
  priority: r.priority,
  schedule: { type: r.scheduleType, daysOfWeek: r.daysOfWeek || [], startDate: r.startDate },
  status: r.status,
});

export const decryptGoal = r => ({
  _id: r._id,
  userId: r.userId,
  title: decrypt(r.title),
  durationDays: r.durationDays,
  startDate: decrypt(r.startDate),
  status: r.status,
  position: r.position,
});

export const goalJson = (g, checked, today) => {
  const endDate = addDays(g.startDate, g.durationDays - 1);
  const days = [];
  let checkedDays = 0;
  let daysLeft = 0;
  let todayChecked = false;
  for (let d = g.startDate; d <= endDate; d = addDays(d, 1)) {
    const isChecked = checked.has(d);
    if (isChecked) checkedDays++;
    if (d > today) daysLeft++;
    if (d === today) todayChecked = isChecked;
    days.push({ date: d, checked: isChecked, future: d > today });
  }
  return {
    id: g._id.toString(),
    title: g.title,
    durationDays: g.durationDays,
    startDate: g.startDate,
    endDate,
    status: g.status,
    todayChecked,
    checkedDays,
    totalDays: g.durationDays,
    pct: g.durationDays ? Math.round((checkedDays / g.durationDays) * 100) : 0,
    daysLeft,
    achieved: checkedDays >= g.durationDays,
    days,
  };
};