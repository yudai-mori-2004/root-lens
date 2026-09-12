#!/usr/bin/env bash
set -euo pipefail

script_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_directory=$(cd "${script_directory}/.." && pwd)
sdk_directory=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${HOME}/Library/Android/sdk}}
android_jar="${sdk_directory}/platforms/android-35/android.jar"
output_directory="${project_directory}/app/build/session-artifacts-test"
source_directory="${project_directory}/app/src/main/java"
test_directory="${project_directory}/app/src/test/java"

if [[ ! -f "$android_jar" ]]; then
  echo "Android SDK 35 is required; set ANDROID_HOME or ANDROID_SDK_ROOT." >&2
  exit 1
fi
mkdir -p "$output_directory"
javac -cp "$android_jar" -sourcepath "${source_directory}:${test_directory}" -d "$output_directory" \
  "${test_directory}/io/rootlens/mentra/CaptureFileCommitTest.java" \
  "${test_directory}/io/rootlens/mentra/SessionArtifactsTest.java"
java -Xmx32m -cp "${output_directory}:${android_jar}" io.rootlens.mentra.CaptureFileCommitTest
java -Xmx32m -cp "${output_directory}:${android_jar}" io.rootlens.mentra.SessionArtifactsTest
