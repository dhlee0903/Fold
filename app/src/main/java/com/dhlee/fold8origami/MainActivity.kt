package com.dhlee.fold8origami

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dhlee.fold8origami.fold.HingePosture
import com.dhlee.fold8origami.fold.HingeSource
import com.dhlee.fold8origami.ui.Fold8OrigamiTheme
import com.dhlee.fold8origami.ui.FoldOrigamiScreen
import com.dhlee.fold8origami.ui.OrigamiViewModel

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val hingeSource = HingeSource(this)

        setContent {
            val viewModel: OrigamiViewModel = viewModel()
            val postures = remember(hingeSource) { hingeSource.postures() }
            val posture by postures.collectAsStateWithLifecycle(initialValue = HingePosture.Unknown)

            LaunchedEffect(posture) { viewModel.onPosture(posture) }

            Fold8OrigamiTheme {
                FoldOrigamiScreen(viewModel)
            }
        }
    }
}
