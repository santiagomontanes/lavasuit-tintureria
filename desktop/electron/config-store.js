const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = Object.freeze({
  apiHost: 'localhost',
  apiPort: 3000,
  apiProtocol: 'http',
});

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function read() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      apiHost: typeof parsed.apiHost === 'string' && parsed.apiHost.trim() ? parsed.apiHost.trim() : DEFAULTS.apiHost,
      apiPort: Number.isFinite(parsed.apiPort) && parsed.apiPort > 0 ? Number(parsed.apiPort) : DEFAULTS.apiPort,
      apiProtocol: parsed.apiProtocol === 'https' ? 'https' : DEFAULTS.apiProtocol,
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function write(next) {
  const sanitized = {
    apiHost: typeof next.apiHost === 'string' && next.apiHost.trim() ? next.apiHost.trim() : DEFAULTS.apiHost,
    apiPort: Number.isFinite(Number(next.apiPort)) && Number(next.apiPort) > 0 ? Number(next.apiPort) : DEFAULTS.apiPort,
    apiProtocol: next.apiProtocol === 'https' ? 'https' : DEFAULTS.apiProtocol,
  };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(sanitized, null, 2), 'utf-8');
  return sanitized;
}

function baseUrl(cfg) {
  return `${cfg.apiProtocol}://${cfg.apiHost}:${cfg.apiPort}`;
}

module.exports = { read, write, configPath, baseUrl, DEFAULTS };
