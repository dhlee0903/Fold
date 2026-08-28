// 책상 위에 종이 한 장.
//
// 접는 것은 기기가 하는 일이다. 화면을 접으면 화면이 꺾이는 그 선에서 종이도 꺾인다.
// 손이 하는 일은 종이를 그 선 위로 옮기고 각도를 맞추는 것이다.
import { ALL_LAYERS, VALLEY, modelBounds, segmentInside, sheet, vec } from './origami.js';
import { FoldSession } from './models.js';
import {
  centeredFit, hingeCrease, hitsPaper, makeTransform, sideOfScreenPoint, toPaper, toScreen,
} from './layout.js';
import { readHinge, watchPosture } from './hinge.js';
import { paintDesk } from './desk.js';

const canvas = document.getElementById('paper');
const hintText = document.getElementById('hint');
const context = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** A4에 가까운 비율의 종이 한 장. */
const PAPER = { width: 2, height: 2.8 };
const deskModel = {
  id: 'desk',
  name: '종이',
  description: '',
  sheet: () => sheet(PAPER.width, PAPER.height),
  steps: [],
  freeform: true,
};

const session = new FoldSession(deskModel);

/** 종이가 책상 위 어디에, 얼마나 돌아간 채로 놓였는지. */
const placement = { origin: vec(0, 0), angle: 0, scale: 1, mid: vec(0, 0) };

let hinge = readHinge();
let transform = null;
let crease = null;
let deskImage = null;
let viewport = { width: 0, height: 0 };
let ratio = 1;
let busy = false;

// --- 색 ---
let palette = readPalette();

function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(name).trim();
  return {
    front: read('--paper-front'),
    back: read('--paper-back'),
    edge: read('--paper-edge'),
    shadow: read('--paper-shadow'),
    crease: read('--crease'),
    desk: {
      light: read('--desk-light'),
      dark: read('--desk-dark'),
      grainRgb: read('--desk-grain-rgb'),
      seam: read('--desk-seam'),
      sheen: read('--desk-sheen'),
    },
  };
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  palette = readPalette();
  deskImage = paintDesk(viewport.width, viewport.height, ratio, palette.desk);
  draw();
});

// --- 배치 ---
const paperCenter = () => {
  const bounds = modelBounds(session.paper);
  return vec(bounds.centerX, bounds.centerY);
};

function rebuild() {
  transform = makeTransform({
    u: vec(1, 0),
    n: vec(0, 1),
    U: vec(Math.cos(placement.angle), Math.sin(placement.angle)),
    scale: placement.scale,
    mid: placement.mid,
    origin: placement.origin,
  });
  crease = hingeCrease(transform, hinge);
}

/** 힌지를 한가운데 두고 위아래(또는 좌우)로 같은 만큼 쓰는 영역. */
function hingeBand() {
  const margin = Math.min(28, viewport.width * 0.06);
  const safe = {
    left: margin,
    top: margin,
    width: Math.max(1, viewport.width - margin * 2),
    height: Math.max(1, viewport.height - margin * 2),
  };
  if (hinge.orientation === 'vertical') {
    const half = Math.min(hinge.x - safe.left, safe.left + safe.width - hinge.x);
    return { left: hinge.x - half, top: safe.top, width: 2 * half, height: safe.height };
  }
  const half = Math.min(hinge.y - safe.top, safe.top + safe.height - hinge.y);
  return { left: safe.left, top: hinge.y - half, width: safe.width, height: 2 * half };
}

/** 새 종이를 접히는 선 한가운데에 반듯하게 놓는다. */
function placeOnHinge() {
  const fitted = centeredFit(deskModel.sheet(), hingeBand());
  placement.scale = fitted.scale;
  placement.angle = 0;
  placement.mid = paperCenter();
  placement.origin = fitted.origin;
  rebuild();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  viewport = { width: rect.width, height: rect.height };
  ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  deskImage = paintDesk(viewport.width, viewport.height, ratio, palette.desk);
  hinge = readHinge();

  if (!transform) {
    placeOnHinge();
    return;
  }
  // 화면이 바뀌어도 종이는 놓인 자리를 지킨다. 화면 밖으로 나가지만 않게 붙든다.
  placement.origin = vec(
    Math.min(Math.max(placement.origin.x, 0), viewport.width),
    Math.min(Math.max(placement.origin.y, 0), viewport.height),
  );
  rebuild();
}

