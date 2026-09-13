#ifndef BundleDir
  #error BundleDir must point to the PyInstaller output folder
#endif
#ifndef AppVersion
  #error AppVersion must match rootlens_import.__version__
#endif

[Setup]
AppId={{DF82D3D9-DF73-4D27-A1DA-5E7ECB83FEE2}
AppName=RootLens
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
UninstallDisplayIcon={app}\RootLens Import.exe
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "デスクトップにアイコンを作成する"; Flags: checkedonce

[Icons]
Name: "{group}\RootLens"; Filename: "{app}\RootLens Import.exe"
Name: "{autodesktop}\RootLens"; Filename: "{app}\RootLens Import.exe"; Tasks: desktopicon

[InstallDelete]
Type: files; Name: "{userprograms}\RootLens Import\RootLens Import.lnk"
Type: dirifempty; Name: "{userprograms}\RootLens Import"
Type: files; Name: "{autodesktop}\RootLens Import.lnk"

[Run]
Filename: "{app}\RootLens Import.exe"; Description: "RootLens を起動する"; Flags: nowait postinstall skipifsilent
