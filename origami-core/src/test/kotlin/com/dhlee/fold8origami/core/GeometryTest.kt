package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val TOL = 1e-9

private fun assertClose(expected: Double, actual: Double, message: String = "") =
    assertTrue(abs(expected - actual) < 1e-9, "$message expected=$expected actual=$actual")

private fun assertClose(expected: Vec2, actual: Vec2) {
    assertClose(expected.x, actual.x, "x")
    assertClose(expected.y, actual.y, "y")
}

class GeometryTest {

    private val square = listOf(Vec2(-1.0, -1.0), Vec2(1.0, -1.0), Vec2(1.0, 1.0), Vec2(-1.0, 1.0))

    @Test
    /** 수직선 반사는 x 부호를 바꾼다 */
    fun reflectAcrossVerticalLineFlipsX() {
        val line = Line.vertical(0.0)
        assertClose(Vec2(-2.0, 3.0), line.reflect(Vec2(2.0, 3.0)))
    }

    @Test
    /** 대각선 반사로 모서리가 반대편 축에 붙는다 */
    fun reflectAcrossDiagonalMovesCornerToAxis() {
        val line = Line.through(Vec2(0.0, 0.0), Vec2(-1.0, -1.0))
        assertClose(Vec2(0.0, -1.0), line.reflect(Vec2(-1.0, 0.0)))
    }

    @Test
    /** 선 위의 점은 반사해도 그대로다 */
    fun pointOnCreaseStaysPut() {
        val line = Line.through(Vec2(0.0, 1.4), Vec2(-1.0, 0.4))
        assertClose(Vec2(-1.0, 0.4), line.reflect(Vec2(-1.0, 0.4)))
    }

    @Test
    /** 정사각형을 가운데서 자르면 넓이가 반씩 나뉜다 */
    fun splitThroughCenterHalvesArea() {
        val (positive, negative) = splitPolygon(square, Line.vertical(0.0))
        assertNotNull(positive)
        assertNotNull(negative)
        assertClose(2.0, polygonArea(positive))
        assertClose(2.0, polygonArea(negative))
    }

    @Test
    /** 자른 조각들의 넓이 합은 원본과 같다 */
    fun splitPreservesTotalArea() {
        val line = Line.through(Vec2(0.3, -1.0), Vec2(-0.7, 1.0))
        val (positive, negative) = splitPolygon(square, line)
        val total = polygonArea(positive ?: emptyList()) + polygonArea(negative ?: emptyList())
        assertClose(polygonArea(square), total)
    }

    @Test
    /** 종이를 지나지 않는 선은 한쪽만 남긴다 */
    fun splitOutsidePaperKeepsOneSide() {
        val (positive, negative) = splitPolygon(square, Line.vertical(5.0))
        assertNull(positive)
        assertNotNull(negative)
        assertClose(4.0, polygonArea(negative))
    }

    @Test
    /** 모서리에 스치는 선은 실오라기 조각을 만들지 않는다 */
    fun splitGrazingEdgeMakesNoSliver() {
        val (positive, _) = splitPolygon(square, Line.vertical(1.0))
        assertNull(positive)
    }

    @Test
    /** 경계 상자는 모든 점을 감싼다 */
    fun boundsCoverAllPoints() {
        val bounds = Bounds.of(square)
        assertEquals(-1.0, bounds.minX)
        assertEquals(1.0, bounds.maxY)
        assertClose(2.0, bounds.width)
        assertClose(0.0, bounds.centerX)
    }
}

class LineSegmentTest {

    private val box = Bounds(-1.0, -1.0, 1.0, 1.0)

    /** 수직 주름선은 상자를 위아래로 가로지른다 */
    @Test
    fun verticalCreaseCrossesBoxTopToBottom() {
        val (a, b) = Line.vertical(0.0).segmentInside(box)!!
        assertClose(0.0, a.x)
        assertClose(0.0, b.x)
        assertClose(2.0, abs(a.y - b.y))
    }

    /** 대각선 주름선은 마주 보는 두 모서리를 잇는다 */
    @Test
    fun diagonalCreaseConnectsOppositeCorners() {
        val (a, b) = Line.through(Vec2(0.0, 0.0), Vec2(1.0, 1.0)).segmentInside(box)!!
        assertClose(2.0, abs(a.x - b.x))
        assertClose(2.0, abs(a.y - b.y))
    }

    /** 상자를 비껴가는 선은 구간이 없다 */
    @Test
    fun creaseOutsideBoxHasNoSegment() {
        assertNull(Line.vertical(5.0).segmentInside(box))
        assertNull(Line.horizontal(-3.0).segmentInside(box))
    }
}
