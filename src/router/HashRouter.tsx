import { useState, useEffect } from 'react';

/**
 * Custom lightweight Hash Router hook that listens to window.location.hash
 * and provides stateful navigation suitable for static GitHub Pages hosting.
 */
export function useHashRoute(): [string, (route: string) => void] {
  const getCleanRoute = (): string => {
    const hash = window.location.hash;
    // Normalize '#/merge' or '#merge' or '#/'
    const cleaned = hash.replace(/^#\/?/, '').trim();
    return cleaned;
  };

  const [route, setRoute] = useState<string>(getCleanRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getCleanRoute());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (newRoute: string) => {
    const clean = newRoute.replace(/^\/?/, '');
    window.location.hash = clean ? `/${clean}` : '/';
  };

  return [route, navigate];
}
