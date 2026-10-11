@echo off
chcp 65001 >nul
title Quiz Escolar - Portal Host para VPNs (Tailscale, Radmin, ZeroTier, Hamachi, WireGuard)
echo =========================================================================
echo Quiz Escolar - Portal Host para VPNs e Rede Privada
echo =========================================================================

echo Liberando a porta 3000 no Firewall para conexoes de VPN (se executado como Admin)...
netsh advfirewall firewall add rule name="Quiz Escolar VPN Host (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

if not exist node_modules (
  echo [1/3] Instalando dependencias pela primeira vez...
  call npm install
)

echo.
echo [2/3] IPs das suas Interfaces de Rede e VPNs ativas neste computador:
echo -------------------------------------------------------------------------
ipconfig | findstr /i "Adaptador IPv4"
echo -------------------------------------------------------------------------
echo Basta usar qualquer IP acima seguido de :3000 (ex: http://26.x.x.x:3000 ou http://100.x.x.x:3000)
echo.

echo [3/3] Iniciando o Portal Host VPN em 0.0.0.0:3000...
start "" "http://localhost:3000"
call npm run dev
pause
