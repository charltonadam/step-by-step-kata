// Projector window: draws the mat, warped onto the four calibrated corners,
// and handles the clicks made on the projected image (corners, start positions).
import { getState, subscribe, updateCalib, currentKata, MAT_H } from '../store.js';
import { solveHomography, applyH, invert3, toCssMatrix3d } from '../calibrate/homography.js';
import { drawStep } from '../render/shapes.js';
import { runAction, runKeyAction } from '../runKeys.js';

const RAD = Math.PI / 180;
const RES = 1.5; // mat canvas pixels per mat unit
const CORNER_NAMES = ['front-left', 'front-right', 'back-right', 'back-left'];
const START_RADIUS = 28; // mat units

const mat = document.getElementById('mat');
const mctx = mat.getContext('2d');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const fsBtn = document.getElementById('fs-btn');

let Hinv = null; // projector-window px -> mat units
let pending = []; // corners clicked so far while re-marking
let selCorner = -1;
let drag = null;

const matDims = () => [getState().calib.aspect * MAT_H, MAT_H];

function corners() {
  const c = getState().calib.corners;
  if (c) return c;
  const w = innerWidth;
  const h = innerHeight;
  return [[w * 0.15, h * 0.15], [w * 0.85, h * 0.15], [w * 0.85, h * 0.85], [w * 0.15, h * 0.85]];
}

const markingCorners = (s) => s.mode === 'area' && !s.calib.corners;

function render() {
  const s = getState();
  const [W, H] = matDims();

  const pw = Math.round(W * RES);
  const ph = Math.round(H * RES);
  if (mat.width !== pw || mat.height !== ph) {
    mat.width = pw;
    mat.height = ph;
  }
  mat.style.width = `${W}px`;
  mat.style.height = `${H}px`;
  const Hm = solveHomography([[0, 0], [W, 0], [W, H], [0, H]], corners());
  mat.style.transform = toCssMatrix3d(Hm);
  mat.style.visibility = markingCorners(s) ? 'hidden' : 'visible';
  Hinv = invert3(Hm);

  drawMat(s, W, H);
  drawOverlay(s);
  document.body.classList.toggle('running', s.mode === 'run');
  fsBtn.hidden = !!document.fullscreenElement || s.mode === 'run';
}

function drawMat(s, W, H) {
  const ctx = mctx;
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const kata = currentKata();

  switch (s.mode) {
    case 'area':
      drawGrid(ctx, W, H);
      drawBorder(ctx, W, H, '#ffffff', 6);
      drawFrontLabel(ctx, W, H);
      break;
    case 'size':
      drawBorder(ctx, W, H, '#555', 3);
      drawCircles(ctx, W, H);
      if (kata) drawKataAt(ctx, kata, kata.steps[0], W / 2, H / 2);
      break;
    case 'starts':
      drawBorder(ctx, W, H, '#555', 3);
      drawFrontLabel(ctx, W, H);
      s.calib.starts.forEach((p, i) => {
        if (kata) drawKataAt(ctx, kata, kata.steps[0], p.x * W, p.y * H);
        drawStartMarker(ctx, p.x * W, p.y * H, i + 1, kata);
      });
      break;
    case 'edit':
      drawBorder(ctx, W, H, '#333', 3);
      if (kata) drawAtStarts(ctx, kata, kata.steps[Math.min(s.editStep, kata.steps.length - 1)], W, H);
      break;
    case 'run':
      if (kata && !s.run.blank) drawAtStarts(ctx, kata, kata.steps[Math.min(s.run.step, kata.steps.length - 1)], W, H);
      break;
  }
}

function drawAtStarts(ctx, kata, step, W, H) {
  const starts = getState().calib.starts;
  if (!starts.length) drawKataAt(ctx, kata, step, W / 2, H / 2);
  for (const p of starts) drawKataAt(ctx, kata, step, p.x * W, p.y * H);
}

function drawKataAt(ctx, kata, step, x, y) {
  const c = getState().calib;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(c.facing * RAD);
  ctx.scale(c.scale, c.scale);
  drawStep(ctx, step, kata, c.colors, { highlightActive: true, dimInactive: true });
  ctx.restore();
}

function drawBorder(ctx, W, H, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(width / 2, width / 2, W - width, H - width);
}

