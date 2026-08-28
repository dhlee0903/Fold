package com.dhlee.fold8origami.core

/** 한 작품의 접기 설명서. */
data class OrigamiModel(
    val id: String,
    val name: String,
    val description: String,
    val sheet: PaperModel,
    val steps: List<FoldStep>,
    /** true면 정해진 순서 없이 사용자가 그은 주름선을 계속 이어 접는다. */
    val freeform: Boolean = false,
)

/** 기본으로 들어 있는 작품들. 자유 모드는 [freeFold]. */
object OrigamiModels {

    /** 세로로 세 번 번갈아 접는 부채. 산접기/골접기 차이를 눈으로 보기 좋다. */
    val fan = OrigamiModel(
        id = "fan",
        name = "부채",
        description = "한 번씩 번갈아 접으면 주름이 생깁니다",
        sheet = PaperModel.sheet(2.0, 2.0),
        steps = listOf(
            FoldStep(
                title = "1. 오른쪽 1/4 접기",
                instruction = "오른쪽 끝을 안쪽으로 접어 올립니다",
                crease = Line.vertical(0.5),
                movingSide = Side.POSITIVE,
                direction = FoldDirection.VALLEY,
            ),
            FoldStep(
                title = "2. 뒤로 접기",
                instruction = "이번엔 반대로 뒤쪽으로 넘겨 주름을 만듭니다",
                crease = Line.vertical(0.0),
                movingSide = Side.POSITIVE,
                direction = FoldDirection.MOUNTAIN,
            ),
            FoldStep(
                title = "3. 다시 앞으로 접기",
                instruction = "마지막으로 앞쪽으로 접으면 부채 주름 완성",
                crease = Line.vertical(-0.5),
                movingSide = Side.POSITIVE,
                direction = FoldDirection.VALLEY,
            ),
        ),
    )

    /** 신문지 모자. 앞장/뒷장을 따로 접는 단계가 들어 있다. */
    val hat = OrigamiModel(
        id = "hat",
        name = "종이 모자",
        description = "반 접고 양쪽 모서리를 모아 챙을 올립니다",
        sheet = PaperModel.sheet(2.0, 2.8),
        steps = listOf(
            FoldStep(
                title = "1. 반으로 접기",
                instruction = "위쪽 절반을 아래로 접습니다",
                crease = Line.horizontal(0.0),
                movingSide = Side.POSITIVE,
                direction = FoldDirection.VALLEY,
            ),
            FoldStep(
                title = "2. 왼쪽 모서리 접기",
                instruction = "왼쪽 위 모서리를 가운데로 접어 내립니다",
                crease = Line.through(Vec2(0.0, 0.0), Vec2(-1.0, -1.0)),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.VALLEY,
            ),
            FoldStep(
                title = "3. 오른쪽 모서리 접기",
                instruction = "반대쪽 모서리도 똑같이 가운데로 모읍니다",
                crease = Line.through(Vec2(0.0, 0.0), Vec2(1.0, -1.0)),
                movingSide = Side.POSITIVE,
                direction = FoldDirection.VALLEY,
            ),
            FoldStep(
                title = "4. 앞쪽 챙 올리기",
                instruction = "아래에 남은 띠를 앞장만 위로 접습니다",
                crease = Line.horizontal(-1.0),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.VALLEY,
                layers = LayerSelection.Top(1),
            ),
            FoldStep(
                title = "5. 뒤쪽 챙 올리기",
                instruction = "뒤집지 말고 뒷장 띠는 뒤로 넘겨 접습니다",
                crease = Line.horizontal(-1.0),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.MOUNTAIN,
                layers = LayerSelection.Bottom(1),
            ),
        ),
    )

    /** 종이비행기(다트). 앞장과 뒷장을 대칭으로 접는다. */
    val plane = OrigamiModel(
        id = "plane",
        name = "종이비행기",
        description = "반 접고 코를 만든 뒤 날개를 내립니다",
        sheet = PaperModel.sheet(2.0, 2.8),
        steps = listOf(
            FoldStep(
                title = "1. 세로로 반 접기",
                instruction = "가운데 접은 선이 비행기의 등이 됩니다",
                crease = Line.vertical(0.0),
                movingSide = Side.POSITIVE,
                direction = FoldDirection.VALLEY,
            ),
            FoldStep(
                title = "2. 앞장으로 코 만들기",
                instruction = "위쪽 모서리를 앞장만 등선에 맞춰 접습니다",
                crease = Line.through(Vec2(0.0, 1.4), Vec2(-1.0, 0.4)),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.VALLEY,
                layers = LayerSelection.Top(1),
            ),
            FoldStep(
                title = "3. 뒷장으로 코 만들기",
                instruction = "뒤집어 놓은 것처럼, 뒷장은 뒤로 접어 대칭을 맞춥니다",
                crease = Line.through(Vec2(0.0, 1.4), Vec2(-1.0, 0.4)),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.MOUNTAIN,
                layers = LayerSelection.Bottom(1),
            ),
            FoldStep(
                title = "4. 앞날개 접기",
                instruction = "등선과 나란하게 앞쪽 날개를 접어 내립니다",
                crease = Line.vertical(-0.5),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.VALLEY,
                layers = LayerSelection.Top(2),
            ),
            FoldStep(
                title = "5. 뒷날개 접기",
                instruction = "뒷날개도 같은 자리에서 반대쪽으로 접습니다",
                crease = Line.vertical(-0.5),
                movingSide = Side.NEGATIVE,
                direction = FoldDirection.MOUNTAIN,
                layers = LayerSelection.Bottom(2),
            ),
        ),
    )

    /** 정해진 순서 없이 직접 주름선을 그어 접는 모드. */
    val freeFold = OrigamiModel(
        id = "free",
        name = "자유 접기",
        description = "화면을 쓸어 주름선을 긋고 기기를 접으세요",
        sheet = PaperModel.sheet(2.0, 2.0),
        steps = emptyList(),
        freeform = true,
    )

    val all: List<OrigamiModel> = listOf(fan, hat, plane, freeFold)

    fun byId(id: String): OrigamiModel = all.firstOrNull { it.id == id } ?: fan
}
