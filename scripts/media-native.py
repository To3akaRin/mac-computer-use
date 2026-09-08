#!/usr/bin/env python3
"""录制专用原生演示窗口的真实截图，供 README 动图合成使用。"""
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'artifacts/media-native'
BINARY = ROOT / '.build/release/mac-computer-use'
FIXTURE = ROOT / '.build/release/native-fixture'
TITLE = 'mac-computer-use · Native Demo'
OUTPUT.mkdir(parents=True, exist_ok=True)
EVENTS = []
FRAMES = []
START = time.monotonic()


def call(*args, event=True, expected=(0,)):
    started = time.monotonic()
    process = subprocess.run([str(BINARY), *map(str, args)], capture_output=True,
                             text=True, timeout=35)
    result = json.loads(process.stdout)
    assert process.returncode in expected, result
    if expected == (2,):
        assert result['status'] == 'unknown', result
    if event:
        public_result = {key: value for key, value in result.items()
                         if key not in ('target', 'snapshot', 'evidence')}
        EVENTS.append({
            'at_seconds': round(started - START, 3),
            'duration_ms': round((time.monotonic() - started) * 1000),
            'command': args[0], 'exit_code': process.returncode,
            'result': public_result,
        })
    return result


def write_manifest():
    (OUTPUT / 'recording.json').write_text(json.dumps({
        'name': 'mac-computer-use native demonstration',
        'source': 'Actual ScreenCaptureKit images from the project CLI',
        'privacy': 'Only the disposable synthetic fixture window was captured',
        'frames': FRAMES, 'events': EVENTS,
    }, ensure_ascii=False, indent=2) + '\n')


with tempfile.TemporaryDirectory(prefix='mac-computer-use-media-') as temporary:
    contents = Path(temporary) / 'MCUDemo.app/Contents'
    (contents / 'MacOS').mkdir(parents=True)
    shutil.copy(FIXTURE, contents / 'MacOS/native-fixture')
    (contents / 'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleIdentifier': 'dev.mac-computer-use.fixture.media',
        'CFBundleName': 'MCUDemo', 'CFBundleExecutable': 'native-fixture',
        'CFBundlePackageType': 'APPL',
    }))
    subprocess.run(['open', '-n', str(contents.parent), '--args', TITLE], check=True)
    time.sleep(1)
    pid = None
    try:
        deadline = time.monotonic() + 10
        candidates = []
        while not candidates and time.monotonic() < deadline:
            candidates = [window for window in call('windows', event=False)['data']
                          if window['title'] == TITLE]
            if not candidates:
                time.sleep(0.2)
        assert len(candidates) == 1, '演示窗口必须唯一'
        window = candidates[0]['id']
        pid = candidates[0]['pid']
        snapshot = OUTPUT / 'ax.json'
        common = ('--window', window, '--snapshot', snapshot)

        def observe():
            return call('ax', '--window', window, '--snapshot-out', snapshot)['data']

        def value(identifier):
            return next(item['value'] for item in observe()
                        if item.get('identifier') == identifier)

        def frame(name, caption):
            time.sleep(0.2)
            call('shot', '--window', window, '--output', OUTPUT / name,
                 '--snapshot-out', OUTPUT / (name + '.json'))
            FRAMES.append({'file': name, 'caption': caption,
                           'at_seconds': round(time.monotonic() - START, 3)})
            write_manifest()

        observe()
        call('ax-set', *common, '--identifier', 'fixture-input', '--text', '等待 Agent')
        assert value('fixture-input') == '等待 Agent'
        frame('01-ready.png', 'Observe a real native window')

        call('ax-set', *common, '--identifier', 'fixture-input', '--text', '让 Mac 开始执行', '--dry-run')
        assert value('fixture-input') == '等待 Agent'
        frame('02-dry-run.png', 'Preview without side effects')

        call('ax-set', *common, '--identifier', 'fixture-input', '--text', '让 Mac 开始执行')
        assert value('fixture-input') == '让 Mac 开始执行'
        frame('03-ax-write.png', 'Write Chinese text through Accessibility')

        call('click', *common, '--x', 70, '--y', 170, '--unit', 'points', expected=(2,))
        assert value('fixture-status') == '确认次数: 1'
        frame('04-click.png', 'Click and verify the counter')

        call('click', *common, '--x', 100, '--y', 110, '--unit', 'points', expected=(2,))
        call('key', *common, '--key', 'a', '--modifiers', 'command', expected=(2,))
        call('type', *common, '--text', '任务已验证', expected=(2,))
        assert value('fixture-input') == '任务已验证'
        frame('05-keyboard.png', 'Type and read back the exact result')

        call('click', *common, '--x', 70, '--y', 170, '--unit', 'points', expected=(2,))
        assert value('fixture-status') == '确认次数: 2'
        frame('06-verified.png', 'Verified state, saved evidence')
        print(json.dumps({'status': 'success', 'frames': len(FRAMES),
                          'output': 'artifacts/media-native'}, ensure_ascii=False))
    finally:
        write_manifest()
        if pid:
            os.kill(pid, signal.SIGTERM)
