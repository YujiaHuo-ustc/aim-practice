const { spawn } = require('node:child_process');
const http = require('node:http');

const vite = spawn('npx', ['vite', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  shell: true
});

const serverUrl = 'http://127.0.0.1:5173';
const startedAt = Date.now();

function waitForVite() {
  http
    .get(serverUrl, (res) => {
      res.resume();
      launchElectron();
    })
    .on('error', () => {
      if (Date.now() - startedAt > 30000) {
        console.error('Timed out waiting for Vite dev server.');
        vite.kill();
        process.exit(1);
      }
      setTimeout(waitForVite, 300);
    });
}

function launchElectron() {
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: serverUrl
    }
  });

  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});

waitForVite();
