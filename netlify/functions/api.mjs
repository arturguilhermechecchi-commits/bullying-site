export async function handler(event) {
  const path = event.path || '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const host = event.headers['x-forwarded-host'] || event.headers.host || 'localhost:3000';
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  const clientIp =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for'] ||
    'netlify-edge';

  if (path.endsWith('/vpn-ping')) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'online',
        clientIp,
        timestamp: new Date().toISOString(),
        platform: 'github-netlify-firebase',
        port: 443
      })
    };
  }

  if (path.endsWith('/server-info')) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        localhostUrl: 'http://localhost:3000',
        networkUrls: [origin],
        vpnEndpoints: [],
        lanEndpoints: [],
        customVpnHost: origin,
        clientIp,
        publicAppUrl: origin,
        port: 443
      })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      questions: [],
      savedDefaultOptions: ['', '', ''],
      submissions: [],
      customVpnHost: origin
    })
  };
}
