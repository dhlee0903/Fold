package com.dhlee.fold8origami.fold

/** 힌지 정보를 어디서 얻었는지. */
enum class HingeSourceKind {
    /** 힌지 각도 센서(TYPE_HINGE_ANGLE). 각도가 연속으로 들어온다. */
    SENSOR,

    /** Jetpack WindowManager의 접힘 상태. 펼침/반접힘 두 단계만 알 수 있다. */
    WINDOW_STATE,

    /** 접히는 기기가 아니다. 화면의 수동 조절기를 쓴다. */
    NONE,
}

/**
 * 지금 기기가 얼마나 접혀 있는지.
 *
 * @param angleDegrees 180°가 완전히 펴진 상태, 0°가 완전히 닫힌 상태.
 * @param hingeThicknessPx 화면을 가르는 힌지 영역의 두께(픽셀). 접힌 자리에 UI를 걸치지 않게 쓴다.
 */
data class HingePosture(
    val angleDegrees: Float?,
    val isFoldable: Boolean,
    val isHalfOpened: Boolean,
    val isSeparating: Boolean,
    val isHorizontalHinge: Boolean,
    val hingeThicknessPx: Int,
    val source: HingeSourceKind,
) {
    /** 힌지가 화면을 위아래로 나눠 놓은 상태(테이블톱). 위쪽엔 그림, 아래쪽엔 조작부를 둔다. */
    val isTabletop: Boolean get() = isSeparating && isHorizontalHinge

    companion object {
        val Unknown = HingePosture(
            angleDegrees = null,
            isFoldable = false,
            isHalfOpened = false,
            isSeparating = false,
            isHorizontalHinge = false,
            hingeThicknessPx = 0,
            source = HingeSourceKind.NONE,
        )
    }
}
