import assert from 'node:assert/strict';
import { sql, addDays, todayStr, getStreaks, isScheduled, DEFAULT_USER_EMAIL } from './db.js';

const demoEmail = DEFAULT_USER_EMAIL;

await sql`DELETE FROM users WHERE email = ${demoEmail}`;

const userRows = await sql`INSERT INTO users (name, email, password_hash) VALUES ('Shashank', ${demoEmail}, '') RETURNING id`;
const userId = userRows[0].id;

const mk = async (name, color, priority, schedule_type, days_of_week) => {
  const r = await sql`INSERT INTO habits (user_id, name, color, priority, schedule_type, days_of_week, start_date) VALUES (${userId}, ${name}, ${color}, ${priority}, ${schedule_type}, ${JSON.stringify(days_of_week)}, ${addDays(todayStr(), -60)}) RETURNING id, schedule_type, days_of_week, start_date::text AS start_date`;
  return r[0];
};

const study = await mk('Study DSA', '#D97706', 'HIGH', 'DAILY', []);
const read = await mk('Read', '#059669', 'MEDIUM', 'DAILY', []);
const exercise = await mk('Exercise', '#DC2626', 'HIGH', 'WEEKLY', [1, 3, 5]);
const meditate = await mk('Meditate', '#8B5CF6', 'MEDIUM', 'DAILY', []);

const gaps = {
  [study.id]: new Set([4, 19, 34]),
  [read.id]: new Set([8, 45]),
  [meditate.id]: new Set([3, 7, 11, 20, 31, 50]),
};
const readSkips = new Set([30]);
const exerciseMiss = new Set([13, 41]);
const exerciseSkip = new Set([28]);

const start = addDays(todayStr(), -60);
for (let i = 0; i < 60; i++) {
  const date = addDays(start, i);
  for (const h of [study, read, exercise, meditate]) {
    if (h.id === exercise.id) {
      if (!isScheduled(h, date)) continue;
      if (exerciseMiss.has(i)) continue;
      await sql`INSERT INTO habit_completions (habit_id, user_id, date, status) VALUES (${h.id}, ${userId}, ${date}, ${exerciseSkip.has(i) ? 'SKIPPED' : 'COMPLETED'}) ON CONFLICT (habit_id, date) DO NOTHING`;
    } else {
      if (gaps[h.id].has(i)) continue;
      await sql`INSERT INTO habit_completions (habit_id, user_id, date, status) VALUES (${h.id}, ${userId}, ${date}, ${h.id === read.id && readSkips.has(i) ? 'SKIPPED' : 'COMPLETED'}) ON CONFLICT (habit_id, date) DO NOTHING`;
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
  const recs = await sql`SELECT status FROM habit_completions WHERE habit_id = ${exercise.id} AND date = ${d}`;
  const rec = recs[0];
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

await sql.end();