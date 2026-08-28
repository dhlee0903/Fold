package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ModelsTest {

    private fun OrigamiModel.foldAll(): PaperModel {
        var model = sheet
        steps.forEachIndexed { index, step ->
            assertTrue(step.affects(model), "[$name] ${index + 1}번째 단계의 주름선이 종이를 지나지 않습니다: ${step.title}")
            model = model.applyFold(step)
        }
        return model
    }

    @Test
    /** 모든 작품은 단계마다 종이를 실제로 접는다 */
    fun everyStepActuallyFoldsThePaper() {
        OrigamiModels.all.filter { it.steps.isNotEmpty() }.forEach { it.foldAll() }
    }

    @Test
    /** 접는 동안 종이 넓이는 보존된다 */
    fun areaIsPreservedThroughEveryStep() {
        OrigamiModels.all.filter { it.steps.isNotEmpty() }.forEach { model ->
            val startArea = model.sheet.facets.sumOf { polygonArea(it.polygon) }
            var paper = model.sheet
            model.steps.forEach { step ->
                paper = paper.applyFold(step)
                val area = paper.facets.sumOf { polygonArea(it.polygon) }
                assertTrue(abs(area - startArea) < 1e-6, "[${model.name}] 넓이가 변했습니다: $area vs $startArea")
            }
        }
    }

    @Test
    /** 부채는 네 칸으로 포개진다 */
    fun fanEndsUpWithFourLayers() {
        val folded = OrigamiModels.fan.foldAll()
        // 정사각형을 1/4씩 번갈아 접으면 네 칸이 포개진다.
        assertEquals(4, folded.layerCount)
        val bounds = folded.bounds()
        assertTrue(abs(bounds.width - 0.5) < 1e-9, "width=${bounds.width}")
    }

    @Test
    /** 모자는 챙까지 접으면 위쪽만 남는다 */
    fun hatBrimFoldsUpward() {
        val folded = OrigamiModels.hat.foldAll()
        val bounds = folded.bounds()
        // 4·5단계에서 아래 띠를 위로 접었으므로 y = -1 아래로는 종이가 남지 않는다.
        assertTrue(bounds.minY > -1.0 - 1e-6, "minY=${bounds.minY}")
        assertTrue(folded.layerCount >= 4)
    }

    @Test
    /** 비행기는 접을수록 폭이 좁아진다 */
    fun planeGetsNarrowerEveryStep() {
        var paper = OrigamiModels.plane.sheet
        var width = paper.bounds().width
        OrigamiModels.plane.steps.forEach { step ->
            paper = paper.applyFold(step)
            val newWidth = paper.bounds().width
            assertTrue(newWidth <= width + 1e-9, "폭이 넓어졌습니다: $width -> $newWidth")
            width = newWidth
        }
        // 세로로 반 접었으니 최종 폭은 원래 종이의 절반 이하다.
        assertTrue(width <= 1.0 + 1e-9, "width=$width")
    }

    @Test
    /** 모든 작품은 id로 찾을 수 있다 */
    fun modelsAreLookedUpById() {
        OrigamiModels.all.forEach { assertEquals(it, OrigamiModels.byId(it.id)) }
    }
}
