package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FoldSessionTest {

    private fun FoldSession.foldAndOpen() {
        update(1.0)
        update(0.0)
    }

    @Test
    /** 힌지 각도 180도는 펴짐 0도는 완전히 접힘 */
    fun hingeAngleMapsToFoldProgress() {
        assertEquals(0.0, FoldSession.progressFromHingeAngle(180f))
        assertEquals(1.0, FoldSession.progressFromHingeAngle(0f))
        assertTrue(abs(FoldSession.progressFromHingeAngle(90f) - 0.5) < 1e-9)
        // 센서가 범위를 벗어난 값을 주더라도 잘라 낸다.
        assertEquals(0.0, FoldSession.progressFromHingeAngle(200f))
        assertEquals(1.0, FoldSession.progressFromHingeAngle(-10f))
    }

    @Test
    /** 한 번 접었다 펴면 한 단계만 진행한다 */
    fun oneCloseOpenCycleAdvancesOneStep() {
        val session = FoldSession(OrigamiModels.fan)
        assertIs<FoldEvent.StepCommitted>(session.update(0.8))
        assertEquals(1, session.stepIndex)

        // 더 접어도 다음 단계로 넘어가지 않는다.
        assertNull(session.update(0.95))
        assertNull(session.update(1.0))
        assertEquals(1, session.stepIndex)

        // 다시 펴야 준비 상태가 된다.
        assertEquals(FoldEvent.Armed, session.update(0.1))
        assertTrue(session.armed)
        assertIs<FoldEvent.StepCommitted>(session.update(0.9))
        assertEquals(2, session.stepIndex)
    }

    @Test
    /** 살짝 접었다 펴는 정도로는 단계가 넘어가지 않는다 */
    fun partialFoldDoesNotCommit() {
        val session = FoldSession(OrigamiModels.fan)
        assertNull(session.update(0.5))
        assertNull(session.update(0.71))
        assertNull(session.update(0.0))
        assertEquals(0, session.stepIndex)
    }

    @Test
    /** 마지막 단계를 접으면 완성 신호가 온다 */
    fun lastStepEmitsCompleted() {
        val session = FoldSession(OrigamiModels.fan)
        val steps = OrigamiModels.fan.steps.size
        repeat(steps - 1) { session.foldAndOpen() }
        session.update(0.0)
        assertEquals(FoldEvent.Completed, session.update(1.0))
        assertTrue(session.isComplete)
        assertNull(session.currentStep)
        assertNull(session.update(1.0))
    }

    @Test
    /** 되돌리기는 직전 단계를 취소한다 */
    fun undoRevertsLastStep() {
        val session = FoldSession(OrigamiModels.hat)
        session.foldAndOpen()
        session.foldAndOpen()
        assertEquals(2, session.stepIndex)
        val layersAfterTwo = session.paper.layerCount

        assertTrue(session.undo())
        assertEquals(1, session.stepIndex)
        assertTrue(session.paper.layerCount <= layersAfterTwo)
        assertTrue(session.armed, "펴져 있는 상태에서 되돌리면 바로 다시 접을 수 있어야 한다")

        assertTrue(session.undo())
        assertFalse(session.canUndo)
        assertFalse(session.undo())
        assertEquals(OrigamiModels.hat.sheet, session.paper)
    }

    @Test
    /** 자유 모드는 사용자가 그은 주름선을 그때그때 접는다 */
    fun freeModeFoldsQueuedStep() {
        val session = FoldSession(OrigamiModels.freeFold)
        assertNull(session.currentStep)
        assertNull(session.update(1.0))

        session.update(0.0)
        session.queueStep(FoldStep("자유", "", Line.vertical(0.2), Side.POSITIVE))
        assertIs<FoldEvent.StepCommitted>(session.update(1.0))
        assertEquals(2, session.paper.layerCount)
        // 자유 모드는 몇 번을 접어도 "완성"으로 끝나지 않는다.
        assertFalse(session.isComplete)
    }

    @Test
    /** 초기화하면 처음 종이로 돌아간다 */
    fun resetReturnsToFlatSheet() {
        val session = FoldSession(OrigamiModels.plane)
        session.foldAndOpen()
        session.reset(OrigamiModels.plane)
        assertEquals(0, session.stepIndex)
        assertEquals(OrigamiModels.plane.sheet, session.paper)
        assertFalse(session.canUndo)
    }

    @Test
    /** 중간 자세는 확정 전에만 움직인다 */
    fun poseOnlyAnimatesBeforeCommit() {
        val session = FoldSession(OrigamiModels.fan)
        session.update(0.4)
        assertTrue(session.pose().any { it.moving })
        session.update(0.8) // 확정
        assertTrue(session.pose().none { it.moving }, "확정 뒤에는 다시 펴기 전까지 멈춰 있어야 한다")
    }
}
