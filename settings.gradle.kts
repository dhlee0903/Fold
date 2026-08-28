pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "fold8-origami"

include(":origami-core")

// 안드로이드 SDK가 없는 환경(CI의 순수 JVM 검사 등)에서도 접기 엔진 테스트는 돌아가야 하므로
// SDK를 찾을 수 있을 때만 :app 모듈을 포함한다. -PincludeApp=true 로 강제할 수 있다.
val androidSdkDir: String? = System.getenv("ANDROID_HOME")
    ?: System.getenv("ANDROID_SDK_ROOT")
    ?: file("local.properties")
        .takeIf { it.exists() }
        ?.readLines()
        ?.firstOrNull { it.startsWith("sdk.dir=") }
        ?.substringAfter("=")

if (androidSdkDir != null || extra.properties["includeApp"] == "true") {
    include(":app")
} else {
    logger.lifecycle("안드로이드 SDK를 찾지 못해 :app 모듈을 건너뜁니다. (:origami-core 만 빌드)")
}
