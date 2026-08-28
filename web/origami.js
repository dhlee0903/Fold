// 종이접기 엔진 (안드로이드 앱의 origami-core를 그대로 옮긴 것)
//
// 접힌 종이는 "면(다각형 + 겹 번호 + 앞뒤 여부)의 목록"이다.
// 한 단계를 접으면 주름선으로 각 면을 자르고, 움직이는 쪽을 반사시킨 뒤,
// 넘어간 겹들의 순서를 뒤집어 남은 뭉치 위(골접기) 또는 아래(산접기)에 쌓는다.

export const EPS = 1e-9;
const AREA_EPS = 1e-7;
const CLIP_EPS = 1e-9;

export const vec = (x, y) => ({ x, y });
export const add = (a, b) => vec(a.x + b.x, a.y + b.y);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y);
export const mul = (a, s) => vec(a.x * s, a.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const len = (a) => Math.hypot(a.x, a.y);

export function normalize(a) {
  const l = len(a);
  if (l <= EPS) throw new Error('0 벡터는 정규화할 수 없습니다.');
  return vec(a.x / l, a.y / l);
}

/** [point]를 지나 [dir] 방향으로 뻗는 주름선. normal 쪽이 양(+)의 반평면이다. */
export function line(point, dir) {
  const d = normalize(dir);
  return { point, dir: d, normal: vec(-d.y, d.x) };
}

export const lineThrough = (a, b) => line(a, sub(b, a));
export const horizontal = (y) => line(vec(0, y), vec(1, 0));
/** 오른쪽(x가 큰 쪽)이 양의 반평면이 되도록 아래를 향한다. */
export const vertical = (x) => line(vec(x, 0), vec(0, -1));

export const signedDistance = (l, p) => dot(sub(p, l.point), l.normal);
export const reflect = (l, p) => sub(p, mul(l.normal, 2 * signedDistance(l, p)));

export function polygonArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const isRealFacet = (poly) => poly.length >= 3 && polygonArea(poly) > AREA_EPS;

/** 다각형을 주름선의 한쪽 반평면만 남기고 자른다(Sutherland–Hodgman). */
export function clipHalfPlane(poly, l, keepPositive) {
  if (!poly || poly.length < 3) return null;
  const sign = keepPositive ? 1 : -1;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const next = poly[(i + 1) % poly.length];
    const dCur = signedDistance(l, cur) * sign;
    const dNext = signedDistance(l, next) * sign;
    if (dCur >= -CLIP_EPS) out.push(cur);
    if ((dCur > CLIP_EPS && dNext < -CLIP_EPS) || (dCur < -CLIP_EPS && dNext > CLIP_EPS)) {
      const t = dCur / (dCur - dNext);
      out.push(add(cur, mul(sub(next, cur), t)));
    }
  }
  return isRealFacet(out) ? out : null;
}

/** [양수 쪽, 음수 쪽] 두 조각. 선이 지나지 않으면 한쪽은 null. */
export const splitPolygon = (poly, l) => [clipHalfPlane(poly, l, true), clipHalfPlane(poly, l, false)];

export function boundsOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/** 주름선이 상자 안을 지나는 구간. 안내선을 그릴 때 쓴다. */
export function segmentInside(l, bounds) {
  let tMin = -Infinity;
  let tMax = Infinity;
  const clip = (origin, direction, low, high) => {
    if (Math.abs(direction) < EPS) return origin >= low && origin <= high;
    const t1 = (low - origin) / direction;
    const t2 = (high - origin) / direction;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMin <= tMax;
  };
  if (!clip(l.point.x, l.dir.x, bounds.minX, bounds.maxX)) return null;
  if (!clip(l.point.y, l.dir.y, bounds.minY, bounds.maxY)) return null;
  if (tMin > tMax) return null;
  return [add(l.point, mul(l.dir, tMin)), add(l.point, mul(l.dir, tMax))];
}

export const VALLEY = 'valley';
export const MOUNTAIN = 'mountain';
export const POSITIVE = 'positive';
export const NEGATIVE = 'negative';

export const ALL_LAYERS = { kind: 'all' };
export const topLayers = (count) => ({ kind: 'top', count });
export const bottomLayers = (count) => ({ kind: 'bottom', count });

/** width x height 직사각형 종이 한 장. 원점이 가운데다. */
export function sheet(width, height) {
  const hw = width / 2;
  const hh = height / 2;
  return [{
    polygon: [vec(-hw, -hh), vec(hw, -hh), vec(hw, hh), vec(-hw, hh)],
    layer: 0,
    flipped: false,
  }];
}

export const modelBounds = (facets) => boundsOf(facets.flatMap((f) => f.polygon));
export const layerCount = (facets) => new Set(facets.map((f) => f.layer)).size;
export const totalArea = (facets) => facets.reduce((sum, f) => sum + polygonArea(f.polygon), 0);

/** 층 번호를 0부터 촘촘하게 다시 매긴다. */
function normalized(facets) {
  const order = [...new Set(facets.map((f) => f.layer))].sort((a, b) => a - b);
  const remap = new Map(order.map((layer, i) => [layer, i]));
  return facets.map((f) => ({ ...f, layer: remap.get(f.layer) }));
}

