// 화면: 종이 그리기, 기기 자세 감지, 조작부.
import {
  MOUNTAIN, POSITIVE, VALLEY, ALL_LAYERS, topLayers,
  boundsOf, modelBounds, pointToPointFold, segmentInside, signedDistance, vec,
} from './origami.js';
import {
  COMMIT_THRESHOLD, DRAG_COMMIT, FoldSession, MODELS, RELEASE_THRESHOLD, modelById,
} from './models.js';

const el = (id) => document.getElementById(id);
const dom = {
  posture: el('posture'), stage: el('stage'), canvas: el('paper'), note: el('stageNote'),
  stepCount: el('stepCount'), stepTitle: el('stepTitle'), stepInstruction: el('stepInstruction'),
  gaugeFill: el('gaugeFill'), gaugeNeedle: el('gaugeNeedle'), angleRead: el('angleRead'), gaugeLabel: el('gaugeLabel'),
  foldRange: el('foldRange'), progressRead: el('progressRead'), foldOnce: el('foldOnce'),
  undo: el('undo'), restart: el('restart'), models: el('models'),
  freeOptions: el('freeOptions'), freeDirection: el('freeDirection'), freeLayers: el('freeLayers'),
};

const ARC_LENGTH = 151;
const context = dom.canvas.getContext('2d');

let model = MODELS[0];
let session = new FoldSession(model);
let viewBounds = boundsFor(session);
let progress = 0;
let target = 0;
let animating = false;
let freeDirection = VALLEY;
let freeTopOnly = false;
/** 손으로 종이를 잡고 있는 동안의 정보. */
let gesture = null;
/** 자유 접기 미리보기: 거의 다 접은 채로 보여 줘야 어디에 포개지는지 알 수 있다. */
const FREE_PREVIEW = 0.985;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

/** 그림이 잘리지 않도록 원래 종이와 접힌 종이를 모두 담는 상자. 접는 도중엔 바뀌지 않는다. */
function boundsFor(current) {
  const flat = modelBounds(current.model.sheet());
  const folded = modelBounds(current.paper);
  const margin = 0.08 * Math.max(flat.width, flat.height);
  return boundsOf([
    vec(Math.min(flat.minX, folded.minX) - margin, Math.min(flat.minY, folded.minY) - margin),
    vec(Math.max(flat.maxX, folded.maxX) + margin, Math.max(flat.maxY, folded.maxY) + margin),
  ]);
}

// --- 색: CSS 변수에서 읽어 와 라이트/다크를 함께 따라간다 ---
let palette = readPalette();

function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(name).trim();
  return {
    front: read('--paper-front'),
    back: read('--paper-back'),
    edge: read('--paper-edge'),
    guide: read('--guide'),
    shadow: read('--paper-shadow'),
  };
}

function refreshPalette() {
  palette = readPalette();
  draw();
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshPalette);
new MutationObserver(refreshPalette).observe(document.documentElement, { attributeFilter: ['data-theme'] });

// --- 좌표 변환 ---
let view = { scale: 1, offsetX: 0, offsetY: 0 };

function fitView() {
  const rect = dom.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  dom.canvas.width = Math.max(1, Math.round(rect.width * ratio));
  dom.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const scale = Math.min(
    rect.width / Math.max(viewBounds.width, 1e-3),
    rect.height / Math.max(viewBounds.height, 1e-3),
  ) * 0.9;
  view = {
    scale,
    offsetX: rect.width / 2 - viewBounds.centerX * scale,
    offsetY: rect.height / 2 + viewBounds.centerY * scale,
    ratio,
  };
}

const toScreen = (p) => ({ x: view.offsetX + p.x * view.scale, y: view.offsetY - p.y * view.scale });
const toPaper = (x, y) => vec((x - view.offsetX) / view.scale, (view.offsetY - y) / view.scale);

// --- 그리기 ---
function tracePath(polygon) {
  context.beginPath();
  polygon.forEach((point, i) => {
    const s = toScreen(point);
    if (i === 0) context.moveTo(s.x, s.y);
    else context.lineTo(s.x, s.y);
  });
  context.closePath();
}

