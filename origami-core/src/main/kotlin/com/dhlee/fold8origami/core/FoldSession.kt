package com.dhlee.fold8origami.core

/** 접기 진행 중 일어난 사건. 소리·진동·안내 문구를 띄우는 데 쓴다. */
sealed interface FoldEvent {
    /** [index] 번째 단계가 확정됐다. */
    data class StepCommitted(val index: Int) : FoldEvent

    /** 기기를 다시 펴서 다음 단계를 접을 준비가 됐다. */
    data object Armed : FoldEvent

    /** 마지막 단계까지 끝났다. */
    data object Completed : FoldEvent
}

/**
 * 기기 힌지 각도를 종이접기 진행 상태로 바꿔 주는 상태 기계.
 *
 * 한 번 접었다 펴는 동작이 한 단계에 대응한다.
 * - [COMMIT_THRESHOLD] 이상 접으면 현재 단계를 확정한다.
 * - 다시 [RELEASE_THRESHOLD] 이하로 펴야 다음 단계를 접을 수 있다(연속 확정 방지).
 *
 * 갤럭시 Z 폴드류는 완전히 닫히기 전에 큰 화면이 꺼지므로, 확정 기준을 0°가 아니라
 * 50° 부근(진행률 0.72)에 둬서 화면이 살아 있는 동안 단계가 넘어가게 했다.
 */
class FoldSession(model: OrigamiModel) {

    private var freeform: Boolean = model.freeform
    private val _steps: MutableList<FoldStep> = model.steps.toMutableList()
    private val history: ArrayDeque<Pair<PaperModel, Int>> = ArrayDeque()

    /** 지금까지 확정된 결과. 진행 중인 단계는 반영돼 있지 않다. */
    var paper: PaperModel = model.sheet
        private set

    /** 다음에 접을 단계 번호. */
    var stepIndex: Int = 0
        private set

    /** 마지막으로 받은 접힘 정도(0 = 완전히 펴짐, 1 = 완전히 접힘). */
    var progress: Double = 0.0
        private set

    /** true면 이번에 접는 동작이 다음 단계를 확정한다. */
    var armed: Boolean = true
        private set

    val steps: List<FoldStep> get() = _steps

    val currentStep: FoldStep? get() = _steps.getOrNull(stepIndex)

    /** 자유 모드는 끝이 없으므로 완성 상태가 되지 않는다. */
    val isComplete: Boolean get() = !freeform && _steps.isNotEmpty() && stepIndex >= _steps.size

    val canUndo: Boolean get() = history.isNotEmpty()

    /**
     * 힌지에서 읽은 접힘 정도를 반영한다.
     *
     * @param foldProgress 0(완전히 펴짐) ~ 1(완전히 접힘).
     */
    fun update(foldProgress: Double): FoldEvent? {
        progress = foldProgress.coerceIn(0.0, 1.0)
        val step = currentStep ?: return null

        if (armed && progress >= COMMIT_THRESHOLD) {
            history.addLast(paper to stepIndex)
            paper = paper.applyFold(step)
            stepIndex++
            armed = false
            return if (isComplete) FoldEvent.Completed else FoldEvent.StepCommitted(stepIndex - 1)
        }
        if (!armed && progress <= RELEASE_THRESHOLD) {
            armed = true
            return FoldEvent.Armed
        }
        return null
    }

    /** 자유 모드에서 사용자가 그은 주름선을 다음 단계로 넣는다. */
    fun queueStep(step: FoldStep) {
        while (_steps.size > stepIndex) {
            _steps.removeAt(_steps.size - 1)
        }
        _steps.add(step)
    }

    /** 마지막으로 확정한 단계를 되돌린다. */
    fun undo(): Boolean {
        val (previous, index) = history.removeLastOrNull() ?: return false
        paper = previous
        stepIndex = index
        armed = progress <= RELEASE_THRESHOLD
        return true
    }

    /** 처음 상태(펴진 종이)로 되돌린다. */
    fun reset(model: OrigamiModel) {
        freeform = model.freeform
        history.clear()
        _steps.clear()
        _steps.addAll(model.steps)
        paper = model.sheet
        stepIndex = 0
        armed = true
    }

    /** 지금 화면에 그려야 할 모습. 진행 중인 단계의 중간 각도까지 반영한다. */
    fun pose(): List<PosedFacet> =
        paper.pose(currentStep, if (armed) progress else 0.0)

    companion object {
        const val COMMIT_THRESHOLD = 0.72
        const val RELEASE_THRESHOLD = 0.20

        /**
         * 힌지 각도(180° 완전히 펴짐 ~ 0° 완전히 닫힘)를 접힘 정도로 바꾼다.
         */
        fun progressFromHingeAngle(degrees: Float): Double =
            ((180.0 - degrees) / 180.0).coerceIn(0.0, 1.0)
    }
}
