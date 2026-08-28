// node --test web/layout.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { POSITIVE, NEGATIVE, polygonArea, sheet, signedDistance, vec } from './origami.js';
import { centeredFit, hingeCrease, sideOfScreenPoint, toPaper, toScreen } from './layout.js';

const safe = { left: 20, top: 20, width: 360, height: 560 };
const paper = sheet(2, 2.8);
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message ?? ''} ${a} vs ${b}`);

test('종이는 놓인 자리 한가운데에 온다', () => {
  const t = centeredFit(paper, safe);
  const center = toScreen(t, vec(0, 0));
  close(center.x, safe.left + safe.width / 2, 'x');
  close(center.y, safe.top + safe.height / 2, 'y');
});

test('종이는 놓인 자리를 넘지 않는다', () => {
  const t = centeredFit(paper, safe);
  for (const point of paper[0].polygon) {
    const s = toScreen(t, point);
    assert.ok(s.x >= safe.left && s.x <= safe.left + safe.width, `x=${s.x}`);
    assert.ok(s.y >= safe.top && s.y <= safe.top + safe.height, `y=${s.y}`);
  }
});

test('종이 좌표와 화면 좌표를 오갈 수 있다', () => {
  const t = centeredFit(paper, safe);
  for (const point of [vec(0, 0), vec(0.7, -1.1), vec(-0.9, 1.3)]) {
    const back = toPaper(t, toScreen(t, point));
    close(back.x, point.x, 'x');
    close(back.y, point.y, 'y');
  }
});

test('화면 위쪽이 종이 위쪽이고, 좌우가 뒤집히지 않는다', () => {
  const t = centeredFit(paper, safe);
  const origin = toScreen(t, vec(0, 0));
  assert.ok(toScreen(t, vec(0, 1)).y < origin.y, '종이의 +y는 화면 위쪽');
  assert.ok(toScreen(t, vec(1, 0)).x > origin.x, '종이의 +x는 화면 오른쪽');
});

test('화면 한가운데 힌지는 종이를 반으로 가르는 주름선이 된다', () => {
  const t = centeredFit(paper, safe);
  const hinge = { orientation: 'horizontal', x: safe.left + safe.width / 2, y: safe.top + safe.height / 2 };
  const crease = hingeCrease(t, hinge);
  close(signedDistance(crease, vec(0, 0)), 0, '종이 한가운데를 지난다');
  // 주름선을 따라간 점들은 화면에서 힌지 높이에 그대로 있다.
  close(toScreen(t, crease.point).y, hinge.y, '화면 높이');
  close(toScreen(t, { x: crease.point.x + crease.dir.x, y: crease.point.y + crease.dir.y }).y, hinge.y, '기울기');
});

test('힌지가 화면 아래쪽이면 주름선도 종이 아래쪽으로 내려간다', () => {
  const t = centeredFit(paper, safe);
  const low = { orientation: 'horizontal', x: 200, y: safe.top + safe.height * 0.75 };
  const crease = hingeCrease(t, low);
  assert.ok(crease.point.y < 0, '종이 좌표에서 아래쪽(y<0)이어야 한다');
});

test('화면 위쪽을 가리키면 주름선의 위쪽 편이 나온다', () => {
  const t = centeredFit(paper, safe);
  const hinge = { orientation: 'horizontal', x: 200, y: safe.top + safe.height / 2 };
  const crease = hingeCrease(t, hinge);
  const above = sideOfScreenPoint(t, crease, vec(200, hinge.y - 80));
  const below = sideOfScreenPoint(t, crease, vec(200, hinge.y + 80));
  assert.notEqual(above, below);
  assert.ok(above === POSITIVE || above === NEGATIVE);
  // 위쪽 편을 접으면 종이의 위 절반이 넘어간다.
  const movingSign = above === POSITIVE ? 1 : -1;
  const upperArea = paper[0].polygon.filter((p) => signedDistance(crease, p) * movingSign > 0).length;
  assert.equal(upperArea, 2, '위 절반의 꼭짓점 두 개');
  close(polygonArea(paper[0].polygon), 2 * 2.8);
});

test('세로 힌지는 종이를 좌우로 가른다', () => {
  const t = centeredFit(paper, safe);
  const crease = hingeCrease(t, { orientation: 'vertical', x: safe.left + safe.width / 2, y: 200 });
  close(signedDistance(crease, vec(0, 0)), 0, '가운데를 지난다');
  const a = toScreen(t, crease.point);
  const b = toScreen(t, { x: crease.point.x + crease.dir.x, y: crease.point.y + crease.dir.y });
  close(a.x, b.x, '화면에서 세로선이다');
});
