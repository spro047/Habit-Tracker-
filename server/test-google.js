import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { app, upsertGoogleUser } from './app.js';
import { db, client } from './db.js';

const cleanup = async email => {
  const u = await db.collection('users').findOne({ email });
  if (u) {
    await db.collection('habit_completions').deleteMany({ userId: u._id.toString() });
    await db.collection('habits').deleteMany({ userId: u._id.toString() });
    await db.collection('tasks').deleteMany({ userId: u._id.toString() });
    await db.collection('users').deleteOne({ _id: u._id });
  }
};

// A: create user from Google payload
await cleanup('gtest1@example.com');
const u1 = await upsertGoogleUser({ email: 'GTEST1@example.com', name: 'G One', email_verified: true });
assert.equal(u1.email, 'gtest1@example.com', 'email lowercased');
assert.equal(u1.passwordHash, null, 'google user has no password');
assert.equal(u1.name, 'G One', 'name from payload');

// B: idempotent find-or-create
const u1b = await upsertGoogleUser({ email: 'gtest1@example.com', name: 'Different' });
assert.equal(u1b._id.toString(), u1._id.toString(), 'second call returns same user');

// C: password user links with Google (same email)
await cleanup('gtest2@example.com');
const pw = await db.collection('users').insertOne({ name: 'P W', email: 'gtest2@example.com', passwordHash: bcrypt.hashSync('pw1234', 10), timezone: 'Asia/Kolkata', createdAt: new Date() });
const linked = await upsertGoogleUser({ email: 'gtest2@example.com', name: 'Google Name', email_verified: true });
assert.equal(linked._id.toString(), pw.insertedId.toString(), 'google login links to existing password account');
assert.ok(linked.passwordHash, 'password hash preserved when linking');

// server for endpoint tests
const server = app.listen(3903);
const base = 'http://localhost:3903';
const j = r => r.json();

// D: google-config endpoint
const cfg = await j(await fetch(`${base}/api/auth/google-config`));
assert.ok('clientId' in cfg, 'google-config returns clientId field');

// E: garbage credential -> 401
const bad = await fetch(`${base}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'definitely-not-a-google-token' }) });
assert.equal(bad.status, 401, 'forged token rejected');

// F: password login works for linked account; google-only user rejects password login
const pwLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'gtest2@example.com', password: 'pw1234' }) });
assert.equal(pwLogin.status, 200, 'linked account still logs in with password');
const gOnly = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'gtest1@example.com', password: 'whatever' }) });
assert.equal(gOnly.status, 401, 'google-only account rejects password login');
const gMsg = await j(gOnly);
assert.match(gMsg.error, /Google sign-in/, 'clear message for google-only account');

console.log('All google-auth tests passed.');
server.close();
await cleanup('gtest1@example.com');
await cleanup('gtest2@example.com');
await client.close();
process.exit(0);