import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import { client, db, addDays, todayStr, getStreaks, isScheduled } from './db.js';

const demoEmail = 'shashank@demo.com';

const existing = await db.collection('users').findOne({ email: demoEmail });
if (existing) {
  await db.collection('habit_completions').deleteMany({ userId: existing._id.toString() });
  await db.collection('habits').deleteMany({ userId: existing._id.toString() });
  await db.collection('tasks').deleteMany({ userId: existing._id.toString() });
  await db.collection('users').deleteOne({ _id: existing._id });
}

const user = await db.collection('users').insertOne({
  name: 'Shashank', email: demoEmail, passwordHash: bcrypt.hashSync('demo1234', 10), timezone: 'Asia/Kolkata', createdAt: new Date(),
});
const userId = user.insertedId.toString();

const mk = async (name, color, priority, scheduleType, daysOfWeek) => {
  const r = await db.collection('habits').insertOne({
    userId, name, description: '', color, priority, scheduleType, daysOfWeek, startDate: addDays(todayStr(), -60), status: 'ACTIVE', createdAt: new Date(),
  });
  return db.collection('habits').findOne({ _id: r.insertedId });
};

const study = await mk('Study DSA', '#D97706', 'HIGH', 'DAILY', []);
const read = await mk('Read', '#059669', 'MEDIUM', 'DAILY', []);
const exercise = await mk('Exercise', '#DC2626', 'HIGH', 'WEEKLY', [1, 3, 5]);
const meditate = await mk('Meditate', '#8B5CF6', 'MEDIUM', 'DAILY', []);

const gaps = {
  [study._id.toString()]: new Set([4, 19, 34]),
  [read._id.toString()]: new Set([8, 45]),
  [meditate._id.toString()]: new Set([3, 7, 11, 20, 31, 50]),
};
const readSkips = new Set([30]);
const exerciseMiss = new Set([13, 41]);
const exerciseSkip = new Set([28]);

const start = addDays(todayStr(), -60);
const completions = db.collection('habit_completions');
for (let i = 0; i < 60; i++) {
  const date = addDays(start, i);
  for (const h of [study, read, exercise, meditate]) {
    if (h._id.equals(exercise._id)) {
      if (!isScheduled(h, date)) continue;
      if (exerciseMiss.has(i)) continue;
      await completions.insertOne({ habitId: h._id, userId, date, status: exerciseSkip.has(i) ? 'SKIPPED' : 'COMPLETED' });
    } else {
      if (gaps[h._id.toString()].has(i)) continue;
      await completions.insertOne({ habitId: h._id, userId, date, status: h._id.equals(read._id) && readSkips.has(i) ? 'SKIPPED' : 'COMPLETED' });
    }
  }
}

const s = {
  study: await getStreaks(study, userId),
  read: await getStreaks(read, userId),
  exercise: await getStreaks(exercise, userId),
  meditate: await getStreaks(meditate, userId),
};
assert.equal(s.study.best, 25, 'Study DSA best streak = 25 (run days 35..59)');
assert.equal(s.read.best, 21, 'Read best streak = 21 (run days 9..29; SKIPPED at 30 resets run)');
assert.equal(s.meditate.best, 18, 'Meditate best streak = 18 (run days 32..49)');
for (const k of ['study', 'read', 'meditate']) {
  assert.equal(s[k].current, 0, `${k}: current = 0 while today is scheduled but unseeded`);
}

const wd = date => new Date(date + 'T00:00:00Z').getUTCDay();
let run = 0, expBest = 0;
for (let i = 0; i < 60; i++) {
  const date = addDays(start, i);
  if (![1, 3, 5].includes(wd(date))) continue;
  if (exerciseMiss.has(i) || exerciseSkip.has(i)) { run = 0; continue; }
  run++; expBest = Math.max(expBest, run);
}
let expCurrent = 0;
for (let d = todayStr(); d >= addDays(todayStr(), -60); d = addDays(d, -1)) {
  if (![1, 3, 5].includes(wd(d))) continue;
  const rec = await completions.findOne({ habitId: exercise._id, date: d });
  if (!rec) break;
  if (rec.status === 'COMPLETED') expCurrent++;
}
assert.equal(s.exercise.best, expBest, 'Exercise best = independent oracle');
assert.equal(s.exercise.current, expCurrent, 'Exercise current = independent oracle');

console.log('SEEDED demo user: shashank@demo.com / demo1234');
console.log('Streaks (today unseeded):');
for (const [h, st] of [[study, s.study], [read, s.read], [exercise, s.exercise], [meditate, s.meditate]])
  console.log(`  ${h.name.padEnd(12)} current=${st.current}  best=${st.best}`);
console.log('All engine assertions passed.');

await client.close();