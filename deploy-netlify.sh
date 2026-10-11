#!/usr/bin/env bash
set -e

echo "========================================================================="
echo "Quiz Escolar - Deploy Automático de Produção no Netlify"
echo "Banco Firebase Vinculado: rational-space-19pl1"
echo "========================================================================="

if [ ! -d "node_modules" ]; then
  echo "[1/3] Instalando pacotes..."
  npm install
fi

echo "[2/3] Gerando pacote de produção (pasta dist)..."
npm run build

echo "[3/3] Publicando o sistema em Produção no Netlify..."
npx --yes netlify-cli deploy --prod --dir=dist
