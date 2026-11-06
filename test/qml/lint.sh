#!/bin/bash

set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
OMARCHY_PATH=${OMARCHY_PATH:-/usr/share/omarchy}
REQUIRE_QMLLINT=${REQUIRE_QMLLINT:-0}

skip_or_fail() {
  local reason="$1"
  if [[ $REQUIRE_QMLLINT == 1 ]]; then
    echo "not ok - qml lint: $reason" >&2
    exit 1
  fi
  echo "ok - qml lint # SKIP $reason"
  exit 0
}

QMLLINT=$(command -v qmllint 2>/dev/null || true)
if [[ -z $QMLLINT && -x /usr/lib/qt6/bin/qmllint ]]; then
  QMLLINT=/usr/lib/qt6/bin/qmllint
fi
[[ -n $QMLLINT ]] || skip_or_fail "qmllint is not installed"
[[ -f $OMARCHY_PATH/shell/Commons/Style.qml ]] || skip_or_fail "OMARCHY_PATH does not point at an Omarchy checkout: $OMARCHY_PATH"
OMARCHY_PATH=$(cd -- "$OMARCHY_PATH" && pwd -P)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/omarchy-cadence-lint.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# qmllint resolves `import qs.Commons` as the module directory qs/Commons, not
# as the shell root Quickshell uses at runtime. Give it that shape in temp.
ln -s "$OMARCHY_PATH/shell" "$TMP/qs"

set +e
"$QMLLINT" -W -1 -I "$TMP" \
  "$ROOT/BarWidget.qml" \
  "$ROOT/Panel.qml" \
  "$ROOT/Service.qml" >"$TMP/lint.log" 2>&1
status=$?
set -e

if grep -q '^Error' "$TMP/lint.log"; then
  cat "$TMP/lint.log" >&2
  echo "not ok - qml lint" >&2
  exit 1
fi

if (( status != 0 )); then
  cat "$TMP/lint.log" >&2
  echo "not ok - qml lint (qmllint exited $status)" >&2
  exit 1
fi

warnings=$(grep -c '^Warning' "$TMP/lint.log" || true)
errors=$(grep -c '^Error' "$TMP/lint.log" || true)
echo "ok - qml lint (${warnings} warnings, ${errors} errors)"
