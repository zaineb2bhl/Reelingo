import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'editor'; formatId: string }
  | { name: 'project'; id: string }
  | { name: 'settings' }
  | { name: 'series' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [first, second] = path.split('/');
  if (first === 'edit' && second) return { name: 'editor', formatId: decodeURIComponent(second) };
  if (first === 'project' && second) return { name: 'project', id: decodeURIComponent(second) };
  if (first === 'settings') return { name: 'settings' };
  if (first === 'series') return { name: 'series' };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'editor':
      return `#/edit/${encodeURIComponent(route.formatId)}`;
    case 'project':
      return `#/project/${encodeURIComponent(route.id)}`;
    case 'settings':
      return '#/settings';
    case 'series':
      return '#/series';
    case 'home':
      return '#/';
  }
}

/** Tiny hash router: no server config needed for static hosting. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
