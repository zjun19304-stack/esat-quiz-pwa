@echo off
chcp 65001 >nul
echo ============================================
echo   ESAT 题库离线版 — 本地启动
echo ============================================
echo.
echo 正在启动本地服务器，浏览器将打开 http://localhost:8000
echo 若未自动打开，请手动在浏览器访问该地址。
echo.
start "" "http://localhost:8000"

where node >nul 2>nul
if %errorlevel%==0 (
  node "%~dp0serve.js"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python -m http.server 8000
  ) else (
    echo.
    echo [错误] 未检测到 Node.js 或 Python。
    echo 请先安装其中一个：
    echo   Node.js: https://nodejs.org/
    echo   Python:  https://www.python.org/
    echo.
    pause
  )
)
