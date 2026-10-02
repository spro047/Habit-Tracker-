import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store.jsx';
import { Err, COLORS, ThemePicker } from '../components.jsx';

const MODE_BTN = 'border-[3px] border-ink font-bold uppercase tracking-wider text-sm py-2.5 cursor-pointer';
const MODE_ACTIVE = 'bg-ink text-bg';
const MODE_IDLE = 'bg-card text-ink';

export default function Login() {
  const { login, register, googleLogin } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    api('/api/auth/google-config')
      .then(({ clientId: cid }) => {
        if (cancelled || !cid) return;
        setClientId(cid);
        const init = () => {
          if (!window.google?.accounts?.id) return false;
          window.google.accounts.id.initialize({
            client_id: cid,
            callback: async ({ credential }) => {
              setErr('');
              try {
                await googleLogin(credential);
              } catch (ex) {
                setErr(ex.message);
              }
            },
          });
          if (btnRef.current) {
            window.google.accounts.id.renderButton(btnRef.current, { theme: 'outline', size: 'large', text: 'continue_with' });
          }
          return true;
        };
        if (!init()) timer = setTimeout(init, 1500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const submit = async e => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="neo-card w-full max-w-md">
        <div className="border-b-[3px] border-ink p-5">
          <div className="flex gap-1.5 mb-4 items-center justify-between">
            <div className="flex gap-1.5">
              {COLORS.map(c => (
                <span key={c} className="w-8 h-3 border-2 border-ink" style={{ background: c }} aria-hidden="true" />
              ))}
            </div>
            <ThemePicker />
          </div>
          <h1 className="font-display text-3xl leading-none">
            HABIT<span className="text-primary">/</span>TRACKER
          </h1>
          <p className="font-bold uppercase text-xs tracking-widest text-ink/60 mt-2">Build consistency. Track everything.</p>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button type="button" className={`${MODE_BTN} ${mode === 'login' ? MODE_ACTIVE : MODE_IDLE}`} onClick={() => { setMode('login'); setErr(''); }} aria-pressed={mode === 'login'}>
              LOG IN
            </button>
            <button type="button" className={`${MODE_BTN} ${mode === 'register' ? MODE_ACTIVE : MODE_IDLE}`} onClick={() => { setMode('register'); setErr(''); }} aria-pressed={mode === 'register'}>
              CREATE ACCOUNT
            </button>
          </div>

          <Err msg={err} />

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="neo-label" htmlFor="lname">NAME</label>
                <input id="lname" className="neo-input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required disabled={busy} />
              </div>
            )}
            <div>
              <label className="neo-label" htmlFor="lemail">EMAIL</label>
              <input id="lemail" type="email" className="neo-input" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required disabled={busy} />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="neo-label" htmlFor="lpass">PASSWORD</label>
                <button type="button" className="neo-tag bg-card cursor-pointer mb-1" onClick={() => setShow(s => !s)} aria-pressed={show}>
                  {show ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              <input
                id="lpass"
                type={show ? 'text' : 'password'}
                className="neo-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                disabled={busy}
              />
            </div>
            <button type="submit" className="neo-btn w-full" disabled={busy}>
              {busy ? 'WAIT…' : mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
            </button>
          </form>

          {clientId && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex-1 border-t-2 border-ink/30" aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink/50">OR</span>
                <span className="flex-1 border-t-2 border-ink/30" aria-hidden="true" />
              </div>
              <div ref={btnRef} className="w-full flex justify-center" />
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-ink/40">Habit Tracker v1 · Neo-Brutalist</p>
    </div>
  );
}