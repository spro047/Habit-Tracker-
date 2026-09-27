import { useState } from 'react';
import { useAuth } from '../store.jsx';
import { Err } from '../components.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="neo-card p-6 w-full max-w-sm">
        <h1 className="font-display text-2xl mb-1">
          HABIT<span className="text-primary">/</span>TRACKER
        </h1>
        <p className="font-bold uppercase text-xs mb-5 text-ink/60">Build consistency. Track everything.</p>
        <Err msg={err} />
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="neo-label" htmlFor="lname">NAME</label>
              <input id="lname" className="neo-input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="neo-label" htmlFor="lemail">EMAIL</label>
            <input id="lemail" type="email" className="neo-input" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="neo-label" htmlFor="lpass">PASSWORD</label>
            <input id="lpass" type="password" className="neo-input" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button type="submit" className="neo-btn w-full" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
          </button>
        </form>
        <div className="flex gap-2 mt-4">
          <button type="button" className={`neo-tag flex-1 cursor-pointer ${mode === 'login' ? 'bg-primary' : 'bg-white'}`} onClick={() => { setMode('login'); setErr(''); }}>
            LOGIN
          </button>
          <button type="button" className={`neo-tag flex-1 cursor-pointer ${mode === 'register' ? 'bg-primary' : 'bg-white'}`} onClick={() => { setMode('register'); setErr(''); }}>
            REGISTER
          </button>
        </div>
        <p className="text-xs font-bold uppercase mt-4 text-ink/50">Demo: shashank@demo.com / demo1234</p>
      </div>
    </div>
  );
}