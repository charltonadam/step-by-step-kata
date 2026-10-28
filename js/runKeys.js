// Keyboard / presentation-clicker controls for Run mode, shared by both windows.
import { getState, update, currentKata } from './store.js';

// Clickers usually send PageUp/PageDown; some send arrow keys, and "b" or "." to blank.
const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']);
const PREV = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

export function runKeyAction(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (NEXT.has(e.key)) return 'next';
  if (PREV.has(e.key)) return 'prev';
  if (e.key === 'Home') return 'first';
  if (e.key === 'End') return 'last';
  if (e.key === 'b' || e.key === 'B' || e.key === '.') return 'blank';
  return null;
}

export function runAction(action) {
  const kata = currentKata();
  if (!kata) return;
  const last = kata.steps.length - 1;
  let { step, blank } = getState().run;
  step = Math.min(step, last);
  switch (action) {
    case 'next':
      step = Math.min(last, step + 1);
      blank = false;
      break;
    case 'prev':
      step = Math.max(0, step - 1);
      blank = false;
      break;
    case 'first':
      step = 0;
      blank = false;
      break;
    case 'last':
      step = last;
      blank = false;
      break;
    case 'blank':
      blank = !blank;
      break;
  }
  update({ run: { step, blank } });
}
