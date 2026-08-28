// 기기 화면이 어디서 꺾이는지 알아낸다.
//
// 크롬은 접히는 기기의 화면 조각 위치를 CSS 환경 변수 viewport-segment-* 로 알려 준다.
// 두 조각 사이의 빈 자리가 힌지다. 접히지 않는 기기에서는 화면 한가운데를 힌지로 삼는다.

const PROBES = [
  ['segment0Bottom', 'env(viewport-segment-bottom 0 0, -1px)'],
  ['segment1Top', 'env(viewport-segment-top 0 1, -1px)'],
  ['segment0Right', 'env(viewport-segment-right 0 0, -1px)'],
  ['segment1Left', 'env(viewport-segment-left 1 0, -1px)'],
];

let probes = null;

function ensureProbes() {
  if (probes) return probes;
  probes = new Map();
  for (const [name, value] of PROBES) {
    const node = document.createElement('div');
    // 화면에 보이지 않게 두고 top 값만 읽는다. 커스텀 속성과 달리 top은 px로 계산돼 나온다.
    node.style.cssText = `position:fixed;left:-9999px;width:0;height:0;pointer-events:none;top:${value}`;
    document.body.append(node);
    probes.set(name, node);
  }
  return probes;
}

const measure = (name) => {
  const value = Number.parseFloat(getComputedStyle(probes.get(name)).top);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/**
 * 지금 화면의 힌지.
 *
 * @returns {{ orientation: 'horizontal'|'vertical', x: number, y: number, thickness: number, real: boolean }}
 */
export function readHinge() {
  ensureProbes();

  const bottom = measure('segment0Bottom');
  const top = measure('segment1Top');
  if (bottom !== null && top !== null && top >= bottom) {
    return { orientation: 'horizontal', x: window.innerWidth / 2, y: (bottom + top) / 2, thickness: top - bottom, real: true };
  }

  const right = measure('segment0Right');
  const left = measure('segment1Left');
  if (right !== null && left !== null && left >= right) {
    return { orientation: 'vertical', x: (right + left) / 2, y: window.innerHeight / 2, thickness: left - right, real: true };
  }

  // 접히지 않는 기기: 화면 한가운데를 접히는 자리로 친다.
  return {
    orientation: 'horizontal',
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    thickness: 0,
    real: false,
  };
}

/** 기기가 반쯤 접혔는지. 크롬의 Device Posture API가 있을 때만 알 수 있다. */
export function watchPosture(onChange) {
  const posture = navigator.devicePosture;
  if (!posture) return false;
  const notify = () => onChange(posture.type === 'folded');
  posture.addEventListener('change', notify);
  notify();
  return true;
}
