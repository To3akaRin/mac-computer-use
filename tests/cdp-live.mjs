// 可选真实浏览器验收：仅启动临时用户目录中的独立 headless Chromium。
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { Client, targets, execute, runBatch } from "../scripts/lib/cdp.mjs";
const directory = await mkdtemp(join(tmpdir(), "mac-computer-use-cdp-"));
const chrome = spawn(
  process.env.CHROME_BINARY ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${directory}`,
    "--no-first-run",
    "--no-default-browser-check",
    pathToFileURL(resolve("tests/fixtures/cdp.html")).href,
  ],
  { stdio: "ignore" },
);
let client;
try {
  let port;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      port = (
        await readFile(join(directory, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(port, "Chromium debugging port readiness");
  let target;
  while (Date.now() < deadline) {
    target = (await targets(`http://127.0.0.1:${port}`)).find((t) =>
      t.url.includes("cdp.html"),
    );
    if (target) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(target, "fixture target");
  client = await Client.connect(target.webSocketDebuggerUrl);
  assert.equal(
    (
      await execute(client, {
        command: "wait",
        expression: "!!document.querySelector('#name')",
      })
    ).status,
    "success",
  );
  assert.equal(
    (
      await execute(client, {
        command: "input",
        selector: "#name",
        text: "中文验收",
      })
    ).status,
    "success",
  );
  assert.equal(
    (
      await execute(client, {
        command: "input",
        selector: "#editable",
        text: "可编辑中文",
      })
    ).status,
    "success",
  );
  assert.equal(
    (
      await execute(client, {
        command: "click",
        selector: "#save",
        assert: "document.querySelector('#result').textContent === '中文验收'",
      })
    ).status,
    "success",
  );
  assert.equal(
    (
      await execute(client, {
        command: "key",
        selector: "#name",
        key: "ArrowLeft",
        assert:
          "document.querySelector('#name').selectionStart === '中文验收'.length - 1",
      })
    ).status,
    "success",
  );
  await assert.rejects(
    execute(client, {
      command: "wait",
      expression: "document.querySelector('#name').value='不应修改',false",
      timeout: 100,
    }),
  );
  assert.equal(
    (await execute(client, { command: "find", selector: "#name" })).data[0]
      .value,
    "中文验收",
  );
  assert.equal(
    (
      await execute(client, {
        command: "shot",
        output: join(directory, "fixture.png"),
      })
    ).status,
    "success",
  );
  assert.equal(
    (await execute(client, { command: "snapshot" })).data.title,
    "mac-computer-use CDP fixture",
  );
  assert.equal(
    (
      await execute(client, {
        command: "input",
        selector: "#name",
        text: "不应发生",
        dryRun: true,
      })
    ).status,
    "success",
  );
  assert.equal(
    (await execute(client, { command: "find", selector: "#name" })).data[0]
      .value,
    "中文验收",
  );
  const batch = await runBatch(client, [
    { command: "click", selector: "#save" },
    { command: "input", selector: "#name", text: "不可重放" },
  ]);
  assert.equal(batch.status, "unknown");
  assert.equal(batch.steps.length, 1);
  assert.equal(
    (await execute(client, { command: "find", selector: "#name" })).data[0]
      .value,
    "中文验收",
  );
  console.log(
    JSON.stringify({
      status: "success",
      checks: [
        "中文输入读回",
        "点击断言",
        "按键断言",
        "PNG截图",
        "页面快照",
        "dry-run无副作用",
        "batch未知停止",
      ],
    }),
  );
} finally {
  client?.close();
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise((r) => chrome.once("exit", r)),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
  await rm(directory, { recursive: true, force: true });
}
