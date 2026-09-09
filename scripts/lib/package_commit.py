#!/usr/bin/env python3
"""以精确目标路径提交暂存文件，拒绝覆盖和目录嵌套。仅使用 Python 标准库。"""
import ctypes
import os
import sys


def exclusive_rename():
    if sys.platform != "darwin":
        raise RuntimeError("目录安装需要 macOS renamex_np 原子排他重命名；当前系统不支持")
    library = ctypes.CDLL(None, use_errno=True)
    try:
        rename = library.renamex_np
    except AttributeError as error:
        raise RuntimeError("当前系统缺少 renamex_np，无法保证无覆盖安装") from error
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    return rename


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "check-directory" and len(sys.argv) == 2:
        exclusive_rename()
        return
    if mode not in ("directory", "file") or len(sys.argv) != 4:
        raise RuntimeError("用法：package_commit.py directory|file SOURCE DESTINATION")
    source, destination = sys.argv[2:]
    if mode == "file":
        # os.link 的目标是文件名，不会把源文件放入已有目标目录。
        os.link(source, destination)
        return
    rename = exclusive_rename()
    # Apple macOS SDK sys/stdio.h 定义 RENAME_EXCL = 0x00000004。
    if rename(os.fsencode(source), os.fsencode(destination), 0x00000004) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), destination)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print("原子提交失败：" + str(error), file=sys.stderr)
        sys.exit(1)
