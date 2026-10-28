// Kata editor: place footprints, arrows and text on each step. The previous
// step is drawn faded underneath for reference.
import { getState, update, subscribe, saveKata, selectKata, deleteKata, currentKata } from '../store.js';
import { newKata, newFoot, newArrow, newText, stepFromPrevious, duplicateStep, uid } from '../kata/schema.js';
import { readKataFile, downloadKata } from '../kata/io.js';
import { drawStep, textFont, stepsBounds, fitView } from '../render/shapes.js';

const RAD = Math.PI / 180;
const SNAP_DEG = 5;
const LAYER = { arrow: 0, foot: 1, text: 2 };
const TITLES = { foot: 'Footprint', arrow: 'Arrow', text: 'Text' };

const $ = (sel) => document.querySelector(sel);
const canvas = $('#editor-canvas');
const ctx = canvas.getContext('2d');
const propsEl = $('#props');
const stepListEl = $('#step-list');
const nameInput = $('#kata-name');
const footInput = $('#kata-foot');
const fileInput = $('#import-file');

let kata = null; // working copy of the selected kata
let loadedId = null;
let stepIdx = 0;
let sel = -1; // index of the selected item in the current step
let view = { cx: 0, cy: -60, zoom: 3 }; // zoom = screen px per cm
let needsFit = true;
let drag = null;
let inputDirty = false;
const undoStack = [];
const redoStack = [];

const step = () => kata.steps[stepIdx];
const selected = () => (kata && sel >= 0 ? step().items[sel] ?? null : null);
const snap = (v) => Math.round(v * 2) / 2;
const normDeg = (a) => ((((Math.round(a) + 180) % 360) + 360) % 360) - 180;
const round1 = (v) => Math.round(v * 10) / 10;

// ---- state ---------------------------------------------------------------

function loadKata() {
  const k = currentKata();
  loadedId = getState().currentKataId;
  kata = k ? structuredClone(k) : null;
  undoStack.length = 0;
  redoStack.length = 0;
  sel = -1;
  stepIdx = kata ? Math.min(getState().editStep ?? 0, kata.steps.length - 1) : 0;
  needsFit = true;
  renderSidebar();
  renderProps();
  draw();
}

function commit() {
  undoStack.push(JSON.stringify({ kata, stepIdx }));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}

function persist() {
  saveKata(structuredClone(kata));
}

function restore(json) {
  const snapshot = JSON.parse(json);
  kata = snapshot.kata;
  sel = -1;
  persist();
  setStep(snapshot.stepIdx);
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({ kata, stepIdx }));
  restore(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({ kata, stepIdx }));
  restore(redoStack.pop());
}

// Every change goes through here: snapshot for undo, change, save, redraw.
function change(fn, { props = true, sidebar = false } = {}) {
  if (!kata) return;
  commit();
  fn();
  persist();
  if (sidebar) renderSidebar();
  if (props) renderProps();
  draw();
}

function setStep(i) {
  stepIdx = Math.max(0, Math.min(i, kata.steps.length - 1));
  sel = -1;
  update({ editStep: stepIdx });
  renderSidebar();
  renderProps();
  draw();
}

// ---- drawing -------------------------------------------------------------

function draw() {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  if (needsFit && kata) {
    view = fitView(stepsBounds(kata.steps, kata.footLength), w, h, 60);
    needsFit = false;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!kata) return;

  const z = view.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, (dpr * w) / 2 - view.cx * z, (dpr * h) / 2 - view.cy * z);
  drawGrid(w, h);
  const colors = getState().calib.colors;
  if (stepIdx > 0) drawStep(ctx, kata.steps[stepIdx - 1], kata, colors, { alpha: 0.22, letters: false });
  drawStep(ctx, step(), kata, colors, { highlightActive: true });
  drawSelection();
}

