import { useEffect, useState } from 'react';

export const navigate = to => {
  location.hash = to;
};

export function useRoute() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { path: parts[0] || 'home', id: parts[1] };
}