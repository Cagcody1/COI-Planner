@echo off
rem Installs the game-data exporter mod into the game's Mods folder, with the folder name the game requires.
setlocal
set "SRC=%~dp0Exporter\PlannerDataExporter"
set "MODS=%APPDATA%\Captain of Industry\Mods"
if not exist "%SRC%\manifest.json" goto missing
if not exist "%MODS%" mkdir "%MODS%"
if exist "%MODS%\PlannerDataExporter" rmdir /s /q "%MODS%\PlannerDataExporter"
xcopy "%SRC%" "%MODS%\PlannerDataExporter\" /e /i /q /y >nul
if errorlevel 1 goto failed
echo Installed to "%MODS%\PlannerDataExporter".
echo Next: start the game, enable "Planner Data Exporter" in the mod list, and start a NEW map.
echo The export appears in "%MODS%\PlannerDataExporter\exports". Double-click Summarize-Export.cmd there to shrink it.
pause
exit /b 0
:missing
echo The exporter is not part of this copy of the planner (it is built on a PC that has the game installed).
echo Get PlannerDataExporter from https://github.com/Cagcody1/COI-Planner/releases and copy that folder to "%MODS%".
pause
exit /b 1
:failed
echo Copying failed. Copy the folder "%SRC%" to "%MODS%" by hand; its name must stay PlannerDataExporter.
pause
exit /b 1
