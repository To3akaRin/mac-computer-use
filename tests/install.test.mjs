import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  existsSync,
  readdirSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(import.meta.dirname, "..");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "技能 安装-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "源 技能");
  mkdirSync(source);
  cpSync(join(repo, "scripts"), join(source, "scripts"), { recursive: true });
  writeFileSync(join(source, "SKILL.md"), "示例技能");
  writeFileSync(
    join(source, "scripts/package-files.txt"),
    "SKILL.md\nscripts/install.sh\nscripts/package.sh\nscripts/lib/package-common.sh\nscripts/lib/package_commit.py\nscripts/package-files.txt\n",
  );
  writeFileSync(join(source, ".env"), "DO_NOT_PACKAGE");
  return { root, source, parent: join(root, "安装 目录") };
}
function run(source, name, args) {
  return spawnSync("sh", [join(source, "scripts", name), ...args], {
    encoding: "utf8",
  });
}

test("预演不创建父目录，安装保留中文空格且不复制清单外文件", (t) => {
  const f = fixture(t);
  assert.equal(
    run(f.source, "install.sh", ["--skills-dir", f.parent, "--dry-run"]).status,
    0,
  );
  assert.equal(existsSync(f.parent), false);
  const r = run(f.source, "install.sh", ["--skills-dir", f.parent]);
  assert.equal(r.status, 0, r.stderr);
  const target = join(f.parent, "mac-computer-use");
  assert.equal(readFileSync(join(target, "SKILL.md"), "utf8"), "示例技能");
  assert.equal(existsSync(join(target, ".env")), false);
  assert.deepEqual(readdirSync(f.parent), ["mac-computer-use"]);
});

test("拒绝已存在目录和悬空符号链接，不覆盖内容", (t) => {
  const f = fixture(t);
  mkdirSync(f.parent);
  const target = join(f.parent, "mac-computer-use");
  symlinkSync(join(f.root, "missing"), target);
  assert.notEqual(
    run(f.source, "install.sh", ["--skills-dir", f.parent]).status,
    0,
  );
  rmSync(target);
  mkdirSync(target);
  writeFileSync(join(target, "keep"), "保留");
  assert.notEqual(
    run(f.source, "install.sh", ["--skills-dir", f.parent]).status,
    0,
  );
  assert.equal(readFileSync(join(target, "keep"), "utf8"), "保留");
});

