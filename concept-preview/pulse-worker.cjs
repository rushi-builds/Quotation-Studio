'use strict';
// No provider adapters: this worker can only create isolated internal tasks/notices.
const fs = require('node:fs');
const Ops = require('./pulse-operations.js');
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const before = JSON.stringify(input.data);
  Ops.run(input.data, input.now || Date.now());
  process.stdout.write(JSON.stringify({ changed: JSON.stringify(input.data) !== before, data: input.data }));
} catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