function draw() {
  const rect = dom.canvas.getBoundingClientRect();
  context.setTransform(view.ratio || 1, 0, 0, view.ratio || 1, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.lineJoin = 'round';

  for (const facet of session.pose()) {
    // 들린 종이는 아래에 그림자를 만든다.
    if (Math.abs(facet.lift) > 1e-3) {
      const drop = Math.max(-24, Math.min(24, facet.lift * 14));
      context.save();
      context.translate(drop, drop);
      tracePath(facet.polygon);
      context.fillStyle = palette.shadow;
      context.fill();
      context.restore();
    }
    tracePath(facet.polygon);
    context.fillStyle = facet.flipped ? palette.back : palette.front;
    context.fill();
    // 들린 만큼 밝기를 조금 바꿔 입체감을 준다.
    const shade = Math.max(-0.3, Math.min(0.3, facet.lift * 0.35));
    if (Math.abs(shade) > 0.01) {
      context.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      context.fill();
    }
    context.strokeStyle = palette.edge;
    context.globalAlpha = 0.45;
    context.lineWidth = 1;
    context.stroke();
    context.globalAlpha = 1;
  }

  const step = session.currentStep;
  if (step) {
    const segment = segmentInside(step.crease, viewBounds);
    if (segment) {
      const [a, b] = segment.map(toScreen);
      context.save();
      context.setLineDash([8, 7]);
      context.strokeStyle = palette.guide;
      context.globalAlpha = 0.75;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.restore();
    }
  }

  if (gesture?.kind === 'free' && gesture.to) {
    const a = toScreen(gesture.from);
    const b = toScreen(gesture.to);
    context.save();
    context.setLineDash([6, 6]);
    context.strokeStyle = palette.guide;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(a.x, a.y, 6, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(b.x, b.y, 9, 0, Math.PI * 2);
    context.globalAlpha = 0.35;
    context.fill();
    context.restore();
  }
}

// --- 화면 글자 갱신 ---
function syncUi() {
  const step = session.currentStep;
  const total = model.freeform ? session.steps.length : model.steps.length;

  if (session.isComplete) {
    dom.stepCount.textContent = '완성';
    dom.stepTitle.textContent = '다 접었습니다';
    dom.stepInstruction.textContent = `종이가 ${new Set(session.paper.map((f) => f.layer)).size}겹이 됐어요. 다른 작품도 접어 보세요.`;
  } else if (!step && model.freeform) {
    dom.stepCount.textContent = '자유 접기';
    dom.stepTitle.textContent = '종이를 쓸어 주름선을 그으세요';
    dom.stepInstruction.textContent = '접을 점에서 도착할 점으로 끌면 두 점을 포개는 선이 생깁니다.';
  } else if (!step) {
    dom.stepCount.textContent = '';
    dom.stepTitle.textContent = '작품을 고르세요';
    dom.stepInstruction.textContent = '';
  } else {
    dom.stepCount.textContent = model.freeform ? '자유 접기' : `${session.stepIndex + 1} / ${total} 단계`;
    dom.stepTitle.textContent = step.title;
    dom.stepInstruction.textContent = session.armed ? step.instruction : '기기를 다시 펴면 다음 단계로 넘어갑니다.';
  }

  const shown = session.shownProgress;
  dom.angleRead.textContent = `${Math.round(180 - shown * 180)}°`;
  dom.gaugeFill.setAttribute('stroke-dashoffset', String(ARC_LENGTH * (1 - shown)));
  dom.gaugeNeedle.setAttribute('transform', `rotate(${(90 - shown * 180).toFixed(1)} 60 52)`);
  dom.gaugeLabel.textContent = session.dragging
    ? (shown >= DRAG_COMMIT ? '놓으면 접힙니다' : '더 넘겨 보세요')
    : shown >= COMMIT_THRESHOLD ? (session.armed ? '접는 중' : '한 단계 접었습니다')
      : shown <= RELEASE_THRESHOLD ? '펼친 상태' : '접는 중';
  dom.progressRead.textContent = `${Math.round(shown * 100)}%`;
  dom.foldRange.value = String(Math.round(shown * 100));
  dom.undo.disabled = !session.canUndo;
  dom.freeOptions.hidden = !model.freeform;

  const note = session.dragging ? ''
    : session.isComplete ? ''
      : model.freeform && !session.currentStep ? '종이를 쓸어 주름선을 그으세요'
        : !session.armed ? '펴면 다음 단계'
          : '종이를 잡고 점선 너머로 넘겨 보세요';
  dom.note.textContent = note;
  dom.note.dataset.show = note ? 'true' : 'false';
}

// --- 진행 상태 ---
function setProgress(next) {
  if (session.dragging) return;
  progress = Math.min(1, Math.max(0, next));
  const event = session.update(progress);
  if (event === 'committed' || event === 'completed') {
    viewBounds = boundsFor(session);
    fitView();
    navigator.vibrate?.(12);
  }
  draw();
  syncUi();
}

function animateTo(value) {
  if (session.dragging) return;
  target = value;
  if (animating) return;
  animating = true;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const speed = 1.8; // 초당 진행률
    const delta = target - progress;
    const stepSize = Math.sign(delta) * Math.min(Math.abs(delta), speed * dt);
    setProgress(progress + stepSize);
    if (Math.abs(target - progress) < 0.001) {
      setProgress(target);
      animating = false;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 한 번 접었다 펴는 동작 = 한 단계. */
function foldOnce() {
  animateTo(1);
  const waitForFold = setInterval(() => {
    if (progress >= 0.999) {
      clearInterval(waitForFold);
      animateTo(0);
    }
  }, 40);
}

// --- 기기 자세 감지 ---
function watchPosture() {
  if (!('devicePosture' in navigator)) {
    dom.posture.textContent = '이 브라우저에서는 접힘을 읽을 수 없어요 · 아래로 접으세요';
    return;
  }
  const apply = () => {
    const folded = navigator.devicePosture.type === 'folded';
    dom.posture.dataset.live = 'true';
    dom.posture.textContent = folded ? '기기 접힘 감지' : '기기 펼침 · 반쯤 접어 보세요';
    animateTo(folded ? 1 : 0);
  };
  navigator.devicePosture.addEventListener('change', apply);
  apply();
}

// --- 조작 ---
function selectModel(next) {
  model = next;
  session = new FoldSession(next);
  progress = 0;
  target = 0;
  gesture = null;
  viewBounds = boundsFor(session);
  fitView();
  draw();
  syncUi();
  for (const button of dom.models.children) {
    button.setAttribute('aria-pressed', String(button.dataset.id === next.id));
  }
}

for (const entry of MODELS) {
  const button = document.createElement('button');
  button.textContent = entry.name;
  button.dataset.id = entry.id;
  button.setAttribute('aria-pressed', String(entry.id === model.id));
  button.addEventListener('click', () => selectModel(modelById(entry.id)));
  dom.models.append(button);
}

dom.foldRange.addEventListener('input', () => {
  animating = false;
  setProgress(Number(dom.foldRange.value) / 100);
});

dom.foldOnce.addEventListener('click', foldOnce);

dom.undo.addEventListener('click', () => {
  session.undo();
  viewBounds = boundsFor(session);
  fitView();
  draw();
  syncUi();
});

dom.restart.addEventListener('click', () => selectModel(model));

dom.freeDirection.addEventListener('click', () => {
  freeDirection = freeDirection === VALLEY ? MOUNTAIN : VALLEY;
  const valley = freeDirection === VALLEY;
  dom.freeDirection.textContent = valley ? '골접기 · 앞으로' : '산접기 · 뒤로';
  dom.freeDirection.setAttribute('aria-pressed', String(!valley));
});

dom.freeLayers.addEventListener('click', () => {
  freeTopOnly = !freeTopOnly;
  dom.freeLayers.textContent = freeTopOnly ? '앞장만' : '전체 겹';
  dom.freeLayers.setAttribute('aria-pressed', String(freeTopOnly));
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.target !== document.body) return;
  event.preventDefault();
  foldOnce();
});

// --- 손으로 직접 접기 ---
// 안내가 있는 작품은 잡은 점이 주름선에서 얼마나 넘어갔는지로 접힘 각도를 정한다.
// 잡은 점의 주름선까지 거리가 d0이면, 접는 중에는 d0·cos(θ)로 줄어든다. 그 역이 곧 각도다.

/** 접히는 쪽에서 주름선에게서 가장 먼 거리. 종이 아무 데나 잡아도 넘길 수 있게 하는 기준. */
function reachOf(step, facets) {
  const sign = step.movingSide === POSITIVE ? 1 : -1;
  let far = 0;
  for (const facet of facets) {
    for (const point of facet.polygon) {
      far = Math.max(far, signedDistance(step.crease, point) * sign);
    }
  }
  return far;
}

function paperPoint(event) {
  const rect = dom.canvas.getBoundingClientRect();
  return toPaper(event.clientX - rect.left, event.clientY - rect.top);
}

/** 손을 뗀 뒤 접힌 자리 또는 제자리로 부드럽게 넘긴다. */
function settleDrag(commit) {
  const from = session.dragProgress ?? 0;
  const to = commit ? 1 : 0;
  const duration = REDUCED_MOTION.matches ? 1 : 160;
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    session.dragTo(from + (to - from) * k * (2 - k));
    draw();
    syncUi();
    if (k < 1) {
      requestAnimationFrame(tick);
      return;
    }
    if (commit && session.releaseDrag()) {
      viewBounds = boundsFor(session);
      fitView();
      navigator.vibrate?.(12);
    } else {
      session.cancelDrag();
    }
    draw();
    syncUi();
  };
  requestAnimationFrame(tick);
}

dom.canvas.addEventListener('pointerdown', (event) => {
  if (session.isComplete) return;
  animating = false; // 손이 우선
  const point = paperPoint(event);

  if (model.freeform) {
    session.cancelDrag();
    gesture = { kind: 'free', from: point, to: null };
  } else {
    const step = session.currentStep;
    if (!step) return;
    const sign = step.movingSide === POSITIVE ? 1 : -1;
    const reach = reachOf(step, session.paper);
    if (reach < 1e-6) return;
    const grabbed = signedDistance(step.crease, point) * sign;
    // 접히는 쪽을 잡았으면 그 점을, 반대쪽을 잡았으면 접히는 쪽 끝을 잡은 것으로 친다.
    gesture = { kind: 'guided', sign, span: grabbed > 0.05 ? grabbed : reach };
    session.dragTo(0);
  }
  dom.canvas.setPointerCapture(event.pointerId);
  draw();
  syncUi();
});

dom.canvas.addEventListener('pointermove', (event) => {
  if (!gesture) return;
  const point = paperPoint(event);

  if (gesture.kind === 'free') {
    gesture.to = point;
    const step = pointToPointFold(gesture.from, point, {
      direction: freeDirection,
      layers: freeTopOnly ? topLayers(1) : ALL_LAYERS,
    });
    if (step) {
      session.queueStep(step);
      session.dragTo(FREE_PREVIEW);
    }
  } else {
    const step = session.currentStep;
    if (!step) return;
    const distance = signedDistance(step.crease, point) * gesture.sign;
    const ratio = Math.max(-1, Math.min(1, distance / gesture.span));
    session.dragTo(Math.acos(ratio) / Math.PI);
  }
  draw();
  syncUi();
});

function endGesture(commit) {
  if (!gesture) return;
  const wasFree = gesture.kind === 'free';
  gesture = null;
  if (!session.dragging) {
    draw();
    syncUi();
    return;
  }
  // 자유 접기는 그은 주름선이 곧 접는 선이고, 안내 작품은 90°를 넘겼을 때만 접는다.
  settleDrag(commit && (wasFree || session.dragProgress >= DRAG_COMMIT));
}

dom.canvas.addEventListener('pointerup', () => endGesture(true));
dom.canvas.addEventListener('pointercancel', () => endGesture(false));

const resize = new ResizeObserver(() => {
  fitView();
  draw();
});
resize.observe(dom.stage);

fitView();
draw();
syncUi();
watchPosture();