/**
 * 이 단계에서 움직이는 면들을 고른다.
 *
 * 겹 선택은 종이 전체가 아니라 "주름선 너머에 걸쳐 있는 면들" 중에서 센다.
 * 설명서의 "앞장만 접으세요"와 같은 뜻이다.
 */
function selectMoving(facets, step) {
  const touching = [];
  facets.forEach((facet, index) => {
    const [positive, negative] = splitPolygon(facet.polygon, step.crease);
    const movingPart = step.movingSide === POSITIVE ? positive : negative;
    const stayingPart = step.movingSide === POSITIVE ? negative : positive;
    if (movingPart) touching.push({ index, facet, movingPart, stayingPart });
  });
  touching.sort((a, b) => b.facet.layer - a.facet.layer);
  const layers = step.layers ?? ALL_LAYERS;
  let chosen = touching;
  if (layers.kind === 'top') chosen = touching.slice(0, layers.count);
  else if (layers.kind === 'bottom') chosen = touching.slice(Math.max(0, touching.length - layers.count));
  return new Map(chosen.map((s) => [s.index, s]));
}

/** 이 단계가 종이를 실제로 접는지(주름선이 종이를 지나는지). */
export const affects = (facets, step) => selectMoving(facets, step).size > 0;

/** 단계를 적용해 완전히 접은(180°) 결과를 만든다. */
export function applyFold(facets, step) {
  const moving = selectMoving(facets, step);
  if (moving.size === 0) return facets;

  const result = [];
  const top = Math.max(...facets.map((f) => f.layer));
  const bottom = Math.min(...facets.map((f) => f.layer));

  facets.forEach((facet, index) => {
    const split = moving.get(index);
    if (!split) result.push(facet);
    else if (split.stayingPart) result.push({ ...facet, polygon: split.stayingPart });
  });

  for (const split of [...moving.values()].sort((a, b) => a.index - b.index)) {
    const old = split.facet.layer;
    // 반사되면서 겹 순서도 뒤집힌다: 맨 위에 있던 겹이 넘어간 뭉치의 맨 아래가 된다.
    const layer = step.direction === MOUNTAIN ? 2 * bottom - 1 - old : 2 * top + 1 - old;
    result.push({
      polygon: split.movingPart.map((p) => reflect(step.crease, p)),
      layer,
      flipped: !split.facet.flipped,
    });
  }
  return normalized(result);
}

/**
 * 접는 중간 자세. progress 0=펴짐, 1=완전히 접힘.
 *
 * 움직이는 조각은 주름선을 축으로 회전한다. 정사영으로 그리므로 주름선에서의
 * 거리 d는 d·cos(θ)로 줄고 d·sin(θ)만큼 떠오른다. θ=180°면 applyFold와 같아진다.
 */
export function pose(facets, step, progress) {
  const posed = [];
  if (!step || progress <= 0) {
    for (const f of facets) {
      posed.push({ polygon: f.polygon, flipped: f.flipped, moving: false, lift: 0, drawKey: f.layer });
    }
    return posed.sort((a, b) => a.drawKey - b.drawKey);
  }

  const t = Math.min(1, Math.max(0, progress));
  const theta = Math.PI * t;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const liftSign = step.direction === MOUNTAIN ? -1 : 1;
  const movingBias = liftSign * 1e6;
  const moving = selectMoving(facets, step);

  facets.forEach((facet, index) => {
    const split = moving.get(index);
    if (!split) {
      posed.push({ polygon: facet.polygon, flipped: facet.flipped, moving: false, lift: 0, drawKey: facet.layer });
      return;
    }
    if (split.stayingPart) {
      posed.push({ polygon: split.stayingPart, flipped: facet.flipped, moving: false, lift: 0, drawKey: facet.layer });
    }
    let distanceSum = 0;
    const rotated = split.movingPart.map((p) => {
      const d = signedDistance(step.crease, p);
      distanceSum += Math.abs(d);
      return sub(p, mul(step.crease.normal, d * (1 - cosT)));
    });
    // 90도를 넘어가면 뭉치가 뒤집히므로 겹 순서도 함께 뒤집힌다.
    const order = t < 0.5 ? facet.layer : -facet.layer;
    posed.push({
      polygon: rotated,
      flipped: t > 0.5 ? !facet.flipped : facet.flipped,
      moving: true,
      lift: liftSign * sinT * (distanceSum / split.movingPart.length),
      drawKey: movingBias + order,
    });
  });
  return posed.sort((a, b) => a.drawKey - b.drawKey);
}

/** 이보다 짧게 쓸면 주름선이 흔들려 무시한다(종이 좌표 기준). */
export const MIN_DRAG = 0.08;

/**
 * "이 점을 저 점 위로 접기"를 한 단계로 만든다.
 * 두 점을 포갤 수 있는 주름선은 수직이등분선 하나뿐이다.
 */
export function pointToPointFold(from, to, { direction = VALLEY, layers = ALL_LAYERS } = {}) {
  const delta = sub(to, from);
  if (len(delta) < MIN_DRAG) return null;
  const crease = line(mul(add(from, to), 0.5), vec(-delta.y, delta.x));
  return {
    title: '자유 접기',
    instruction: '짚은 점을 도착한 점 위로 포갭니다',
    crease,
    // 손가락을 올린 쪽(=from)이 넘어간다.
    movingSide: signedDistance(crease, from) > 0 ? POSITIVE : NEGATIVE,
    direction,
    layers,
  };
}
