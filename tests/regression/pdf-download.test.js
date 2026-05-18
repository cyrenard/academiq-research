const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

function startServer() {
  const pdf = Buffer.from('%PDF-1.4\n% AcademiQ regression fixture\n');
  const large = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(256, 65)]);
  const server = http.createServer((req, res) => {
    if (req.url === '/direct.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.length });
      res.end(pdf);
      return;
    }
    if (req.url === '/article') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><head><meta name="citation_pdf_url" content="/oa.pdf"></head><body>paper</body></html>');
      return;
    }
    if (req.url === '/oa.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(pdf);
      return;
    }
    if (req.url === '/large.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': large.length });
      res.end(large);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('missing');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('pdf_download Rust helper handles direct PDF, HTML fallback, errors and maxBytes', async () => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const output = await new Promise((resolve) => {
      const child = spawn(
      'cargo',
      ['test', 'pdf::url_fallback::tests::pdf_download_node_mock_server_probe', '--', '--nocapture'],
      {
        cwd: path.join(rootDir, 'src-tauri'),
        env: { ...process.env, AQ_TEST_PDF_DOWNLOAD_BASE: base }
      }
      );
      let text = '';
      child.stdout.on('data', (chunk) => { text += chunk; });
      child.stderr.on('data', (chunk) => { text += chunk; });
      child.on('close', (code) => resolve({ code, text }));
    });
    assert.equal(output.code, 0, output.text);
    assert.match(output.text, /pdf_download_node_mock_server_probe \.\.\. ok/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
