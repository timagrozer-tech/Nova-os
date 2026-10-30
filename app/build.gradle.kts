plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.droidvm.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.droidvm.app"
        minSdk = 26
        // 34: на Android 15 не включается принудительный edge-to-edge
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    // Один постоянный ключ, чтобы новые сборки ставились поверх старых без удаления.
    signingConfigs {
        create("droidvm") {
            storeFile = rootProject.file("keystore/droidvm.jks")
            storePassword = "droidvm123"
            keyAlias = "droidvm"
            keyPassword = "droidvm123"
        }
    }

    buildTypes {
        debug { signingConfig = signingConfigs.getByName("droidvm") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("droidvm")
        }
    }

    // Встраиваем только ABI, для которых скрипт положил QEMU (по умолчанию arm64-v8a).
    val abis = file("src/main/jniLibs").listFiles()?.filter { it.isDirectory }?.map { it.name }.orEmpty()
    if (abis.isNotEmpty()) {
        defaultConfig { ndk { abiFilters += abis } }
    }

    packaging {
        jniLibs {
            // Распаковывать .so на устройство (иначе QEMU нельзя будет запустить как процесс)
            useLegacyPackaging = true
            keepDebugSymbols += "**/*.so"
        }
    }

    androidResources {
        // Прошивки уже в zip — не сжимать повторно
        noCompress += "zip"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}
