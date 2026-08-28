package com.dhlee.fold8origami.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dhlee.fold8origami.core.FoldDirection
import com.dhlee.fold8origami.core.FoldEvent
import com.dhlee.fold8origami.core.FoldSession
import com.dhlee.fold8origami.core.OrigamiModels
import com.dhlee.fold8origami.core.segmentInside
import com.dhlee.fold8origami.fold.HingePosture
import com.dhlee.fold8origami.fold.HingeSourceKind
import kotlin.math.roundToInt

@Composable
fun FoldOrigamiScreen(viewModel: OrigamiViewModel, modifier: Modifier = Modifier) {
    val state = viewModel.state
    val posture = viewModel.posture
    val haptics = LocalHapticFeedback.current

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is FoldEvent.StepCommitted, FoldEvent.Completed ->
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)

                FoldEvent.Armed -> Unit
            }
        }
    }

    val hingeGapDp = with(LocalDensity.current) { posture.hingeThicknessPx.toDp() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .systemBarsPadding(),
    ) {
        Header(state, posture)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            PaperCanvas(
                facets = state.facets,
                viewBounds = state.viewBounds,
                modifier = Modifier.fillMaxSize(),
                creaseGuide = state.currentStep?.crease?.segmentInside(state.viewBounds),
                dragPreview = viewModel.dragPreview,
                onFreeDrag = if (viewModel.isFreeMode) viewModel::onFreeDrag else null,
                onFreeFold = if (viewModel.isFreeMode) viewModel::onFreeDragEnd else null,
                onFreeDragCancel = viewModel::cancelFreeDrag,
            )
        }

        // 테이블톱 자세에서는 힌지가 지나는 자리를 비워 두고 아래쪽 절반을 조작부로 쓴다.
        if (posture.isTabletop) Spacer(Modifier.height(hingeGapDp))

        Controls(
            viewModel = viewModel,
            modifier = if (posture.isTabletop) Modifier.weight(1f) else Modifier,
        )
    }
}

@Composable
private fun Header(state: OrigamiUiState, posture: HingePosture, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
        Text(
            text = state.model.name,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = when {
                state.isComplete -> "완성! 종이가 ${state.layerCount}겹이 됐어요"
                state.stepCount == 0 -> state.model.description
                else -> "${state.stepIndex + 1} / ${state.stepCount} 단계 · ${state.layerCount}겹"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = posture.statusText(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.secondary,
        )
    }
}

@Composable
private fun Controls(viewModel: OrigamiViewModel, modifier: Modifier = Modifier) {
    val state = viewModel.state
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StepCard(state, viewModel.isFreeMode)

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OrigamiModels.all.forEach { model ->
                val selected = model.id == state.model.id
                if (selected) {
                    Button(onClick = { viewModel.selectModel(model) }) { Text(model.name) }
                } else {
                    OutlinedButton(onClick = { viewModel.selectModel(model) }) { Text(model.name) }
                }
            }
        }

        if (viewModel.isFreeMode) FreeFoldOptions(viewModel)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = viewModel::undo, enabled = state.canUndo) { Text("한 단계 되돌리기") }
            OutlinedButton(onClick = viewModel::restart) { Text("처음부터") }
        }

        ManualControl(viewModel)
    }
}

@Composable
private fun StepCard(state: OrigamiUiState, isFreeMode: Boolean, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val step = state.currentStep
            Text(
                text = when {
                    state.isComplete -> "다 접었습니다"
                    step == null && isFreeMode -> "화면을 쓸어 접을 곳을 정하세요"
                    step == null -> "접을 단계가 없습니다"
                    else -> step.title
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = when {
                    state.isComplete -> "다른 작품을 골라 보거나 처음부터 다시 접어 보세요."
                    step == null && isFreeMode -> "접을 점에서 도착할 점으로 손가락을 끌면 주름선이 생깁니다."
                    step == null -> "작품을 선택하세요."
                    !state.armed -> "기기를 다시 펴면 다음 단계로 넘어갑니다."
                    else -> step.instruction
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LinearProgressIndicator(
                progress = { state.progress.toFloat() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
            )
            Text(
                text = "접힘 ${(state.progress * 100).roundToInt()}%" +
                    if (state.progress >= FoldSession.COMMIT_THRESHOLD) " · 접기 완료" else "",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FreeFoldOptions(viewModel: OrigamiViewModel, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val valley = viewModel.freeDirection == FoldDirection.VALLEY
        OutlinedButton(
            onClick = {
                viewModel.setFreeDirection(if (valley) FoldDirection.MOUNTAIN else FoldDirection.VALLEY)
            },
        ) {
            Text(if (valley) "골접기(앞으로)" else "산접기(뒤로)")
        }
        OutlinedButton(onClick = { viewModel.setFreeTopLayerOnly(!viewModel.freeTopLayerOnly) }) {
            Text(if (viewModel.freeTopLayerOnly) "앞장만" else "전체 겹")
        }
    }
}

@Composable
private fun ManualControl(viewModel: OrigamiViewModel, modifier: Modifier = Modifier) {
    var sliderValue by remember { mutableFloatStateOf(0f) }
    val posture = viewModel.posture

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "수동으로 접기",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f),
            )
            Switch(
                checked = viewModel.manualMode,
                onCheckedChange = viewModel::setManualMode,
            )
        }
        Text(
            text = if (posture.source == HingeSourceKind.NONE) {
                "이 기기에서는 힌지를 읽을 수 없어 수동 조절기로 접습니다."
            } else {
                "기기를 접는 대신 손으로 조절하고 싶을 때 켜세요."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Slider(
            value = sliderValue,
            onValueChange = {
                sliderValue = it
                viewModel.onManualProgress(it)
            },
            enabled = viewModel.manualMode || posture.source == HingeSourceKind.NONE,
        )
    }
}

private fun HingePosture.statusText(): String = when (source) {
    HingeSourceKind.SENSOR -> "힌지 ${angleDegrees?.roundToInt() ?: 0}° · 기기를 접었다 펴면 한 단계씩 접힙니다"
    HingeSourceKind.WINDOW_STATE -> if (isHalfOpened) {
        "반접힘 감지 · 다시 펴면 다음 단계"
    } else {
        "펼침 상태 · 기기를 반쯤 접어 보세요"
    }

    HingeSourceKind.NONE -> "접히는 기기가 아니에요 · 아래 조절기로 접습니다"
}
