@echo off
title ¡¢º¥ºÏ≤È—∞ª€–≈œ‰
cd /d "%~dp0"

set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python.exe"

"%PY%" "%~dp0mailbox_notify.py" --dry-run

echo.
pause
