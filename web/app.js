// 책상 위에 종이 한 장.
//
// 접는 것은 기기가 하는 일이다. 화면을 접으면 화면이 꺾이는 그 선에서 종이도 꺾인다.
// 손이 하는 일은 종이를 그 선 위로 옮기고 각도를 맞추는 것이다.
import { ALL_LAYERS, VALLEY, affects, modelBounds, segmentInside, sheet, vec } from './origami.js';
import { FoldSession } from './models.js';
import {
  centeredFit, hingeCrease, hitsPaper, makeTransform, sideOfScreenPoint, toPaper, toScreen,
} from './layout.js';
import { readHinge, watchPosture } from './hinge.js';
import { paintDesk } from './desk.js';

const canvas = document.getElementById('paper');
const hintText = document.getElementById('hint');
const badge = document.getElementById('badge');
const settingsButton = document.getElementById('settings');
const foldButton = document.getElementById('fold');
const statusLine = document.getElementById('status');
const undoButton = document.getElementById('undo');
const resetButton = document.getElementById('reset');
const panel = document.getElementById('panel');
const shapeRow = document.getElementById('shapes');
const colorRow = document.getElementById('colors');
const context = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** 고를 수 있는 종이 모양. A4는 짧은 변 대 긴 변이 1 대 √2다. */
const SHAPES = {
  a4: { label: 'A4', width: 2, height: 2 * Math.SQRT2 },
  square: { label: '정사각형', width: 2.4, height: 2.4 },
};

/** 색종이처럼 앞면만 색이 있고 뒷면은 흰색이다. */
const COLORS = {
  white: { label: '흰색', value: null },
  red: { label: '다홍', value: '#D8503C' },
  blue: { label: '쪽빛', value: '#2F5D8C' },
  yellow: { label: '치자', value: '#E3B44B' },
  green: { label: '쑥색', value: '#5C8560' },
  ink: { label: '먹색', value: '#3B3A3C' },
};

const settings = loadSettings();

function loadSettings() {
  const fallback = { shape: 'a4', color: 'white' };
  try {
    const saved = JSON.parse(localStorage.getItem('desk-paper') ?? '{}');
    return {
      shape: saved.shape in SHAPES ? saved.shape : fallback.shape,
      color: saved.color in COLORS ? saved.color : fallback.color,
    };
  } catch {
    return fallback;
  }
}

function saveSettings() {
  try {
    localStorage.setItem('desk-paper', JSON.stringify(settings));
  } catch {
    // 저장이 막힌 곳(사생활 보호 창 등)에서도 쓰는 데는 문제가 없다.
  }
}

const deskModel = {
  id: 'desk',
  name: '종이',
  description: '',
  sheet: () => sheet(SHAPES[settings.shape].width, SHAPES[settings.shape].height),
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
  undoButton.disabled = !session.canUndo;
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
    context.fillStyle = paperFill(facet.flipped);
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

/** 색종이는 앞면만 색이 있다. 흰 종이는 뒷면만 살짝 그늘진 흰색이다. */
function paperFill(flipped) {
  const color = COLORS[settings.color].value;
  if (!color) return flipped ? palette.back : palette.front;
  return flipped ? palette.front : color;
}

// --- 접기: 화면이 접힐 때 ---
const creaseTouchesPaper = () => !!segmentInside(crease, modelBounds(session.paper));

/** 화면에서 접힐 때 움직이는 쪽(가로 힌지면 위 화면). */
function movingSideOfDevice() {
  const point = hinge.orientation === 'vertical'
    ? vec(hinge.x + 120, hinge.y)
    : vec(hinge.x, hinge.y - 120);
  return sideOfScreenPoint(transform, crease, point);
}

const hingeStep = (movingSide) => ({
  title: '',
  instruction: '',
  crease,
  movingSide,
  direction: VALLEY,
  layers: ALL_LAYERS,
});

/**
 * 종이를 접히는 자리로 데려온다.
 *
 * 한 번 접고 나면 종이가 접힌 선 한쪽으로 통째로 내려가, 선과는 가장자리만 닿는다.
 * 그대로 다시 접으면 넘어갈 부분이 없어 아무 일도 일어나지 않으므로, 접기 전에
 * 종이 한가운데를 그 선 위로 옮겨 준다.
 */
function slideOntoHinge(done) {
  const center = toScreen(transform, paperCenter());
  const target = hinge.orientation === 'vertical'
    ? vec(hinge.x, center.y)
    : vec(center.x, hinge.y);
  const from = placement.origin;
  const shift = vec(target.x - center.x, target.y - center.y);
  const duration = reducedMotion.matches ? 1 : 260;
  const start = performance.now();
  busy = true;

  const finish = () => {
    placement.origin = vec(from.x + shift.x, from.y + shift.y);
    rebuild();
    busy = false;
    draw();
    done();
  };
  const guard = setTimeout(finish, duration + 600);
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = k * (2 - k);
    placement.origin = vec(from.x + shift.x * eased, from.y + shift.y * eased);
    rebuild();
    draw();
    if (k < 1) requestAnimationFrame(tick);
    else {
      clearTimeout(guard);
      finish();
    }
  };
  if (document.visibilityState === 'visible') requestAnimationFrame(tick);
  else {
    clearTimeout(guard);
    finish();
  }
}

