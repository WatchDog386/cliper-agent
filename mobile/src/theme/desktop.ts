import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Wide screens (a laptop or desktop browser) get the side-rail layout from this width up. */
export const DESKTOP_MIN = 1024;
/** Width of the desktop side rail. */
export const RAIL_WIDTH = 248;

const wide = () => Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;

/** True while the window is desktop-wide; follows resizes. */
export function useDesktop() {
  const [on, setOn] = useState(wide);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const update = () => setOn(wide());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return on;
}
