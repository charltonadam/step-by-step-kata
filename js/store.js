// Shared app state. It is saved to localStorage and kept in sync between the
// control window and the projector window over a BroadcastChannel.
import { newKata } from './kata/schema.js';

const STORAGE_KEY = 'skk.state.v1';

// The mat is drawn in "mat units": always MAT_H tall, and aspect * MAT_H wide.
export const MAT_H = 1000;

export const DEFAULT_COLORS = {
  left: '#3b82f6',
  right: '#ef4444',
  arrow: '#facc15',
  text: '#ffffff',
};

function defaults() {
  return {
    mode: 'edit', // edit | area | size | starts | run
    katas: {},
    currentKataId: null,
    editStep: 0,
    calib: {
      corners: null, // 4 projector-window points: front-left, front-right, back-right, back-left
      aspect: 1.5, // mat width / height
      scale: 2.5, // mat units per kata centimetre
      starts: [], // [{x, y}] as fractions of the mat width / height
      facing: 0, // degrees; 0 = students face the front edge
      colors: { ...DEFAULT_COLORS },
    },
    run: { step: 0, blank: false },
  };
}

function load() {
  const d = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      return {
        ...d,
        ...saved,
        calib: { ...d.calib, ...saved.calib, colors: { ...d.calib.colors, ...saved.calib?.colors } },
        run: { ...d.run, ...saved.run },
      };
    }
  } catch (err) {
    console.error('Could not read saved state', err);
  }
  return d;
}

let state = load();
const listeners = new Set();
const channel = new BroadcastChannel('skk');
let saveTimer = null;

function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save state', err);
  }
}

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 200);
}

addEventListener('pagehide', () => {
  if (saveTimer) persistNow();
});

function apply(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state, patch);
}

channel.onmessage = ({ data }) => {
  if (data.type === 'patch') apply(data.patch);
  else if (data.type === 'hello') channel.postMessage({ type: 'patch', patch: state });
};
// Ask any window that is already open for its latest state.
channel.postMessage({ type: 'hello' });

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Replaces the given top-level keys and tells the other window.
export function update(patch) {
  apply(patch);
  persistSoon();
  channel.postMessage({ type: 'patch', patch });
}

export function updateCalib(patch) {
  update({ calib: { ...state.calib, ...patch } });
}

export const currentKata = () => state.katas[state.currentKataId] ?? null;

export function saveKata(kata) {
  update({ katas: { ...state.katas, [kata.id]: kata } });
}

export function selectKata(id) {
  update({ currentKataId: id, editStep: 0, run: { step: 0, blank: false } });
}

export function deleteKata(id) {
  const katas = { ...state.katas };
  delete katas[id];
  let next = Object.keys(katas)[0];
  if (!next) {
    const k = newKata();
    katas[k.id] = k;
    next = k.id;
  }
  update({ katas, currentKataId: next, editStep: 0, run: { step: 0, blank: false } });
}

// Makes sure there is at least one kata and a valid selection.
export function ensureKatas(seed) {
  let katas = state.katas;
  if (!Object.keys(katas).length) {
    katas = Object.fromEntries(seed().map((k) => [k.id, k]));
    if (!Object.keys(katas).length) {
      const k = newKata();
      katas = { [k.id]: k };
    }
  }
  const currentKataId = katas[state.currentKataId] ? state.currentKataId : Object.keys(katas)[0];
  if (katas !== state.katas || currentKataId !== state.currentKataId) update({ katas, currentKataId });
}
