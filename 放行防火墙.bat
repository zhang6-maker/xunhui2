@echo off
echo ============================================
echo  寻慧手机遥控 - 防火墙放行 (8080 / 8083)
echo ============================================
echo.
echo [1/2] 放行 TCP 8080 (遥控器网页) ...
netsh advfirewall firewall add rule name="XunHui-Remote-8080" dir=in action=allow protocol=TCP localport=8080
echo [2/2] 放行 TCP 8083 (WebSocket 实时通信) ...
netsh advfirewall firewall add rule name="XunHui-Remote-8083" dir=in action=allow protocol=TCP localport=8083
echo.
echo Done. 若提示 "Access is denied / 拒绝访问"，
echo 请关闭本窗口，右键本文件 -> 以管理员身份运行。
echo.
pause
