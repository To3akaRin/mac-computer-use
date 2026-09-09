# 安装与打包共用清单。只复制已验证的普通文件，不递归复制目录。
package_fail() { printf '%s\n' "$*" >&2; exit 1; }

package_canonical() (
  case $1 in /*) package_path=$1 ;; *) package_path=$PWD/$1 ;; esac
  if [ -d "$package_path" ]; then cd "$package_path" && pwd -P; return; fi
  [ ! -L "$package_path" ] || package_fail "目标包含悬空符号链接：$package_path"
  package_base=$(basename "$package_path")
  package_parent=$(package_canonical "$(dirname "$package_path")") || exit 1
  case $package_base in .) printf '%s\n' "$package_parent" ;; ..) dirname "$package_parent" ;; *) printf '%s/%s\n' "${package_parent%/}" "$package_base" ;; esac
)

package_validate() {
  package_manifest=$package_root/scripts/package-files.txt
  [ -f "$package_manifest" ] && [ ! -L "$package_manifest" ] || package_fail '缺少普通文件清单'
  [ -s "$package_manifest" ] || package_fail '文件清单为空'
  awk 'seen[$0]++ {exit 1}' "$package_manifest" || package_fail '清单包含重复路径'
  while IFS= read -r package_file || [ -n "$package_file" ]; do
    case $package_file in ''|/*|*/|*//*|.|..|./*|../*|*/./*|*/../*|*/.|*/..|.git/*|.build/*|.env|*/.env|.env.local|*/.env.local) package_fail "非法清单路径：$package_file" ;; esac
    case $package_file in *[!a-zA-Z0-9_./-]*) package_fail "清单路径仅支持项目内的标准文件名：$package_file" ;; esac
    package_part=$package_file
    while :; do
      [ ! -L "$package_root/$package_part" ] || package_fail "清单不允许符号链接：$package_file"
      case $package_part in */*) package_part=${package_part%/*} ;; *) break ;; esac
    done
    [ -f "$package_root/$package_file" ] || package_fail "清单文件不存在：$package_file"
  done < "$package_manifest"
}

package_overlap() {
  case $1/ in "$package_root/"*) package_fail '目标不能位于技能源目录内' ;; esac
  case $package_root/ in "$1/"*) package_fail '技能源目录不能位于目标内' ;; esac
}

package_copy() {
  while IFS= read -r package_file || [ -n "$package_file" ]; do
    mkdir -p "$1/$(dirname "$package_file")"
    cp -p "$package_root/$package_file" "$1/$package_file"
  done < "$package_manifest"
}
