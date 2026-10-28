// Kata data model. Coordinates are centimetres relative to the performer's
// start point: x to the right, y toward the back, so "forward" is -y.
// Rotation is in degrees clockwise; 0 means toes / text pointing forward.

export const FORMAT_VERSION = 1;
export const DEFAULT_FOOT_LENGTH = 22;

export const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 10);

const num = (v, fallback = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : fallback);

export function newFoot(side, x, y, rot = 0) {
  return { type: 'foot', side, x, y, rot, active: false };
}

export function newArrow(x, y) {
  return { type: 'arrow', points: [[x - 30, y + 10], [x, y - 10], [x + 30, y + 10]], width: 4 };
}

export function newText(x, y) {
  return { type: 'text', text: 'TEXT', x, y, rot: 0, size: 14 };
}

function readyStep() {
  return {
    id: uid('s'),
    label: 'Ready',
    items: [newFoot('left', -15, 0), newFoot('right', 15, 0)],
  };
}

export function newKata(name = 'New kata') {
  return {
    format: FORMAT_VERSION,
    id: uid('kata-'),
    name,
    description: '',
    units: 'cm',
    footLength: DEFAULT_FOOT_LENGTH,
    steps: [readyStep()],
  };
}

// The next step usually starts where the feet already are, so only the feet carry over.
export function stepFromPrevious(step) {
  return {
    id: uid('s'),
    label: '',
    items: step.items
      .filter((i) => i.type === 'foot')
      .map((i) => ({ ...i, active: false })),
  };
}

export function duplicateStep(step) {
  return { ...structuredClone(step), id: uid('s') };
}

function normalizeItem(raw) {
  switch (raw?.type) {
    case 'foot':
      return {
        type: 'foot',
        side: raw.side === 'right' ? 'right' : 'left',
        x: num(raw.x),
        y: num(raw.y),
        rot: num(raw.rot),
        active: !!raw.active,
      };
    case 'arrow': {
      let pts = Array.isArray(raw.points) ? raw.points.map((p) => [num(p?.[0]), num(p?.[1])]) : [];
      if (pts.length === 2) pts = [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]];
      if (pts.length !== 3) return null;
      return { type: 'arrow', points: pts, width: num(raw.width, 4) };
    }
    case 'text':
      return {
        type: 'text',
        text: String(raw.text ?? ''),
        x: num(raw.x),
        y: num(raw.y),
        rot: num(raw.rot),
        size: num(raw.size, 14),
      };
    default:
      return null;
  }
}

// Validates a kata loaded from JSON and fills in anything missing.
export function normalizeKata(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) {
    throw new Error('Not a kata file (missing a "steps" list).');
  }
  const steps = raw.steps.map((s) => ({
    id: typeof s?.id === 'string' && s.id ? s.id : uid('s'),
    label: String(s?.label ?? ''),
    items: (Array.isArray(s?.items) ? s.items : []).map(normalizeItem).filter(Boolean),
  }));
  return {
    format: FORMAT_VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('kata-'),
    name: String(raw.name || 'Untitled kata'),
    description: String(raw.description ?? ''),
    units: 'cm',
    footLength: num(raw.footLength, DEFAULT_FOOT_LENGTH),
    steps: steps.length ? steps : [readyStep()],
  };
}
