// 작품별 접기 설명서와, 힌지/자세를 단계 진행으로 바꾸는 상태 기계.
import {
  ALL_LAYERS, MOUNTAIN, NEGATIVE, POSITIVE, VALLEY,
  applyFold, bottomLayers, horizontal, lineThrough, pose, sheet, topLayers, vec, vertical,
} from './origami.js';

export const MODELS = [
  {
    id: 'fan',
    name: '부채',
    description: '한 번씩 번갈아 접으면 주름이 생깁니다',
    sheet: () => sheet(2, 2),
    steps: [
      {
        title: '1. 오른쪽 1/4 접기',
        instruction: '오른쪽 끝을 안쪽으로 접어 올립니다',
        crease: vertical(0.5), movingSide: POSITIVE, direction: VALLEY, layers: ALL_LAYERS,
      },
      {
        title: '2. 뒤로 접기',
        instruction: '이번엔 반대로 뒤쪽으로 넘겨 주름을 만듭니다',
        crease: vertical(0), movingSide: POSITIVE, direction: MOUNTAIN, layers: ALL_LAYERS,
      },
      {
        title: '3. 다시 앞으로 접기',
        instruction: '마지막으로 앞쪽으로 접으면 부채 주름 완성',
        crease: vertical(-0.5), movingSide: POSITIVE, direction: VALLEY, layers: ALL_LAYERS,
      },
    ],
  },
  {
    id: 'hat',
    name: '종이 모자',
    description: '반 접고 양쪽 모서리를 모아 챙을 올립니다',
    sheet: () => sheet(2, 2.8),
    steps: [
      {
        title: '1. 반으로 접기',
        instruction: '위쪽 절반을 아래로 접습니다',
        crease: horizontal(0), movingSide: POSITIVE, direction: VALLEY, layers: ALL_LAYERS,
      },
      {
        title: '2. 왼쪽 모서리 접기',
        instruction: '왼쪽 위 모서리를 가운데로 접어 내립니다',
        crease: lineThrough(vec(0, 0), vec(-1, -1)), movingSide: NEGATIVE, direction: VALLEY, layers: ALL_LAYERS,
      },
      {
        title: '3. 오른쪽 모서리 접기',
        instruction: '반대쪽 모서리도 똑같이 가운데로 모읍니다',
        crease: lineThrough(vec(0, 0), vec(1, -1)), movingSide: POSITIVE, direction: VALLEY, layers: ALL_LAYERS,
      },
      {
        title: '4. 앞쪽 챙 올리기',
        instruction: '아래에 남은 띠를 앞장만 위로 접습니다',
        crease: horizontal(-1), movingSide: NEGATIVE, direction: VALLEY, layers: topLayers(1),
      },
      {
        title: '5. 뒤쪽 챙 올리기',
        instruction: '뒷장 띠는 뒤로 넘겨 접습니다',
        crease: horizontal(-1), movingSide: NEGATIVE, direction: MOUNTAIN, layers: bottomLayers(1),
      },
    ],
  },
  {
    id: 'plane',
    name: '종이비행기',
    description: '반 접고 코를 만든 뒤 날개를 내립니다',
    sheet: () => sheet(2, 2.8),
    steps: [
      {
        title: '1. 세로로 반 접기',
        instruction: '가운데 접은 선이 비행기의 등이 됩니다',
        crease: vertical(0), movingSide: POSITIVE, direction: VALLEY, layers: ALL_LAYERS,
      },
      {
        title: '2. 앞장으로 코 만들기',
        instruction: '위쪽 모서리를 앞장만 등선에 맞춰 접습니다',
        crease: lineThrough(vec(0, 1.4), vec(-1, 0.4)), movingSide: NEGATIVE, direction: VALLEY, layers: topLayers(1),
      },
      {
        title: '3. 뒷장으로 코 만들기',
        instruction: '뒷장은 뒤로 접어 대칭을 맞춥니다',
        crease: lineThrough(vec(0, 1.4), vec(-1, 0.4)), movingSide: NEGATIVE, direction: MOUNTAIN, layers: bottomLayers(1),
      },
      {
        title: '4. 앞날개 접기',
        instruction: '등선과 나란하게 앞쪽 날개를 접어 내립니다',
        crease: vertical(-0.5), movingSide: NEGATIVE, direction: VALLEY, layers: topLayers(2),
      },
      {
        title: '5. 뒷날개 접기',
        instruction: '뒷날개도 같은 자리에서 반대쪽으로 접습니다',
        crease: vertical(-0.5), movingSide: NEGATIVE, direction: MOUNTAIN, layers: bottomLayers(2),
      },
    ],
  },
  {
    id: 'free',
    name: '자유 접기',
    description: '종이를 쓸어 주름선을 긋고 기기를 접으세요',
    sheet: () => sheet(2, 2),
    steps: [],
    freeform: true,
  },
];

export const modelById = (id) => MODELS.find((m) => m.id === id) ?? MODELS[0];

/** 한 단계를 확정하는 접힘 정도(약 50°). 폴드류는 다 닫히기 전에 화면이 꺼진다. */
export const COMMIT_THRESHOLD = 0.72;
/** 다시 이만큼 펴야 다음 단계를 접을 수 있다(약 145°). */
export const RELEASE_THRESHOLD = 0.2;

/** 힌지 각도(180=펴짐, 0=닫힘)를 접힘 정도로. */
export const progressFromHingeAngle = (degrees) => Math.min(1, Math.max(0, (180 - degrees) / 180));

/**
 * 한 번 접었다 펴는 동작이 한 단계에 대응하는 상태 기계.
 */
export class FoldSession {
  constructor(model) {
    this.reset(model);
  }

  reset(model) {
    this.model = model;
    this.freeform = !!model.freeform;
    this.steps = [...model.steps];
    this.paper = model.sheet();
    this.history = [];
    this.stepIndex = 0;
    this.progress = 0;
    this.armed = true;
  }

  get currentStep() {
    return this.steps[this.stepIndex] ?? null;
  }

  /** 자유 모드는 끝이 없으므로 완성 상태가 되지 않는다. */
  get isComplete() {
    return !this.freeform && this.steps.length > 0 && this.stepIndex >= this.steps.length;
  }

  get canUndo() {
    return this.history.length > 0;
  }

  /** @returns 'committed' | 'completed' | 'armed' | null */
  update(foldProgress) {
    this.progress = Math.min(1, Math.max(0, foldProgress));
    const step = this.currentStep;
    if (!step) return null;

    if (this.armed && this.progress >= COMMIT_THRESHOLD) {
      this.history.push({ paper: this.paper, stepIndex: this.stepIndex });
      this.paper = applyFold(this.paper, step);
      this.stepIndex++;
      this.armed = false;
      return this.isComplete ? 'completed' : 'committed';
    }
    if (!this.armed && this.progress <= RELEASE_THRESHOLD) {
      this.armed = true;
      return 'armed';
    }
    return null;
  }

  /** 자유 모드에서 사용자가 그은 주름선을 다음 단계로 넣는다. */
  queueStep(step) {
    this.steps.length = this.stepIndex;
    this.steps.push(step);
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return false;
    this.paper = previous.paper;
    this.stepIndex = previous.stepIndex;
    this.armed = this.progress <= RELEASE_THRESHOLD;
    return true;
  }

  pose() {
    return pose(this.paper, this.currentStep, this.armed ? this.progress : 0);
  }
}