function drawGrid(ctx, W, H) {
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const step = H / 10;
  for (let x = step; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = step; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawFrontLabel(ctx, W, H) {
  ctx.fillStyle = '#888';
  ctx.font = `bold ${H * 0.05}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('▲ FRONT ▲', W / 2, H * 0.03);
}

// Circles look round on the floor only when the proportion is right.
function drawCircles(ctx, W, H) {
  const rows = 3;
  const cols = Math.max(1, Math.round(rows * (W / H)));
  const r = Math.min(W / cols, H / rows) * 0.38;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      ctx.beginPath();
      ctx.arc((W / cols) * (i + 0.5), (H / rows) * (j + 0.5), r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// A dot on the start point, with the number badge behind the heels so it doesn't hide the feet.
function drawStartMarker(ctx, x, y, n, kata) {
  const c = getState().calib;
  const back = (kata?.footLength ?? 22) * c.scale * 0.6 + START_RADIUS * 0.8;
  const a = c.facing * RAD;
  const bx = x - Math.sin(a) * back;
  const by = y + Math.cos(a) * back;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(bx, by, START_RADIUS * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${START_RADIUS * 0.8}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), bx, by + 1);
}

function drawOverlay(s) {
  const dpr = devicePixelRatio || 1;
  const w = innerWidth;
  const h = innerHeight;
  if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
  }
  const ctx = octx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (s.mode === 'area') {
    if (markingCorners(s)) {
      pending.forEach((p, i) => drawHandle(ctx, p, i, true));
      banner(ctx, `Click corner ${pending.length + 1} of 4: ${CORNER_NAMES[pending.length].toUpperCase()}  (Esc to restart)`);
    } else {
      s.calib.corners.forEach((p, i) => drawHandle(ctx, p, i, i === selCorner));
      banner(ctx, 'Drag a corner to adjust. Click a corner, then use the arrow keys to nudge it.');
    }
  } else if (s.mode === 'starts') {
    banner(ctx, 'Click to add a start position · drag to move · right-click to remove');
  }
}

function drawHandle(ctx, [x, y], i, active) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#38bdf8';
  ctx.fillStyle = active ? '#38bdf8' : 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = `${i + 1} ${CORNER_NAMES[i]}`;
  const tx = Math.min(x + 20, innerWidth - ctx.measureText(label).width - 8);
  const ty = Math.min(Math.max(y, 14), innerHeight - 14);
  ctx.fillText(label, tx, ty);
}

function banner(ctx, text) {
  ctx.font = '20px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 32;
  const x = (innerWidth - w) / 2;
  const y = innerHeight - 60;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(x, y, w, 40);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, innerWidth / 2, y + 20);
}

function hitStart([mx, my]) {
  const [W, H] = matDims();
  const starts = getState().calib.starts;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (Math.hypot(starts[i].x * W - mx, starts[i].y * H - my) <= START_RADIUS * 1.5) return i;
  }
  return -1;
}

overlay.addEventListener('pointerdown', (e) => {
  const s = getState();
  const p = [e.clientX, e.clientY];

  if (s.mode === 'area') {
    if (e.button !== 0) return;
    if (markingCorners(s)) {
      pending.push(p);
      if (pending.length === 4) {
        const done = pending;
        pending = [];
        selCorner = -1;
        updateCalib({ corners: done });
      } else {
        render();
      }
      return;
    }
    const cs = s.calib.corners;
    let best = -1;
    let bestDist = 40;
    cs.forEach(([x, y], i) => {
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    selCorner = best;
    if (best >= 0) {
      drag = { type: 'corner', i: best, off: [cs[best][0] - p[0], cs[best][1] - p[1]] };
      overlay.setPointerCapture(e.pointerId);
    }
    render();
    return;
  }

  if (s.mode === 'starts') {
    const m = applyH(Hinv, p);
    const hit = hitStart(m);
    if (e.button === 2) {
      if (hit >= 0) updateCalib({ starts: s.calib.starts.filter((_, j) => j !== hit) });
      return;
    }
    if (e.button !== 0) return;
    if (hit >= 0) {
      drag = { type: 'start', i: hit };
    } else {
      const [W, H] = matDims();
      if (m[0] < 0 || m[1] < 0 || m[0] > W || m[1] > H) return;
      updateCalib({ starts: [...s.calib.starts, { x: m[0] / W, y: m[1] / H }] });
      drag = { type: 'start', i: s.calib.starts.length };
    }
    overlay.setPointerCapture(e.pointerId);
  }
});

overlay.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const s = getState();
  if (drag.type === 'corner') {
    const cs = s.calib.corners.map((c) => [...c]);
    cs[drag.i] = [e.clientX + drag.off[0], e.clientY + drag.off[1]];
    updateCalib({ corners: cs });
  } else if (drag.type === 'start') {
    const [W, H] = matDims();
    const [mx, my] = applyH(Hinv, [e.clientX, e.clientY]);
    const starts = s.calib.starts.map((st, i) =>
      i === drag.i ? { x: Math.min(1, Math.max(0, mx / W)), y: Math.min(1, Math.max(0, my / H)) } : st,
    );
    updateCalib({ starts });
  }
});

const endDrag = () => {
  drag = null;
};
overlay.addEventListener('pointerup', endDrag);
overlay.addEventListener('pointercancel', endDrag);
overlay.addEventListener('contextmenu', (e) => e.preventDefault());

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch((err) => console.error(err));
}

fsBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', render);
addEventListener('resize', render);

const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

addEventListener('keydown', (e) => {
  const s = getState();
  if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
    return;
  }
  if (s.mode === 'run') {
    const action = runKeyAction(e);
    if (action) {
      e.preventDefault();
      runAction(action);
    }
    return;
  }
  if (s.mode === 'area') {
    if (e.key === 'Escape') {
      pending = [];
      render();
    } else if (NUDGE[e.key] && s.calib.corners && selCorner >= 0) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      const cs = s.calib.corners.map((c) => [...c]);
      cs[selCorner] = [cs[selCorner][0] + NUDGE[e.key][0] * d, cs[selCorner][1] + NUDGE[e.key][1] * d];
      updateCalib({ corners: cs });
    }
  }
});

subscribe((s, patch) => {
  if ('mode' in patch) {
    pending = [];
    selCorner = -1;
  }
  render();
});
render();
