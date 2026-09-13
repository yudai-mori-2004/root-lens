#!/usr/bin/env bash
set -euo pipefail

script_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_directory=$(cd "${script_directory}/.." && pwd)
output_directory="${project_directory}/app/build/capture-engine-test"

mkdir -p "$output_directory"
mapfile_sources=()
while IFS= read -r -d '' source_path; do
  mapfile_sources+=("$source_path")
done < <(find "${project_directory}/app/src/hostTest/java" -name '*.java' -print0)
javac -d "$output_directory" \
  "${project_directory}/app/src/main/java/io/rootlens/mentra/AppContract.java" \
  "${project_directory}/app/src/main/java/io/rootlens/mentra/CaptureEngine.java" \
  "${mapfile_sources[@]}"
java -cp "$output_directory" io.rootlens.mentra.CaptureEngineFaultTest