function drawGrid(w, h) {
  const px = 1 / view.zoom;
  const x0 = view.cx - (w / 2) * px;
  const x1 = view.cx + (w / 2) * px;
  const y0 = view.cy - (h / 2) * px;
  const y1 = view.cy + (h / 2) * px;
  ctx.lineWidth = px;
  for (const [g, color] of [[10, '#1e222a'], [50, '#2a303b']]) {
    if (g === 10 && view.zoom < 1.5) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / g) * g; x <= x1; x += g) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = Math.ceil(y0 / g) * g; y <= y1; y += g) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  }

  // Start point and the direction the student faces.
  ctx.strokeStyle = ctx.fillStyle = '#5b6577';
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.arc(0, 0, 6 * px, 0, Math.PI * 2);
  ctx.moveTo(0, -6 * px);
  ctx.lineTo(0, -40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(-5, -38);
  ctx.lineTo(5, -38);
  ctx.closePath();
  ctx.fill();
  ctx.font = `${12 * px}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('FRONT', 0, -50);
  ctx.textBaseline = 'top';
  ctx.fillText('START', 0, 9 * px);
}

function textWidth(it) {
  ctx.save();
  ctx.font = textFont(it.size);
  const w = ctx.measureText(it.text || ' ').width;
  ctx.restore();
  return w;
}

// Box around a foot or text item, in its own rotated coordinates.
function localBox(it) {
  if (it.type === 'foot') {
    const L = kata.footLength;
    return [-0.27 * L, -0.55 * L, 0.27 * L, 0.53 * L];
  }
  const w = textWidth(it) / 2 + 2;
  return [-w, -it.size * 0.6, w, it.size * 0.6];
}

function toLocal(it, wx, wy) {
  const a = it.rot * RAD;
  const dx = wx - it.x;
  const dy = wy - it.y;
  return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
}

function handles(it) {
  if (it.type === 'arrow') return it.points.map(([x, y], i) => ({ kind: `p${i}`, x, y }));
  const d = -localBox(it)[1] + 22 / view.zoom;
  const a = it.rot * RAD;
  return [{ kind: 'rot', x: it.x + Math.sin(a) * d, y: it.y - Math.cos(a) * d }];
}

function drawSelection() {
  const it = selected();
  if (!it) return;
  const px = 1 / view.zoom;
  ctx.save();
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([5 * px, 4 * px]);
  if (it.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(...it.points[0]);
    ctx.lineTo(...it.points[1]);
    ctx.lineTo(...it.points[2]);
    ctx.stroke();
  } else {
    const [x0, y0, x1, y1] = localBox(it);
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot * RAD);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(0, y0 - 22 * px);
    ctx.stroke();
  }
  ctx.restore();

  for (const h of handles(it)) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 6 * px, 0, Math.PI * 2);
    ctx.fillStyle = h.kind === 'p1' ? '#15171c' : '#7dd3fc';
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2 * px;
    ctx.fill();
    ctx.stroke();
  }
}

// ---- hit testing -----------------------------------------------------------

function hitTest(it, wx, wy) {
  if (it.type === 'arrow') {
    const [[x0, y0], [cx, cy], [x2, y2]] = it.points;
    const tol = Math.max((it.width ?? 4) / 2 + 2, 8 / view.zoom);
    let prev = [x0, y0];
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const u = 1 - t;
      const p = [u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2];
      if (distToSegment([wx, wy], prev, p) < tol) return true;
      prev = p;
    }
    return false;
  }
  const [lx, ly] = toLocal(it, wx, wy);
  const [x0, y0, x1, y1] = localBox(it);
  return lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1;
}

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitItem(wx, wy) {
  const items = step().items;
  const order = items.map((_, i) => i).sort((a, b) => LAYER[items[b].type] - LAYER[items[a].type] || b - a);
  return order.find((i) => hitTest(items[i], wx, wy)) ?? -1;
}

function hitHandle(wx, wy) {
  const it = selected();
  if (!it) return null;
  return handles(it).find((h) => Math.hypot(h.x - wx, h.y - wy) <= 9 / view.zoom) ?? null;
}

// ---- pointer & keyboard ----------------------------------------------------

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left - r.width / 2) / view.zoom + view.cx, (e.clientY - r.top - r.height / 2) / view.zoom + view.cy];
}

function onPointerDown(e) {
  if (!kata) return;
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const [wx, wy] = toWorld(e);
  const pan = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
  if (e.button !== 0) {
    drag = pan;
    return;
  }
  const handle = hitHandle(wx, wy);
  if (handle) {
    drag = { type: handle.kind, sx: e.clientX, sy: e.clientY, committed: false };
    return;
  }
  const idx = hitItem(wx, wy);
  if (idx >= 0) {
    if (idx !== sel) {
      sel = idx;
      renderProps();
    }
    drag = { type: 'move', sx: e.clientX, sy: e.clientY, start: [wx, wy], orig: structuredClone(selected()), committed: false };
  } else {
    if (sel !== -1) {
      sel = -1;
      renderProps();
    }
    drag = pan;
  }
  draw();
}

function onPointerMove(e) {
  if (!drag) return;
  if (drag.type === 'pan') {
    view.cx = drag.cx - (e.clientX - drag.sx) / view.zoom;
    view.cy = drag.cy - (e.clientY - drag.sy) / view.zoom;
    draw();
    return;
  }
  const it = selected();
  if (!it) return;
  if (!drag.committed) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    commit();
    drag.committed = true;
  }
  const [wx, wy] = toWorld(e);
  if (drag.type === 'move') {
    const dx = snap(wx - drag.start[0]);
    const dy = snap(wy - drag.start[1]);
    if (it.type === 'arrow') {
      it.points = drag.orig.points.map(([x, y]) => [x + dx, y + dy]);
    } else {
      it.x = drag.orig.x + dx;
      it.y = drag.orig.y + dy;
    }
  } else if (drag.type === 'rot') {
    let a = Math.atan2(wx - it.x, -(wy - it.y)) / RAD;
    if (!e.shiftKey) a = Math.round(a / SNAP_DEG) * SNAP_DEG;
    it.rot = normDeg(a);
  } else {
    const k = +drag.type[1];
    it.points = it.points.map((p, i) => (i === k ? [snap(wx), snap(wy)] : p));
  }
  persist();
  syncProps();
  draw();
}

function onWheel(e) {
  e.preventDefault();
  const before = toWorld(e);
  view.zoom = Math.max(0.3, Math.min(20, view.zoom * Math.exp(-e.deltaY * 0.0015)));
  const after = toWorld(e);
  view.cx += before[0] - after[0];
  view.cy += before[1] - after[1];
  draw();
}

function onKey(e) {
  if (getState().mode !== 'edit' || !kata) return;
  if (e.target.closest?.('input, textarea, select')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (key === 'y') {
      e.preventDefault();
      redo();
    }
    return;
  }
  if (key === 'PageDown' || key === ']') {
    e.preventDefault();
    setStep(stepIdx + 1);
    return;
  }
  if (key === 'PageUp' || key === '[') {
    e.preventDefault();
    setStep(stepIdx - 1);
    return;
  }
  const it = selected();
  if (!it) return;
  const big = e.shiftKey;
  const nudges = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (key === 'Delete' || key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (key === 'Escape') {
    sel = -1;
    renderProps();
    draw();
  } else if ((key === 'q' || key === 'e') && it.type !== 'arrow') {
    const d = (big ? 5 : 15) * (key === 'q' ? -1 : 1);
    change(() => (it.rot = normDeg(it.rot + d)), { props: false });
    syncProps();
  } else if (nudges[key]) {
    e.preventDefault();
    const [dx, dy] = nudges[key].map((v) => v * (big ? 10 : 1));
    change(() => moveBy(it, dx, dy), { props: false });
    syncProps();
  }
}

function moveBy(it, dx, dy) {
  if (it.type === 'arrow') it.points = it.points.map(([x, y]) => [x + dx, y + dy]);
  else {
    it.x += dx;
    it.y += dy;
  }
}

function deleteSelected() {
  if (!selected()) return;
  change(() => {
    step().items.splice(sel, 1);
    sel = -1;
  });
}

function addItem(item) {
  change(() => {
    step().items.push(item);
    sel = step().items.length - 1;
  });
}

function onTool(tool) {
  if (!kata) return;
  const x = Math.round(view.cx);
  const y = Math.round(view.cy);
  switch (tool) {
    case 'left':
      return addItem(newFoot('left', x - 15, y));
    case 'right':
      return addItem(newFoot('right', x + 15, y));
    case 'arrow':
      return addItem(newArrow(x, y));
    case 'text':
      return addItem(newText(x, y));
    case 'undo':
      return undo();
    case 'redo':
      return redo();
    case 'fit':
      needsFit = true;
      return draw();
  }
}

// ---- sidebar ---------------------------------------------------------------

function renderSidebar() {
  const disabled = !kata;
  nameInput.disabled = footInput.disabled = disabled;
  if (document.activeElement !== nameInput) nameInput.value = kata?.name ?? '';
  if (document.activeElement !== footInput) footInput.value = kata?.footLength ?? '';
  stepListEl.replaceChildren(
    ...(kata?.steps ?? []).map((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.label || '(no label)';
      li.classList.toggle('muted', !s.label);
      li.classList.toggle('active', i === stepIdx);
      li.addEventListener('click', () => setStep(i));
      return li;
    }),
  );
  stepListEl.children[stepIdx]?.scrollIntoView({ block: 'nearest' });
}

function moveStep(dir) {
  const j = stepIdx + dir;
  if (j < 0 || j >= kata.steps.length) return;
  change(() => {
    const s = kata.steps;
    [s[stepIdx], s[j]] = [s[j], s[stepIdx]];
  });
  setStep(j);
}

function initSidebar() {
  const editOnce = (fn) => () => {
    if (!kata) return;
    if (!inputDirty) {
      commit();
      inputDirty = true;
    }
    fn();
    persist();
  };
  nameInput.addEventListener('input', editOnce(() => (kata.name = nameInput.value)));
  footInput.addEventListener(
    'input',
    editOnce(() => {
      const v = parseFloat(footInput.value);
      if (Number.isFinite(v) && v >= 5 && v <= 60) kata.footLength = v;
      draw();
    }),
  );
  for (const input of [nameInput, footInput]) input.addEventListener('blur', () => (inputDirty = false));

  $('#kata-new').addEventListener('click', () => {
    const k = newKata();
    saveKata(k);
    selectKata(k.id);
  });
  $('#kata-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const k = await readKataFile(file);
      if (getState().katas[k.id]) k.id = uid('kata-');
      saveKata(k);
      selectKata(k.id);
    } catch (err) {
      alert(`Could not import ${file.name}: ${err.message}`);
    }
  });
  $('#kata-export').addEventListener('click', () => kata && downloadKata(kata));
  $('#kata-delete').addEventListener('click', () => {
    if (kata && confirm(`Delete "${kata.name}"? Export it first if you want a copy.`)) deleteKata(kata.id);
  });

  $('#step-add').addEventListener('click', () => {
    if (!kata) return;
    change(() => kata.steps.splice(stepIdx + 1, 0, stepFromPrevious(step())));
    setStep(stepIdx + 1);
  });
  $('#step-dup').addEventListener('click', () => {
    if (!kata) return;
    change(() => kata.steps.splice(stepIdx + 1, 0, duplicateStep(step())));
    setStep(stepIdx + 1);
  });
  $('#step-del').addEventListener('click', () => {
    if (!kata || kata.steps.length < 2) return;
    change(() => kata.steps.splice(stepIdx, 1));
    setStep(Math.min(stepIdx, kata.steps.length - 1));
  });
  $('#step-up').addEventListener('click', () => kata && moveStep(-1));
  $('#step-down').addEventListener('click', () => kata && moveStep(1));
}

// ---- properties panel --------------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const field = (label, input) => el('label', { className: 'field' }, el('span', { textContent: label }), input);

// An input bound to obj[key]. Typing in it counts as one undo step until it loses focus.
function bound(obj, key, { type = 'number', step = 1, onChange } = {}) {
  const input = el('input', { type, step });
  input._sync = () => {
    input.value = type === 'number' ? round1(obj[key]) : obj[key];
  };
  input._sync();
  input.addEventListener('input', () => {
    const v = type === 'number' ? parseFloat(input.value) : input.value;
    if (type === 'number' && !Number.isFinite(v)) return;
    if (!inputDirty) {
      commit();
      inputDirty = true;
    }
    obj[key] = v;
    persist();
    onChange?.();
    draw();
  });
  input.addEventListener('blur', () => (inputDirty = false));
  return input;
}

function button(text, onClick, className = '') {
  return el('button', { textContent: text, className, onclick: onClick });
}

function renderProps() {
  propsEl.replaceChildren();
  if (!kata) return;
  const s = step();
  propsEl.append(
    el('h3', { textContent: `Step ${stepIdx + 1} of ${kata.steps.length}` }),
    field('Label (shown on the laptop while running)', bound(s, 'label', { type: 'text', onChange: renderSidebar })),
  );

  const it = selected();
  if (!it) {
    propsEl.append(el('p', { className: 'hint', textContent: 'Select a piece on the canvas to edit it.' }));
    return;
  }
  propsEl.append(el('h3', { textContent: TITLES[it.type] }));

  if (it.type === 'foot') {
    const side = el('select', {}, new Option('Left foot', 'left'), new Option('Right foot', 'right'));
    side.value = it.side;
    side.addEventListener('change', () => change(() => (it.side = side.value)));
    const active = el('input', { type: 'checkbox', checked: it.active });
    active.addEventListener('change', () => change(() => (it.active = active.checked)));
    propsEl.append(
      field('Side', side),
      el('div', { className: 'field-row' }, field('X (cm)', bound(it, 'x')), field('Y (cm)', bound(it, 'y')), field('Rotation°', bound(it, 'rot', { step: 5 }))),
      el('label', { className: 'check' }, active, el('span', { textContent: 'Moving foot (outlined in white)' })),
    );
  } else if (it.type === 'text') {
    propsEl.append(
      field('Text', bound(it, 'text', { type: 'text' })),
      el('div', { className: 'field-row' }, field('Size (cm)', bound(it, 'size')), field('X (cm)', bound(it, 'x')), field('Y (cm)', bound(it, 'y'))),
      field('Rotation°', bound(it, 'rot', { step: 5 })),
      el(
        'div',
        { className: 'btn-row' },
        button('↺ 90°', () => change(() => (it.rot = normDeg(it.rot - 90)))),
        button('↻ 90°', () => change(() => (it.rot = normDeg(it.rot + 90)))),
        button('Upright', () => change(() => (it.rot = 0))),
      ),
    );
  } else if (it.type === 'arrow') {
    propsEl.append(
      el('p', { className: 'hint', textContent: 'Drag the end handles to place the arrow; drag the hollow middle handle to bend it.' }),
      field('Line width (cm)', bound(it, 'width')),
      el(
        'div',
        { className: 'btn-row' },
        button('Reverse', () => change(() => it.points.reverse())),
        button('Straighten', () =>
          change(() => {
            const [[x0, y0], , [x2, y2]] = it.points;
            it.points[1] = [(x0 + x2) / 2, (y0 + y2) / 2];
          }),
        ),
      ),
    );
  }
  propsEl.append(el('div', { className: 'btn-row' }, button('Delete piece', deleteSelected, 'danger')));
}

function syncProps() {
  for (const input of propsEl.querySelectorAll('input')) {
    if (input._sync && input !== document.activeElement) input._sync();
  }
}

// ---- init --------------------------------------------------------------------

export function initEditor() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointercancel', () => (drag = null));
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', onKey);
  new ResizeObserver(draw).observe(canvas);
  for (const btn of document.querySelectorAll('[data-tool]')) {
    btn.addEventListener('click', () => onTool(btn.dataset.tool));
  }
  initSidebar();

  subscribe((s, patch) => {
    if (s.currentKataId !== loadedId) loadKata();
    else if ('calib' in patch) draw();
  });
  loadKata();
}
