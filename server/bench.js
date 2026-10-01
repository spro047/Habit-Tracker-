import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';
import { app } from './app.js';
import { db, client, oid } from './db.js';
import { encrypt, tag } from './enc.js';

let ops = 0;
client.on('commandStarted', () => ops++);

const pingMs = await (async () => {
  const t = performance.now();
  await client.db().command({ ping: 1 });
  return Math.round(performance.now() - t);
})();
console.log(`Mongo ping: ${pingMs}ms`);

const email = 'bench@example.com';
const existing = await db.collection('users').findOne({ email });
if (existing) {
  await db.collection('habit_completions').deleteMany({ userId: existing._id.toString() });
  await db.collection('habits').deleteMany({ userId: existing._id.toString() });
  await db.collection('tasks').deleteMany({ userId: existing._id.toString() });
  await db.collection('users').deleteOne({ _id: existing._id });
}
const u = await db.collection('users').insertOne({ name: 'Bench', email, passwordHash: bcrypt.hashSync('benchpass', 10), timezone: 'Asia/Kolkata', createdAt: new Date() });
const userId = u.insertedId.toString();

const mk = async (name, type, days) => {
  const r = await db.collection('habits').insertOne({
    userId, name: encrypt(name), description: encrypt(''), color: encrypt('#059669'), priority: encrypt('MEDIUM'),
    scheduleType: encrypt(type), daysOfWeek: encrypt(JSON.stringify(days)), startDate: encrypt('2026-06-01'), status: 'ACTIVE', createdAt: new Date(),
  });
  return r.insertedId;
};
const ids = [await mk('Alpha', 'DAILY', []), await mk('Beta', 'DAILY', []), await mk('Gamma', 'DAILY', []), await mk('Delta', 'WEEKLY', [1, 3, 5])];
const bulk = [];
for (const id of ids) {
  for (let i = 0; i < 120; i++) {
    const date = `2026-${String(6 + Math.floor(i / 31)).padStart(2, '0')}-${String((i % 31) + 1).padStart(2, '0')}`;
    if (date > '2026-09-28') continue;
    bulk.push({ insertOne: { document: { habitId: id, userId, dateTag: tag(id, date), date: encrypt(date), status: encrypt(i % 7 === 3 ? 'SKIPPED' : 'COMPLETED') } } });
  }
}
await db.collection('habit_completions').bulkWrite(bulk);
console.log(`Seeded ${bulk.length} completions`);

const server = app.listen(3901);
const base = 'http://localhost:3901';
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'benchpass' }) })).json();
const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };

async function bench(label, url, n = 5) {
  await fetch(url, { headers: h }).then(r => r.json());
  const times = [];
  let opsLast = 0;
  for (let i = 0; i < n; i++) {
    ops = 0;
    const t = performance.now();
    await fetch(url, { headers: h }).then(r => r.json());
    times.push(performance.now() - t);
    opsLast = ops;
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / n);
  console.log(`${label.padEnd(24)} avg ${String(avg).padStart(5)}ms   db ops ${opsLast}`);
}

await bench('dashboard/today', `${base}/api/dashboard/today`);
await bench('habits (list)', `${base}/api/habits`);
await bench('habit detail', `${base}/api/habits/${ids[0]}`);
await bench('calendar/month', `${base}/api/calendar/month?year=2026&month=8`);
await bench('calendar/year', `${base}/api/calendar/year?year=2026`);

await db.collection('habit_completions').deleteMany({ userId });
await db.collection('habits').deleteMany({ userId });
await db.collection('users').deleteOne({ _id: oid(userId) });
console.log('cleaned up');
server.close();
await client.close();
process.exit(0);