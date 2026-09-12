#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root_dir=$(cd "$script_dir/.." && pwd)
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT

javac -d "$build_dir" \
  "$root_dir/app/src/main/java/io/rootlens/mentra/DeviceOperationGate.java" \
  "$root_dir/app/src/main/java/io/rootlens/mentra/ServiceCommandLifecycle.java" \
  "$root_dir/app/src/main/java/io/rootlens/mentra/CaptureCommandPolicy.java" \
  "$root_dir/app/src/test/java/io/rootlens/mentra/DeviceOperationGateTest.java" \
  "$root_dir/app/src/test/java/io/rootlens/mentra/ServiceCommandLifecycleTest.java" \
  "$root_dir/app/src/test/java/io/rootlens/mentra/CaptureCommandPolicyTest.java"
java -cp "$build_dir" io.rootlens.mentra.DeviceOperationGateTest
java -cp "$build_dir" io.rootlens.mentra.ServiceCommandLifecycleTest
java -cp "$build_dir" io.rootlens.mentra.CaptureCommandPolicyTest
