import { useEffect, useState } from 'react';
import { parseRoute, type Route } from './routes';

/** The current route; updates when the URL hash changes and scrolls to the top. */
export function useHashRoute(onChange?: () => void): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      onChange?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '/';
    return () => window.removeEventListener('hashchange', onHash);
  }, [onChange]);

  return route;
}
