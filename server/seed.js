import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import { db, addDays, todayStr, getStreaks, isScheduled } from './db.js';

const demoEmail = 'shashank@demo.com';

// Idempotent: remove previous demo user + their data
const existing = db.prepare('SELECT id FROM users WHERE email=?').get(demoEmail);
if (existing) {
  db.prepare('DELETE FROM habit_completions WHERE user_id=?').run(existing.id);
  db.prepare('DELETE FROM tasks WHERE user_id=?').run(existing.id);
  db.prepare('DELETE FROM habits WHERE user_id=?').run(existing.id);
  db.prepare('DELETE FROM users WHERE id=?').run(existing.id);
}

const info = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)').run('Shashank', demoEmail, bcrypt.hashSync('demo1234', 10));
const userId = info.lastInsertRowid;

const mk = (name, color, priority, schedule_type, days_of_week) => {
  const r = db.prepare('INSERT INTO habits (user_id,name,color,priority,schedule_type,days_of_week,start_date) VALUES (?,?,?,?,?,?,?)')
    .run(userId, name, color, priority, schedule_type, JSON.stringify(days_of_week), addDays(todayStr(), -60));
  return db.prepare('SELECT * FROM habits WHERE id=?').get(r.lastInsertRowid);
};

const study = mk('Study DSA', '#D97706', 'HIGH', 'DAILY', []);
const read = mk('Read', '#059669', 'MEDIUM', 'DAILY', []);
const exercise = mk('Exercise', '#DC2626', 'HIGH', 'WEEKLY', [1, 3, 5]);
const meditate = mk('Meditate', '#8B5CF6', 'MEDIUM', 'DAILY', []);

// Deterministic backfill: i = 0..59 (i=0 is 60 days ago, i=59 is yesterday). Today stays unseeded (PENDING).
const gaps = {
  [study.id]: new Set([4, 19, 34]),   // -> best run = days 35..59 = 25
  [read.id]: new Set([8, 45]),        // -> best run = days 9..29 = 21 (SKIPPED at 30 resets)
  [meditate.id]: new Set([3, 7, 11, 20, 31, 50]), // -> best run = days 32..49 = 18
};
const readSkips = new Set([30]);
const exerciseMiss = new Set([13, 41]);
const exerciseSkip = new Set([28]);

const start = addDays(todayStr(), -60);
const ins = db.prepare('INSERT OR IGNORE INTO habit_completions (habit_id,user_id,date,status) VALUES (?,?,?,?)');
for (let i = 0; i < 60; i++) {
  const date = addDays(start, i);
  for (const h of [study, read, exercise, meditate]) {
    if (h.id === exercise.id) {
      if (!isScheduled(h, date)) continue;
      if (exerciseMiss.has(i)) continue; // MISSED
      ins.run(h.id, userId, date, exerciseSkip.has(i) ? 'SKIPPED' : 'COMPLETED');
    } else {
      if (gaps[h.id].has(i)) continue; // MISSED
      ins.run(h.id, userId, date, h.id === read.id && readSkips.has(i) ? 'SKIPPED' : 'COMPLETED');
    }
  }
}

const s = { study: getStreaks(study, userId), read: getStreaks(read, userId), exercise: getStreaks(exercise, userId), meditate: getStreaks(meditate, userId) };
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
  const rec = db.prepare('SELECT status FROM habit_completions WHERE habit_id=? AND date=?').get(exercise.id, d);
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