import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';

const USER_KEY = 'ht_user';
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (getToken() && !user) {
      api('/api/auth/me')
        .then(d => {
          setUser(d.user);
          localStorage.setItem(USER_KEY, JSON.stringify(d.user));
        })
        .catch(() => logout())
        .finally(() => setBooted(true));
    } else setBooted(true);
  }, []);

  const adopt = d => {
    setToken(d.token);
    setUser(d.user);
    localStorage.setItem(USER_KEY, JSON.stringify(d.user));
  };
  const login = (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } }).then(adopt);
  const register = (name, email, password) => api('/api/auth/register', { method: 'POST', body: { name, email, password } }).then(adopt);
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(USER_KEY);
  };

  return <AuthCtx.Provider value={{ user, booted, login, register, logout }}>{children}</AuthCtx.Provider>;
}