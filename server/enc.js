import crypto from 'node:crypto';

if (!process.env.HABIT_ENC_KEY) throw new Error('HABIT_ENC_KEY environment variable is required');
const key = crypto.createHash('sha256').update(process.env.HABIT_ENC_KEY).digest();

export const encrypt = v => {
  if (v === null || v === undefined) return v;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(v), 'utf8'), cipher.final()]);
  return 'enc:' + Buffer.concat([iv, enc, cipher.getAuthTag()]).toString('base64');
};

export const decrypt = v => {
  if (typeof v !== 'string' || !v.startsWith('enc:')) return v;
  try {
    const buf = Buffer.from(v.slice(4), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(buf.length - 16));
    return decipher.update(buf.subarray(12, buf.length - 16), null, 'utf8') + decipher.final('utf8');
  } catch {
    return v;
  }
};

export const tag = (habitId, date) =>
  crypto.createHmac('sha256', key).update(String(habitId) + '|' + date).digest('hex');