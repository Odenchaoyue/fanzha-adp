@echo off
setlocal
cd /d "%~dp0"
title Fanzha Voice Lab

echo ============================================
echo   Fanzha Voice Lab - local Kokoro audition
echo ============================================
echo.

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Creating Python venv and installing sherpa-onnx...
  python -m venv .venv || goto :err
  ".venv\Scripts\python.exe" -m pip install -U pip
  ".venv\Scripts\python.exe" -m pip install sherpa-onnx==1.13.7 || goto :err
) else (
  echo [1/3] Python venv OK.
)

if not exist "C:\fanzha-voice-lab-model\" (
  if exist "model\model.onnx" (
    echo [2/3] Linking model to ASCII path C:\fanzha-voice-lab-model ...
    mklink /J "C:\fanzha-voice-lab-model" "%~dp0model" >nul
  ) else (
    echo [2/3] WARNING: model\model.onnx not found. See README.md.
  )
) else (
  echo [2/3] Model link OK.
)

if not exist "samples\sid_102.wav" (
  echo [3/3] Generating samples, first run takes several minutes...
  set PYTHONIOENCODING=utf-8
  ".venv\Scripts\python.exe" -u tts_local.py --all
) else (
  echo [3/3] Samples OK.
)

echo.
echo Opening audition page...
start "" "%~dp0index.html"
exit /b 0

:err
echo.
echo Setup failed. Please check Python 3.9+ and network access.
pause
exit /b 1
