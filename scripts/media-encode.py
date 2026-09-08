#!/usr/bin/env python3
"""使用 FFmpeg 将已录制的演示帧编码为 GIF，不修改原始应用截图。"""
from pathlib import Path
import shutil
import subprocess
import imageio_ffmpeg

root = Path(__file__).resolve().parents[1]
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
for source, output in [('media-native-stage', 'native-demo.gif'), ('media-cdp', 'cdp-demo.gif')]:
    frames = root / 'artifacts' / source
    if not list(frames.glob('frame-*.png')):
        raise RuntimeError('请先录制: ' + source)
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '5',
                    '-i', str(frames / 'frame-%03d.png'), '-filter_complex',
                    '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
                    '-loop', '0', str(root / 'assets' / output)], check=True)
    print(output, (root / 'assets' / output).stat().st_size)
shutil.copy2(root / 'artifacts/media-cdp/frame-034.png', root / 'assets/cdp-demo-poster.png')

# 3D 案例从用户提供的模型查看器录屏，原始浏览器帧为 JPEG。
model_frames = root / 'artifacts/model-rotation'
if list(model_frames.glob('frame-*.jpg')):
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '8',
                    '-i', str(model_frames / 'frame-%03d.jpg'), '-filter_complex',
                    '[0:v]scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
                    '-loop', '0', str(root / 'assets/showcase-3d.gif')], check=True)
    shutil.copy2(model_frames / 'frame-008.jpg', root / 'assets/showcase-3d-poster.jpg')
