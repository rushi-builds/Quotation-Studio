'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isWithin(basePath, filePath) {
  const relativePath = path.relative(basePath, filePath);
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
}

function sendError(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(`${message}\n`);
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendError(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    sendError(response, 400, 'Invalid URL');
    return;
  }

  let filePath = path.resolve(root, `.${pathname}`);
  if (!isWithin(root, filePath)) {
    sendError(response, 403, 'Forbidden');
    return;
  }

  try {
    const realRoot = await fs.promises.realpath(root);
    filePath = await fs.promises.realpath(filePath);
    if (!isWithin(root, filePath) || !isWithin(realRoot, filePath)) {
      sendError(response, 403, 'Forbidden');
      return;
    }

    let fileInfo = await fs.promises.stat(filePath);
    if (fileInfo.isDirectory()) {
      filePath = await fs.promises.realpath(path.join(filePath, 'index.html'));
      if (!isWithin(realRoot, filePath)) {
        sendError(response, 403, 'Forbidden');
        return;
      }
      fileInfo = await fs.promises.stat(filePath);
    }
    if (!fileInfo.isFile()) {
      sendError(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Length': fileInfo.size,
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      console.error(`Could not read ${filePath}: ${error.message}`);
      if (!response.headersSent) {
        sendError(response, 500, 'Could not read file');
      } else {
        response.destroy(error);
      }
    });
    stream.pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendError(response, 404, 'Not found');
      return;
    }
    console.error(`Could not serve ${pathname}: ${error.message}`);
    sendError(response, 500, 'Internal server error');
  }
});

const configuredPort = process.env.PORT;
const port = configuredPort ? Number(configuredPort) : 0;
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${configuredPort}`);
}

/* Loopback by default: this QA/preview server serves the working tree, so it
   must not listen on the LAN unless the operator explicitly asks for it. */
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  const address = server.address();
  console.log(`Quotation Studio preview: http://localhost:${address.port}/`);
});
