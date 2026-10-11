@echo off
chcp 65001 >nul
title Quiz Escolar - Servidor Localhost
echo ====================================================
echo Iniciando o Quiz Escolar em http://localhost:3000 ...
echo ====================================================

if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
)

start "" "http://localhost:3000"
call npm run dev
pause
