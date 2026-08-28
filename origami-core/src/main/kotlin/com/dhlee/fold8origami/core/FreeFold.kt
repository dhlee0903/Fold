package com.dhlee.fold8origami.core

/**
 * "이 점을 저 점 위로 접기"를 한 단계로 만든다.
 *
 * 두 점을 포갤 수 있는 주름선은 두 점을 잇는 선분의 수직이등분선 하나뿐이므로,
 * 화면을 [from]에서 [to]로 쓸기만 하면 접는 선이 정해진다.
 *
 * @return 두 점이 너무 가까우면(주름선을 정할 수 없으면) null.
 */
fun pointToPointFold(
    from: Vec2,
    to: Vec2,
    direction: FoldDirection = FoldDirection.VALLEY,
    layers: LayerSelection = LayerSelection.All,
): FoldStep? {
    val delta = to - from
    if (delta.length() < MIN_DRAG) return null

    val crease = Line(point = (from + to) * 0.5, dir = Vec2(-delta.y, delta.x).normalized())
    // 사용자가 손가락을 올린 쪽(=from)이 넘어간다.
    val movingSide = if (crease.signedDistance(from) > 0) Side.POSITIVE else Side.NEGATIVE

    return FoldStep(
        title = "자유 접기",
        instruction = "짚은 점을 도착한 점 위로 포갭니다",
        crease = crease,
        movingSide = movingSide,
        direction = direction,
        layers = layers,
    )
}

/** 이보다 짧게 쓸면 주름선이 흔들려 무시한다(종이 좌표 기준). */
const val MIN_DRAG = 0.08
