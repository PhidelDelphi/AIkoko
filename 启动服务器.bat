@echo off
chcp 65001 >nul 2>&1
title AFR - Assignment Feedback and Review
echo.
echo   ╔══════════════════════════════════════╗
echo   ║  AFR 本地服务器                       ║
echo   ║  浏览器会自动打开                      ║
echo   ║  关闭此窗口 = 关闭服务器               ║
echo   ╚══════════════════════════════════════╝
echo.
start "" "http://localhost:8766"
python -m http.server 8766 --bind 127.0.0.1
