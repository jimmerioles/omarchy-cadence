#!/bin/bash

set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
OMARCHY_PATH=${OMARCHY_PATH:-/usr/share/omarchy}
REQUIRE_QML=${REQUIRE_QML:-0}

skip_or_fail() {
  local reason="$1"
  if [[ $REQUIRE_QML == 1 ]]; then
    echo "not ok - qml fixtures: $reason" >&2
    exit 1
  fi
  echo "ok - qml fixtures # SKIP $reason"
  exit 0
}

command -v quickshell >/dev/null 2>&1 || skip_or_fail "quickshell is not installed"
command -v jq >/dev/null 2>&1 || skip_or_fail "jq is not installed"
[[ -f $OMARCHY_PATH/shell/Commons/Translations.qml ]] || skip_or_fail "OMARCHY_PATH does not point at an Omarchy checkout: $OMARCHY_PATH"
OMARCHY_PATH=$(cd -- "$OMARCHY_PATH" && pwd -P)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/omarchy-focus-qml.XXXXXX")
QS_PID=""

cleanup() {
  if [[ -n ${QS_PID:-} ]] && kill -0 "$QS_PID" 2>/dev/null; then
    kill "$QS_PID" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$QS_PID" 2>/dev/null || break
      sleep 0.05
    done
    kill -KILL "$QS_PID" 2>/dev/null || true
    wait "$QS_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

mkdir -p "$TMP/bin" "$TMP/imports" "$TMP/runtime"
chmod 700 "$TMP/runtime"
ln -s "$OMARCHY_PATH/shell" "$TMP/imports/qs"

cat >"$TMP/bin/omarchy-shell" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >> "$FOCUS_TEST_COMMAND_LOG"
if [[ ${1:-} == notifications && ${2:-} == isDnd ]]; then
  echo off
fi
exit 0
SH

cat >"$TMP/bin/omarchy-notification-send" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >> "$FOCUS_TEST_NOTIFICATION_LOG"
exit 0
SH

# Util.execArgv runs commands through `bash -lc`; a login shell can reset PATH
# from /etc/profile, which would lose the stubs above. Drop -l just for tests.
cat >"$TMP/bin/bash" <<'SH'
#!/bin/bash
if [[ ${1:-} == -lc ]]; then
  shift
  set -- -c "$@"
fi
exec /bin/bash "$@"
SH
chmod +x "$TMP/bin/"*

fail() {
  local name="$1"
  local detail="${2:-}"
  [[ -n $detail ]] && printf '%s\n' "$detail" >&2
  echo "not ok - qml fixture: $name" >&2
  exit 1
}

show_logs() {
  local name="$1"
  if [[ -f $TMP/$name.log ]]; then
    printf '%s\n' "--- $name log ---" >&2
    sed -n '1,220p' "$TMP/$name.log" >&2
  fi
  if [[ -s $TMP/result.json ]]; then
    printf '%s\n' "--- $name result ---" >&2
    jq . "$TMP/result.json" >&2 || cat "$TMP/result.json" >&2
  fi
  if [[ -s $TMP/commands.log ]]; then
    printf '%s\n' "--- $name commands ---" >&2
    cat "$TMP/commands.log" >&2
  fi
  if [[ -s $TMP/notifications.log ]]; then
    printf '%s\n' "--- $name notifications ---" >&2
    cat "$TMP/notifications.log" >&2
  fi
}

run_fixture() {
  local name="$1"

  rm -rf "$TMP/home"
  mkdir -p "$TMP/home"
  : >"$TMP/commands.log"
  : >"$TMP/notifications.log"
  rm -f "$TMP/result.json"

  (
    unset WAYLAND_DISPLAY
    env \
      HOME="$TMP/home" \
      XDG_CONFIG_HOME="$TMP/home/.config" \
      XDG_CACHE_HOME="$TMP/home/.cache" \
      XDG_STATE_HOME="$TMP/home/.local/state" \
      XDG_RUNTIME_DIR="$TMP/runtime" \
      PATH="$TMP/bin:$PATH" \
      QML2_IMPORT_PATH="$TMP/imports" \
      QML_IMPORT_PATH="$TMP/imports" \
      OMARCHY_PATH="$OMARCHY_PATH" \
      FOCUS_PLUGIN_DIR="$ROOT" \
      FOCUS_TEST_RESULT="$TMP/result.json" \
      FOCUS_TEST_COMMAND_LOG="$TMP/commands.log" \
      FOCUS_TEST_NOTIFICATION_LOG="$TMP/notifications.log" \
      QT_QPA_PLATFORM=offscreen \
      quickshell -p "$ROOT/test/qml/fixtures/$name" --no-color
  ) >"$TMP/$name.log" 2>&1 &
  QS_PID=$!

  for _ in {1..400}; do
    [[ -s $TMP/result.json ]] && break
    kill -0 "$QS_PID" 2>/dev/null || break
    sleep 0.05
  done

  if [[ ! -s $TMP/result.json ]]; then
    show_logs "$name"
    fail "$name" "the fixture exited or timed out before writing a result"
  fi

  if ! jq -e '.ok == true' "$TMP/result.json" >/dev/null 2>&1; then
    show_logs "$name"
    fail "$name" "the fixture reported a failure"
  fi

  if [[ -n ${QS_PID:-} ]] && kill -0 "$QS_PID" 2>/dev/null; then
    kill "$QS_PID" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$QS_PID" 2>/dev/null || break
      sleep 0.05
    done
    kill -KILL "$QS_PID" 2>/dev/null || true
    wait "$QS_PID" 2>/dev/null || true
  fi
  QS_PID=""

  if [[ $name == "service" ]]; then
    grep -q 'notifications isDnd' "$TMP/commands.log" || fail "$name" "the DND probe never ran"
    grep -q 'notifications setDnd true' "$TMP/commands.log" || fail "$name" "Focus never claimed DND"
    grep -q 'notifications setDnd false' "$TMP/commands.log" || fail "$name" "Focus never released DND"
    grep -q 'notifications showHistory' "$TMP/commands.log" || fail "$name" "Focus never replayed notification history"
    grep -q 'Deep Focus complete' "$TMP/notifications.log" || fail "$name" "the work notification never arrived"
    grep -q 'Break complete' "$TMP/notifications.log" || fail "$name" "the break notification never arrived"
  fi

  if [[ $name == "restart" ]]; then
    grep -q 'notifications setDnd false' "$TMP/commands.log" || fail "$name" "destroying a running service did not release DND"
    [[ -f $TMP/home/.local/state/omarchy/focus/state.json ]] || fail "$name" "the recovered state file is missing"
    jq -e '.version == 2' "$TMP/home/.local/state/omarchy/focus/state.json" >/dev/null 2>&1 \
      || fail "$name" "the recovered state file is not version 2"
  fi

  echo "ok - qml fixture: $name"
}

run_fixture service
run_fixture restart
run_fixture widget
