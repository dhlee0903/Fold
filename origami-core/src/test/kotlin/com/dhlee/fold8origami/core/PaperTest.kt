package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private fun PaperModel.totalArea(): Double = facets.sumOf { polygonArea(it.polygon) }

class PaperTest {

    private val sheet = PaperModel.sheet(2.0, 2.0)

    private fun halfFold(
        direction: FoldDirection = FoldDirection.VALLEY,
        layers: LayerSelection = LayerSelection.All,
    ) = FoldStep(
        title = "반 접기",
        instruction = "",
        crease = Line.vertical(0.0),
        movingSide = Side.POSITIVE,
        direction = direction,
        layers = layers,
    )

    @Test
    /** 접어도 종이 넓이는 그대로다 */
    fun foldPreservesArea() {
        val folded = sheet.applyFold(halfFold())
        assertTrue(abs(folded.totalArea() - sheet.totalArea()) < 1e-9)
    }

    @Test
    /** 반 접으면 두 겹이 되고 폭이 절반이 된다 */
    fun halfFoldDoublesLayersAndHalvesWidth() {
        val folded = sheet.applyFold(halfFold())
        assertEquals(2, folded.layerCount)
        val bounds = folded.bounds()
        assertTrue(abs(bounds.width - 1.0) < 1e-9, "width=${bounds.width}")
        assertTrue(bounds.maxX <= 1e-9, "접힌 종이는 왼쪽 반평면에만 있어야 한다")
    }

    @Test
    /** 넘어간 겹은 뒷면이 보이고 맨 위에 쌓인다 */
    fun valleyFoldPutsFlippedFacetOnTop() {
        val folded = sheet.applyFold(halfFold())
        val top = folded.facets.maxBy { it.layer }
        assertTrue(top.flipped)
        val bottom = folded.facets.minBy { it.layer }
        assertFalse(bottom.flipped)
    }

    @Test
    /** 산접기는 넘어간 겹을 맨 아래에 놓는다 */
    fun mountainFoldPutsFlippedFacetOnBottom() {
        val folded = sheet.applyFold(halfFold(FoldDirection.MOUNTAIN))
        val bottom = folded.facets.minBy { it.layer }
        assertTrue(bottom.flipped, "뒤로 넘긴 겹이 가장 아래여야 한다")
    }

    @Test
    /** 여러 번 접으면 겹 순서가 뒤집히며 쌓인다 */
    fun repeatedFoldsStackLayers() {
        var model = sheet.applyFold(halfFold())
        model = model.applyFold(
            FoldStep("", "", Line.horizontal(0.0), Side.POSITIVE, FoldDirection.VALLEY),
        )
        assertEquals(4, model.layerCount)
        assertTrue(abs(model.totalArea() - 4.0) < 1e-9)
        // 층 번호는 0부터 빈틈없이 다시 매겨진다.
        assertEquals(listOf(0, 1, 2, 3), model.facets.map { it.layer }.sorted())
    }

    @Test
    /** 앞장만 접기는 선택한 겹만 움직인다 */
    fun topLayerSelectionMovesOnlySelectedFacets() {
        val twoLayers = sheet.applyFold(halfFold())
        val front = twoLayers.applyFold(
            FoldStep(
                title = "",
                instruction = "",
                crease = Line.vertical(-0.5),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.VALLEY,
                layers = LayerSelection.Top(1),
            ),
        )
        // 앞장만 갈라졌으므로 면은 셋(접힌 앞장 조각 둘 + 손대지 않은 뒷장)이다.
        assertEquals(3, front.facets.size)
        val moved = front.facets.maxBy { it.layer }
        assertTrue(moved.polygon.all { it.x >= -0.5 - 1e-9 }, "앞장은 주름선 오른쪽으로 넘어가야 한다")
        assertTrue(
            front.facets.any { f -> f.polygon.any { it.x <= -1.0 + 1e-9 } },
            "뒷장은 그대로 남아 있어야 한다",
        )
        assertTrue(abs(front.totalArea() - 4.0) < 1e-9)
    }

    @Test
    /** 종이를 비껴가는 주름선은 아무것도 바꾸지 않는다 */
    fun creaseMissingPaperChangesNothing() {
        val step = FoldStep("", "", Line.vertical(9.0), Side.POSITIVE)
        assertFalse(step.affects(sheet))
        assertEquals(sheet, sheet.applyFold(step))
    }

    @Test
    /** 진행률 1의 중간 자세는 완전히 접은 결과와 같다 */
    fun poseAtFullProgressMatchesAppliedFold() {
        val step = halfFold()
        val posed = sheet.pose(step, 1.0).filter { it.moving }
        val folded = sheet.applyFold(step)
        val movedArea = posed.sumOf { polygonArea(it.polygon) }
        assertTrue(abs(movedArea - 2.0) < 1e-9)
        val posedBounds = Bounds.of(posed.flatMap { it.polygon })
        val foldedBounds = folded.bounds()
        assertTrue(abs(posedBounds.minX - foldedBounds.minX) < 1e-9)
        assertTrue(abs(posedBounds.maxX - foldedBounds.maxX) < 1e-9)
    }

    @Test
    /** 진행률 0이면 아직 제자리에 있다 */
    fun poseAtZeroProgressIsUnmoved() {
        val posed = sheet.pose(halfFold(), 0.0)
        assertEquals(1, posed.size)
        assertTrue(posed.none { it.moving })
    }

    @Test
    /** 접는 중에는 종이가 떠오르고 골접기는 앞으로 온다 */
    fun poseLiftsValleyForwardAndMountainBack() {
        val posed = sheet.pose(halfFold(), 0.5).first { it.moving }
        assertTrue(posed.lift > 0.0)
        val mountain = sheet.pose(halfFold(FoldDirection.MOUNTAIN), 0.5).first { it.moving }
        assertTrue(mountain.lift < 0.0)
    }

    @Test
    /** 그리는 순서는 아래 겹부터다 */
    fun poseIsSortedFromBottomLayer() {
        val model = sheet.applyFold(halfFold())
        val posed = model.pose(null, 0.0)
        assertEquals(posed.sortedBy { it.drawKey }, posed)
    }
}
