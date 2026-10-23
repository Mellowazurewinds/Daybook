@echo off
cd /d "%~dp0"
set "CODEX_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

rem Prefer the runtime bundled with Codex so this launcher does not depend on
rem Python being registered in the Windows py launcher or PATH.
if exist "%CODEX_PYTHON%" (
  echo Starting Daybook with Codex's bundled Python...
  "%CODEX_PYTHON%" -u app.py
  if errorlevel 1 (
    echo Daybook stopped with an error. Read the message above.
    pause
  )
  exit /b
)

where py >nul 2>nul
if not errorlevel 1 (
  py -3 --version >nul 2>nul
  if not errorlevel 1 (
    py -3 -u app.py
    if not errorlevel 1 exit /b
  )
)
where python >nul 2>nul
if not errorlevel 1 (
  python --version >nul 2>nul
  if not errorlevel 1 (
    python -u app.py
    if not errorlevel 1 exit /b
  )
)
echo Python 3.11 or newer was not found. Install Python and try again.
pause
