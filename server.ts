import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer as createViteServer } from 'vite';

interface Question {
  id: string;
  question: string;
  options: [string, string, string];
}

interface QuizSubmission {
  id: string;
  submittedAt: string;
  answers: Record<string, number>;
  turma?: string;
}

interface StoreData {
  questions: Question[];
  savedDefaultOptions: [string, string, string];
  submissions: QuizSubmission[];
  customVpnHost?: string;
}

export interface NetworkEndpoint {
  interfaceName: string;
  ip: string;
  url: string;
  type: 'vpn' | 'lan';
  providerLabel: string;
}

const DATA_FILE = path.resolve(process.cwd(), 'quiz-store.json');

function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        savedDefaultOptions:
          Array.isArray(parsed.savedDefaultOptions) && parsed.savedDefaultOptions.length >= 3
            ? [
                String(parsed.savedDefaultOptions[0] || ''),
                String(parsed.savedDefaultOptions[1] || ''),
                String(parsed.savedDefaultOptions[2] || '')
              ]
            : ['', '', ''],
        submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
        customVpnHost: parsed.customVpnHost ? String(parsed.customVpnHost) : ''
      };
    }
  } catch (err) {
    console.error('Error reading store:', err);
  }
  return {
    questions: [],
    savedDefaultOptions: ['', '', ''],
    submissions: [],
    customVpnHost: ''
  };
}

function saveStore(data: StoreData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing store:', err);
  }
}

function classifyNetworkInterface(name: string, ip: string): { type: 'vpn' | 'lan'; providerLabel: string } {
  const lower = name.toLowerCase();

  // Tailscale / CGNAT range 100.64.0.0/10
  const octets = ip.split('.').map(Number);
  if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) {
    return { type: 'vpn', providerLabel: 'Tailscale / WireGuard VPN' };
  }
  if (octets[0] === 26) {
    return { type: 'vpn', providerLabel: 'Radmin VPN' };
  }
  if (octets[0] === 25) {
    return { type: 'vpn', providerLabel: 'LogMeIn Hamachi VPN' };
  }
  if (
    lower.includes('tailscale') ||
    lower.includes('zerotier') ||
    lower.includes('zt') ||
    lower.includes('wg') ||
    lower.includes('wireguard') ||
    lower.includes('tun') ||
    lower.includes('tap') ||
    lower.includes('radmin') ||
    lower.includes('hamachi') ||
    lower.includes('vpn') ||
    lower.includes('nordlynx') ||
    lower.includes('proton') ||
    lower.includes('cloudflarewarp') ||
    lower.includes('utun')
  ) {
    return { type: 'vpn', providerLabel: `Adaptador VPN (${name})` };
  }

  return { type: 'lan', providerLabel: `Rede Local (${name})` };
}

function getNetworkEndpoints(port: number): NetworkEndpoint[] {
  const interfaces = os.networkInterfaces();
  const endpoints: NetworkEndpoint[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        const { type, providerLabel } = classifyNetworkInterface(name, net.address);
        endpoints.push({
          interfaceName: name,
          ip: net.address,
          url: `http://${net.address}:${port}`,
          type,
          providerLabel
        });
      }
    }
  }
  return endpoints;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Enable proxy & VPN/Tunnel compatibility headers (CORS + Private Network Access for VPNs)
  app.set('trust proxy', true);
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Bypass-Tunnel-Reminder, X-Forwarded-For, X-Forwarded-Host, X-Real-IP'
    );
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // Health / Ping route for VPN clients & portals
  app.get('/api/vpn-ping', (req, res) => {
    res.json({
      status: 'online',
      clientIp: req.ip || req.socket.remoteAddress || 'desconhecido',
      timestamp: new Date().toISOString(),
      port: PORT
    });
  });

  // Save custom VPN Host IP/Domain configured by Admin
  app.put('/api/vpn-host', (req, res) => {
    const store = loadStore();
    const { customVpnHost } = req.body;
    store.customVpnHost = customVpnHost ? String(customVpnHost).trim() : '';
    saveStore(store);
    res.json({ customVpnHost: store.customVpnHost });
  });

  // Get server localhost, LAN, VPN interfaces, and public internet URL info
  app.get('/api/server-info', (req, res) => {
    const store = loadStore();
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const hostHeader =
      (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
    const detectedOrigin = `${forwardedProto.split(',')[0].trim()}://${hostHeader
      .split(',')[0]
      .trim()}`;

    const endpoints = getNetworkEndpoints(PORT);
    const vpnEndpoints = endpoints.filter((e) => e.type === 'vpn');
    const lanEndpoints = endpoints.filter((e) => e.type === 'lan');

    res.json({
      localhostUrl: `http://localhost:${PORT}`,
      networkUrls: endpoints.map((e) => e.url),
      vpnEndpoints,
      lanEndpoints,
      customVpnHost: store.customVpnHost || '',
      clientIp: req.ip || req.socket.remoteAddress || '127.0.0.1',
      publicAppUrl: process.env.APP_URL || detectedOrigin,
      port: PORT
    });
  });

  // Get shared quiz state for all users
  app.get('/api/quiz', (_req, res) => {
    const store = loadStore();
    res.json(store);
  });

  // Update questions and default options (from Admin Panel)
  app.put('/api/quiz/questions', (req, res) => {
    const store = loadStore();
    const { questions, savedDefaultOptions } = req.body;

    if (Array.isArray(questions)) {
      store.questions = questions.map((q: Question) => ({
        id: String(q.id || `q-${Date.now()}`),
        question: String(q.question || ''),
        options: Array.isArray(q.options)
          ? [
              String(q.options[0] || ''),
              String(q.options[1] || ''),
              String(q.options[2] || '')
            ]
          : ['', '', '']
      }));
    }

    if (Array.isArray(savedDefaultOptions) && savedDefaultOptions.length >= 3) {
      store.savedDefaultOptions = [
        String(savedDefaultOptions[0] || ''),
        String(savedDefaultOptions[1] || ''),
        String(savedDefaultOptions[2] || '')
      ];
    }

    saveStore(store);
    res.json(store);
  });

  // Record a new anonymous quiz submission from any user
  app.post('/api/quiz/submissions', (req, res) => {
    const store = loadStore();
    const { answers, turma } = req.body;

    if (answers && typeof answers === 'object') {
      const newSub: QuizSubmission = {
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        submittedAt: new Date().toISOString(),
        answers,
        turma: typeof turma === 'string' && turma.trim() ? turma.trim().slice(0, 20) : undefined
      };
      store.submissions.push(newSub);
      saveStore(store);
    }

    res.json(store);
  });

  // Clear all anonymous submissions (from Admin Chart page)
  app.delete('/api/quiz/submissions', (_req, res) => {
    const store = loadStore();
    store.submissions = [];
    saveStore(store);
    res.json(store);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const endpoints = getNetworkEndpoints(PORT);
    console.log('====================================================');
    console.log('Quiz Escolar — Portal Host VPN & Universal Iniciado!');
    console.log(`➜ Localhost:        http://localhost:${PORT}`);
    endpoints.forEach((ep) => {
      console.log(`➜ ${ep.providerLabel}: ${ep.url}`);
    });
    if (process.env.APP_URL) {
      console.log(`➜ Internet Global:  ${process.env.APP_URL}`);
    }
    console.log('====================================================');
  });
}

startServer();
