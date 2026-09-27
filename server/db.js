import { MongoClient, ObjectId } from 'mongodb';

const url = process.env.MONGO_URL;
if (!url) throw new Error('MONGO_URL environment variable is required');

export const client = new MongoClient(url, { appName: 'habbit-tracker' });
await client.connect();
export const db = client.db('habbit');

await db.collection('users').createIndex({ email: 1 }, { unique: true });
await db.collection('habit_completions').createIndex({ habitId: 1, date: 1 }, { unique: true });
await db.collection('habits').createIndex({ userId: 1 });
await db.collection('tasks').createIndex({ userId: 1 });

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

export async function getStreaks(habit, userId) {
  const today = todayStr(await userTimezone(userId));
  const recs = await db.collection('habit_completions').find({ habitId: habit._id, userId }).toArray();
  const rec = new Map(recs.map(r => [r.date, r.status]));
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

export const habitJson = r => ({
  id: r._id.toString(),
  name: r.name,
  description: r.description,
  color: r.color,
  priority: r.priority,
  schedule: { type: r.scheduleType, daysOfWeek: r.daysOfWeek || [], startDate: r.startDate },
  status: r.status,
});