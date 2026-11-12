@echo off
rem Removes the game-data exporter mod from the game's Mods folder (use it when you are done exporting).
setlocal
set "DEST=%APPDATA%\Captain of Industry\Mods\PlannerDataExporter"
if not exist "%DEST%" goto none
echo This deletes:
echo   %DEST%
echo including its exports folder (the planner-data-*.json files and any summary). Copy anything you still need first.
echo Close the game before continuing.
choice /c YN /n /m "Delete it? [Y/N] "
if errorlevel 2 goto cancelled
rmdir /s /q "%DEST%"
if exist "%DEST%" goto failed
echo Removed. You can install it again later with Install-Exporter.cmd.
pause
exit /b 0
:none
echo The exporter is not installed ("%DEST%" does not exist).
pause
exit /b 0
:cancelled
echo Nothing was deleted.
pause
exit /b 0
:failed
echo Could not delete everything (is the game still running?). Close the game and try again.
pause
exit /b 1
