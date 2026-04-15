# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Bibliogon Windows launcher.
#
# Build:  poetry run pyinstaller bibliogon-launcher.spec
# Output: dist/bibliogon-launcher.exe (single-file, windowed, icon embedded)

import sys

block_cipher = None


a = Analysis(
    ["bibliogon_launcher/__main__.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Keep the bundle lean: drop anything we definitely do not import.
        "numpy",
        "pandas",
        "matplotlib",
        "scipy",
        "PIL",  # Pillow is only for the icon-generation script, not runtime.
    ],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="bibliogon-launcher",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # Windows-only: embed icon + version metadata. On non-Windows builds
    # (used only for local smoke by Linux devs), these kwargs are ignored.
    icon=["bibliogon.ico"] if sys.platform == "win32" else None,
    version="version_info.txt" if sys.platform == "win32" else None,
)
