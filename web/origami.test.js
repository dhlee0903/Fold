// node --test web/ 로 실행. 코틀린 엔진과 같은 성질을 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_LAYERS, MOUNTAIN, NEGATIVE, POSITIVE, VALLEY,
  affects, applyFold, boundsOf, layerCount, lineThrough, modelBounds, pointToPointFold,
  polygonArea, pose, reflect, segmentInside, sheet, splitPolygon, topLayers, totalArea,
  vec, vertical, horizontal,
} from './origami.js';
import { FoldSession, MODELS, modelById, progressFromHingeAngle } from './models.js';

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected=${expected} actual=${actual}`);

const square = sheet(2, 2)[0].polygon;
const halfFold = (direction = VALLEY, layers = ALL_LAYERS) => ({
  title: '반 접기', instruction: '', crease: vertical(0), movingSide: POSITIVE, direction, layers,
});

test('수직선 반사는 x 부호를 바꾼다', () => {
  const p = reflect(vertical(0), vec(2, 3));
  close(p.x, -2, 'x');
  close(p.y, 3, 'y');
});

test('대각선 반사로 모서리가 반대편 축에 붙는다', () => {
  const p = reflect(lineThrough(vec(0, 0), vec(-1, -1)), vec(-1, 0));
  close(p.x, 0, 'x');
  close(p.y, -1, 'y');
});

test('자른 조각들의 넓이 합은 원본과 같다', () => {
  const [positive, negative] = splitPolygon(square, lineThrough(vec(0.3, -1), vec(-0.7, 1)));
  close(polygonArea(positive) + polygonArea(negative), polygonArea(square));
});

test('종이를 비껴가는 선은 한쪽만 남긴다', () => {
  const [positive, negative] = splitPolygon(square, vertical(5));
  assert.equal(positive, null);
  close(polygonArea(negative), 4);
});

test('모서리에 스치는 선은 실오라기 조각을 만들지 않는다', () => {
  assert.equal(splitPolygon(square, vertical(1))[0], null);
});

test('접어도 종이 넓이는 그대로다', () => {
  close(totalArea(applyFold(sheet(2, 2), halfFold())), 4);
});

test('반 접으면 두 겹이 되고 폭이 절반이 된다', () => {
  const folded = applyFold(sheet(2, 2), halfFold());
  assert.equal(layerCount(folded), 2);
  const bounds = modelBounds(folded);
  close(bounds.width, 1, 'width');
  assert.ok(bounds.maxX <= 1e-9, '접힌 종이는 왼쪽 반평면에만 있어야 한다');
});

test('넘어간 겹은 뒷면이 보이고 골접기는 맨 위, 산접기는 맨 아래에 쌓인다', () => {
  const valley = applyFold(sheet(2, 2), halfFold());
  assert.ok(valley.reduce((a, b) => (a.layer > b.layer ? a : b)).flipped);
  const mountain = applyFold(sheet(2, 2), halfFold(MOUNTAIN));
  assert.ok(mountain.reduce((a, b) => (a.layer < b.layer ? a : b)).flipped);
});

test('앞장만 접기는 선택한 겹만 움직인다', () => {
  const two = applyFold(sheet(2, 2), halfFold());
  const front = applyFold(two, {
    title: '', instruction: '', crease: vertical(-0.5), movingSide: NEGATIVE, direction: VALLEY, layers: topLayers(1),
  });
  assert.equal(front.length, 3, '앞장만 갈라져 면이 셋이어야 한다');
  const moved = front.reduce((a, b) => (a.layer > b.layer ? a : b));
  assert.ok(moved.polygon.every((p) => p.x >= -0.5 - 1e-9), '앞장은 주름선 오른쪽으로 넘어가야 한다');
  assert.ok(front.some((f) => f.polygon.some((p) => p.x <= -1 + 1e-9)), '뒷장은 그대로 남아 있어야 한다');
  close(totalArea(front), 4);
});

test('종이를 비껴가는 주름선은 아무것도 바꾸지 않는다', () => {
  const step = { title: '', instruction: '', crease: vertical(9), movingSide: POSITIVE, direction: VALLEY, layers: ALL_LAYERS };
  assert.equal(affects(sheet(2, 2), step), false);
  assert.deepEqual(applyFold(sheet(2, 2), step), sheet(2, 2));
});

test('진행률 1의 중간 자세는 완전히 접은 결과와 같다', () => {
  const step = halfFold();
  const moving = pose(sheet(2, 2), step, 1).filter((f) => f.moving);
  close(moving.reduce((sum, f) => sum + polygonArea(f.polygon), 0), 2);
  const posedBounds = boundsOf(moving.flatMap((f) => f.polygon));
  const foldedBounds = modelBounds(applyFold(sheet(2, 2), step));
  close(posedBounds.minX, foldedBounds.minX, 'minX');
  close(posedBounds.maxX, foldedBounds.maxX, 'maxX');
});

test('접는 중에는 골접기가 앞으로, 산접기가 뒤로 뜬다', () => {
  assert.ok(pose(sheet(2, 2), halfFold(), 0.5).find((f) => f.moving).lift > 0);
  assert.ok(pose(sheet(2, 2), halfFold(MOUNTAIN), 0.5).find((f) => f.moving).lift < 0);
});

test('주름선 안내 구간은 상자를 가로지른다', () => {
  const box = boundsOf(square);
  const [a, b] = segmentInside(vertical(0), box);
  close(a.x, 0, 'a.x');
  close(Math.abs(a.y - b.y), 2, '길이');
  assert.equal(segmentInside(horizontal(-3), box), null);
});

test('모든 작품은 단계마다 종이를 실제로 접고 넓이를 지킨다', () => {
  for (const model of MODELS.filter((m) => m.steps.length > 0)) {
    let paper = model.sheet();
    const startArea = totalArea(paper);
    model.steps.forEach((step, i) => {
      assert.ok(affects(paper, step), `[${model.name}] ${i + 1}번째 단계가 종이를 지나지 않습니다`);
      paper = applyFold(paper, step);
      assert.ok(Math.abs(totalArea(paper) - startArea) < 1e-6, `[${model.name}] 넓이가 변했습니다`);
    });
  }
});

test('부채는 네 칸으로 포개진다', () => {
  const fan = modelById('fan');
  const folded = fan.steps.reduce((paper, step) => applyFold(paper, step), fan.sheet());
  assert.equal(layerCount(folded), 4);
  close(modelBounds(folded).width, 0.5, 'width');
});

test('비행기는 접을수록 폭이 좁아진다', () => {
  const plane = modelById('plane');
  let paper = plane.sheet();
  let width = modelBounds(paper).width;
  for (const step of plane.steps) {
    paper = applyFold(paper, step);
    const next = modelBounds(paper).width;
    assert.ok(next <= width + 1e-9, `폭이 넓어졌습니다: ${width} -> ${next}`);
    width = next;
  }
  assert.ok(width <= 1 + 1e-9);
});

test('힌지 각도 180도는 펴짐, 0도는 완전히 접힘', () => {
  assert.equal(progressFromHingeAngle(180), 0);
  assert.equal(progressFromHingeAngle(0), 1);
  close(progressFromHingeAngle(90), 0.5);
  assert.equal(progressFromHingeAngle(200), 0);
  assert.equal(progressFromHingeAngle(-10), 1);
});

test('한 번 접었다 펴면 한 단계만 진행한다', () => {
  const session = new FoldSession(modelById('fan'));
  assert.equal(session.update(0.8), 'committed');
  assert.equal(session.stepIndex, 1);
  assert.equal(session.update(0.95), null, '더 접어도 넘어가지 않는다');
  assert.equal(session.update(1), null);
  assert.equal(session.update(0.1), 'armed');
  assert.equal(session.update(0.9), 'committed');
  assert.equal(session.stepIndex, 2);
});

test('살짝 접었다 펴는 정도로는 단계가 넘어가지 않는다', () => {
  const session = new FoldSession(modelById('fan'));
  assert.equal(session.update(0.5), null);
  assert.equal(session.update(0.71), null);
  assert.equal(session.update(0), null);
  assert.equal(session.stepIndex, 0);
});

test('마지막 단계를 접으면 완성 신호가 온다', () => {
  const session = new FoldSession(modelById('fan'));
  session.update(1); session.update(0);
  session.update(1); session.update(0);
  assert.equal(session.update(1), 'completed');
  assert.ok(session.isComplete);
  assert.equal(session.currentStep, null);
  assert.equal(session.update(1), null);
});

test('되돌리기는 직전 단계를 취소한다', () => {
  const session = new FoldSession(modelById('hat'));
  session.update(1); session.update(0);
  session.update(1); session.update(0);
  assert.equal(session.stepIndex, 2);
  assert.ok(session.undo());
  assert.equal(session.stepIndex, 1);
  assert.ok(session.armed, '펴져 있으면 바로 다시 접을 수 있어야 한다');
  assert.ok(session.undo());
  assert.equal(session.canUndo, false);
  assert.equal(session.undo(), false);
  assert.deepEqual(session.paper, modelById('hat').sheet());
});

test('자유 모드는 그은 주름선을 그때그때 접고 완성으로 끝나지 않는다', () => {
  const session = new FoldSession(modelById('free'));
  assert.equal(session.currentStep, null);
  assert.equal(session.update(1), null);
  session.update(0);
  session.queueStep(pointToPointFold(vec(-1, 0), vec(1, 0)));
  assert.equal(session.update(1), 'committed');
  assert.equal(layerCount(session.paper), 2);
  assert.equal(session.isComplete, false);
});

test('짚은 점이 도착한 점 자리로 옮겨진다', () => {
  const step = pointToPointFold(vec(-1, -1), vec(0.4, 0.6));
  const landed = reflect(step.crease, vec(-1, -1));
  close(landed.x, 0.4, 'x');
  close(landed.y, 0.6, 'y');
  assert.equal(pointToPointFold(vec(0, 0), vec(0.01, 0.01)), null, '손가락을 거의 안 움직이면 접지 않는다');
});

test('중간 자세는 확정 전에만 움직인다', () => {
  const session = new FoldSession(modelById('fan'));
  session.update(0.4);
  assert.ok(session.pose().some((f) => f.moving));
  session.update(0.8);
  assert.ok(session.pose().every((f) => !f.moving), '확정 뒤에는 다시 펴기 전까지 멈춰 있어야 한다');
});

test('종이를 반 넘게 끌고 놓으면 접힌 채로 남는다', () => {
  const session = new FoldSession(modelById('fan'));
  session.dragTo(0.3);
  assert.ok(session.dragging);
  assert.ok(session.pose().some((f) => f.moving), '끄는 동안 종이가 따라 움직인다');
  assert.equal(session.releaseDrag(), null, '90도를 못 넘기면 되돌아간다');
  assert.equal(session.stepIndex, 0);
  assert.equal(session.dragging, false);

  session.dragTo(0.8);
  assert.equal(session.releaseDrag(), 'committed');
  assert.equal(session.stepIndex, 1);
  assert.equal(layerCount(session.paper), 2);
});

test('손으로 접으면 기기를 다시 펴지 않아도 다음 단계를 접을 수 있다', () => {
  const session = new FoldSession(modelById('fan'));
  session.dragTo(1);
  session.releaseDrag();
  assert.ok(session.armed, '곧바로 다음 단계를 접을 수 있어야 한다');
  assert.equal(session.progress, 0);
  session.dragTo(1);
  assert.equal(session.releaseDrag(), 'committed');
  assert.equal(session.stepIndex, 2);
});

test('손으로 접은 것도 되돌릴 수 있다', () => {
  const session = new FoldSession(modelById('hat'));
  session.dragTo(1);
  session.releaseDrag();
  assert.equal(session.stepIndex, 1);
  assert.ok(session.undo());
  assert.equal(session.stepIndex, 0);
  assert.deepEqual(session.paper, modelById('hat').sheet());
});

test('마지막 단계를 손으로 접으면 완성 신호가 온다', () => {
  const session = new FoldSession(modelById('fan'));
  session.dragTo(1); session.releaseDrag();
  session.dragTo(1); session.releaseDrag();
  session.dragTo(1);
  assert.equal(session.releaseDrag(), 'completed');
  assert.ok(session.isComplete);
});

test('끄는 도중에는 단계가 넘어가지 않는다', () => {
  const session = new FoldSession(modelById('fan'));
  session.dragTo(0.99);
  assert.equal(session.stepIndex, 0, '손을 떼기 전에는 확정되지 않는다');
  session.cancelDrag();
  assert.equal(session.stepIndex, 0);
  assert.equal(session.shownProgress, 0);
});
