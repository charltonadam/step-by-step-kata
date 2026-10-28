// Control-window panels for the three calibration steps.
import { getState, subscribe, updateCalib, DEFAULT_COLORS } from '../store.js';

const $ = (sel) => document.querySelector(sel);

// Sliders are logarithmic so small and large values are equally easy to set.
const SLIDERS = {
  aspect: { base: 4, min: 0.25, max: 4, format: (v) => `${v.toFixed(2)} : 1` },
  scale: { base: 10, min: 10 ** -0.5, max: 10 ** 1.3, format: (v) => `${Math.round(v * 40)}%` },
};

export function initSetup() {
  $('#area-reset').addEventListener('click', () => updateCalib({ corners: null }));

  for (const [key, cfg] of Object.entries(SLIDERS)) {
    $(`#${key}`).addEventListener('input', (e) => updateCalib({ [key]: cfg.base ** +e.target.value }));
  }
  for (const btn of document.querySelectorAll('[data-nudge]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.nudge;
      const { min, max } = SLIDERS[key];
      const v = getState().calib[key] * +btn.dataset.factor;
      updateCalib({ [key]: Math.min(max, Math.max(min, v)) });
    });
  }

  $('#starts-clear').addEventListener('click', () => {
    if (confirm('Remove all start positions?')) updateCalib({ starts: [] });
  });
  $('#facing').addEventListener('change', (e) => updateCalib({ facing: +e.target.value }));
  for (const input of document.querySelectorAll('[data-color]')) {
    input.addEventListener('input', () =>
      updateCalib({ colors: { ...getState().calib.colors, [input.dataset.color]: input.value } }),
    );
  }
  $('#colors-reset').addEventListener('click', () => updateCalib({ colors: { ...DEFAULT_COLORS } }));

  subscribe(sync);
  sync(getState());
}

function sync(s) {
  const c = s.calib;
  $('#area-status').textContent = c.corners
    ? 'Corners are marked. Re-mark them if the projector or mat has moved.'
    : s.mode === 'area'
      ? 'Waiting for corner clicks on the projected image…'
      : 'Corners are not marked yet. A default area is being used.';

  for (const [key, cfg] of Object.entries(SLIDERS)) {
    const slider = $(`#${key}`);
    if (document.activeElement !== slider) slider.value = Math.log(c[key]) / Math.log(cfg.base);
    $(`#${key}-out`).textContent = cfg.format(c[key]);
  }

  const n = c.starts.length;
  $('#starts-status').textContent = n
    ? `${n} start position${n === 1 ? '' : 's'}.`
    : 'No start positions yet. Footprints will be shown in the middle of the mat.';
  $('#facing').value = String(c.facing);
  for (const input of document.querySelectorAll('[data-color]')) {
    if (document.activeElement !== input) input.value = c.colors[input.dataset.color];
  }
}
