// 책상 위에 종이 한 장. 기기가 접히는 자리가 곧 종이가 접히는 자리다.
import {
  ALL_LAYERS, NEGATIVE, POSITIVE, VALLEY,
  modelBounds, segmentInside, sheet, signedDistance, vec,
} from './origami.js';
import { DRAG_COMMIT, FoldSession } from './models.js';
import { centeredFit, hingeCrease, makeTransform, sideOfScreenPoint, toPaper, toScreen } from './layout.js';
import { readHinge, watchPosture } from './hinge.js';

const canvas = document.getElementById('paper');
const hintText = document.getElementById('hint');
const context = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** A4에 가까운 비율의 종이 한 장. */
const PAPER = { width: 2, height: 2.8 };
const desk = {
  id: 'desk',
  name: '종이',
  description: '',
  sheet: () => sheet(PAPER.width, PAPER.height),
  steps: [],
  freeform: true,
};

const session = new FoldSession(desk);
let hinge = readHinge();
let transform = null;
let crease = null;
let gesture = null;
let busy = false;
let ratio = 1;

// --- 색은 CSS에서 읽어 라이트/다크를 함께 따라간다 ---
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
  };
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  palette = readPalette();
  draw();
});

// --- 배치: 종이는 언제나 힌지를 가로질러 놓인다 ---

/** 조작할 것이 없으므로 화면 전체가 책상이다. 가장자리만 조금 비워 둔다. */
function safeArea() {
  const margin = Math.min(28, window.innerWidth * 0.06);
  return {
    left: margin,
    top: margin,
    width: Math.max(1, window.innerWidth - margin * 2),
    height: Math.max(1, window.innerHeight - margin * 2),
  };
}

/** 힌지를 한가운데 두고 위아래(또는 좌우)로 같은 만큼 쓰는 영역. */
function hingeBand(safe) {
  if (hinge.orientation === 'vertical') {
    const half = Math.min(hinge.x - safe.left, safe.left + safe.width - hinge.x);
    return { left: hinge.x - half, top: safe.top, width: 2 * half, height: safe.height };
  }
  const half = Math.min(hinge.y - safe.top, safe.top + safe.height - hinge.y);
  return { left: safe.left, top: hinge.y - half, width: safe.width, height: 2 * half };
}

function layout() {
  const rect = canvas.getBoundingClientRect();
  ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));

  hinge = readHinge();
  const band = hingeBand(safeArea());
  const fitted = centeredFit(desk.sheet(), band);
  // 접기 시작한 뒤에는 배율을 유지한다. 접을수록 종이가 작아지는 게 실제와 같다.
  transform = makeTransform({
    u: fitted.u,
    n: fitted.n,
    U: fitted.U,
    scale: transform ? transform.scale : fitted.scale,
    mid: paperCenter(),
    origin: fitted.origin,
  });
  crease = hingeCrease(transform, hinge);
}

function paperCenter() {
  const bounds = modelBounds(session.paper);
  return vec(bounds.centerX, bounds.centerY);
}

/** 접고 나면 종이를 다시 힌지 위로 미끄러뜨린다. 그래야 다음 번에도 그 자리에서 접힌다. */
function slideOntoHinge() {
  const from = transform.mid;
  const to = paperCenter();
  const duration = reducedMotion.matches ? 1 : 320;
  const start = performance.now();
  busy = true;
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = k * (2 - k);
    transform = makeTransform({
      u: transform.u,
      n: transform.n,
      U: transform.U,
      scale: transform.scale,
      mid: vec(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased),
      origin: transform.origin,
    });
    crease = hingeCrease(transform, hinge);
    draw();
    if (k < 1) requestAnimationFrame(tick);
    else busy = false;
  };
  requestAnimationFrame(tick);
}

// --- 그리기 ---
function tracePath(polygon) {
  context.beginPath();
  polygon.forEach((point, i) => {
    const s = toScreen(transform, point);
    if (i === 0) context.moveTo(s.x, s.y);
    else context.lineTo(s.x, s.y);
  });
  context.closePath();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.lineJoin = 'round';

  const posed = session.pose();

  // 책상에 놓인 종이 그림자. 면마다 그리면 겹치는 곳이 겹겹이 어두워지므로 한 번에 그린다.
  context.save();
  // 좌표는 경로를 만드는 순간의 변환을 따르므로 옮기고 나서 그린다.
  context.translate(2, 5);
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
      context.fillStyle = palette.shadow;
      context.filter = 'blur(6px)';
      context.fill();
      context.restore();
    }
    tracePath(facet.polygon);
    context.fillStyle = facet.flipped ? palette.back : palette.front;
    context.fill();
    // 들린 만큼 밝기를 살짝 바꿔 종이가 떠오른 것을 보여 준다.
    const shade = Math.max(-0.22, Math.min(0.22, facet.lift * 0.3));
    if (Math.abs(shade) > 0.01) {
      context.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      context.fill();
    }
    context.strokeStyle = palette.edge;
    context.lineWidth = 1;
    context.stroke();
  }

  // 접히게 될 자리를 종이 위에만 옅게 그어 둔다.
  if (!session.dragging && crease) {
    const segment = segmentInside(crease, modelBounds(session.paper));
    if (segment) {
      const [a, b] = segment.map((p) => toScreen(transform, p));
      context.save();
      context.setLineDash([7, 8]);
      context.strokeStyle = palette.crease;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.restore();
    }
  }
}

