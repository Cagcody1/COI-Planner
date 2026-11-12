@echo off
rem Captain of Industry Factory Planner - portable launcher.
rem Opens the planner in its own window using Edge or Chrome, with the browser's data kept in the Data folder next to
rem this file, so your imported game data, designs and settings travel with the folder (USB stick, another PC).
setlocal
set "HERE=%~dp0"
set "APP=%HERE%app\COI-Planner.html"
set "DATA=%HERE%Data\browser"
if not exist "%APP%" goto missing
if not exist "%DATA%" mkdir "%DATA%"

set "BROWSER="
set "C1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "C2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "C3=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "C4=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "C5=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%C5%" set "BROWSER=%C5%"
if exist "%C4%" set "BROWSER=%C4%"
if exist "%C3%" set "BROWSER=%C3%"
if exist "%C2%" set "BROWSER=%C2%"
if exist "%C1%" set "BROWSER=%C1%"
if not defined BROWSER goto fallback

set "URL=file:///%APP:\=/%"
start "" "%BROWSER%" --user-data-dir="%DATA%" --app="%URL%" --no-first-run --no-default-browser-check
exit /b 0

:fallback
rem No Edge or Chrome found: open the default browser. Saved data then stays in that browser, not in the Data folder;
rem use "Download backup" on the Game data tab to carry it between computers.
start "" "%APP%"
exit /b 0

:missing
echo Could not find "%APP%".
echo Keep the "app" folder next to COI-Planner.cmd.
pause
exit /b 1
