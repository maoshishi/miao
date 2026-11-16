@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo 正在处理图片（卡面 / 背景 / 猫窝木框）...
echo.
python tools\prepare-cards.py
if errorlevel 1 (
  echo.
  echo 运行失败：请先安装 Python 3，并执行  pip install pillow numpy
)
echo.
pause