// --- 그리기 ---
function tracePath(polygon) {
  context.beginPath();
  polygon.forEach((point, i) => {
    const screen = toScreen(transform, point);
    if (i === 0) context.moveTo(screen.x, screen.y);
    else context.lineTo(screen.x, screen.y);
  });
  context.closePath();
}

function drawHingeLine() {
  const horizontal = hinge.orientation !== 'vertical';
  context.save();
  context.setLineDash([9, 10]);
  context.lineWidth = 1;
  context.strokeStyle = palette.crease;
  context.globalAlpha = hinge.real ? 0.7 : 0.5;
  context.beginPath();
  if (horizontal) {
    context.moveTo(0, hinge.y);
    context.lineTo(viewport.width, hinge.y);
  } else {
    context.moveTo(hinge.x, 0);
    context.lineTo(hinge.x, viewport.height);
  }
  context.stroke();
  context.restore();
}

function draw() {
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  if (deskImage) context.drawImage(deskImage, 0, 0, viewport.width, viewport.height);
  context.lineJoin = 'round';

  drawHingeLine();

  const posed = session.pose();

  // 책상에 놓인 종이 그림자. 면마다 그리면 겹치는 곳이 겹겹이 어두워지므로 한 번에 그린다.
  context.save();
  context.translate(2, 6);
  context.filter = 'blur(7px)';
  context.fillStyle = palette.shadow;
  context.beginPath();
  for (const facet of posed) {
    facet.polygon.forEach((point, i) => {
      const screen = toScreen(transform, point);
      if (i === 0) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    context.closePath();
  }
  context.fill();
  context.restore();

  for (const facet of posed) {
    if (Math.abs(facet.lift) > 1e-3) {
      const drop = Math.max(-26, Math.min(26, facet.lift * transform.scale * 0.28));
      context.save();
      context.translate(drop * 0.6, drop);
      tracePath(facet.polygon);
      context.filter = 'blur(6px)';
      context.fillStyle = palette.shadow;
      context.fill();
      context.restore();
    }
    tracePath(facet.polygon);
    context.fillStyle = facet.flipped ? palette.back : palette.front;
    context.fill();
    const shade = Math.max(-0.22, Math.min(0.22, facet.lift * 0.3));
    if (Math.abs(shade) > 0.01) {
      context.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      context.fill();
    }
    context.strokeStyle = palette.edge;
    context.lineWidth = 1;
    context.stroke();
  }

  // 종이를 지나가는 부분은 진하게: 여기가 접히는 자리다.
  if (!busy && crease) {
    const segment = segmentInside(crease, modelBounds(session.paper));
    if (segment) {
      const [a, b] = segment.map((p) => toScreen(transform, p));
      context.save();
      context.setLineDash([7, 7]);
      context.strokeStyle = palette.crease;
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.restore();
    }
  }
}

// --- 접기: 화면이 접힐 때만 ---
const creaseTouchesPaper = () => !!segmentInside(crease, modelBounds(session.paper));

/** 화면에서 접힐 때 움직이는 쪽(가로 힌지면 위 화면). */
function movingSideOfDevice() {
  const point = hinge.orientation === 'vertical'
    ? vec(hinge.x + 120, hinge.y)
    : vec(hinge.x, hinge.y - 120);
  return sideOfScreenPoint(transform, crease, point);
}

function foldAtHinge() {
  if (busy) return;
  if (!creaseTouchesPaper()) {
    showHint('종이를 접히는 선 위에 올려 주세요');
    return;
  }
  session.queueStep({
    title: '',
    instruction: '',
    crease,
    movingSide: movingSideOfDevice(),
    direction: VALLEY,
    layers: ALL_LAYERS,
  });
  session.dragTo(0);
  hideHint();

  const duration = reducedMotion.matches ? 1 : 420;
  const start = performance.now();
  busy = true;
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    session.dragTo(k * (2 - k));
    draw();
    if (k < 1) {
      requestAnimationFrame(tick);
      return;
    }
    session.releaseDrag();
    busy = false;
    // 접힌 종이는 접힌 자리에 그대로 둔다. 다음 접기는 사용자가 다시 올려놓고 한다.
    draw();
    navigator.vibrate?.(12);
  };
  requestAnimationFrame(tick);
}

// --- 손: 종이를 옮기고 돌리기 ---
const pointers = new Map();
let anchor = null;

const screenPoint = (event) => {
  const rect = canvas.getBoundingClientRect();
  return vec(event.clientX - rect.left, event.clientY - rect.top);
};

/** 지금 닿아 있는 손가락들의 한가운데와, 두 손가락이면 그 사이의 각도. */
function grip() {
  const points = [...pointers.values()];
  if (!points.length) return null;
  if (points.length === 1) return { center: points[0], angle: null };
  const [a, b] = points;
  return {
    center: vec((a.x + b.x) / 2, (a.y + b.y) / 2),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

canvas.addEventListener('pointerdown', (event) => {
  if (busy) return;
  const point = screenPoint(event);
  // 종이를 짚었을 때만 잡힌다. 책상을 짚으면 아무 일도 없다.
  if (!pointers.size && !hitsPaper(session.pose(), toPaper(transform, point))) return;
  pointers.set(event.pointerId, point);
  anchor = grip();
  canvas.setPointerCapture(event.pointerId);
  hideHint();
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, screenPoint(event));
  const now = grip();
  if (!anchor || !now) return;

  // 손가락이 움직인 만큼 종이도 따라 움직인다.
  placement.origin = vec(
    placement.origin.x + (now.center.x - anchor.center.x),
    placement.origin.y + (now.center.y - anchor.center.y),
  );

  // 두 손가락이면 그 사이가 벌어진 각도만큼 종이를 돌린다. 손가락 한가운데가 축이다.
  if (now.angle !== null && anchor.angle !== null) {
    const turn = now.angle - anchor.angle;
    placement.angle += turn;
    const dx = placement.origin.x - now.center.x;
    const dy = placement.origin.y - now.center.y;
    placement.origin = vec(
      now.center.x + dx * Math.cos(turn) - dy * Math.sin(turn),
      now.center.y + dx * Math.sin(turn) + dy * Math.cos(turn),
    );
  }

  anchor = now;
  rebuild();
  draw();
});

function releasePointer(event) {
  if (!pointers.delete(event.pointerId)) return;
  anchor = grip();
}

canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);

// 마우스로도 각도를 바꿀 수 있게: 휠을 굴리면 종이가 돈다.
canvas.addEventListener('wheel', (event) => {
  if (busy) return;
  event.preventDefault();
  placement.angle += event.deltaY * 0.0022;
  rebuild();
  draw();
}, { passive: false });

// 되돌리기와 새 종이
canvas.addEventListener('dblclick', () => {
  if (!busy && session.undo()) draw();
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    foldAtHinge();
  } else if (event.code === 'Escape') {
    session.reset(deskModel);
    placeOnHinge();
    draw();
  } else if (event.code === 'Backspace') {
    event.preventDefault();
    if (!busy && session.undo()) draw();
  }
});

// --- 안내 문구는 잠깐 보였다 사라진다 ---
let hintTimer = null;

function hideHint() {
  hintText.dataset.gone = 'true';
  clearTimeout(hintTimer);
}

function showHint(text) {
  hintText.textContent = text;
  hintText.dataset.gone = 'false';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 6000);
}

// --- 시작 ---
resize();
draw();

new ResizeObserver(() => {
  resize();
  draw();
}).observe(document.body);

watchPosture((folded) => {
  if (folded) foldAtHinge();
});

showHint(
  hinge.real
    ? '끌어서 옮기고, 두 손가락으로 돌리세요 · 화면을 접으면 이 선에서 접힙니다'
    : '끌어서 옮기고, 두 손가락으로 돌리세요 · 스페이스로 접습니다',
);
