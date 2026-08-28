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

/**
 * 기기가 반쯤 접혔는지 지켜본다.
 *
 * 브라우저마다 알려 주는 방법이 달라서 셋을 함께 쓴다.
 * 1. Device Posture API (크롬 125+)
 * 2. CSS 미디어 쿼리 (device-posture: folded)
 * 3. 창 너비가 크게 줄어드는 것 — 접으면 큰 화면에서 겉화면으로 옮겨 가며 폭이 확 준다.
 *    화면 회전이나 주소창 여닫음과 헷갈리지 않게, 폭이 많이 줄고 높이는 별로 안 바뀔 때만 본다.
 *
 * @param onChange 접힘 여부가 바뀔 때 불린다.
 * @returns 어떤 방법이 쓰이는지 알려 주는 상태 객체(화면에 표시해 원인을 찾는 데 쓴다).
 */
export function watchPosture(onChange) {
  const state = { api: false, media: false, folded: false, source: '없음' };
  let last = false;

  const update = (folded, source) => {
    if (folded === last) return;
    last = folded;
    state.folded = folded;
    state.source = source;
    onChange(folded);
  };

  const posture = navigator.devicePosture;
  if (posture) {
    state.api = true;
    state.source = 'Device Posture';
    const notify = () => update(posture.type === 'folded', 'Device Posture');
    posture.addEventListener('change', notify);
    if (posture.type === 'folded') notify();
  }

  const query = window.matchMedia?.('(device-posture: folded)');
  // 모르는 미디어 기능은 브라우저가 'not all'로 되돌려 준다. 그때는 쳐다보지 않는다.
  if (query && query.media !== 'not all') {
    state.media = true;
    if (state.source === '없음') state.source = 'CSS device-posture';
    query.addEventListener('change', (event) => update(event.matches, 'CSS device-posture'));
    if (query.matches) update(true, 'CSS device-posture');
  }

  let lastSize = { width: window.innerWidth, height: window.innerHeight };
  window.addEventListener('resize', () => {
    const size = { width: window.innerWidth, height: window.innerHeight };
    const widthDrop = 1 - size.width / lastSize.width;
    const heightChange = Math.abs(1 - size.height / lastSize.height);
    const wasWide = lastSize.width > 600;
    if (wasWide && widthDrop > 0.35 && heightChange < 0.25) {
      update(true, '화면 크기 변화');
    } else if (widthDrop < -0.35 && heightChange < 0.25) {
      update(false, '화면 크기 변화');
    }
    lastSize = size;
  });

  return state;
}
