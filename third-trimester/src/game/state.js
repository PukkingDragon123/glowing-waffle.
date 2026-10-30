// Persistent game state + helpers. game.state is the object that gets saved.
import { game } from '../core/game.js';
import { ITEMS } from './items.js';
import { clamp } from '../core/util.js';

export const DAY_START = 8 * 60;  // 08:00
export const LAST_DAY = 5;

export function newState() {
  return {
    version: 1,
    day: 1,
    clock: DAY_START,          // minutes since midnight
    money: 46.5,
    hunger: 55,                // 100 = full, 0 = starving
    mood: 45,                  // 0..100
    energy: 80,
    craving: null,             // { id, text, tags:[...] }
    cravingsMet: 0,
    baby: { born: false, name: 'Bean', hunger: 80, clean: 85, comfort: 75, diaper: 0, power: 0 },
    pantry: { noodle_chicken: 3, noodle_spicy: 1, noodle_cup: 1, egg: 2, chili: 4, coffee: 3 },  // counts
    deliveries: [],            // { id, qty, at (clock minute), day }
    home: {},                  // apartment layout/props (owned by scenes/apartment.js)
    tasks: {},                 // day task flags
    flags: {},                 // story flags
    computer: null,            // computer.serialize()
    stats: { calls: 0, goodCalls: 0, noodles: 0, perfectNoodles: 0, earned: 0 },
  };
}

export const S = () => game.state;

export function addMoney(amount, reason = '') {
  const s = game.state; s.money = Math.round((s.money + amount) * 100) / 100;
  if (amount > 0) s.stats.earned += amount;
  game.events.emit('money', { amount, reason, money: s.money });
}
export function spend(amount, reason = '') {
  const s = game.state;
  if (s.money + 1e-6 < amount) return false;
  addMoney(-amount, reason);
  return true;
}
export function addItem(id, qty = 1) {
  const s = game.state; const uses = ITEMS[id]?.uses || 1;
  s.pantry[id] = (s.pantry[id] || 0) + qty * uses;
  game.events.emit('pantry', { id, qty });
}
export function useItem(id, n = 1) {
  const s = game.state;
  if ((s.pantry[id] || 0) < n) return false;
  s.pantry[id] -= n; if (s.pantry[id] <= 0) delete s.pantry[id];
  game.events.emit('pantry', { id, qty: -n });
  return true;
}
export const has = (id) => (game.state.pantry[id] || 0) > 0;

export function stat(key, delta) {
  const s = game.state; s[key] = clamp(s[key] + delta, 0, 100);
  return s[key];
}
export function babyStat(key, delta) {
  const b = game.state.baby; b[key] = clamp(b[key] + delta, 0, 100);
  return b[key];
}
export const flag = (k) => !!game.state.flags[k];
export const setFlag = (k, v = true) => { game.state.flags[k] = v; game.events.emit('flag', { k, v }); };
