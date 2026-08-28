// 코틀린 플러그인은 하위 모듈이 서로 다른 id(jvm/android/compose)로 같은 아티팩트를 요청하므로
// 버전을 루트에서 한 번만 정해 둔다. 그러지 않으면 두 번째 요청이
// "plugin is already on the classpath with an unknown version"로 실패한다.
//
// 안드로이드 플러그인(AGP)은 :app 에서만 선언한다. 그래야 Google Maven에 닿지 못하는
// 환경에서도 접기 엔진(:origami-core)만 빌드하고 테스트할 수 있다.
plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
