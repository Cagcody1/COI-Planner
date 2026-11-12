@echo off
rem COI Planner - game data exporter tools, all in one place. Works from the planner's own folder.
setlocal
cd /d "%~dp0"
set "MODS=%APPDATA%\Captain of Industry\Mods"
set "MOD=%MODS%\PlannerDataExporter"

:menu
cls
echo ================================================
echo   COI Planner - game data exporter
echo ================================================
echo.
if exist "%MOD%\manifest.json" goto st_in
echo   Status: NOT installed in the game
goto st_done
:st_in
echo   Status: installed in the game's Mods folder
:st_done
echo.
echo   1  Install the exporter into the game
echo   2  Make a small summary of the newest export
echo   3  Open the exports folder
echo   4  Uninstall the exporter (when you are done)
echo   5  Start the planner
echo   Q  Quit
echo.
choice /c 12345Q /n /m "Choose: "
if errorlevel 6 exit /b 0
if errorlevel 5 goto planner
if errorlevel 4 goto uninstall
if errorlevel 3 goto openexports
if errorlevel 2 goto summary
goto install

:install
set "SRC=%~dp0Exporter\PlannerDataExporter"
if not exist "%SRC%\manifest.json" goto noexporter
if not exist "%MODS%" mkdir "%MODS%"
rem Copies over an existing install (an update) without touching its exports folder.
xcopy "%SRC%" "%MOD%\" /e /i /q /y >nul
if errorlevel 1 goto copyfailed
echo.
echo Installed to "%MOD%".
echo Next: start the game, enable "Planner Data Exporter" in the mod list, start a NEW map and wait for it to load.
echo Then come back here: option 2 makes a small summary of the export, option 3 opens the exports folder.
pause
goto menu

:uninstall
if not exist "%MOD%" goto notinstalled
echo.
echo This deletes "%MOD%"
echo including its exports folder (the planner-data-*.json files and any summary). Copy what you still need first.
echo Close the game before continuing.
choice /c YN /n /m "Delete it? [Y/N] "
if errorlevel 2 goto menu
rmdir /s /q "%MOD%"
if exist "%MOD%" goto delfailed
echo Removed. Choose 1 to install it again later.
pause
goto menu

:planner
start "" "%~dp0COI-Planner.cmd"
exit /b 0

:openexports
if not exist "%MOD%\exports" goto noexports
explorer "%MOD%\exports"
goto menu

:summary
set "NEWEST="
if exist "%MOD%\exports" for /f "delims=" %%F in ('dir /b /o-d "%MOD%\exports\planner-data-*.json" 2^>nul') do if not defined NEWEST set "NEWEST=%%F"
if not defined NEWEST goto noexports
call :findpy
if not defined PY goto nopython
set "SUM=%~dp0Exporter\PlannerDataExporter\summarize.py"
if not exist "%SUM%" set "SUM=%MOD%\summarize.py"
if not exist "%SUM%" goto nosummarizer
echo Summarizing %NEWEST% ...
"%PY%" "%SUM%" "%MOD%\exports\%NEWEST%" "%MOD%\exports\planner-export-summary.json"
if errorlevel 1 goto failed
explorer "%MOD%\exports"
pause
goto menu

:findpy
set "PY="
if defined PYTHON_EXE if exist "%PYTHON_EXE%" set "PY=%PYTHON_EXE%"
if not defined PY if exist "%~dp0..\..\python\python.exe" set "PY=%~dp0..\..\python\python.exe"
if not defined PY if exist "%~dp0..\PocketBuilder\python\python.exe" set "PY=%~dp0..\PocketBuilder\python\python.exe"
if not defined PY (py -3 --version >nul 2>nul && for /f "delims=" %%P in ('py -3 -c "import sys;print(sys.executable)"') do set "PY=%%P")
if not defined PY (python --version >nul 2>nul && for /f "delims=" %%P in ('python -c "import sys;print(sys.executable)"') do set "PY=%%P")
exit /b 0

:noexporter
echo The exporter is not part of this copy of the planner. It is only included when the planner is built on a PC that has the game installed.
pause
goto menu

:copyfailed
echo Copying failed. Close the game and try again. The folder must end up named PlannerDataExporter inside "%MODS%".
pause
goto menu

:notinstalled
echo The exporter is not installed.
pause
goto menu

:delfailed
echo Could not delete everything. Close the game and try again.
pause
goto menu

:noexports
echo No export found yet. Install the exporter (option 1), start the game with it enabled, and start a NEW map.
pause
goto menu

:nopython
echo Python was not found. It is normally in PocketApps\python, or set PYTHON_EXE to a python.exe.
pause
goto menu

:nosummarizer
echo summarize.py is missing from this copy (the exporter was not built into it).
pause
goto menu

:failed
echo The summary could not be made. Send the message above.
pause
goto menu
