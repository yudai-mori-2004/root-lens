#ifndef BundleDir
  #error BundleDir must point to the PyInstaller output folder
#endif
#ifndef AppVersion
  #error AppVersion must match rootlens_import.__version__
#endif

[Setup]
AppId={{DF82D3D9-DF73-4D27-A1DA-5E7ECB83FEE2}
AppName=RootLens Importer
AppVersion={#AppVersion}
AppPublisher=RootLens
DefaultDirName={localappdata}\Programs\RootLens Import
DefaultGroupName=RootLens
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputBaseFilename=RootLens-Import-Setup-{#AppVersion}-windows-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=icons\rootlens.ico
UninstallDisplayIcon={app}\RootLens Importer.exe
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "デスクトップにアイコンを作成する"; Flags: checkedonce

[Icons]
Name: "{group}\RootLens Importer"; Filename: "{app}\RootLens Importer.exe"
Name: "{autodesktop}\RootLens Importer"; Filename: "{app}\RootLens Importer.exe"; Tasks: desktopicon

[InstallDelete]
Type: files; Name: "{app}\RootLens Import.exe"
Type: files; Name: "{userprograms}\RootLens Import\RootLens Import.lnk"
Type: dirifempty; Name: "{userprograms}\RootLens Import"
Type: files; Name: "{autodesktop}\RootLens Import.lnk"
Type: files; Name: "{userprograms}\RootLens\RootLens.lnk"
Type: files; Name: "{autodesktop}\RootLens.lnk"

[Run]
Filename: "{app}\RootLens Importer.exe"; Description: "RootLens Importer を起動する"; Flags: nowait postinstall skipifsilent
