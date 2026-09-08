// 原创演示资产录制：临时独立 Chrome，不读取现有浏览器资料。
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client, targets, execute } from "./lib/cdp.mjs";
const profile = await mkdtemp(join(tmpdir(), "mac-computer-use-media-"));
const output = resolve("artifacts/media-cdp");
await mkdir(output, { recursive: true });
const child = spawn(
  process.env.CHROME_BINARY ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=1100,620",
    pathToFileURL(resolve("assets/demo/cdp-demo.html")).href,
  ],
  { stdio: "ignore" },
);
let client,
  index = 0;
const evidence = [];
async function capture(count) {
  for (let n = 0; n < count; n++) {
    const file = join(output, `frame-${String(index++).padStart(3, "0")}.png`);
    await rm(file, { force: true });
    await execute(client, { command: "shot", output: file });
  }
}
async function action(step) {
  const result = await execute(client, step);
  evidence.push({ command: step.command, status: result.status });
  if (result.status !== "success") throw Error(JSON.stringify(result));
  return result;
}
try {
  let port;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!port) throw Error("Chrome readiness timeout");
  let target;
  while (Date.now() < deadline) {
    target = (await targets(`http://127.0.0.1:${port}`)).find((t) =>
      t.url.includes("cdp-demo.html"),
    );
    if (target) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!target) throw Error("Demo target missing");
  client = await Client.connect(target.webSocketDebuggerUrl);
  await client.call("Emulation.setDeviceMetricsOverride", {
    width: 1100,
    height: 620,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await action({
    command: "wait",
    expression: "document.readyState === 'complete'",
  });
  await capture(5);
  await action({ command: "input", selector: "#title", text: "周五" });
  await capture(3);
  await action({ command: "input", selector: "#title", text: "周五，一起" });
  await capture(3);
  await action({
    command: "input",
    selector: "#title",
    text: "周五，一起探索 Mac 自动化",
  });
  await capture(6);
  await action({
    command: "click",
    selector: "#run",
    assert:
      "document.querySelector('#result').textContent === '周五，一起探索 Mac 自动化'",
  });
  await capture(6);
  await action({
    command: "wait",
    expression:
      "document.querySelector('#result').textContent === document.querySelector('#title').value",
  });
  // 只有实际工具断言通过后才将演示页面标记为已验证。
  await action({ command: "eval", expression: "window.markVerified()" });
  await capture(12);
  await writeFile(
    join(output, "recording.json"),
    JSON.stringify(
      { frames: index, fps: 5, viewport: [1100, 620], evidence },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: "success", frames: index, output }));
} finally {
  client?.close();
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((r) => child.once("exit", r)),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true });
}