/** 접히는 자리에서 한 번 접는다. */
function startFold() {
  const step = hingeStep(movingSideOfDevice());
  if (!affects(session.paper, step)) {
    showHint('종이를 접히는 선 위에 올려 주세요');
    return;
  }
  session.queueStep(step);
  session.dragTo(0);
  hideHint();

  const duration = reducedMotion.matches ? 1 : 420;
  const start = performance.now();
  let done = false;
  busy = true;

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    session.dragTo(1);
    session.releaseDrag();
    busy = false;
    draw();
    navigator.vibrate?.(12);
    // 접고 나면 종이가 선 한쪽으로 내려간다. 바로 다시 접을 수 있게 그 자리로 데려다 놓는다.
    if (!affects(session.paper, hingeStep(movingSideOfDevice()))) slideOntoHinge(() => {});
  };

  // 기기를 접는 순간 화면이 꺼지거나 앱이 뒤로 가면 애니메이션 프레임이 멈춘다.
  // 그래도 접기는 끝나야 하므로, 시간이 지나면 프레임 없이도 마무리한다.
  const guard = setTimeout(finish, duration + 800);

  const tick = (now) => {
    if (done) return;
    const k = Math.min(1, (now - start) / duration);
    session.dragTo(k * (2 - k));
    draw();
    if (k < 1) requestAnimationFrame(tick);
    else finish();
  };
  if (document.visibilityState === 'visible') requestAnimationFrame(tick);
  else finish();
}

function foldAtHinge() {
  if (busy) return;
  // 접을 수 없는 자리에 있으면 먼저 종이를 데려오고 나서 접는다.
  if (!affects(session.paper, hingeStep(movingSideOfDevice()))) {
    slideOntoHinge(startFold);
    return;
  }
  startFold();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') draw();
});

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
    if (!panel.hidden) togglePanel(false);
    else newSheet();
  } else if (event.code === 'Backspace') {
    event.preventDefault();
    if (!busy && session.undo()) draw();
  }
});

// --- 도구: 되돌리기, 새 종이, 종이 설정 ---
function newSheet() {
  session.reset(deskModel);
  placeOnHinge();
  draw();
}

undoButton.addEventListener('click', () => {
  if (!busy && session.undo()) draw();
});

resetButton.addEventListener('click', () => {
  if (!busy) newSheet();
});

function togglePanel(open) {
  const show = open ?? panel.hidden;
  panel.hidden = !show;
  settingsButton.setAttribute('aria-expanded', String(show));
}

// 설정판 밖을 짚으면 닫는다. 판과 버튼 위에서 일어난 일은 밖으로 새지 않게 막는다.
const keepOpen = (event) => event.stopPropagation();
settingsButton.addEventListener('pointerdown', keepOpen);
panel.addEventListener('pointerdown', keepOpen);
settingsButton.addEventListener('click', () => togglePanel());
document.addEventListener('pointerdown', () => togglePanel(false));

function markChoices() {
  for (const button of shapeRow.children) {
    button.setAttribute('aria-pressed', String(button.dataset.shape === settings.shape));
  }
  for (const button of colorRow.children) {
    button.setAttribute('aria-pressed', String(button.dataset.color === settings.color));
  }
}

for (const [key, shape] of Object.entries(SHAPES)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset.shape = key;
  button.textContent = shape.label;
  button.addEventListener('click', () => {
    settings.shape = key;
    saveSettings();
    markChoices();
    // 모양이 바뀌면 접던 것을 이어갈 수 없으니 새 종이를 꺼낸다.
    newSheet();
  });
  shapeRow.append(button);
}

for (const [key, color] of Object.entries(COLORS)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.dataset.color = key;
  button.title = color.label;
  button.setAttribute('aria-label', color.label);
  button.style.background = color.value ?? '#FCFCFA';
  button.addEventListener('click', () => {
    settings.color = key;
    saveSettings();
    markChoices();
    draw();
  });
  colorRow.append(button);
}

markChoices();

// --- 안내 문구는 잠깐 보였다 사라진다 ---
let badgeTimer = null;

/** 기기 접힘이 감지됐는지 화면 위쪽에 또렷하게 알린다. */
function showBadge(text, tone = 'on') {
  badge.textContent = text;
  badge.dataset.tone = tone;
  badge.dataset.gone = 'false';
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badge.dataset.gone = 'true';
  }, 2800);
}

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

// 이미 접힌 채로 열면 아래 콜백이 곧바로 불린다. 그때도 안전하도록 미리 선언해 둔다.
let posture = null;
posture = watchPosture((folded) => {
  showBadge(folded ? '기기 접힘 감지' : '기기 펼침');
  if (folded) foldAtHinge();
  showStatus();
});

foldButton.addEventListener('click', () => foldAtHinge());

/** 접힘을 무엇으로 알아내고 있는지, 지금 어떤 상태인지. */
function showStatus() {
  if (!posture) return;
  const how = posture.api ? 'Device Posture API'
    : posture.media ? 'CSS device-posture'
      : '화면 크기 변화만';
  statusLine.textContent = [
    `접힘 감지: ${how}`,
    `지금: ${posture.folded ? '접힘' : '펼침'} (${posture.source})`,
    `화면: ${Math.round(window.innerWidth)} x ${Math.round(window.innerHeight)}`,
    `접히는 자리: ${hinge.real ? '기기 힌지' : '화면 한가운데'}`,
  ].join('\n');
}

window.addEventListener('resize', showStatus);
showStatus();

// 접힘을 알 수 없는 브라우저라면 처음부터 그렇다고 알려 준다. 헛되이 접어 보지 않도록.
if (!posture.api && !posture.media) {
  showBadge('이 브라우저는 접힘을 알 수 없어요 · 접기 단추로 접으세요', 'off');
}

showHint('끌어서 옮기고 두 손가락으로 돌리세요 · 화면을 90도쯤 접거나 접기 단추를 누르면 이 선에서 접힙니다');
