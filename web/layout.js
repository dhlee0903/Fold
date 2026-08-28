// 종이를 책상(화면) 위 어디에 놓을지와, 화면의 힌지 선이 종이의 어느 주름선인지 정한다.
//
// 종이는 힌지를 가로질러 놓인다. 그래서 기기를 접으면 화면이 꺾이는 바로 그 선에서
// 종이도 꺾인다. 접는 선을 종이에 맞추는 게 아니라, 기기가 접히는 자리가 곧 주름선이다.
import { NEGATIVE, POSITIVE, dot, mul, add, sub, signedDistance, lineThrough, vec } from './origami.js';

/**
 * 종이 좌표 ↔ 화면 좌표 변환.
 *
 * 종이의 기준축 (u, n)을 화면의 (U, N)으로 보낸다. u는 주름선 방향, n은 그 법선이다.
 * N은 항상 U에서 같은 방향으로 90도 돌린 것이라 좌우가 뒤집히는 일이 없다.
 */
export function makeTransform({ u, n, U, scale, mid, origin }) {
  const N = vec(U.y, -U.x);
  return { u, n, U, N, scale, mid, origin };
}

export const toScreen = (t, p) => {
  const d = sub(p, t.mid);
  const along = dot(d, t.u) * t.scale;
  const across = dot(d, t.n) * t.scale;
  return vec(
    t.origin.x + along * t.U.x + across * t.N.x,
    t.origin.y + along * t.U.y + across * t.N.y,
  );
};

export const toPaper = (t, s) => {
  const d = vec((s.x - t.origin.x) / t.scale, (s.y - t.origin.y) / t.scale);
  return add(t.mid, add(mul(t.u, dot(d, t.U)), mul(t.n, dot(d, t.N))));
};

const MARGIN = 0.86;
const MIN_SCALE = 1e-4;

/** 종이 한 장을 [safe] 한가운데에 놓는다. 접기 시작한 뒤에도 배율은 그대로 둔다. */
export function centeredFit(facets, safe) {
  const points = facets.flatMap((f) => f.polygon);
  if (!points.length) {
    return makeTransform({
      u: vec(1, 0), n: vec(0, 1), U: vec(1, 0), scale: 1,
      mid: vec(0, 0), origin: vec(safe.left + safe.width / 2, safe.top + safe.height / 2),
    });
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const width = Math.max(maxX - minX, MIN_SCALE);
  const height = Math.max(maxY - minY, MIN_SCALE);
  const scale = MARGIN * Math.min(safe.width / width, safe.height / height);
  return makeTransform({
    u: vec(1, 0),
    n: vec(0, 1),
    U: vec(1, 0),
    scale: Math.max(scale, MIN_SCALE),
    mid: vec((minX + maxX) / 2, (minY + maxY) / 2),
    origin: vec(safe.left + safe.width / 2, safe.top + safe.height / 2),
  });
}

/**
 * 화면의 힌지 선을 종이 좌표의 주름선으로 바꾼다.
 *
 * @param hinge {{ orientation: 'horizontal'|'vertical', x, y }} 화면 좌표의 힌지 선
 */
export function hingeCrease(transform, hinge) {
  const horizontal = hinge.orientation !== 'vertical';
  const a = horizontal ? vec(0, hinge.y) : vec(hinge.x, 0);
  const b = horizontal ? vec(100, hinge.y) : vec(hinge.x, 100);
  return lineThrough(toPaper(transform, a), toPaper(transform, b));
}

/**
 * 화면의 [point] 쪽이 주름선의 어느 편인지.
 * 기기를 접을 때 움직이는 쪽(가로 힌지면 위 화면)을 넘기려면 이 값이 필요하다.
 */
export function sideOfScreenPoint(transform, crease, point) {
  return signedDistance(crease, toPaper(transform, point)) > 0 ? POSITIVE : NEGATIVE;
}
