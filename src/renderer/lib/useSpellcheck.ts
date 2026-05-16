/**
 * React hook around spellcheck-controller. Returns the live state and
 * a setter that toggles enabled. Components don't have to manage
 * subscribe/unsubscribe themselves.
 */
import { useEffect, useState } from 'react';
import {
  getSpellcheckState,
  setSpellcheckEnabled,
  subscribeSpellcheck,
  type SpellcheckState
} from './spellcheck-controller';

export interface UseSpellcheckReturn {
  state: SpellcheckState;
  toggle: (next?: boolean) => void;
}

export function useSpellcheck(): UseSpellcheckReturn {
  const [state, setState] = useState<SpellcheckState>(() => getSpellcheckState());
  useEffect(() => subscribeSpellcheck(setState), []);
  return {
    state,
    toggle: (next?: boolean) =>
      setSpellcheckEnabled(typeof next === 'boolean' ? next : !state.enabled)
  };
}
