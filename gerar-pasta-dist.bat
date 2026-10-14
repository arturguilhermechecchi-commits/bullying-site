@echo off
chcp 65001 >nul
title Quiz Escolar - Gerar e Abrir Pasta DIST para o Netlify
echo =========================================================================
echo Quiz Escolar - Gerador da Pasta DIST para o Netlify
echo =========================================================================

if not exist node_modules (
  echo [1/2] Instalando dependencias...
  call npm install
)

echo [2/2] Criando a pasta DIST compilada com Firebase vinculado...
call npm run build

if exist dist (
  echo.
  echo =========================================================================
  echo SUCESSO! A pasta "dist" foi criada e vai abrir na sua tela agora.
  echo Basta arrastar essa pasta "dist" para https://app.netlify.com/drop
  echo =========================================================================
  explorer dist
) else (
  echo [ERRO] Nao foi possivel gerar a pasta dist. Verifique se o Node.js esta instalado.
)
pause
