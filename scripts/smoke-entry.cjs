// Test-only entry point. Production always starts src/main/main.cjs directly.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.ISASZEG_SMOKE_HOME;
if (!root) throw new Error('ISASZEG_SMOKE_HOME is required for the test harness.');
for (const name of ['profile', 'documents']) fs.mkdirSync(path.join(root, name), { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
app.setPath('documents', path.join(root, 'documents'));
require('../src/main/main.cjs');
