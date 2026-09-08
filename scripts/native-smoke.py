#!/usr/bin/env python3
"""在专用原生测试窗口中验收；需要辅助功能和屏幕录制权限。"""
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[1]
binary = root / '.build/release/mac-computer-use'
fixture = root / '.build/release/native-fixture'

def call(*args, expected=(0,)):
    process = subprocess.run([str(binary), *map(str, args)], capture_output=True, text=True, timeout=35)
    data = json.loads(process.stdout)
    assert process.returncode in expected, data
    if expected == (2,):
        assert data["status"] == "unknown", data
    return data

with tempfile.TemporaryDirectory(prefix='mac-computer-use-smoke-') as temp:
    directory = Path(temp)
    app = directory / 'MCUFixture.app'
    contents = app / 'Contents'
    (contents / 'MacOS').mkdir(parents=True)
    shutil.copy(fixture, contents / 'MacOS/native-fixture')
    (contents / 'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleIdentifier': 'dev.mac-computer-use.fixture.smoke',
        'CFBundleName': 'MCUFixture', 'CFBundleExecutable': 'native-fixture',
        'CFBundlePackageType': 'APPL',
    }))
    subprocess.run(['open', '-n', str(app)], check=True)
    time.sleep(1)
    pid = None
    origin_pid = None
    try:
        candidates = [w for w in call('windows')['data'] if w['title'] == 'mac-computer-use Fixture']
        assert len(candidates) == 1, '请先关闭其他 fixture 窗口再测试'
        window = candidates[0]['id']
        pid = candidates[0]['pid']
        snapshot = directory / 'ax.json'
        def observe():
            return call('ax', '--window', window, '--snapshot-out', snapshot)['data']
        def value(identifier):
            return next(e['value'] for e in observe() if e.get('identifier') == identifier)
        observe()
        common = ('--window', window, '--snapshot', snapshot)
        original = value('fixture-input')
        call('ax-set', *common, '--identifier', 'fixture-input', '--text', '预演', '--dry-run')
        assert value('fixture-input') == original
        call('ax-set', *common, '--identifier', 'fixture-input', '--text', '中文读回')
        assert value('fixture-input') == '中文读回'
        call('click', *common, '--x', 70, '--y', 170, '--unit', 'points', expected=(2,))
        assert value('fixture-status') == '确认次数: 1'
        call('click', *common, '--x', 100, '--y', 110, '--unit', 'points', expected=(2,))
        call('key', *common, '--key', 'a', '--modifiers', 'command', expected=(2,))
        call('type', *common, '--text', '中文键盘验证', expected=(2,))
        actual = value('fixture-input')
        assert actual == '中文键盘验证', actual
        origin_app = directory / 'MCUOrigin.app'
        shutil.copytree(app, origin_app)
        origin_info = origin_app / 'Contents/Info.plist'
        info = plistlib.loads(origin_info.read_bytes())
        info['CFBundleIdentifier'] = 'dev.mac-computer-use.fixture.origin'
        info['CFBundleName'] = 'MCUOrigin'
        origin_info.write_bytes(plistlib.dumps(info))
        subprocess.run(['open', '-n', str(origin_app), '--args', 'mac-computer-use Origin'], check=True)
        time.sleep(1)
        origin_pid = next(w['pid'] for w in call('windows')['data'] if w['title'] == 'mac-computer-use Origin')
        assert call('doctor')['data']['frontmostPID'] == origin_pid
        restored = call('click', *common, '--x', 70, '--y', 170, '--unit', 'points', expected=(2,))
        assert restored['focus']['changed'] and restored['focus']['restored'], restored
        assert call('doctor')['data']['frontmostPID'] == origin_pid
        assert value('fixture-status') == '确认次数: 2'
        call('shot', '--window' , window, '--output', directory/'fixture.png', '--snapshot-out', directory/'shot.json')
        assert (directory/'fixture.png').stat().st_size > 100
        print(json.dumps({'status': 'success', 'checks': ['dry-run unchanged', 'AX Chinese readback', 'click counter', 'keyboard Chinese readback', 'window screenshot', 'controlled activation and restoration']}, ensure_ascii=False))
    finally:
        if origin_pid:
            os.kill(origin_pid, signal.SIGTERM)
        if pid:
            os.kill(pid, signal.SIGTERM)
