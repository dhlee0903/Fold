package com.dhlee.fold8origami.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val PaperScheme = lightColorScheme(
    primary = Color(0xFFC2452F),
    onPrimary = Color(0xFFFFF7EC),
    secondary = Color(0xFF3B6EA5),
    onSecondary = Color(0xFFFFF7EC),
    background = Color(0xFFF6EFE3),
    onBackground = Color(0xFF2E2A25),
    surface = Color(0xFFFFFBF3),
    onSurface = Color(0xFF2E2A25),
    surfaceVariant = Color(0xFFEADFCB),
    onSurfaceVariant = Color(0xFF5A5044),
    outline = Color(0xFFB6A78F),
)

@Composable
fun Fold8OrigamiTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = PaperScheme, content = content)
}
