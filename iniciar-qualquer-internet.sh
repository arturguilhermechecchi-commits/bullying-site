#!/usr/bin/env bash
echo "===================================================================="
echo "Quiz Escolar — Iniciador Universal (Localhost + Qualquer Internet)"
echo "===================================================================="

if [ ! -d "node_modules" ]; then
  echo "[1/3] Instalando dependências pela primeira vez..."
  npm install
fi

echo "[2/3] Iniciando servidor local em http://localhost:3000 ..."
npm run dev &
SERVER_PID=$!

sleep 3
echo "[3/3] Gerando link público gratuito para abrir em QUALQUER INTERNET (4G/5G/Wi-Fi)..."
npx --yes cloudflared tunnel --url http://localhost:3000

kill $SERVER_PID 2>/dev/null
