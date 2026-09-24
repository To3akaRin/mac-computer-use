// 将原创 HTML 场景渲染为演示 GIF；使用独立浏览器目录，不访问用户会话。
// node scripts/media-readme-hero.mjs [--ffmpeg /path/to/ffmpeg] [--chrome /path/to/chrome]
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, targets } from "./lib/cdp.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "artifacts/media-readme-hero");
const args = process.argv.slice(2);
const options = { ffmpeg: "ffmpeg", chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" };
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.replace(/^--/, "");
  if (!Object.hasOwn(options, key) || !args[index + 1])
    throw new Error("用法：node scripts/media-readme-hero.mjs [--ffmpeg PATH] [--chrome PATH]");
  options[key] = args[index + 1];
}
function run(binary, arguments_) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, arguments_, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", chunk => { error += chunk; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolveRun() : reject(new Error(`${binary} (${code}): ${error}`)));
  });
}
// 编码器不可用时，在耗时渲染之前给出明确错误。
await run(options.ffmpeg, ["-version"]);
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "mac-computer-use-hero-"));
const page = pathToFileURL(join(root, "assets/demo/readme-hero.html")).href;
const browser = spawn(options.chrome, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-background-networking", page,
], { stdio: "ignore" });
let browserError, client;
browser.on("error", error => { browserError = error; });
try {
  const deadline = Date.now() + 15000;
  let port, target;
  while (Date.now() < deadline) {
    if (browserError) throw browserError;
    if (browser.exitCode !== null) throw new Error("浏览器启动失败");
    try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch {}
    if (port) {
      target = (await targets(`http://127.0.0.1:${port}`)).find(item => item.url === page);
      if (target) break;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  if (!target) throw new Error("演示浏览器启动超时");
  client = await Client.connect(target.webSocketDebuggerUrl);
  await client.call("Emulation.setDeviceMetricsOverride", { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  for (let frame = 0; frame < 80; frame++) {
    const evaluation = await client.call("Runtime.evaluate", { expression: `window.render(${frame})`, returnByValue: true });
    if (evaluation.exceptionDetails) throw new Error("无法渲染 Hero 帧");
    const { data } = await client.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(output, `frame-${String(frame).padStart(3, "0")}.png`), Buffer.from(data, "base64"));
  }
} finally {
  client?.close();
  if (browser.exitCode === null) {
    browser.kill("SIGTERM");
    await Promise.race([new Promise(resolveExit => browser.once("exit", resolveExit)), new Promise(resolveWait => setTimeout(resolveWait, 2500))]);
    if (browser.exitCode === null) browser.kill("SIGKILL");
  }
  await rm(profile, { recursive: true, force: true });
}
const temporaryGif = join(output, "readme-hero.gif");
await run(options.ffmpeg, [
  "-v", "error", "-y", "-framerate", "10", "-i", join(output, "frame-%03d.png"),
  "-filter_complex", "split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
  "-frames:v", "80", "-loop", "0", temporaryGif,
]);
// 实际解码一次，避免交付损坏的动画。
await run(options.ffmpeg, ["-v", "error", "-i", temporaryGif, "-f", "null", "-"]);
const bytes = (await stat(temporaryGif)).size;
if (bytes > 3_000_000) throw new Error(`Hero GIF 超出 3 MB 目标：${bytes} bytes`);
await copyFile(join(output, "frame-065.png"), join(root, "assets/readme-hero-poster.png"));
await rename(temporaryGif, join(root, "assets/readme-hero.gif"));
const report = { status: "success", width: 960, height: 540, frames: 80, fps: 10, seconds: 8, bytes, source: "原创 HTML/SVG 概念流程，非真实操作录像" };
await writeFile(join(output, "render.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
