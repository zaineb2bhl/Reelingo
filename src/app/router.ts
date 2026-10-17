import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  /** `fromDocument` opens the editor with the "From a document" panel expanded. */
  | { name: 'editor'; formatId: string; fromDocument?: boolean }
  | { name: 'project'; id: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [first, second] = path.split('/');
  if (first === 'edit' && second) {
    const fromDocument = new URLSearchParams(query).has('doc');
    return fromDocument ? { name: 'editor', formatId: decodeURIComponent(second), fromDocument } : { name: 'editor', formatId: decodeURIComponent(second) };
  }
  if (first === 'project' && second) return { name: 'project', id: decodeURIComponent(second) };
  if (first === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'editor':
      return `#/edit/${encodeURIComponent(route.formatId)}${route.fromDocument ? '?doc' : ''}`;
    case 'project':
      return `#/project/${encodeURIComponent(route.id)}`;
    case 'settings':
      return '#/settings';
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
