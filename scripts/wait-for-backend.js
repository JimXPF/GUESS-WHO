/**
 * 等待后端 /api/health 就绪后再启动 Vite，避免 ECONNREFUSED 代理报错。
 */
const http = require('http');

const url = process.env.BACKEND_HEALTH_URL || 'http://127.0.0.1:3001/api/health';
const maxAttempts = Number(process.env.BACKEND_WAIT_ATTEMPTS || 90);
const intervalMs = Number(process.env.BACKEND_WAIT_INTERVAL_MS || 500);

function probe() {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  process.stdout.write(`Waiting for backend at ${url} (up to ${maxAttempts} checks)...\n`);
  for (let i = 1; i <= maxAttempts; i += 1) {
    if (await probe()) {
      process.stdout.write(`Backend ready after ${i} attempt(s).\n`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  process.stderr.write(
    `Backend not ready after ${maxAttempts} attempts at ${url}. ` +
      `If cargo is still compiling, wait for it to finish and start again.\n`,
  );
  process.exit(1);
})();
