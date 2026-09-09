@echo off
title 卸载寻慧信箱本地提醒

schtasks /delete /tn "XunHuiMailboxNotify" /f

if errorlevel 1 (
    echo.
    echo [提示] 没有找到该计划任务，可能已经卸载过。
) else (
    echo.
    echo [完成] 已删除计划任务 XunHuiMailboxNotify，本地提醒已停止。
)

echo.
pause
