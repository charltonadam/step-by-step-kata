// Vector drawing for kata pieces, in kata centimetres (see kata/schema.js).
// Callers set up the canvas transform; everything here scales freely.

const RAD = Math.PI / 180;

// Right foot outline, normalised to length 1 with the toes toward -y.
// The left foot is the same shape mirrored.
function traceSole(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.bezierCurveTo(0.17, 0.5, 0.2, 0.3, 0.18, 0.1);
  ctx.bezierCurveTo(0.17, -0.05, 0.24, -0.18, 0.2, -0.28);
  ctx.bezierCurveTo(0.16, -0.38, -0.18, -0.4, -0.22, -0.28);
  ctx.bezierCurveTo(-0.24, -0.15, -0.1, -0.02, -0.1, 0.12);
  ctx.bezierCurveTo(-0.1, 0.3, -0.17, 0.5, 0, 0.5);
  ctx.closePath();
}

// [x, y, radiusX, radiusY], big toe first (on the inside of the foot).
const TOES = [
  [-0.12, -0.435, 0.07, 0.075],
  [-0.02, -0.45, 0.042, 0.05],
  [0.06, -0.43, 0.038, 0.045],
  [0.125, -0.4, 0.034, 0.04],
  [0.18, -0.355, 0.03, 0.035],
];

function traceToe(ctx, [x, y, rx, ry]) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

export function drawFoot(ctx, item, footLength, color, { highlight = false, letter = true } = {}) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot * RAD);

  ctx.save();
  ctx.scale(footLength, footLength);
  if (item.side === 'left') ctx.scale(-1, 1);
  if (highlight) {
    // White rim around the foot that moves on this step.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.07;
    ctx.lineJoin = 'round';
    traceSole(ctx);
    ctx.stroke();
    for (const toe of TOES) {
      traceToe(ctx, toe);
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  traceSole(ctx);
  ctx.fill();
  for (const toe of TOES) {
    traceToe(ctx, toe);
    ctx.fill();
  }
  ctx.restore();

  if (letter) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.font = `bold ${footLength * 0.3}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.side === 'left' ? 'L' : 'R', 0, footLength * 0.15);
  }
  ctx.restore();
}

// Quadratic curve from points[0] to points[2], bent by the control point points[1].
export function drawArrow(ctx, item, color) {
  const [[x0, y0], [cx, cy], [x1, y1]] = item.points;
  let dx = x1 - cx;
  let dy = y1 - cy;
  if (Math.hypot(dx, dy) < 1e-6) {
    dx = x1 - x0;
    dy = y1 - y0;
  }
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const w = item.width ?? 4;
  const head = w * 3;
  const half = w * 2.2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1 - ux * head * 0.7, y1 - uy * head * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * half, y1 - uy * head + ux * half);
  ctx.lineTo(x1 - ux * head + uy * half, y1 - uy * head - ux * half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const textFont = (size) => `bold ${size}px system-ui, "Segoe UI", sans-serif`;

export function drawText(ctx, item, color) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot * RAD);
  ctx.font = textFont(item.size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(item.text, 0, 0);
  ctx.restore();
}

// Draws one step: arrows underneath, then feet, then text on top.
// opts: alpha, highlightActive (rim the moving foot), dimInactive, letters
export function drawStep(ctx, step, kata, colors, opts = {}) {
  const { alpha = 1, highlightActive = false, dimInactive = false, letters = true } = opts;
  const anyActive = step.items.some((i) => i.type === 'foot' && i.active);
  ctx.save();
  for (const item of step.items) {
    if (item.type !== 'arrow') continue;
    ctx.globalAlpha = alpha;
    drawArrow(ctx, item, colors.arrow);
  }
  for (const item of step.items) {
    if (item.type !== 'foot') continue;
    ctx.globalAlpha = alpha * (dimInactive && anyActive && !item.active ? 0.55 : 1);
    drawFoot(ctx, item, kata.footLength, colors[item.side], {
      highlight: highlightActive && item.active,
      letter: letters,
    });
  }
  for (const item of step.items) {
    if (item.type !== 'text') continue;
    ctx.globalAlpha = alpha;
    drawText(ctx, item, colors.text);
  }
  ctx.restore();
}

// Rough bounding box [minX, minY, maxX, maxY] of all items in the given steps.
export function stepsBounds(steps, footLength) {
  let b = null;
  const add = (x0, y0, x1, y1) => {
    b = b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1];
  };
  for (const step of steps) {
    for (const i of step.items) {
      if (i.type === 'foot') {
        const r = footLength * 0.55;
        add(i.x - r, i.y - r, i.x + r, i.y + r);
      } else if (i.type === 'text') {
        const r = Math.max(i.text.length * i.size * 0.35, i.size);
        add(i.x - r, i.y - r, i.x + r, i.y + r);
      } else if (i.type === 'arrow') {
        for (const [x, y] of i.points) add(x, y, x, y);
      }
    }
  }
  return b ?? [-50, -50, 50, 50];
}

// View that fits a bounding box into a w x h area: { cx, cy, zoom }.
export function fitView(bounds, w, h, pad = 30) {
  const [x0, y0, x1, y1] = bounds;
  const zoom = Math.min((w - pad * 2) / Math.max(x1 - x0, 1), (h - pad * 2) / Math.max(y1 - y0, 1));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, zoom: Math.max(0.2, Math.min(zoom, 12)) };
}
