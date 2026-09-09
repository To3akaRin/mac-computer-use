import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
  rmSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = resolve(import.meta.dirname, "../scripts/run.sh");
function fixture(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "launcher-中文 ")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const skill = join(root, "技能 包"),
    bin = join(root, "bin"),
    cwd = join(root, "调用 目录");
  for (const dir of [
    join(skill, "scripts"),
    bin,
    cwd,
    join(skill, ".build/release"),
  ])
    mkdirSync(dir, { recursive: true });
  copyFileSync(source, join(skill, "scripts/run.sh"));
  writeFileSync(join(skill, "scripts/cdp.mjs"), "// fixture");
  const log = join(root, "calls.jsonl");
  const script = (name, body) =>
    writeFileSync(join(bin, name), `#!${process.execPath}\n${body}\n`, {
      mode: 0o755,
    });
  script(
    "uname",
    `console.log(${JSON.stringify(options.platform ?? "Darwin")})`,
  );
  script("sw_vers", `console.log(${JSON.stringify(options.os ?? "14.0")})`);
  script(
    "node",
    `if(process.argv[2] === '--version') { console.log(${JSON.stringify(options.node ?? "v22.4.0")}); process.exit(0); } console.log(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd()})); process.exit(2);`,
  );
  script(
    "swift",
    `import('node:fs').then(fs=>{const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n'); if(args[0]==='--version') console.log(${JSON.stringify(options.swift ?? "Apple Swift version 6.0.1 (swiftlang)")}); else if(args.includes('--show-bin-path')) console.log(${JSON.stringify(join(skill, ".build/release"))}); else { console.log('build chatter'); process.exit(${options.buildExit ?? 0}); } });`,
  );
  writeFileSync(
    join(skill, ".build/release/mac-computer-use"),
    `#!${process.execPath}\nconsole.log(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd()})); process.exit(2);\n`,
    { mode: 0o755 },
  );
  for (const tool of ["dirname", "basename", "readlink", "awk"])
    symlinkSync(`/usr/bin/${tool}`, join(bin, tool));
  if (options.missing) rmSync(join(bin, options.missing));
  const entry = join(root, "入口");
  symlinkSync("技能 包/scripts/run.sh", join(root, "relative-link"));
  symlinkSync("relative-link", entry);
  const run = (...args) =>
    spawnSync("/bin/sh", [entry, ...args], {
      cwd,
      env: { ...process.env, PATH: bin },
      encoding: "utf8",
    });
  return { root, skill, cwd, log, run };
}
test("CDP resolves chained relative symlinks and preserves cwd, arguments, JSON and exit status", (t) => {
  const f = fixture(t, { platform: "Linux", swift: "unavailable" });
  const r = f.run(
    "cdp",
    "input",
    "--text",
    '中文 空格 $() "',
    "--output",
    "relative.png",
  );
  assert.equal(r.status, 2, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    argv: [
      join(f.skill, "scripts/cdp.mjs"),
      "input",
      "--text",
      '中文 空格 $() "',
      "--output",
      "relative.png",
    ],
    cwd: f.cwd,
  });
  assert.equal(r.stderr, "");
});
test("native builds incrementally with absolute package path; build chatter stays on stderr", (t) => {
  const f = fixture(t),
    r = f.run("native", "doctor", "--dry-run");
  assert.equal(r.status, 2, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    argv: ["doctor", "--dry-run"],
    cwd: f.cwd,
  });
  assert.match(r.stderr, /build chatter/);
  const calls = readFileSync(f.log, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls.slice(1), [
    ["build", "--package-path", f.skill, "-c", "release"],
    ["build", "--package-path", f.skill, "-c", "release", "--show-bin-path"],
  ]);
});
for (const [name, options, mode] of [
  ["non-macOS", { platform: "Linux" }, "native"],
  ["old macOS", { os: "13.7" }, "native"],
  ["unknown macOS", { os: "unknown" }, "native"],
  ["old Swift", { swift: "Swift version 5.10" }, "native"],
  ["unknown Swift", { swift: "unavailable" }, "native"],
  ["old Node minor", { node: "v22.3.9" }, "cdp"],
  ["old Node major", { node: "v20.99.0" }, "cdp"],
  ["unknown Node", { node: "unavailable" }, "cdp"],
  ["missing Node", { missing: "node" }, "cdp"],
  ["missing Swift", { missing: "swift" }, "native"],
  ["failed build", { buildExit: 1 }, "native"],
  ["invalid mode", {}, "other"],
])
  test(`launcher rejects ${name} with one JSON failure and diagnostics`, (t) => {
    const r = fixture(t, options).run(mode, "doctor");
    assert.equal(r.status, 1);
    const result = JSON.parse(r.stdout);
    assert.equal(result.status, "failed");
    assert.equal(result.channel, "launcher");
    assert.ok(result.error);
    assert.ok(r.stderr.length);
  });
