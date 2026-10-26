import com.android.build.gradle.LibraryExtension

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

// Older Flutter plugins may declare their manifest package but omit the
// namespace required by modern Android Gradle Plugin versions.
subprojects {
    plugins.withId("com.android.library") {
        extensions.configure<LibraryExtension> {
            if (namespace == null) {
                namespace = "com.raptor.legacy.${project.name.replace('-', '_')}"
            }
        }

        if (project.name == "flutter_bluetooth_serial") {
            tasks.matching { task ->
                task.name.startsWith("process") && task.name.endsWith("Manifest")
            }.configureEach {
                doFirst {
                    val manifest = project.file("src/main/AndroidManifest.xml")
                    if (manifest.exists()) {
                        val original = manifest.readText()
                        val normalized = original.replace(
                            Regex("\\s+package=\\\"[^\\\"]*\\\""),
                            "",
                        )
                        if (normalized != original) {
                            manifest.writeText(normalized)
                        }
                    }
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
