import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("org.jetbrains.kotlin.android")
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing. Local builds read android/key.properties (git-ignored);
// CI provides the same values via GitHub Secrets as env vars so every
// published APK shares ONE signature and can overwrite-install.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

fun propOrEnv(name: String): String? =
    keystoreProperties.getProperty(name) ?: System.getenv("ANDROID_${name.uppercase()}")

val releaseStoreFile = propOrEnv("storeFile")?.takeIf(String::isNotBlank)
val releaseStorePassword = propOrEnv("storePassword")?.takeIf(String::isNotBlank)
val releaseKeyAlias = propOrEnv("keyAlias")?.takeIf(String::isNotBlank)
val releaseKeyPassword = propOrEnv("keyPassword")?.takeIf(String::isNotBlank)
val releaseSigningConfigured = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { it != null }

val validateReleaseSigning = tasks.register("validateReleaseSigning") {
    group = "verification"
    description = "Fails release packaging when the release keystore is missing or incomplete."
    doLast {
        if (!releaseSigningConfigured) {
            throw GradleException(
                "Release signing is required. Configure storeFile, storePassword, keyAlias, and keyPassword in android/key.properties or ANDROID_* environment variables.",
            )
        }
        if (releaseStoreFile == null || !file(releaseStoreFile).isFile) {
            throw GradleException("The configured Android release keystore file does not exist.")
        }
    }
}

tasks.configureEach {
    if (name == "assembleRelease" || name == "bundleRelease" || name == "packageRelease") {
        dependsOn(validateReleaseSigning)
    }
}

android {
    namespace = "com.lingdian.kayingai.agent.code"
    // 本地链 flutter_secure_storage 9 走 SDK 36 即可(上游 11 才需 37)。
    compileSdk = flutter.compileSdkVersion
    // 显式钉住 NDK 版本：Flutter 3.35.5 的 flutter.ndkVersion 是 27.0.12077973，
    // 但本机 27.0.12077973 与 28.2.13676358 两个目录都是残缺副本（前者只剩
    // .installer 中断下载标记、没有 source.properties，AGP 配置期即报 CXX1101；
    // 后者只有 source.properties、没有 build/cmake/android.toolchain.cmake），
    // sdkmanager 重装 27 两次都卡在 "Error reading Zip content from a
    // SeekableByteChannel"（大文件国际下载不稳）。本机唯一完整的是 30.0.14904198。
    // NDK 在此工程只用于给原生库剥离调试符号——Flutter 的 CMakeLists.txt 是空文件，
    // 注释写明「Empty file to trick AGP to download the NDK」，不参与实际编译，
    // 因此高版本可用。插件侧 jni 也用 flutter.ndkVersion，无冲突。
    ndkVersion = "30.0.14904198"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // 新产品首次发行使用独立安装身份，与旧产品并存。
        applicationId = "com.lingdian.kayingai.agent.code"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (releaseSigningConfigured) {
                // Keystore is a PKCS12 file (generated with openssl).
                storeType = "PKCS12"
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                storeFile = file(checkNotNull(releaseStoreFile))
                storePassword = releaseStorePassword
            }
        }
    }

    buildTypes {
        release {
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

flutter {
    source = "../.."
}

// Java 与 Kotlin 的 JVM 目标必须一致：Java 侧为 17，
// Kotlin 默认跟随 JDK 21，会在编译期报 Inconsistent JVM-target。
kotlin {
    jvmToolchain(17)
}
