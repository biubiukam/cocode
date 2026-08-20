param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("install", "uninstall")]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$ShimMarker = "REM cocode-desktop-cli-shim:v1"
$RegistryPath = "HKCU:\Software\Cocode\CLI"
$BinDirectory = Join-Path $env:LOCALAPPDATA "Cocode\bin"
$ShimPath = Join-Path $BinDirectory "cocode.cmd"
$StatePath = Join-Path $env:LOCALAPPDATA "Cocode\cli-registration.json"

function Normalize-PathEntry([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    return $Value.Trim().Trim('"').TrimEnd('\', '/').ToLowerInvariant()
}

function Get-UserPath {
    $value = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($null -eq $value) { return "" }
    return $value
}

function Set-UserPath([string]$Value) {
    [Environment]::SetEnvironmentVariable("Path", $Value, "User")
}

function Broadcast-EnvironmentChange {
    if (-not ("Cocode.EnvironmentBroadcast" -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace Cocode {
    public static class EnvironmentBroadcast {
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
            uint flags, uint timeout, out UIntPtr result);
    }
}
"@
    }
    $result = [UIntPtr]::Zero
    [void][Cocode.EnvironmentBroadcast]::SendMessageTimeout(
        [IntPtr]0xffff,
        0x001A,
        [UIntPtr]::Zero,
        "Environment",
        0x0002,
        1000,
        [ref]$result
    ) # WM_SETTINGCHANGE
}

function Write-Utf8WithoutBom([string]$Path, [string]$Contents) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $Contents, $encoding)
}

function Install-CocodeCli {
    $resources = Join-Path $InstallDir "resources"
    $nodeExecutable = Join-Path $resources "cocode-node.exe"
    $cliEntry = Join-Path $resources "tui\cocode-cli.mjs"
    if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
        throw "Packaged Cocode Node executable is missing: $nodeExecutable"
    }
    if (-not (Test-Path -LiteralPath $cliEntry -PathType Leaf)) {
        throw "Packaged Cocode CLI entry is missing: $cliEntry"
    }

    $previousOwned = $false
    if (Test-Path -LiteralPath $RegistryPath) {
        $previous = Get-ItemProperty -LiteralPath $RegistryPath
        $previousOwned =
            $previous.PathOwned -eq 1 -and
            (Normalize-PathEntry $previous.PathEntry) -eq (Normalize-PathEntry $BinDirectory)
    }

    if (Test-Path -LiteralPath $ShimPath -PathType Leaf) {
        $existing = Get-Content -LiteralPath $ShimPath -Raw
        if (-not $existing.Contains($ShimMarker)) {
            throw "An unmanaged cocode.cmd already exists: $ShimPath"
        }
    }

    New-Item -ItemType Directory -Path $BinDirectory -Force | Out-Null
    $shim = @"
@echo off
$ShimMarker
REM cocode-desktop-cli-source:installer
if not defined COCODE_HOME set "COCODE_HOME=%USERPROFILE%\.cocode"
if not defined COCODE_DSH_HOME set "COCODE_DSH_HOME=%USERPROFILE%\.dsh"
set "DSH_HOME=%COCODE_DSH_HOME%"
set "COCODE_NODE_EXECUTABLE=$nodeExecutable"
set "COCODE_SUPERVISOR_SERVICE_ENTRY=$resources\dsh-runtime\packages\host-supervisor\lib\bin.js"
set "COCODE_TUI_CLIENT_KIND=desktop-tui"
set "DSH_PROFILE=cocode"
set "COCODE_HOST_CONFIG_FINGERPRINT=cocode-web-jsonrpc-v3"
set "COCODE_RUNTIME_CHANNEL=stable"
"$nodeExecutable" "$cliEntry" %*
"@
    Write-Utf8WithoutBom $ShimPath ($shim + "`r`n")
    $shimSha256 = (Get-FileHash -LiteralPath $ShimPath -Algorithm SHA256).Hash

    $currentPath = Get-UserPath
    $normalizedBin = Normalize-PathEntry $BinDirectory
    $pathEntries = @($currentPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $alreadyPresent = $pathEntries | Where-Object {
        (Normalize-PathEntry $_) -eq $normalizedBin
    }
    $pathOwned = $previousOwned
    if (-not $alreadyPresent) {
        $nextPath = if ([string]::IsNullOrWhiteSpace($currentPath)) {
            $BinDirectory
        } elseif ($currentPath.EndsWith(';')) {
            "$currentPath$BinDirectory"
        } else {
            "$currentPath;$BinDirectory"
        }
        Set-UserPath $nextPath
        $pathOwned = $true
    }

    New-Item -ItemType Directory -Path $RegistryPath -Force | Out-Null
    New-ItemProperty -Path $RegistryPath -Name "PathEntry" -Value $BinDirectory -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $RegistryPath -Name "PathOwned" -Value ([int]$pathOwned) -PropertyType DWord -Force | Out-Null
    New-ItemProperty -Path $RegistryPath -Name "ShimPath" -Value $ShimPath -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $RegistryPath -Name "ShimSha256" -Value $shimSha256 -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $RegistryPath -Name "InstallDir" -Value $InstallDir -PropertyType String -Force | Out-Null

    if ($pathOwned) {
        $state = @{ ownedDirectories = @($normalizedBin) } | ConvertTo-Json -Depth 3
        Write-Utf8WithoutBom $StatePath ($state + "`n")
    } elseif (Test-Path -LiteralPath $StatePath) {
        Remove-Item -LiteralPath $StatePath -Force
    }
    Broadcast-EnvironmentChange
}

function Uninstall-CocodeCli {
    if (-not (Test-Path -LiteralPath $RegistryPath)) { return }
    $registration = Get-ItemProperty -LiteralPath $RegistryPath
    $registeredShim = [string]$registration.ShimPath
    $registeredPath = [string]$registration.PathEntry
    $preserveUserChanges = $false

    if (-not [string]::IsNullOrWhiteSpace($registeredShim) -and
        (Test-Path -LiteralPath $registeredShim -PathType Leaf)) {
        $contents = Get-Content -LiteralPath $registeredShim -Raw
        $currentHash = (Get-FileHash -LiteralPath $registeredShim -Algorithm SHA256).Hash
        if ($contents.Contains($ShimMarker) -and $currentHash -eq $registration.ShimSha256) {
            Remove-Item -LiteralPath $registeredShim -Force
        } else {
            $preserveUserChanges = $true
        }
    }

    $pathChanged = $false
    if ($registration.PathOwned -eq 1 -and -not $preserveUserChanges) {
        $normalizedRegisteredPath = Normalize-PathEntry $registeredPath
        $currentPath = Get-UserPath
        $entries = @($currentPath -split ';')
        $retained = @($entries | Where-Object {
            (Normalize-PathEntry $_) -ne $normalizedRegisteredPath
        })
        if ($retained.Count -ne $entries.Count) {
            Set-UserPath ($retained -join ';')
            $pathChanged = $true
        }
    }

    if (Test-Path -LiteralPath $StatePath) {
        Remove-Item -LiteralPath $StatePath -Force
    }
    Remove-Item -LiteralPath $RegistryPath -Recurse -Force
    if ($pathChanged) { Broadcast-EnvironmentChange }
}

if ($Action -eq "install") {
    Install-CocodeCli
} else {
    Uninstall-CocodeCli
}
