#!/bin/sh
set -eu
package_entry=$0
package_links=0
while [ -L "$package_entry" ]; do
  package_links=$((package_links + 1))
  [ "$package_links" -le 40 ] || { printf '%s\n' '入口符号链接过深' >&2; exit 1; }
  package_link=$(readlink "$package_entry")
  case $package_link in /*) package_entry=$package_link ;; *) package_entry=$(dirname "$package_entry")/$package_link ;; esac
done
package_root=$(CDPATH= cd -- "$(dirname "$package_entry")/.." && pwd -P)
. "$package_root/scripts/lib/package-common.sh"
package_output=
while [ "$#" -gt 0 ]; do
  case $1 in
    --output) [ "$#" -ge 2 ] && [ -n "$2" ] || package_fail '--output 需要 ZIP 路径'; package_output=$2; shift 2 ;;
    --help) printf '%s\n' '用法：sh scripts/package.sh --output /目录/mac-computer-use-版本.zip；需要 Python 3（标准库）、zip、shasum'; exit 0 ;;
    *) package_fail "未知参数：$1" ;;
  esac
done
case $package_output in *.zip) ;; *) package_fail '必须指定以 .zip 结尾的 --output' ;; esac
package_validate
package_output=$(package_canonical "$package_output")
package_sha=${package_output%.zip}.sha256
# 允许在源目录内的未分发位置生成产物；逐文件清单不会递归收录产物。
while IFS= read -r package_file || [ -n "$package_file" ]; do
  for package_artifact in "$package_output" "$package_sha"; do
    [ "$package_artifact" != "$package_root/$package_file" ] || package_fail "产物与分发清单重叠：$package_file"
  done
done < "$package_manifest"
for package_artifact in "$package_output" "$package_sha"; do
  [ ! -e "$package_artifact" ] && [ ! -L "$package_artifact" ] || package_fail "产物已存在，拒绝覆盖：$package_artifact"
done
command -v python3 >/dev/null || package_fail '打包需要 Python 3（仅标准库），请先安装 Python 3'
command -v zip >/dev/null || package_fail '缺少 zip'
command -v shasum >/dev/null || package_fail '缺少 shasum'
mkdir -p "$(dirname "$package_output")"
package_lock=$package_output.lock
mkdir "$package_lock" 2>/dev/null || package_fail '相同输出的打包正在运行'
package_stage=
trap '[ -z "$package_stage" ] || rm -rf "$package_stage"; rmdir "$package_lock"' EXIT
trap 'exit 1' HUP INT TERM
package_stage=$(mktemp -d "$(dirname "$package_output")/.mac-computer-use.package.XXXXXX")
mkdir "$package_stage/mac-computer-use"
package_copy "$package_stage/mac-computer-use"
(CDPATH= cd "$package_stage" && COPYFILE_DISABLE=1 zip -q -X -r archive.zip mac-computer-use)
package_digest=$(shasum -a 256 "$package_stage/archive.zip")
printf '%s  %s\n' "${package_digest%% *}" "$(basename "$package_output")" > "$package_stage/archive.sha256"
# 硬链接创建最终文件，遇到竞争创建者也不会覆盖。
python3 "$package_root/scripts/lib/package_commit.py" file "$package_stage/archive.zip" "$package_output"
python3 "$package_root/scripts/lib/package_commit.py" file "$package_stage/archive.sha256" "$package_sha"
printf '已生成：%s\nSHA-256：%s\n' "$package_output" "$package_sha"
