Captain of Industry Factory Planner (portable)
==============================================

Start: double-click COI-Planner.cmd. Nothing is installed.
It opens the planner in its own window using Microsoft Edge or Google Chrome (one of them is on every Windows 10/11 PC).

Folders
  app\COI-Planner.html   the whole program in one file (no internet needed)
  Data\browser           everything you save: imported game data, designs, choices (created on first start)

Moving it: copy the whole folder to a USB drive or another PC. Your saved data comes along because it is in Data\.
To start fresh, close the planner and delete the Data folder.
If Edge/Chrome is not found, the planner opens in your default browser instead and saves there; use
"Download backup" / "Restore backup" on the Game data tab to carry your data between computers.

Game data exporter (to get current recipes, layouts and storages from your game)
  Exporter\PlannerDataExporter  the mod (only present if the game was installed on the PC that built this copy)
  Install-Exporter.cmd         copies it into your game's Mods folder with the right name. Then: start the game, enable
                               "Planner Data Exporter", start a NEW map, wait for it to load. The export appears in
                               %APPDATA%\Captain of Industry\Mods\PlannerDataExporter\exports; run Summarize-Export.cmd there
                               if it is huge, then import in the planner (Game data tab).

Game data
  The planner ships with data for game 0.8.1a, which is older than the current game. It shows a warning until you
  import your own export: Game data tab -> pick machines_and_buildings.json and products.json (and transports.json)
  written by the exporter mod. The page then lists every recipe and machine that changed.

Updating: replace the app\ folder with the new one. Keep Data\.
