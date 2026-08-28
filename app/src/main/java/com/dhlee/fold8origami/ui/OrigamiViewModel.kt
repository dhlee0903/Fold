package com.dhlee.fold8origami.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import com.dhlee.fold8origami.core.Bounds
import com.dhlee.fold8origami.core.FoldDirection
import com.dhlee.fold8origami.core.FoldEvent
import com.dhlee.fold8origami.core.FoldSession
import com.dhlee.fold8origami.core.FoldStep
import com.dhlee.fold8origami.core.LayerSelection
import com.dhlee.fold8origami.core.OrigamiModel
import com.dhlee.fold8origami.core.OrigamiModels
import com.dhlee.fold8origami.core.PosedFacet
import com.dhlee.fold8origami.core.Vec2
import com.dhlee.fold8origami.core.pointToPointFold
import com.dhlee.fold8origami.fold.HingePosture
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** 화면이 그리는 데 필요한 것만 모아 둔 한 장면. */
data class OrigamiUiState(
    val model: OrigamiModel,
    val stepIndex: Int,
    val stepCount: Int,
    val currentStep: FoldStep?,
    val facets: List<PosedFacet>,
    val viewBounds: Bounds,
    val progress: Double,
    val armed: Boolean,
    val isComplete: Boolean,
    val canUndo: Boolean,
    val layerCount: Int,
)

/**
 * 힌지에서 온 각도를 종이접기 진행으로 바꾸고, 화면이 쓸 상태를 들고 있는다.
 *
 * 폴더블은 접었다 펼 때마다 설정 변경이 일어나기 쉬우므로 진행 상황은 ViewModel에 둔다.
 */
class OrigamiViewModel : ViewModel() {

    private var model: OrigamiModel = OrigamiModels.all.first()
    private var session = FoldSession(model)

    var state by mutableStateOf(snapshot())
        private set

    /** 접히지 않는 기기이거나 사용자가 직접 조절하고 싶을 때 쓰는 모드. */
    var manualMode by mutableStateOf(false)
        private set

    var posture by mutableStateOf(HingePosture.Unknown)
        private set

    /** 자유 모드에서 다음에 그을 주름선의 방향. */
    var freeDirection by mutableStateOf(FoldDirection.VALLEY)
        private set

    /** 자유 모드에서 앞장만 접을지. */
    var freeTopLayerOnly by mutableStateOf(false)
        private set

    /** 자유 모드에서 손가락을 끄는 중인 구간. */
    var dragPreview by mutableStateOf<Pair<Vec2, Vec2>?>(null)
        private set

    private val _events = MutableSharedFlow<FoldEvent>(extraBufferCapacity = 8)
    val events = _events.asSharedFlow()

    val isFreeMode: Boolean get() = model.freeform

    fun onPosture(posture: HingePosture) {
        this.posture = posture
        if (manualMode) return
        val angle = posture.angleDegrees ?: return
        applyProgress(FoldSession.progressFromHingeAngle(angle))
    }

    fun setManualMode(enabled: Boolean) {
        manualMode = enabled
        if (!enabled) {
            // 센서 값으로 돌아갈 때 화면이 튀지 않게 현재 각도를 바로 반영한다.
            posture.angleDegrees?.let { applyProgress(FoldSession.progressFromHingeAngle(it)) }
        }
    }

    fun onManualProgress(progress: Float) {
        if (!manualMode) manualMode = true
        applyProgress(progress.toDouble())
    }

    fun selectModel(next: OrigamiModel) {
        model = next
        session = FoldSession(next)
        dragPreview = null
        state = snapshot()
    }

    fun undo() {
        session.undo()
        state = snapshot()
    }

    fun restart() {
        session.reset(model)
        dragPreview = null
        state = snapshot()
    }

    fun setFreeDirection(direction: FoldDirection) {
        freeDirection = direction
    }

    fun setFreeTopLayerOnly(topOnly: Boolean) {
        freeTopLayerOnly = topOnly
    }

    fun onFreeDrag(from: Vec2, to: Vec2) {
        dragPreview = from to to
    }

    /** 자유 모드에서 손가락을 뗐을 때, 짚은 점을 도착한 점 위로 포개는 단계를 예약한다. */
    fun onFreeDragEnd(from: Vec2, to: Vec2) {
        dragPreview = null
        val step = pointToPointFold(
            from = from,
            to = to,
            direction = freeDirection,
            layers = if (freeTopLayerOnly) LayerSelection.Top(1) else LayerSelection.All,
        ) ?: return
        session.queueStep(step)
        state = snapshot()
    }

    fun cancelFreeDrag() {
        dragPreview = null
    }

    private fun applyProgress(progress: Double) {
        val event = session.update(progress)
        state = snapshot()
        if (event != null) _events.tryEmit(event)
    }

    private fun snapshot(): OrigamiUiState = OrigamiUiState(
        model = model,
        stepIndex = session.stepIndex,
        stepCount = session.steps.size,
        currentStep = session.currentStep,
        facets = session.pose(),
        viewBounds = viewBounds(),
        progress = session.progress,
        armed = session.armed,
        isComplete = session.isComplete,
        canUndo = session.canUndo,
        layerCount = session.paper.layerCount,
    )

    /**
     * 그림이 잘리지 않도록 원래 종이와 지금 접힌 종이를 모두 담는 상자를 만든다.
     * 접는 도중에는 바뀌지 않으므로 애니메이션 중에 화면이 출렁이지 않는다.
     */
    private fun viewBounds(): Bounds {
        val sheet = model.sheet.bounds()
        val paper = session.paper.bounds()
        val margin = 0.08 * maxOf(sheet.width, sheet.height)
        return Bounds(
            minX = minOf(sheet.minX, paper.minX) - margin,
            minY = minOf(sheet.minY, paper.minY) - margin,
            maxX = maxOf(sheet.maxX, paper.maxX) + margin,
            maxY = maxOf(sheet.maxY, paper.maxY) + margin,
        )
    }
}
