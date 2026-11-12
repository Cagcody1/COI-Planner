COI Planner (portable)
======================

Start: double-click COI-Planner.cmd (or start it from PocketApps). It opens a program window. Nothing is installed.
Needs Windows 10/11 with Microsoft Edge WebView2 (already part of Windows 11 and of Edge).

Everything it saves (imported game data, designs, settings, backups you make) is in the Data folder next to the program.
Copy the whole folder to another PC or a USB drive and it comes along. Delete Data to start fresh.

Game data from your own game (current recipes, building sizes and ports, storages)
  Game data tab -> Game-data exporter:
    Install exporter      puts the mod into your game's Mods folder
    (start the game, enable "Planner Data Exporter", start a NEW map, wait for it to load)
    Make summary          shrinks a very large export to something you can send
    Remove exporter       removes the mod again when you are done
  After a game update: update this program, then click "Update exporter" and repeat.
  The mod is compiled against YOUR game when this program is built on a PC that has the game installed. If the
  Exporter folder is missing here, it was built somewhere else.

If the window does not open
  COI-Planner-Browser.cmd opens the same planner in its own Edge/Chrome window (its data is then in Data\browser).
  Exporter-Tools.cmd is a plain menu for the exporter that works without the window.
  Data\last-error.txt says why the window could not start.

Folders: app\ (the program), python\ (its runtime), Exporter\ (the mod), Data\ (yours).
Updating: PocketApps replaces the program files and keeps Data. By hand: unzip over the old folder, keep Data.
