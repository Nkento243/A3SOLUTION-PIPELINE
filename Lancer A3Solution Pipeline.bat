@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js n'est pas installe sur cet ordinateur.
  echo Installez-le depuis https://nodejs.org ^(version LTS^), puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances ^(uniquement la premiere fois^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo L'installation a echoue. Verifiez votre connexion internet et reessayez.
    pause
    exit /b 1
  )
)

echo Demarrage d'A3Solution Pipeline...
node server.js
pause
