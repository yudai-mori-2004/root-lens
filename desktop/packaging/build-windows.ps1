param(
    [Parameter(Mandatory=$true)][string]$PlatformTools,
    [Parameter(Mandatory=$true)][string]$Output,
    [Parameter(Mandatory=$true)][string]$RuntimeNotices,
    [string]$Python = "py",
    [string]$InnoSetupCompiler
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw "Build on Windows x64." }
$PackDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Output = [System.IO.Path]::GetFullPath($Output)
& $Python "$PackDir/build.py" --platform-tools $PlatformTools --output $Output --runtime-notices $RuntimeNotices
if ($LASTEXITCODE -ne 0) { throw "Desktop bundle build failed" }
if ($InnoSetupCompiler) {
    $Version = & $Python -c "import sys; sys.path.insert(0, sys.argv[1]); from rootlens_import import __version__; print(__version__)" (Split-Path -Parent $PackDir)
    if ($LASTEXITCODE -ne 0 -or $Version -notmatch '^\d+\.\d+\.\d+$') { throw "Application version could not be determined." }
    & $InnoSetupCompiler "/DBundleDir=$Output/RootLens Import" "/DAppVersion=$Version" "/O$Output" "$PackDir/windows-installer.iss"
    if ($LASTEXITCODE -ne 0) { throw "Installer build failed" }
    $Installer = Join-Path $Output "RootLens-Import-Setup-$Version-windows-x64.exe"
    $InstallerSignature = Get-AuthenticodeSignature -LiteralPath $Installer
    $ApplicationSignature = Get-AuthenticodeSignature -LiteralPath (Join-Path $Output "RootLens Import/RootLens Importer.exe")
    $Manifest = @{
        version = $Version
        architecture = "x64"
        installer = (Split-Path -Leaf $Installer)
        bytes = (Get-Item -LiteralPath $Installer).Length
        sha256 = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
        signing = @{
            installer_status = $InstallerSignature.Status.ToString()
            application_status = $ApplicationSignature.Status.ToString()
            installer_signer = $(if ($InstallerSignature.SignerCertificate) { $InstallerSignature.SignerCertificate.Subject } else { $null })
            application_signer = $(if ($ApplicationSignature.SignerCertificate) { $ApplicationSignature.SignerCertificate.Subject } else { $null })
        }
    }
    $Manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output "windows-build-manifest.json") -Encoding utf8
}
