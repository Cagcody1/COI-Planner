# Builds the PlannerDataExporter mod with the .NET SDK's C# compiler. No Visual Studio, no project file.
#   build.ps1                    finds the game (COI_ROOT, then Steam), builds into build\PlannerDataExporter
#   build.ps1 -Install           also copies the mod into %APPDATA%\Captain of Industry\Mods
#   build.ps1 -GameDirectory D:\Games\Captain of Industry
# Needs: the game installed on this PC (only its Managed\*.dll are read, nothing is copied) and the .NET SDK.
param([string]$GameDirectory = $env:COI_ROOT, [switch]$Install)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Find-Game {
    $candidates = @()
    if ($GameDirectory) { $candidates += $GameDirectory }
    $steam = $null
    try { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop).SteamPath } catch { }
    if ($steam) {
        $steam = $steam -replace '/', '\'
        $candidates += (Join-Path $steam 'steamapps\common\Captain of Industry')
        $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) {
                $candidates += (Join-Path ($m.Groups[1].Value -replace '\\\\', '\') 'steamapps\common\Captain of Industry')
            }
        }
    }
    $candidates += 'C:\Program Files (x86)\Steam\steamapps\common\Captain of Industry'
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c 'Captain of Industry_Data\Managed\Mafi.Core.dll'))) { return $c }
    }
    throw "Could not find Captain of Industry. Set the COI_ROOT environment variable (or pass -GameDirectory) to the game folder, the one that contains 'Captain of Industry_Data'."
}

$game = Find-Game
$managed = Join-Path $game 'Captain of Industry_Data\Managed'
Write-Host "Game: $game"

$sdkLine = (& dotnet --list-sdks | Select-Object -Last 1)
if (-not $sdkLine) { throw '.NET SDK not found. In PocketBuilder, install the .NET SDK from its tools list.' }
$sdkVersion = $sdkLine.Split(' ')[0]
$sdkRoot = $sdkLine.Substring($sdkLine.IndexOf('[') + 1).TrimEnd(']')
$csc = Join-Path $sdkRoot "$sdkVersion\Roslyn\bincore\csc.dll"
if (-not (Test-Path $csc)) { throw "C# compiler not found: $csc" }

$out = Join-Path $PSScriptRoot 'build\PlannerDataExporter'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null

$refs = @('mscorlib', 'System', 'System.Core', 'netstandard', 'Mafi', 'Mafi.Core') | ForEach-Object { '/reference:' + (Join-Path $managed "$_.dll") }
& dotnet $csc /nologo /target:library /nostdlib+ /langversion:latest "/out:$out\PlannerDataExporter.dll" @refs PlannerDataExporter.cs
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed (see the messages above; send them along if the game was updated).' }
Copy-Item manifest.json, LICENSE-THIRD-PARTY -Destination $out
Write-Host "Mod folder ready: $out"

if ($Install) {
    $mods = Join-Path $env:APPDATA 'Captain of Industry\Mods'
    $dest = Join-Path $mods 'PlannerDataExporter'
    New-Item -ItemType Directory -Force $mods | Out-Null
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $out $dest -Recurse
    Write-Host "Installed to $dest"
}
