// 안드로이드 플러그인은 :app 모듈에서만 선언한다. 그래야 SDK가 없는 환경에서도
// 접기 엔진(:origami-core) 테스트를 그대로 돌릴 수 있다.
plugins {
    alias(libs.plugins.kotlin.jvm) apply false
}