// --- 접기 ---

/** 힌지 선을 주름선으로 삼는 한 단계. [movingSide] 쪽이 넘어간다. */
function hingeStep(movingSide) {
  return {
    title: '',
    instruction: '',
    crease,
    movingSide,
    direction: VALLEY,
    layers: ALL_LAYERS,
  };
}

/** 화면에서 접힐 때 움직이는 쪽(가로 힌지면 위 화면). */
function movingSideOfDevice() {
  const point = hinge.orientation === 'vertical'
    ? vec(hinge.x + 120, hinge.y)
    : vec(hinge.x, hinge.y - 120);
  return sideOfScreenPoint(transform, crease, point);
}

/** 손을 뗀 뒤 접힌 자리 또는 제자리로 넘긴다. */
function settle(commit) {
  const from = session.dragProgress ?? 0;
  const to = commit ? 1 : 0;
  const duration = reducedMotion.matches ? 1 : 200;
  const start = performance.now();
  busy = true;
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    session.dragTo(from + (to - from) * k * (2 - k));
    draw();
    if (k < 1) {
      requestAnimationFrame(tick);
      return;
    }
    const folded = commit && session.releaseDrag();
    if (!folded) session.cancelDrag();
    busy = false;
    draw();
    if (folded) {
      navigator.vibrate?.(12);
      slideOntoHinge();
    }
  };
  requestAnimationFrame(tick);
}

/** 기기를 접거나 스페이스를 눌렀을 때: 접히는 자리에서 저절로 한 번 접힌다. */
function foldAtHinge() {
  if (busy || session.dragging) return;
  const step = hingeStep(movingSideOfDevice());
  if (!creaseTouchesPaper()) return;
  session.queueStep(step);
  session.dragTo(0);
  hideHint();
  settle(true);
}

function creaseTouchesPaper() {
  return !!segmentInside(crease, modelBounds(session.paper));
}

// --- 손으로 접기 ---
const paperPoint = (event) => {
  const rect = canvas.getBoundingClientRect();
  return toPaper(transform, vec(event.clientX - rect.left, event.clientY - rect.top));
};

canvas.addEventListener('pointerdown', (event) => {
  if (busy || !creaseTouchesPaper()) return;
  const point = paperPoint(event);
  const distance = signedDistance(crease, point);
  if (Math.abs(distance) < 1e-3) return;

  // 잡은 쪽이 넘어간다. 위를 잡으면 위가, 아래를 잡으면 아래가 접힌다.
  const movingSide = distance > 0 ? POSITIVE : NEGATIVE;
  session.queueStep(hingeStep(movingSide));
  session.dragTo(0);
  gesture = { sign: distance > 0 ? 1 : -1, span: Math.abs(distance) };
  canvas.setPointerCapture(event.pointerId);
  hideHint();
  draw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!gesture) return;
  const distance = signedDistance(crease, paperPoint(event)) * gesture.sign;
  // 잡은 점의 주름선까지 거리는 접히는 동안 d0·cos(θ)로 줄어든다. 그 역이 접힌 각도다.
  const cosine = Math.max(-1, Math.min(1, distance / gesture.span));
  session.dragTo(Math.acos(cosine) / Math.PI);
  draw();
});

function endGesture(commit) {
  if (!gesture) return;
  gesture = null;
  settle(commit && (session.dragProgress ?? 0) >= DRAG_COMMIT);
}

canvas.addEventListener('pointerup', () => endGesture(true));
canvas.addEventListener('pointercancel', () => endGesture(false));

// 접은 것을 되돌리거나(더블 클릭) 새 종이를 꺼낸다(Esc).
canvas.addEventListener('dblclick', () => {
  if (busy) return;
  if (session.undo()) {
    slideOntoHinge();
    draw();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    foldAtHinge();
  } else if (event.code === 'Escape') {
    session.reset(desk);
    transform = null;
    layout();
    draw();
  } else if (event.code === 'Backspace') {
    event.preventDefault();
    if (!busy && session.undo()) slideOntoHinge();
  }
});

// --- 안내 문구는 한 번만 보여 주고 사라진다 ---
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
layout();
draw();

new ResizeObserver(() => {
  layout();
  draw();
}).observe(document.body);

watchPosture((folded) => {
  if (folded) foldAtHinge();
});

showHint(
  hinge.real
    ? '기기를 접으면 이 선에서 종이가 접힙니다 · 종이를 잡고 넘겨도 됩니다'
    : '종이를 잡고 점선 너머로 넘겨 보세요 · 스페이스로도 접힙니다',
);
