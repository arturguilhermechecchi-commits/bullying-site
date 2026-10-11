@echo off
chcp 65001 >nul
title Quiz Escolar - Vincular GitHub + Netlify + Firebase Automatico
echo =========================================================================
echo Quiz Escolar - Envio Automatico para GitHub e Deploy no Netlify
echo =========================================================================
git --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERRO] O Git nao foi encontrado. Instale em https://git-scm.com/
  pause
  exit /b 1
)

if not exist .git (
  echo [1/4] Inicializando repositorio Git...
  git init
  git branch -M main
)

echo [2/4] Adicionando todos os arquivos (com netlify.toml e Firebase)...
git add .
git commit -m "Deploy automatico Quiz Escolar (GitHub + Netlify + Firebase)" >nul 2>&1

git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  set /p REPO_URL="Cole o link do seu repositorio no GitHub (ex: https://github.com/usuario/quiz-escolar.git): "
  git remote add origin %REPO_URL%
)

echo [3/4] Enviando codigo para o GitHub (branch main)...
git push -u origin main

echo.
echo [4/4] Pronto! No Netlify (https://app.netlify.com):
echo  1. Clique em "Add new site" -> "Import an existing project" -> "GitHub"
echo  2. Escolha este repositorio (o arquivo netlify.toml ja configura tudo sozinho!)
echo =========================================================================
pause
