import { useEffect, useRef } from 'react';
import { fileLocationUrl } from '../../utils/fileLocationUrl';

interface Position { root: string; path: string }
export const FILE_LOCATION_WRITTEN = 'gp:file-location-written';
export const FILE_LOCATION_CHANGED = 'gp:file-location-changed';

function readPosition(): Position | null {
  const query = new URLSearchParams(location.search);
  const path = query.get('path');
  if (!path || !path.startsWith('/')) return null;
  return { root: query.get('root') || 'data', path };
}

export function useFileManagerLocation(enabled: boolean, root: string, path: string,
  openDirectory: (root: string, path: string) => void) {
  const initialized = useRef(false);
  const restoring = useRef<Position | null>(null);
  const open = useRef(openDirectory);
  open.current = openDirectory;

  useEffect(() => {
    if (!enabled) { initialized.current = false; restoring.current = null; return; }
    const readableUrl = fileLocationUrl(new URL(location.href));
    if (readableUrl !== location.href) {
      history.replaceState(history.state, '', readableUrl);
      window.dispatchEvent(new Event(FILE_LOCATION_WRITTEN));
    }
    const first = !initialized.current;
    initialized.current = true;
    const urlPosition = readPosition();
    if (first && urlPosition && (urlPosition.root !== root || urlPosition.path !== path)) {
      restoring.current = urlPosition;
      open.current(urlPosition.root, urlPosition.path);
      return;
    }
    if (restoring.current) {
      if (restoring.current.root === root && restoring.current.path === path) restoring.current = null;
      return;
    }
    if (urlPosition?.root === root && urlPosition.path === path) return;
    const url = new URL(location.href);
    url.searchParams.set('root', root);
    url.searchParams.set('path', path);
    if (first) history.replaceState(history.state, '', fileLocationUrl(url));
    else history.pushState(history.state, '', fileLocationUrl(url));
    window.dispatchEvent(new Event(FILE_LOCATION_WRITTEN));
  }, [enabled, root, path]);

  useEffect(() => {
    if (!enabled) return;
    const changed = () => {
      const position = readPosition();
      if (!position) return;
      restoring.current = position;
      open.current(position.root, position.path);
    };
    window.addEventListener(FILE_LOCATION_CHANGED, changed);
    return () => window.removeEventListener(FILE_LOCATION_CHANGED, changed);
  }, [enabled]);
}
