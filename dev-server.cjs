/**
 * dev-server.cjs
 * Single entry-point: starts the Express API then spawns the Vite dev server.
 * Run with:  npm run dev
 */
'use strict';

const { spawn } = require('child_process');
const path      = require('path');

// ── 1. Boot Express API (same process) ──────────────────────────────────────
require('./api/index.js');
console.log('[dev] Express API starting on http://localhost:5000');

// ── 2. Spawn Vite dev server ─────────────────────────────────────────────────
const vite = spawn('npx', ['vite'], {
    stdio : 'inherit',
    shell : true,              // shell:true resolves npx.cmd on Windows
    cwd   : path.resolve(__dirname)
});

vite.on('close', code => {
    console.log(`[dev] Vite exited with code ${code}`);
    process.exit(code ?? 0);
});

// Clean up Vite when this process is killed
['SIGINT', 'SIGTERM'].forEach(sig => {
    process.on(sig, () => {
        vite.kill(sig);
        process.exit(0);
    });
});
