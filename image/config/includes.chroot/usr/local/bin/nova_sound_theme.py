"""Export a user-specific, non-destructive freedesktop sound theme from NOVA events.

Creates a new theme per export under ~/.local/share/sounds; never changes
KDE settings, system files, existing theme directories or user's audio files.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from nova_sound_core import load_settings, resolve_sound

# Freedesktop Sound Naming Specification. Only these standard event names are
# exported; native KDE event bindings are still controlled by System Settings.
STANDARD_EVENTS = {
    'power.connected': 'power-plug',
    'power.disconnected': 'power-unplug',
    'nova.success': 'dialog-information',
    'nova.error': 'dialog-error',
    'nova.warning': 'dialog-warning',
    'nova.phone': 'device-added',
    'nova.import': 'complete',
    'nova.game': 'service-login',
}


def export_theme(home=None, bundled=None):
    """Return fresh exported theme Path. Raises on missing FFmpeg or bad source.

    Set bundled only for offline test fixtures. Input is never modified and
    no existing theme is overwritten, even on an unsuccessful export.
    """
    home = Path(home) if home is not None else Path.home()
    config = load_settings(home)
    if shutil.which('ffmpeg') is None:
        raise RuntimeError('Не найден FFmpeg: установите пакет ffmpeg.')
    base = home / '.local/share/sounds'
    base.mkdir(parents=True, exist_ok=True)
    folder = Path(tempfile.mkdtemp(prefix='NOVA-Personal-', dir=base))
    os.chmod(folder, 0o700)
    stereo = folder / 'stereo'
    stereo.mkdir(mode=0o700)
    count = 0
    try:
        for nova_event, standard_name in STANDARD_EVENTS.items():
            selection = config['events'].get(nova_event)
            if not config['enabled'] or config['volume'] == 0 or selection == 'off':
                (stereo / (standard_name + '.disabled')).touch(mode=0o600)
                count += 1
                continue
            source = resolve_sound(nova_event, config, home, bundled=bundled)
            if source is None:
                continue
            target = stereo / (standard_name + '.oga')
            # Use Ogg/Vorbis for standards compliance. No shell interpolation,
            # no clobber, 12-sec cap, time limit to avoid hanging GUI sessions.
            cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-loglevel', 'error',
                   '-n', '-i', str(source), '-t', '12', '-vn', '-ac', '2',
                   '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '4', str(target)]
            try:
                result = subprocess.run(cmd, stdin=subprocess.DEVNULL,
                                        capture_output=True, timeout=20, check=False)
            except subprocess.TimeoutExpired as exc:
                raise RuntimeError(f'Истекло время обработки: {source.name}') from exc
            if result.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
                raise RuntimeError(f'Не удалось преобразовать звук: {source.name}')
            os.chmod(target, 0o600)
            count += 1
        if count == 0:
            raise RuntimeError('Не удалось найти аудиофайлы. Проверьте звуковой каталог.')
        content = (f'[Sound Theme]\nName=NOVA Personal ({folder.name})\n'
                   'Comment=User generated, local-only NOVA sound theme\n'
                   'Inherits=freedesktop\nDirectories=stereo\n\n'
                   '[stereo]\nOutputProfile=stereo\n')
        (folder / 'index.theme').write_text(content, encoding='utf-8')
        os.chmod(folder / 'index.theme', 0o600)
        return folder
    except Exception:
        # This is ONLY the unique new temporary folder owned by this export.
        shutil.rmtree(folder)
        raise
