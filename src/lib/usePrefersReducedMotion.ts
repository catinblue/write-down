import { useEffect, useState } from 'react';

/**
 * Reads the OS `prefers-reduced-motion` preference and updates live if the
 * user flips the system toggle. Consumers (ShaderCanvas, MeteorOverlay,
 * Deck, App) gate vestibular motion on this.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
