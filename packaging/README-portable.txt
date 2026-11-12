COI Planner (portable)
======================

Start: double-click COI-Planner.cmd (or start it from PocketApps). It opens a program window. Nothing is installed.
Needs Windows 10/11 with Microsoft Edge WebView2 (already part of Windows 11 and of Edge).

Everything it saves (imported game data, designs, settings, backups you make) is in the Data folder next to the program.
Copy the whole folder to another PC or a USB drive and it comes along. Delete Data to start fresh.

Current game data (recipes, building sizes and ports, storages) from YOUR game
  Game data tab -> Game-data exporter:
    Build and install exporter   compiles the mod on this PC against your game, then puts it into the game's Mods folder
    (start the game, enable "Planner Data Exporter", start a NEW map, wait for it to load)
    Make summary                 shrinks a very large export to something you can send
    Remove exporter              removes the mod again when you are done
  After a game update: open the Game data tab and click "Rebuild and update exporter". No new planner is needed.
  Compiling uses the C# compiler that comes with Windows (.NET Framework), or the .NET SDK if you have it.

If the window does not open
  COI-Planner-Browser.cmd opens the same planner in its own Edge/Chrome window (its data is then in Data\browser).
  Data\last-error.txt says why the window could not start.

Folders: app\ (the program), python\ (its runtime), Exporter\source (the mod's code), Data\ (yours).
Updating: PocketApps replaces the program files and keeps Data. By hand: unzip over the old folder, keep Data.
