@echo off
cd /d "%~dp0"
set "CODEX_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if not exist "%CODEX_PYTHON%" (
  echo The Python runtime bundled with Codex was not found.
  echo To rebuild Daybook, install Python 3.11 or newer and update this script.
  pause
  exit /b 1
)

if not exist ".tmp" mkdir ".tmp"
set "TEMP=%CD%\.tmp"
set "TMP=%CD%\.tmp"
set "PYINSTALLER_CONFIG_DIR=%CD%\.tmp\pyinstaller"

if not exist ".builddeps\PyInstaller\__init__.py" (
  echo Preparing the one-time packaging tool...
  "%CODEX_PYTHON%" -m pip install --target .builddeps -r requirements-build.txt
  if errorlevel 1 goto failed
)

set "PYTHONPATH=%CD%\.builddeps"
echo Building Daybook.exe...
"%CODEX_PYTHON%" -m PyInstaller --clean --noconfirm --onefile --console --name Daybook --workpath .build --distpath . --add-data "daybook\static;daybook\static" app.py
if errorlevel 1 goto failed

echo.
echo Build complete: %CD%\Daybook.exe
pause
exit /b 0

:failed
echo.
echo The build failed. Read the error above.
pause
exit /b 1
