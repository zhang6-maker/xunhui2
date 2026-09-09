@echo off
title 安装寻慧信箱本地提醒
cd /d "%~dp0"

set "PY=C:\Python314\pythonw.exe"
if not exist "%PY%" (
    echo [提示] 没找到 C:\Python314\pythonw.exe，改用系统 PATH 里的 pythonw
    set "PY=pythonw.exe"
)

schtasks /create /tn "XunHuiMailboxNotify" /tr "\"%PY%\" \"%~dp0mailbox_notify.py\"" /sc hourly /mo 2 /st 09:00 /f

if errorlevel 1 (
    echo.
    echo [失败] 计划任务创建失败。请右键本文件，选择"以管理员身份运行"。
) else (
    echo.
    echo [成功] 已创建计划任务 XunHuiMailboxNotify
    echo.
    echo   每 2 小时检查一次寻慧信箱，有新消息才弹窗。
    echo   纯本地运行，不调用 AI，零积分消耗。
    echo.
    echo 想马上验证一次，在命令行里执行：
    echo   schtasks /run /tn "XunHuiMailboxNotify"
)

echo.
pause
