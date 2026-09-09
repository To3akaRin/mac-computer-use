#!/bin/sh
# 通用入口：目录解析限于子 shell，保持调用方工作目录与相对输出路径。
set -eu

fail() {
  printf '%s\n' "$2" >&2
  printf '{"status":"failed","target":null,"channel":"launcher","error":{"code":"%s","message":"%s"},"evidence":[]}\n' "$1" "$2"
  exit 1
}

launcher_path=$0
launcher_links=0
while :; do
  launcher_dir=$(CDPATH= cd -P "$(dirname "$launcher_path")" && pwd) || fail PATH_ERROR 'Cannot resolve the skill directory.'
  launcher_path=$launcher_dir/$(basename "$launcher_path")
  [ -L "$launcher_path" ] || break
  launcher_links=$((launcher_links + 1))
  [ "$launcher_links" -le 40 ] || fail PATH_ERROR 'Too many launcher symbolic links.'
  launcher_link=$(readlink "$launcher_path") || fail PATH_ERROR 'Cannot read launcher symbolic link.'
  case "$launcher_link" in
    /*) launcher_path=$launcher_link ;;
    *) launcher_path=$launcher_dir/$launcher_link ;;
  esac
done
skill_dir=$(CDPATH= cd -P "$launcher_dir/.." && pwd) || fail PATH_ERROR 'Cannot resolve the skill root.'

# 严格解析版本，拒绝缺失或不认识的输出，不猜测版本。
version_at_least() {
  printf '%s\n' "$1" | awk -v major="$2" -v minor="$3" '
    /^[0-9]+\.[0-9]+(\.[0-9]+)?$/ {
      split($0, parts, ".");
      if (parts[1] > major || (parts[1] == major && parts[2] >= minor)) valid=1;
    }
    END { exit !valid }
  '
}

mode=${1-}
[ "$#" -gt 0 ] && shift
case "$mode" in
  native)
    [ "$(uname -s)" = Darwin ] || fail PLATFORM_UNSUPPORTED 'Native control requires macOS 14 or newer.'
    os_version=$(sw_vers -productVersion) || fail VERSION_UNKNOWN 'Cannot determine the macOS version.'
    version_at_least "$os_version" 14 0 || fail PLATFORM_UNSUPPORTED 'Native control requires macOS 14 or newer.'
    command -v swift >/dev/null 2>&1 || fail DEPENDENCY_MISSING 'Swift 6 or newer is required.'
    swift_description=$(swift --version) || fail DEPENDENCY_MISSING 'Cannot execute Swift.'
    swift_version=$(printf '%s\n' "$swift_description" | awk '/(^| )Swift version / {for (i=1;i<NF;i++) if ($i=="version") {print $(i+1); exit}}')
    version_at_least "$swift_version" 6 0 || fail VERSION_UNSUPPORTED 'Swift 6 or newer is required.'
    swift build --package-path "$skill_dir" -c release >&2 || fail BUILD_FAILED 'Native incremental build failed.'
    native_bin_dir=$(swift build --package-path "$skill_dir" -c release --show-bin-path) || fail BUILD_FAILED 'Cannot determine the native binary path.'
    [ -x "$native_bin_dir/mac-computer-use" ] || fail BUILD_FAILED 'The native executable was not produced.'
    exec "$native_bin_dir/mac-computer-use" "$@"
    ;;
  cdp)
    command -v node >/dev/null 2>&1 || fail DEPENDENCY_MISSING 'Node.js 22.4 or newer is required.'
    node_version=$(node --version) || fail DEPENDENCY_MISSING 'Cannot execute Node.js.'
    case "$node_version" in v*) node_version=${node_version#v} ;; *) fail VERSION_UNKNOWN 'Cannot determine the Node.js version.' ;; esac
    version_at_least "$node_version" 22 4 || fail VERSION_UNSUPPORTED 'Node.js 22.4 or newer is required.'
    exec node "$skill_dir/scripts/cdp.mjs" "$@"
    ;;
  *) fail USAGE 'Usage: sh scripts/run.sh native|cdp COMMAND [ARGS...]' ;;
esac
