package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * 접힌 종이를 이루는 한 장의 면.
 *
 * @param polygon 눌러서 평평하게 폈을 때의 좌표.
 * @param layer 층 번호. 클수록 보는 사람 쪽(위)에 있다.
 * @param flipped 홀수 번 뒤집혀 종이의 뒷면이 보이는 상태인지.
 */
data class Facet(
    val polygon: List<Vec2>,
    val layer: Int,
    val flipped: Boolean = false,
)

/** 지금까지 접은 결과 전체. */
data class PaperModel(val facets: List<Facet>) {

    val minLayer: Int get() = facets.minOfOrNull { it.layer } ?: 0
    val maxLayer: Int get() = facets.maxOfOrNull { it.layer } ?: 0

    /** 겹친 종이가 몇 장인지(가장 두꺼운 곳 기준이 아니라 층 개수). */
    val layerCount: Int get() = facets.map { it.layer }.distinct().size

    fun bounds(): Bounds = Bounds.of(facets.flatMap { it.polygon })

    /** 층 번호가 띄엄띄엄해지지 않게 0부터 촘촘하게 다시 매긴다. */
    fun normalized(): PaperModel {
        val order = facets.map { it.layer }.distinct().sorted()
        val remap = order.withIndex().associate { (i, layer) -> layer to i }
        return PaperModel(facets.map { it.copy(layer = remap.getValue(it.layer)) })
    }

    companion object {
        /** [width] x [height] 크기의 직사각형 종이 한 장. 원점이 가운데다. */
        fun sheet(width: Double, height: Double): PaperModel {
            val hw = width / 2.0
            val hh = height / 2.0
            return PaperModel(
                listOf(
                    Facet(
                        polygon = listOf(
                            Vec2(-hw, -hh), Vec2(hw, -hh), Vec2(hw, hh), Vec2(-hw, hh),
                        ),
                        layer = 0,
                    ),
                ),
            )
        }
    }
}

/** 골접기(앞으로 접어 올림) / 산접기(뒤로 넘김). */
enum class FoldDirection { VALLEY, MOUNTAIN }

/** 주름선을 기준으로 어느 반평면이 움직이는지. */
enum class Side { POSITIVE, NEGATIVE }

/** 여러 겹 중 어떤 겹을 접을지. 실제 종이접기의 "앞장만 접기"에 해당한다. */
sealed interface LayerSelection {
    /** 닿는 겹을 전부 접는다. */
    data object All : LayerSelection

    /** 앞(위)에서부터 [count]겹만 접는다. */
    data class Top(val count: Int) : LayerSelection

    /** 뒤(아래)에서부터 [count]겹만 접는다. */
    data class Bottom(val count: Int) : LayerSelection
}

/** 한 단계의 접기 지시. */
data class FoldStep(
    val title: String,
    val instruction: String,
    val crease: Line,
    val movingSide: Side,
    val direction: FoldDirection = FoldDirection.VALLEY,
    val layers: LayerSelection = LayerSelection.All,
)

/** 한 면을 주름선으로 나눈 결과. */
private data class SplitFacet(
    val index: Int,
    val facet: Facet,
    val movingPart: List<Vec2>?,
    val stayingPart: List<Vec2>?,
)

private fun FoldStep.split(index: Int, facet: Facet): SplitFacet {
    val (positive, negative) = splitPolygon(facet.polygon, crease)
    return when (movingSide) {
        Side.POSITIVE -> SplitFacet(index, facet, movingPart = positive, stayingPart = negative)
        Side.NEGATIVE -> SplitFacet(index, facet, movingPart = negative, stayingPart = positive)
    }
}

/**
 * 이 단계에서 실제로 움직이는 면들을 고른다.
 *
 * 겹 선택은 종이 전체가 아니라 "주름선 너머에 걸쳐 있는 면들" 중에서 센다.
 * 종이접기 설명서의 "앞장만 접으세요"가 화면 어디에 있는 면이든 상관없이
 * 접는 자리에서 몇 번째 겹이냐를 뜻하는 것과 같다.
 */
private fun FoldStep.selectMoving(model: PaperModel): Map<Int, SplitFacet> {
    val touching = model.facets
        .mapIndexed { index, facet -> split(index, facet) }
        .filter { it.movingPart != null }
        .sortedByDescending { it.facet.layer }
    val chosen = when (val sel = layers) {
        LayerSelection.All -> touching
        is LayerSelection.Top -> touching.take(sel.count)
        is LayerSelection.Bottom -> touching.takeLast(sel.count)
    }
    return chosen.associateBy { it.index }
}

/** 이 단계가 종이에 실제로 변화를 주는지(주름선이 종이를 지나가는지). */
fun FoldStep.affects(model: PaperModel): Boolean = selectMoving(model).isNotEmpty()

