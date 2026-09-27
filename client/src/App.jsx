import { useState } from 'react';
import { AuthProvider, useAuth } from './store.jsx';
import { useRoute, navigate } from './router.jsx';
import { api } from './api.js';
import { Modal, HabitForm, TaskForm, Loading } from './components.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Habits from './pages/Habits.jsx';
import Calendar from './pages/Calendar.jsx';
import HabitDetail from './pages/HabitDetail.jsx';

const TABS = [
  { key: 'home', label: 'HOME' },
  { key: 'habits', label: 'HABITS' },
  { key: 'calendar', label: 'CALENDAR' },
];

function Shell() {
  const { user, logout } = useAuth();
  const route = useRoute();
  const [addOpen, setAddOpen] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey(k => k + 1);

  const active = route.path === 'habits' ? 'habits' : route.path === 'calendar' ? 'calendar' : 'home';
  const view =
    route.path === 'habit' && route.id ? (
      <HabitDetail id={route.id} onChanged={bump} />
    ) : route.path === 'habits' ? (
      <Habits onChanged={bump} />
    ) : route.path === 'calendar' ? (
      <Calendar />
    ) : (
      <Home refreshKey={refreshKey} onChanged={bump} />
    );

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
      <header className="flex items-center justify-between mb-6">
        <button type="button" className="font-display text-xl cursor-pointer" onClick={() => navigate('#/')} aria-label="Go home">
          HABIT<span className="text-primary">/</span>TRACKER
        </button>
        <span className="text-xs font-bold uppercase text-ink/60">{user?.name}</span>
        <button type="button" className="neo-btn neo-btn--white text-xs py-1" onClick={logout}>LOGOUT</button>
      </header>
      <main>{view}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-bg border-t-[3px] border-ink z-30" aria-label="Primary">
        <div className="max-w-2xl mx-auto grid grid-cols-3 h-16 items-center px-4">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => navigate(`#/${t.key === 'home' ? '' : t.key}`)}
              className={`font-display text-sm cursor-pointer ${active === t.key ? 'text-primary underline decoration-[3px] underline-offset-4' : 'text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {addOpen === 'menu' && (
        <div className="fixed bottom-36 right-5 z-40 flex flex-col gap-2">
          <button type="button" className="neo-btn neo-btn--white" onClick={() => setAddOpen('habit')}>+ HABIT</button>
          <button type="button" className="neo-btn" onClick={() => setAddOpen('task')}>+ TASK</button>
        </div>
      )}
      <button
        type="button"
        className="fixed bottom-20 right-5 w-14 h-14 bg-primary border-[3px] border-ink shadow-[4px_4px_0_0_#0F172A] font-display text-2xl z-40 cursor-pointer active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        onClick={() => setAddOpen(addOpen === 'menu' ? null : 'menu')}
        aria-label="Add item"
        aria-expanded={addOpen === 'menu'}
      >
        +
      </button>

      {addOpen === 'habit' && (
        <Modal title="NEW HABIT" onClose={() => setAddOpen(null)}>
          <HabitForm
            onSubmit={async data => {
              await api('/api/habits', { method: 'POST', body: data });
              setAddOpen(null);
              bump();
            }}
            onCancel={() => setAddOpen(null)}
          />
        </Modal>
      )}
      {addOpen === 'task' && (
        <Modal title="NEW TASK" onClose={() => setAddOpen(null)}>
          <TaskForm
            onSubmit={async data => {
              await api('/api/tasks', { method: 'POST', body: data });
              setAddOpen(null);
              bump();
            }}
            onCancel={() => setAddOpen(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function Gate() {
  const { user, booted } = useAuth();
  if (!booted) return <Loading />;
  return user ? <Shell /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}