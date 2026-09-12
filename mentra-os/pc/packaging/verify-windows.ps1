param(
    [Parameter(Mandatory=$true)][string]$BundleDir,
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$SampleVideo,
    [Parameter(Mandatory=$true)][string]$Output,
    [string]$Python = "python"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$PackDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& $Python "$PackDir/verify_windows.py" --bundle-dir $BundleDir --installer $Installer --sample-video $SampleVideo --output $Output
if ($LASTEXITCODE -ne 0) { throw "Windows acceptance checks failed. Inspect $Output." }
& $Python "$PackDir/capture-demo.py" --sample-video $SampleVideo --output "$Output/screenshots"
if ($LASTEXITCODE -ne 0) { throw "Windows demonstration capture failed." }
