#!/bin/sh
set -eu
# 解析入口符号链接，不改变调用者工作目录。
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
install_parent=
install_dry=false
while [ "$#" -gt 0 ]; do
  case $1 in
    --skills-dir) [ "$#" -ge 2 ] && [ -n "$2" ] || package_fail '--skills-dir 需要目录'; install_parent=$2; shift 2 ;;
    --dry-run) install_dry=true; shift ;;
    --help) printf '%s\n' '用法：sh scripts/install.sh --skills-dir 目标技能父目录 [--dry-run]；实际安装需要 macOS 和 Python 3（标准库）'; exit 0 ;;
    *) package_fail "未知参数：$1" ;;
  esac
done
[ -n "$install_parent" ] || package_fail '必须显式指定 --skills-dir'
package_validate
install_parent=$(package_canonical "$install_parent")
package_overlap "$install_parent"
install_target=$install_parent/mac-computer-use
[ ! -e "$install_target" ] && [ ! -L "$install_target" ] || package_fail "目标已存在，拒绝覆盖：$install_target"
if [ "$install_dry" = true ]; then printf '预演：将技能安装到 %s（未写入）\n' "$install_target"; exit 0; fi
command -v python3 >/dev/null || package_fail '安装需要 Python 3（仅标准库），请先安装 Python 3'
python3 "$package_root/scripts/lib/package_commit.py" check-directory
mkdir -p "$install_parent"
install_lock=$install_parent/.mac-computer-use.install-lock
mkdir "$install_lock" 2>/dev/null || package_fail '另一个安装正在运行；确认没有运行中的安装后再清理遗留锁'
install_stage=
trap '[ -z "$install_stage" ] || rm -rf "$install_stage"; rmdir "$install_lock"' EXIT
trap 'exit 1' HUP INT TERM
[ ! -e "$install_target" ] && [ ! -L "$install_target" ] || package_fail '目标已存在，拒绝覆盖'
install_stage=$(mktemp -d "$install_parent/.mac-computer-use.stage.XXXXXX")
package_copy "$install_stage"
[ ! -e "$install_target" ] && [ ! -L "$install_target" ] || package_fail '安装期间目标被创建，拒绝覆盖'
python3 "$package_root/scripts/lib/package_commit.py" directory "$install_stage" "$install_target"
install_stage=
printf '已安装：%s\n' "$install_target"
