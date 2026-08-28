// 나무 책상을 캔버스에 직접 그린다.
//
// CSS 배경은 곳에 따라(내장 브라우저, 미리보기 틀 등) 화면을 다 못 채우는 일이 있어서,
// 화면 전체를 덮는 캔버스에 결·이음매·옹이까지 그려 넣는다. 무늬는 씨앗값이 같으면
// 언제나 같은 모양이 나오므로 다시 그려도 흔들리지 않는다.

/** 같은 씨앗이면 같은 무늬가 나오는 난수. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 책상 그림을 만들어 돌려준다. 화면 크기가 바뀔 때만 다시 만들면 된다.
 *
 * @param colors {{ light, dark, grainRgb: "38, 24, 12", seam, sheen }}
 */
export function paintDesk(width, height, ratio, colors) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const g = canvas.getContext('2d');
  g.scale(ratio, ratio);
  const random = seeded(20260828);

  // 바탕: 왼쪽 위에서 빛이 드는 나무색
  const base = g.createLinearGradient(0, 0, width * 0.35, height);
  base.addColorStop(0, colors.light);
  base.addColorStop(1, colors.dark);
  g.fillStyle = base;
  g.fillRect(0, 0, width, height);

  // 널: 가로로 길게 놓인 판자
  const plankHeight = Math.max(120, Math.min(260, height / 4));
  g.lineCap = 'round';

  for (let top = -plankHeight; top < height + plankHeight; top += plankHeight) {
    const shift = random() * 40 - 20;
    const plankTop = top + shift * 0.2;

    // 판자마다 아주 조금씩 다른 밝기
    g.save();
    g.beginPath();
    g.rect(0, plankTop, width, plankHeight);
    g.clip();
    g.fillStyle = `rgba(255, 236, 210, ${0.012 + random() * 0.03})`;
    g.fillRect(0, plankTop, width, plankHeight);

    // 결: 판자를 따라 흐르는 줄. 굵기와 진하기를 조금씩 달리해 균일한 줄무늬를 피한다.
    const lines = Math.round(plankHeight / 3);
    for (let i = 0; i < lines; i++) {
      const y = plankTop + (i + random() * 0.8) * (plankHeight / lines);
      const amplitude = 1 + random() * 4;
      const period = 220 + random() * 520;
      const phase = random() * Math.PI * 2;
      g.strokeStyle = random() < 0.22
        ? `rgba(255, 228, 195, ${(0.02 + random() * 0.05).toFixed(3)})`
        : `rgba(${colors.grainRgb}, ${(0.05 + random() * 0.22).toFixed(3)})`;
      g.lineWidth = 0.4 + random() * 1.4;
      g.beginPath();
      for (let x = -10; x <= width + 10; x += 14) {
        const wobble = Math.sin((x / period) * Math.PI * 2 + phase) * amplitude;
        if (x < 0) g.moveTo(x, y + wobble);
        else g.lineTo(x, y + wobble);
      }
      g.stroke();
    }

    // 옹이: 판자마다 가끔 하나
    if (random() < 0.55) {
      const kx = random() * width;
      const ky = plankTop + plankHeight * (0.25 + random() * 0.5);
      const rings = 4 + Math.floor(random() * 4);
      for (let r = rings; r > 0; r--) {
        g.strokeStyle = `rgba(${colors.grainRgb}, ${(0.06 + 0.03 * r).toFixed(3)})`;
        g.lineWidth = 0.6 + random() * 1.1;
        g.beginPath();
        g.ellipse(kx, ky, r * (3 + random() * 3), r * (1.6 + random()), random() * 0.4 - 0.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();

    // 판자 사이 이음매: 어두운 홈과 그 아래 밝은 모서리
    g.strokeStyle = colors.seam;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, plankTop);
    g.lineTo(width, plankTop);
    g.stroke();
    g.strokeStyle = 'rgba(255, 235, 205, 0.05)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, plankTop + 1.6);
    g.lineTo(width, plankTop + 1.6);
    g.stroke();
  }

  // 위에서 드는 빛과 가장자리 그늘
  const sheen = g.createRadialGradient(width * 0.3, height * 0.05, 0, width * 0.3, height * 0.05, Math.max(width, height));
  sheen.addColorStop(0, colors.sheen);
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, width, height);

  const vignette = g.createRadialGradient(
    width / 2, height * 0.45, Math.min(width, height) * 0.25,
    width / 2, height * 0.45, Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, width, height);

  return canvas;
}
