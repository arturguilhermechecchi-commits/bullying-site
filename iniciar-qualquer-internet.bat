@echo off
chcp 65001 >nul
title Quiz Escolar - Localhost + Qualquer Internet (Global)
echo ====================================================================
echo Quiz Escolar - Iniciador Universal (Localhost + Qualquer Internet)
echo ====================================================================

if not exist node_modules (
  echo [1/3] Instalando dependencias pela primeira vez...
  call npm install
)

echo [2/3] Iniciando o servidor local na porta 3000...
start "Quiz Escolar - Servidor Local" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo [3/3] Gerando link publico gratuito para abrir em QUALQUER INTERNET (4G/5G/Wi-Fi)...
echo Copie o link "https://...trycloudflare.com" ou "https://...loca.lt" que aparecer abaixo:
echo.
call npx --yes cloudflared tunnel --url http://localhost:3000
pause
