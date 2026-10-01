import { encrypt, decrypt, tag } from './enc.js';
import { client, db } from './db.js';

let habits = 0, completions = 0, tasks = 0;

for (const h of await db.collection('habits').find({}).toArray()) {
  const set = {};
  for (const f of ['name', 'description', 'color', 'priority', 'scheduleType', 'startDate']) {
    if (typeof h[f] === 'string' && !h[f].startsWith('enc:')) set[f] = encrypt(h[f]);
  }
  const days = h.daysOfWeek;
  if (!(typeof days === 'string' && days.startsWith('enc:'))) set.daysOfWeek = encrypt(JSON.stringify(Array.isArray(days) ? days : []));
  if (Object.keys(set).length) {
    await db.collection('habits').updateOne({ _id: h._id }, { $set: set });
    habits++;
  }
}

for (const c of await db.collection('habit_completions').find({}).toArray()) {
  const set = {};
  if (typeof c.date === 'string' && !c.date.startsWith('enc:')) set.date = encrypt(c.date);
  if (typeof c.status === 'string' && !c.status.startsWith('enc:')) set.status = encrypt(c.status);
  if (!c.dateTag) set.dateTag = tag(c.habitId, decrypt(c.date));
  if (Object.keys(set).length) {
    await db.collection('habit_completions').updateOne({ _id: c._id }, { $set: set });
    completions++;
  }
}

for (const t of await db.collection('tasks').find({}).toArray()) {
  const set = {};
  for (const f of ['title', 'priority', 'status']) {
    if (typeof t[f] === 'string' && !t[f].startsWith('enc:')) set[f] = encrypt(t[f]);
  }
  if (t.dueDate !== null && t.dueDate !== undefined && !(typeof t.dueDate === 'string' && t.dueDate.startsWith('enc:'))) set.dueDate = encrypt(t.dueDate);
  if (Object.keys(set).length) {
    await db.collection('tasks').updateOne({ _id: t._id }, { $set: set });
    tasks++;
  }
}

console.log(`Encrypted: ${habits} habits, ${completions} completions, ${tasks} tasks`);
await db.collection('habit_completions').dropIndex('habitId_1_date_1').catch(() => {});
console.log('Dropped legacy (habitId,date) unique index; dateTag unique index will build on next boot');
await client.close();