test("从符号链接调用安装器", (t) => {
  const f = fixture(t);
  const alias = join(f.root, "安装器");
  symlinkSync(join(f.source, "scripts/install.sh"), alias);
  const r = spawnSync("sh", [alias, "--skills-dir", f.parent], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
});

test("清单拒绝穿越路径、绝对路径、重复文件及符号链接", (t) => {
  const f = fixture(t);
  for (const manifest of [
    "../outside\n",
    "/etc/passwd\n",
    "SKILL.md\nSKILL.md\n",
    "linked\n",
  ]) {
    if (!existsSync(join(f.source, "linked")))
      symlinkSync("/etc/passwd", join(f.source, "linked"));
    writeFileSync(join(f.source, "scripts/package-files.txt"), manifest);
    assert.notEqual(
      run(f.source, "install.sh", ["--skills-dir", f.parent]).status,
      0,
      manifest,
    );
    assert.equal(existsSync(f.parent), false);
  }
});

test("拒绝源目标目录重叠与正在执行的安装", (t) => {
  const f = fixture(t);
  assert.notEqual(
    run(f.source, "install.sh", ["--skills-dir", join(f.source, "nested")])
      .status,
    0,
  );
  mkdirSync(f.parent);
  mkdirSync(join(f.parent, ".mac-computer-use.install-lock"));
  assert.notEqual(
    run(f.source, "install.sh", ["--skills-dir", f.parent]).status,
    0,
  );
  assert.equal(existsSync(join(f.parent, "mac-computer-use")), false);
});

test("ZIP 与安装清单一致且包含单层顶级目录、SHA256正确、不覆盖", (t) => {
  const f = fixture(t);
  const output = join(f.root, "发布 包.zip");
  const r = run(f.source, "package.sh", ["--output", output]);
  assert.equal(r.status, 0, r.stderr);
  const contents = spawnSync("unzip", ["-Z1", output], { encoding: "utf8" })
    .stdout.trim()
    .split("\n")
    .filter((p) => !p.endsWith("/"))
    .sort();
  const expected = readFileSync(
    join(f.source, "scripts/package-files.txt"),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((p) => `mac-computer-use/${p}`)
    .sort();
  assert.deepEqual(contents, expected);
  const hash = spawnSync("shasum", ["-a", "256", output], {
    encoding: "utf8",
  }).stdout.split(" ")[0];
  assert.ok(
    readFileSync(output.replace(/\.zip$/, ".sha256"), "utf8").startsWith(hash),
  );
  assert.notEqual(run(f.source, "package.sh", ["--output", output]).status, 0);
});

test("ZIP 解压后仍可安装，文件内容与源清单逐项一致", (t) => {
  const f = fixture(t);
  const output = join(f.root, "release.zip");
  assert.equal(run(f.source, "package.sh", ["--output", output]).status, 0);
  const unpacked = join(f.root, "解压");
  mkdirSync(unpacked);
  const unzip = spawnSync("unzip", ["-q", output, "-d", unpacked], {
    encoding: "utf8",
  });
  assert.equal(unzip.status, 0, unzip.stderr);
  const unpackedSource = join(unpacked, "mac-computer-use");
  const installed = run(unpackedSource, "install.sh", [
    "--skills-dir",
    f.parent,
  ]);
  assert.equal(installed.status, 0, installed.stderr);
  for (const path of readFileSync(
    join(f.source, "scripts/package-files.txt"),
    "utf8",
  )
    .trim()
    .split("\n")) {
    assert.deepEqual(
      readFileSync(join(f.parent, "mac-computer-use", path)),
      readFileSync(join(f.source, path)),
    );
  }
});

test("清单拒绝链接父目录、空清单及不存在文件", (t) => {
  const f = fixture(t);
  const outside = join(f.root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "payload"), "外部");
  symlinkSync(outside, join(f.source, "linked-dir"));
  for (const manifest of ["linked-dir/payload\n", "", "missing\n"]) {
    writeFileSync(join(f.source, "scripts/package-files.txt"), manifest);
    assert.notEqual(
      run(f.source, "install.sh", ["--skills-dir", f.parent]).status,
      0,
    );
    assert.equal(existsSync(f.parent), false);
  }
});

test("允许在源目录未列入清单的 artifacts 中打包，拒绝清单输出重叠", (t) => {
  const f = fixture(t);
  const output = join(f.source, "artifacts", "release.zip");
  const r = run(f.source, "package.sh", ["--output", output]);
  assert.equal(r.status, 0, r.stderr);
  const contents = spawnSync("unzip", ["-Z1", output], {
    encoding: "utf8",
  }).stdout;
  assert.equal(contents.includes("artifacts/"), false);
  // 即使清单列出的文件不存在，也必须在创建输出前失败。
  writeFileSync(
    join(f.source, "scripts/package-files.txt"),
    "artifacts/future.zip\n",
  );
  const overlap = run(f.source, "package.sh", [
    "--output",
    join(f.source, "artifacts/future.zip"),
  ]);
  assert.notEqual(overlap.status, 0);
  assert.equal(existsSync(join(f.source, "artifacts/future.zip")), false);
});

test("安装提交时竞争创建目标目录：不嵌套暂存目录，不报告成功", (t) => {
  const f = fixture(t);
  const wrappers = join(f.root, "bin");
  mkdirSync(wrappers);
  const python = spawnSync(
    "python3",
    ["-c", "import sys; print(sys.executable)"],
    { encoding: "utf8" },
  ).stdout.trim();
  const quotedPython = "'" + python.replaceAll("'", "'\\''") + "'";
  writeFileSync(
    join(wrappers, "python3"),
    '#!/bin/sh\nif [ "$2" = directory ]; then mkdir "$4"; fi\nexec ' +
      quotedPython +
      ' "$@"\n',
    { mode: 0o755 },
  );
  const r = spawnSync(
    "sh",
    [join(f.source, "scripts/install.sh"), "--skills-dir", f.parent],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${wrappers}:${process.env.PATH}` },
    },
  );
  assert.notEqual(r.status, 0);
  assert.deepEqual(readdirSync(join(f.parent, "mac-computer-use")), []);
  assert.equal(r.stdout.includes("已安装"), false);
});

test("打包提交时竞争创建目标目录：不把 ZIP 写入目录", (t) => {
  const f = fixture(t);
  const wrappers = join(f.root, "bin");
  mkdirSync(wrappers);
  const output = join(f.root, "raced.zip");
  const python = spawnSync(
    "python3",
    ["-c", "import sys; print(sys.executable)"],
    { encoding: "utf8" },
  ).stdout.trim();
  const quotedPython = "'" + python.replaceAll("'", "'\\''") + "'";
  writeFileSync(
    join(wrappers, "python3"),
    '#!/bin/sh\nif [ "$2" = file ]; then mkdir "$4"; fi\nexec ' +
      quotedPython +
      ' "$@"\n',
    { mode: 0o755 },
  );
  const r = spawnSync(
    "sh",
    [join(f.source, "scripts/package.sh"), "--output", output],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${wrappers}:${process.env.PATH}` },
    },
  );
  assert.notEqual(r.status, 0);
  assert.deepEqual(readdirSync(output), []);
  assert.equal(r.stdout.includes("已生成"), false);
});
