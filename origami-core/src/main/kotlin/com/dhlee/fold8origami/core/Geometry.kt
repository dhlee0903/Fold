package com.dhlee.fold8origami.core

import kotlin.math.abs
import kotlin.math.hypot

/** 2차원 벡터. 종이 좌표계는 수학 좌표계(y가 위쪽)를 쓴다. */
data class Vec2(val x: Double, val y: Double) {
    operator fun plus(o: Vec2) = Vec2(x + o.x, y + o.y)
    operator fun minus(o: Vec2) = Vec2(x - o.x, y - o.y)
    operator fun times(s: Double) = Vec2(x * s, y * s)

    infix fun dot(o: Vec2) = x * o.x + y * o.y

    fun length() = hypot(x, y)

    fun normalized(): Vec2 {
        val len = length()
        require(len > EPS) { "0 벡터는 정규화할 수 없습니다." }
        return Vec2(x / len, y / len)
    }

    companion object {
        const val EPS = 1e-9
    }
}

/**
 * 접는 선(주름선). [point]를 지나고 [dir] 방향으로 무한히 뻗는 직선이다.
 *
 * [normal]을 기준으로 평면이 양(+)/음(-) 반평면으로 나뉘며, 어느 쪽이 움직일지는
 * [FoldStep.movingSide]가 정한다.
 */
data class Line(val point: Vec2, val dir: Vec2) {

    /** [dir]을 반시계로 90도 돌린 방향. 이 쪽이 양(+)의 반평면이다. */
    val normal: Vec2 = Vec2(-dir.y, dir.x)

    /** [p]가 [normal] 방향으로 얼마나 떨어져 있는지. 부호가 반평면을 구분한다. */
    fun signedDistance(p: Vec2): Double = (p - point) dot normal

    /** [p]를 이 선에 대해 반사시킨 점. 완전히 접었을 때(180°)의 최종 위치다. */
    fun reflect(p: Vec2): Vec2 = p - normal * (2.0 * signedDistance(p))

    companion object {
        /** 두 점을 지나는 선. */
        fun through(a: Vec2, b: Vec2): Line = Line(a, (b - a).normalized())

        /** 수평선 y = [y]. */
        fun horizontal(y: Double): Line = Line(Vec2(0.0, y), Vec2(1.0, 0.0))

        /** 수직선 x = [x]. 오른쪽(x가 큰 쪽)이 양의 반평면이 되도록 아래를 향한다. */
        fun vertical(x: Double): Line = Line(Vec2(x, 0.0), Vec2(0.0, -1.0))
    }
}

/** 반시계 방향을 양수로 하는 다각형 넓이의 절댓값. */
fun polygonArea(poly: List<Vec2>): Double {
    if (poly.size < 3) return 0.0
    var sum = 0.0
    for (i in poly.indices) {
        val a = poly[i]
        val b = poly[(i + 1) % poly.size]
        sum += a.x * b.y - b.x * a.y
    }
    return abs(sum) / 2.0
}

/** 면으로 취급할 수 있을 만큼 넓이가 있는지. 부동소수 오차로 생기는 실오라기 조각을 걸러낸다. */
internal fun isRealFacet(poly: List<Vec2>): Boolean = poly.size >= 3 && polygonArea(poly) > AREA_EPS

internal const val AREA_EPS = 1e-7
private const val CLIP_EPS = 1e-9

/**
 * [poly]를 [line]으로 잘라 [line]의 한쪽 반평면만 남긴다(Sutherland–Hodgman).
 *
 * @param keepPositive true면 법선 방향(+) 쪽을, false면 반대(-) 쪽을 남긴다.
 * @return 남은 다각형. 잘린 조각이 없거나 넓이가 0이면 null.
 */
fun clipHalfPlane(poly: List<Vec2>, line: Line, keepPositive: Boolean): List<Vec2>? {
    if (poly.size < 3) return null
    val sign = if (keepPositive) 1.0 else -1.0
    val out = ArrayList<Vec2>(poly.size + 2)

    for (i in poly.indices) {
        val cur = poly[i]
        val next = poly[(i + 1) % poly.size]
        val dCur = line.signedDistance(cur) * sign
        val dNext = line.signedDistance(next) * sign

        if (dCur >= -CLIP_EPS) out.add(cur)
        // 변이 선을 실제로 가로지를 때만 교점을 추가한다.
        if ((dCur > CLIP_EPS && dNext < -CLIP_EPS) || (dCur < -CLIP_EPS && dNext > CLIP_EPS)) {
            val t = dCur / (dCur - dNext)
            out.add(cur + (next - cur) * t)
        }
    }
    return if (isRealFacet(out)) out else null
}

/**
 * [poly]를 [line]으로 두 조각(양수 쪽, 음수 쪽)으로 나눈다.
 * 선이 다각형을 지나지 않으면 한쪽은 null이 된다.
 */
fun splitPolygon(poly: List<Vec2>, line: Line): Pair<List<Vec2>?, List<Vec2>?> =
    clipHalfPlane(poly, line, keepPositive = true) to clipHalfPlane(poly, line, keepPositive = false)

/** 축에 나란한 경계 상자. 화면에 맞춰 그릴 때 쓴다. */
data class Bounds(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double) {
    val width: Double get() = maxX - minX
    val height: Double get() = maxY - minY
    val centerX: Double get() = (minX + maxX) / 2.0
    val centerY: Double get() = (minY + maxY) / 2.0

    companion object {
        fun of(points: Iterable<Vec2>): Bounds {
            var minX = Double.MAX_VALUE
            var minY = Double.MAX_VALUE
            var maxX = -Double.MAX_VALUE
            var maxY = -Double.MAX_VALUE
            var any = false
            for (p in points) {
                any = true
                if (p.x < minX) minX = p.x
                if (p.y < minY) minY = p.y
                if (p.x > maxX) maxX = p.x
                if (p.y > maxY) maxY = p.y
            }
            return if (any) Bounds(minX, minY, maxX, maxY) else Bounds(0.0, 0.0, 0.0, 0.0)
        }
    }
}

/**
 * 이 직선이 [bounds] 안을 지나는 구간을 구한다. 주름선을 화면에 안내선으로 그릴 때 쓴다.
 *
 * @return 상자 안에 들어오는 선분의 양 끝점. 상자를 지나지 않으면 null.
 */
fun Line.segmentInside(bounds: Bounds): Pair<Vec2, Vec2>? {
    var tMin = -Double.MAX_VALUE
    var tMax = Double.MAX_VALUE

    // 네 변을 각각 "축에 나란한 두 개의 반평면"으로 보고 매개변수 구간을 좁혀 나간다.
    fun clip(origin: Double, direction: Double, low: Double, high: Double): Boolean {
        if (abs(direction) < Vec2.EPS) return origin in low..high
        val t1 = (low - origin) / direction
        val t2 = (high - origin) / direction
        tMin = maxOf(tMin, minOf(t1, t2))
        tMax = minOf(tMax, maxOf(t1, t2))
        return tMin <= tMax
    }

    if (!clip(point.x, dir.x, bounds.minX, bounds.maxX)) return null
    if (!clip(point.y, dir.y, bounds.minY, bounds.maxY)) return null
    if (tMin > tMax) return null
    return (point + dir * tMin) to (point + dir * tMax)
}
