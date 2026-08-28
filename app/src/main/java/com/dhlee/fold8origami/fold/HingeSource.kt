package com.dhlee.fold8origami.fold

import android.app.Activity
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart

/**
 * 기기의 접힘 상태를 하나의 흐름으로 모아 준다.
 *
 * 두 곳에서 정보를 얻는다.
 * 1. 힌지 각도 센서(안드로이드 11+): 0~180°가 연속으로 들어와 접는 애니메이션을 그대로 따라갈 수 있다.
 * 2. Jetpack WindowManager: 센서가 없어도 펼침/반접힘은 알 수 있다.
 *
 * 센서가 없는 기기에서는 "반쯤 접음"을 한 번의 접기로 보고 [HALF_OPENED_ANGLE]을 대신 흘려보낸다.
 */
class HingeSource(private val activity: Activity) {

    private val sensorManager = activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    private val hingeSensor: Sensor? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE)
        } else {
            null
        }

    fun postures(): Flow<HingePosture> =
        combine(hingeAngles(), foldingFeatures()) { angle, feature ->
            val halfOpened = feature?.state == FoldingFeature.State.HALF_OPENED
            HingePosture(
                angleDegrees = angle ?: when {
                    feature == null -> null
                    halfOpened -> HALF_OPENED_ANGLE
                    else -> FLAT_ANGLE
                },
                isFoldable = hingeSensor != null || feature != null,
                isHalfOpened = halfOpened,
                isSeparating = feature?.isSeparating == true,
                isHorizontalHinge = feature?.orientation == FoldingFeature.Orientation.HORIZONTAL,
                hingeThicknessPx = feature?.bounds?.let { minOf(it.width(), it.height()) } ?: 0,
                source = when {
                    angle != null -> HingeSourceKind.SENSOR
                    feature != null -> HingeSourceKind.WINDOW_STATE
                    else -> HingeSourceKind.NONE
                },
            )
        }.distinctUntilChanged()

    /** 힌지 각도 센서 값. 센서가 없으면 null 하나만 내보낸다. */
    private fun hingeAngles(): Flow<Float?> = callbackFlow {
        trySend(null)
        val sensor = hingeSensor
        if (sensor == null) {
            awaitClose { }
            return@callbackFlow
        }
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                event.values.firstOrNull()?.let { trySend(it) }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
        awaitClose { sensorManager.unregisterListener(listener) }
    }

    private fun foldingFeatures(): Flow<FoldingFeature?> =
        WindowInfoTracker.getOrCreate(activity)
            .windowLayoutInfo(activity)
            .map { info -> info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull() }
            .onStart { emit(null) }

    companion object {
        const val FLAT_ANGLE = 180f

        /**
         * 센서가 없을 때 "반접힘"을 대신할 각도.
         * 한 단계를 확정하는 기준(진행률 0.72)을 넘도록 넉넉히 잡았다.
         */
        const val HALF_OPENED_ANGLE = 20f
    }
}
