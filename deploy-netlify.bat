@echo off
chcp 65001 >nul
title Quiz Escolar - Deploy Direto no Netlify (Producao)
echo =========================================================================
echo Quiz Escolar - Deploy Automatico de Producao no Netlify
echo Banco Firebase Vinculado: rational-space-19pl1
echo =========================================================================

if not exist node_modules (
  echo [1/3] Instalando pacotes...
  call npm install
)

echo [2/3] Gerando pacote de producao (pasta dist)...
call npm run build

echo.
echo [3/3] Publicando o sistema em Producao no Netlify...
echo (Uma janela do navegador abrira para autorizar sua conta Netlify se necessario)
call npx --yes netlify-cli deploy --prod --dir=dist

echo.
echo =========================================================================
echo Deploy no Netlify concluido!
echo =========================================================================
pause
