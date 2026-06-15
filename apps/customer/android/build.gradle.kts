allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

subprojects {
    fun configureProject(proj: Project) {
        val android = proj.extensions.findByType<com.android.build.gradle.BaseExtension>()
        android?.apply {
            compileSdkVersion(36)
            defaultConfig {
                targetSdk = 36
            }
        }
    }

    if (state.executed) {
        configureProject(this)
    } else {
        afterEvaluate {
            configureProject(this)
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
