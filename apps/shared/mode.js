// Per-chat mode switch: 'jugendfrei' | 'hemmungslos'. Pure, testable.
import { isAdult as globalIsAdult } from './fsk.js';

export const MODES = { jugendfrei: 'jugendfrei', hemmungslos: 'hemmungslos' };

const isMode = (v) => v === MODES.jugendfrei || v === MODES.hemmungslos;

export function chatMode(conv, profile) {
  const v = conv?.mode;
  if (isMode(v)) return v;
  // Default jugendfrei; 18+-only profiles keep the old implicit behaviour.
  if (profile?.adult === true || profile?.adultMode === true) return profile?.adult === true ? MODES.hemmungslos : MODES.jugendfrei;
  return MODES.jugendfrei;
}

export function effectiveAdult(conv, profile, isAdultFn = globalIsAdult) {
  if (!isAdultFn()) return false;
  if (chatMode(conv, profile) !== MODES.hemmungslos) return false;
  if (profile?.adultMode === false) return false;
  if (profile?.adult === 'never') return false;
  return true;
}