/**
 * [step]을 [model]에 적용해 완전히 접은(180°) 결과를 만든다.
 *
 * 접혀 넘어간 겹은 순서가 뒤집힌 채로 남은 뭉치의 위(골접기) 또는 아래(산접기)에 쌓인다.
 */
fun PaperModel.applyFold(step: FoldStep): PaperModel {
    val moving = step.selectMoving(this)
    if (moving.isEmpty()) return this

    val result = ArrayList<Facet>(facets.size + moving.size)
    val top = maxLayer
    val bottom = minLayer

    facets.forEachIndexed { index, facet ->
        val split = moving[index]
        if (split == null) {
            result.add(facet)
        } else {
            split.stayingPart?.let { result.add(facet.copy(polygon = it)) }
        }
    }

    for (split in moving.values.sortedBy { it.index }) {
        val part = split.movingPart ?: continue
        val old = split.facet.layer
        // 반사되면서 겹 순서도 뒤집힌다: 맨 위에 있던 겹이 넘어간 뭉치의 맨 아래가 된다.
        val newLayer = when (step.direction) {
            FoldDirection.VALLEY -> 2 * top + 1 - old
            FoldDirection.MOUNTAIN -> 2 * bottom - 1 - old
        }
        result.add(
            Facet(
                polygon = part.map { step.crease.reflect(it) },
                layer = newLayer,
                flipped = !split.facet.flipped,
            ),
        )
    }
    return PaperModel(result).normalized()
}

/** 접는 중간 자세의 면 하나. 그리기 좋게 이미 화면 평면으로 투영돼 있다. */
data class PosedFacet(
    val polygon: List<Vec2>,
    val flipped: Boolean,
    val moving: Boolean,
    /** 종이면에서 떠오른 높이. 양수면 앞으로, 음수면 뒤로 넘어가는 중이다. */
    val lift: Double,
    /** 리스트 순서가 곧 그리는 순서이지만, 그림자 세기 등에 쓰라고 같이 준다. */
    val drawKey: Double,
)

/**
 * [step]을 [progress](0=펴짐, 1=완전히 접힘)만큼 진행한 중간 모습.
 *
 * 움직이는 조각은 주름선을 축으로 회전한다. 화면에는 정사영으로 그리므로
 * 주름선에서의 거리 d는 d·cos(θ)로 줄어들고, d·sin(θ)만큼 떠오른다.
 * θ=180°면 정확히 [applyFold]의 결과와 같아진다.
 */
fun PaperModel.pose(step: FoldStep?, progress: Double): List<PosedFacet> {
    val posed = ArrayList<PosedFacet>(facets.size * 2)
    if (step == null || progress <= 0.0) {
        facets.forEach {
            posed.add(PosedFacet(it.polygon, it.flipped, moving = false, lift = 0.0, drawKey = it.layer.toDouble()))
        }
        posed.sortBy { it.drawKey }
        return posed
    }

    val t = progress.coerceIn(0.0, 1.0)
    val theta = Math.PI * t
    val cosT = cos(theta)
    val sinT = sin(theta)
    val liftSign = if (step.direction == FoldDirection.VALLEY) 1.0 else -1.0
    // 접히는 뭉치는 한 덩어리로 움직이므로 나머지 종이보다 확실히 앞(뒤)에서 그린다.
    val movingBias = liftSign * 1e6
    val moving = step.selectMoving(this)

    facets.forEachIndexed { index, facet ->
        val split = moving[index]
        if (split == null) {
            posed.add(PosedFacet(facet.polygon, facet.flipped, false, 0.0, facet.layer.toDouble()))
            return@forEachIndexed
        }
        split.stayingPart?.let {
            posed.add(PosedFacet(it, facet.flipped, false, 0.0, facet.layer.toDouble()))
        }
        val part = split.movingPart ?: return@forEachIndexed

        var distanceSum = 0.0
        val rotated = part.map { p ->
            val d = step.crease.signedDistance(p)
            distanceSum += abs(d)
            p - step.crease.normal * (d * (1.0 - cosT))
        }
        // 90도를 넘어가면 뭉치가 뒤집히므로 겹 순서도 함께 뒤집힌다.
        val order = if (t < 0.5) facet.layer.toDouble() else -facet.layer.toDouble()
        posed.add(
            PosedFacet(
                polygon = rotated,
                flipped = if (t > 0.5) !facet.flipped else facet.flipped,
                moving = true,
                lift = liftSign * sinT * (distanceSum / part.size),
                drawKey = movingBias + order,
            ),
        )
    }
    posed.sortBy { it.drawKey }
    return posed
}
