const https = require('https');
const http = require('http');

function followRedirects(url, maxRedirects = 5, options = {}) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: options.headers || {
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'application/pdf,*/*'
      },
      timeout: options.timeout || 30000
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect without location'));
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        followRedirects(next, maxRedirects - 1, options).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, {
      headers: options.headers || {
        'User-Agent': 'AcademiQ-Updater/1.0',
        'Accept': 'application/json'
      },
      timeout: options.timeout || 15000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (loc) return fetchJSON(loc, options).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

module.exports = {
  followRedirects,
  fetchJSON
};
