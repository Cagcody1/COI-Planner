@echo off
rem Makes a small summary of the newest export so it can be sent for review (the export itself can be hundreds of MB).
rem Needs Python 3 (the "py" launcher or "python"). Writes exports\planner-export-summary.json and opens that folder.
setlocal
cd /d "%~dp0"
set "NEWEST="
for /f "delims=" %%F in ('dir /b /o-d "exports\planner-data-*.json" 2^>nul') do if not defined NEWEST set "NEWEST=%%F"
if not defined NEWEST goto noexport

set "PY="
if defined PYTHON_EXE set "PY=%PYTHON_EXE%"
if not defined PY (py -3 --version >nul 2>nul && set "PY=py -3")
if not defined PY (python --version >nul 2>nul && set "PY=python")
if not defined PY goto nopython

echo Summarizing exports\%NEWEST% ...
%PY% summarize.py "exports\%NEWEST%" "exports\planner-export-summary.json"
if errorlevel 1 goto failed
explorer "%~dp0exports"
pause
exit /b 0

:noexport
echo No export found in "%~dp0exports".
echo Enable the mod, start a new map in the game, wait for it to load, then run this again.
pause
exit /b 1

:nopython
echo Python 3 was not found. Install it from python.org, or set PYTHON_EXE to a python.exe, then run this again.
echo (PocketBuilder has one: look for python\python.exe inside its folder.)
pause
exit /b 1

:failed
echo The summary could not be made. Send the message above.
pause
exit /b 1
