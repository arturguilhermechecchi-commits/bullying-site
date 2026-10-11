#!/usr/bin/env bash
echo "===================================================="
echo "Iniciando o Quiz Escolar em http://localhost:3000 ..."
echo "===================================================="

if [ ! -d "node_modules" ]; then
  echo "Instalando dependências pela primeira vez..."
  npm install
fi

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://localhost:3000") &
elif command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://localhost:3000") &
fi

npm run dev
