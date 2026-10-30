#!/usr/bin/env bash
# Сборка APK в CI. При ошибке последние строки журнала публикуются как аннотации.
set -uo pipefail
LOG=/tmp/build.log
: > "$LOG"
fail() {
  echo "::error title=Шаг: $1::сборка остановилась"
  tail -n 60 "$LOG" | sed 's/%/%25/g' | while IFS= read -r l; do echo "::error::${l:0:900}"; done
  exit 1
}
run() { local name="$1"; shift; echo "== $name" | tee -a "$LOG"; "$@" >>"$LOG" 2>&1 || fail "$name"; tail -n 5 "$LOG"; }

# Android SDK: берём предустановленный, иначе ставим command-line tools
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then
  SDK="$HOME/android-sdk"
  run "download cmdline-tools" bash -c "mkdir -p $SDK/cmdline-tools && cd /tmp && curl -fsSLo clt.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && unzip -qo clt.zip -d $SDK/cmdline-tools && rm -rf $SDK/cmdline-tools/latest && mv $SDK/cmdline-tools/cmdline-tools $SDK/cmdline-tools/latest"
fi
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
SM=$(ls "$SDK"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | sort | tail -1)
echo "SDK=$SDK sdkmanager=$SM" | tee -a "$LOG"
if [ -n "$SM" ]; then
  run "sdk licenses" bash -c "yes | $SM --licenses"
  run "sdk packages" "$SM" "platforms;android-35" "build-tools;35.0.0" "platform-tools"
fi
echo "sdk.dir=$SDK" > local.properties

run "pip zstandard" python3 -m pip install --quiet zstandard
run "fetch qemu" python3 scripts/fetch_qemu.py ${ABIS:---abi arm64-v8a}
cat "$LOG" | grep -E "^  (пакетов|записано|прошивки|системные|!)" || true

chmod +x gradlew
run "gradle assembleRelease" ./gradlew --no-daemon --stacktrace assembleRelease
mkdir -p dist
cp app/build/outputs/apk/release/*.apk dist/DroidVM.apk
ls -la dist
unzip -l dist/DroidVM.apk | grep -E "lib/|assets/" | head -80
