package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FreeFoldTest {

    private val sheet = PaperModel.sheet(2.0, 2.0)

    /** 왼쪽 끝을 오른쪽 끝으로 포개면 가운데를 반 접는 것과 같다 */
    @Test
    fun foldingLeftEdgeOntoRightEdgeHalvesTheSheet() {
        val step = pointToPointFold(Vec2(-1.0, 0.0), Vec2(1.0, 0.0))
        assertNotNull(step)
        val folded = sheet.applyFold(step)
        assertEquals(2, folded.layerCount)
        val bounds = folded.bounds()
        assertTrue(abs(bounds.width - 1.0) < 1e-9, "width=${bounds.width}")
        assertTrue(bounds.minX > -1e-9, "짚은 왼쪽이 오른쪽으로 넘어가야 한다")
    }

    /** 짚은 점이 도착한 점 자리로 옮겨진다 */
    @Test
    fun theGrabbedPointLandsOnTheTarget() {
        val from = Vec2(-1.0, -1.0)
        val to = Vec2(0.4, 0.6)
        val step = pointToPointFold(from, to)
        assertNotNull(step)
        val landed = step.crease.reflect(from)
        assertTrue(abs(landed.x - to.x) < 1e-9 && abs(landed.y - to.y) < 1e-9, "landed=$landed")
    }

    /** 손가락을 거의 움직이지 않으면 접지 않는다 */
    @Test
    fun tinyDragIsIgnored() {
        assertNull(pointToPointFold(Vec2(0.0, 0.0), Vec2(0.01, 0.01)))
    }

    /** 산접기와 앞장만 접기 설정이 그대로 전달된다 */
    @Test
    fun optionsArePassedThrough() {
        val step = pointToPointFold(
            from = Vec2(-1.0, 0.0),
            to = Vec2(1.0, 0.0),
            direction = FoldDirection.MOUNTAIN,
            layers = LayerSelection.Top(1),
        )
        assertNotNull(step)
        assertEquals(FoldDirection.MOUNTAIN, step.direction)
        assertEquals(LayerSelection.Top(1), step.layers)
    }
}
