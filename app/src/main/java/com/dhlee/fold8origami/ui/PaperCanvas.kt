package com.dhlee.fold8origami.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import com.dhlee.fold8origami.core.Bounds
import com.dhlee.fold8origami.core.PosedFacet
import com.dhlee.fold8origami.core.Vec2
import kotlin.math.abs
import kotlin.math.min

/** 종이 좌표(수학 좌표계)와 화면 좌표(y가 아래로) 사이를 오가는 변환. */
class PaperTransform(private val scale: Float, private val offsetX: Float, private val offsetY: Float) {

    fun toScreen(v: Vec2): Offset = Offset(offsetX + v.x.toFloat() * scale, offsetY - v.y.toFloat() * scale)

    fun toPaper(o: Offset): Vec2 = Vec2(
        ((o.x - offsetX) / scale).toDouble(),
        ((offsetY - o.y) / scale).toDouble(),
    )

    companion object {
        /** [bounds]가 [size] 안에 여백을 두고 딱 들어가도록 맞춘다. */
        fun fit(size: IntSize, bounds: Bounds): PaperTransform {
            if (size.width <= 0 || size.height <= 0) return PaperTransform(1f, 0f, 0f)
            val width = bounds.width.toFloat().coerceAtLeast(1e-3f)
            val height = bounds.height.toFloat().coerceAtLeast(1e-3f)
            val scale = min(size.width / width, size.height / height) * 0.92f
            return PaperTransform(
                scale = scale,
                offsetX = size.width / 2f - bounds.centerX.toFloat() * scale,
                offsetY = size.height / 2f + bounds.centerY.toFloat() * scale,
            )
        }
    }
}

private val PaperFront = Color(0xFFF0654A)
private val PaperBack = Color(0xFFFFF7EC)
private val PaperEdge = Color(0xFF6B5B4B)
private val CreaseGuide = Color(0xFF3B6EA5)
private val Shadow = Color(0x1A000000)

/**
 * 접힌 종이를 그린다. 자유 모드에서는 화면을 쓸어 주름선을 정할 수 있다.
 *
 * @param onFreeFold 쓸기가 끝났을 때 (짚은 점, 도착한 점)을 종이 좌표로 알려 준다. null이면 조작을 받지 않는다.
 */
@Composable
fun PaperCanvas(
    facets: List<PosedFacet>,
    viewBounds: Bounds,
    modifier: Modifier = Modifier,
    creaseGuide: Pair<Vec2, Vec2>? = null,
    dragPreview: Pair<Vec2, Vec2>? = null,
    onFreeDrag: ((Vec2, Vec2) -> Unit)? = null,
    onFreeFold: ((Vec2, Vec2) -> Unit)? = null,
    onFreeDragCancel: (() -> Unit)? = null,
) {
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val transform = remember(canvasSize, viewBounds) { PaperTransform.fit(canvasSize, viewBounds) }

    val gestureModifier = if (onFreeFold == null) {
        Modifier
    } else {
        Modifier.pointerInput(transform, onFreeFold) {
            var start = Offset.Zero
            var current = Offset.Zero
            detectDragGestures(
                onDragStart = {
                    start = it
                    current = it
                },
                onDrag = { change, _ ->
                    change.consume()
                    current = change.position
                    onFreeDrag?.invoke(transform.toPaper(start), transform.toPaper(current))
                },
                onDragEnd = { onFreeFold(transform.toPaper(start), transform.toPaper(current)) },
                onDragCancel = { onFreeDragCancel?.invoke() },
            )
        }
    }

    Canvas(
        modifier = modifier
            .onSizeChanged { canvasSize = it }
            .then(gestureModifier),
    ) {
        facets.forEach { facet ->
            val path = facet.polygon.toPath(transform)
            // 들린 종이는 아래에 그림자를 만든다.
            if (abs(facet.lift) > 1e-3) {
                val drop = (facet.lift.toFloat() * 14f).coerceIn(-24f, 24f)
                translate(drop, drop) { drawPath(path, Shadow) }
            }
            drawPath(path, facet.fillColor())
            drawPath(path, PaperEdge.copy(alpha = 0.45f), style = Stroke(width = 2f))
        }

        creaseGuide?.let { (a, b) ->
            drawLine(
                color = CreaseGuide.copy(alpha = 0.75f),
                start = transform.toScreen(a),
                end = transform.toScreen(b),
                strokeWidth = 3f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(16f, 14f)),
            )
        }

        dragPreview?.let { (from, to) ->
            val a = transform.toScreen(from)
            val b = transform.toScreen(to)
            drawLine(CreaseGuide, a, b, strokeWidth = 4f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f)))
            drawCircle(CreaseGuide, radius = 12f, center = a)
            drawCircle(CreaseGuide.copy(alpha = 0.35f), radius = 18f, center = b)
        }
    }
}

/** 들린 정도에 따라 밝기를 조금 바꿔 입체감을 준다. */
private fun PosedFacet.fillColor(): Color {
    val base = if (flipped) PaperBack else PaperFront
    val shade = (lift * 0.35).coerceIn(-0.3, 0.3)
    return if (shade >= 0) lerp(base, Color.White, shade.toFloat()) else lerp(base, Color.Black, -shade.toFloat())
}

private fun List<Vec2>.toPath(transform: PaperTransform): Path = Path().apply {
    forEachIndexed { index, point ->
        val screen = transform.toScreen(point)
        if (index == 0) moveTo(screen.x, screen.y) else lineTo(screen.x, screen.y)
    }
    close()
}
