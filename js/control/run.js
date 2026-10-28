// Run panel in the control window: step readout, buttons and a small preview.
import { getState, subscribe, currentKata } from '../store.js';
import { drawStep, stepsBounds, fitView } from '../render/shapes.js';
import { runAction, runKeyAction } from '../runKeys.js';

const canvas = document.getElementById('run-preview');
const ctx = canvas.getContext('2d');

export function initRun() {
  for (const btn of document.querySelectorAll('[data-run]')) {
    btn.addEventListener('click', () => {
      runAction(btn.dataset.run);
      btn.blur();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (getState().mode !== 'run' || e.target.closest?.('input, select, textarea')) return;
    const action = runKeyAction(e);
    if (action) {
      e.preventDefault();
      runAction(action);
    }
  });
  new ResizeObserver(() => render(getState())).observe(canvas);
  subscribe(render);
}

function render(s) {
  if (s.mode !== 'run') return;
  const kata = currentKata();
  if (!kata) return;
  const idx = Math.min(s.run.step, kata.steps.length - 1);
  const step = kata.steps[idx];

  document.getElementById('run-count').textContent = `${kata.name} · Step ${idx + 1} of ${kata.steps.length}`;
  document.getElementById('run-label').textContent = step.label || '—';
  document.getElementById('blank-btn').setAttribute('aria-pressed', String(s.run.blank));
  document.getElementById('run-warn').textContent = s.calib.starts.length
    ? ''
    : 'No start positions are set, so the footprints are shown in the middle of the mat.';

  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (s.run.blank) {
    ctx.fillStyle = '#666';
    ctx.font = `${24 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Projection blanked (press B)', canvas.width / 2, canvas.height / 2);
    return;
  }
  // Frame the whole kata so movement between steps is visible.
  const view = fitView(stepsBounds(kata.steps, kata.footLength), w, h);
  const z = view.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, (dpr * w) / 2 - view.cx * z, (dpr * h) / 2 - view.cy * z);
  drawStep(ctx, step, kata, s.calib.colors, { highlightActive: true, dimInactive: true });
}
