const https = require('https');
const http = require('http');
const dns = require('dns');
const zlib = require('zlib');

try {
  // Fallback resolvers for environments where local DNS intermittently fails.
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch (_e) {}

function lookupWithFallback(hostname, options, callback) {
  const opts = typeof options === 'object' && options ? options : { family: 0 };
  dns.lookup(hostname, opts, (err, address, family) => {
    if (!err && address) return callback(null, address, family || 4);
    dns.resolve4(hostname, (err4, addrs4) => {
      if (!err4 && Array.isArray(addrs4) && addrs4.length) return callback(null, addrs4[0], 4);
      dns.resolve6(hostname, (err6, addrs6) => {
        if (!err6 && Array.isArray(addrs6) && addrs6.length) return callback(null, addrs6[0], 6);
        callback(err || err4 || err6 || new Error('DNS lookup failed'));
      });
    });
  });
}

function followRedirects(url, maxRedirects = 5, options = {}) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: options.headers || {
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'application/pdf,*/*'
      },
      timeout: options.timeout || 30000,
      lookup: options.lookup || lookupWithFallback
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
      res.on('end', () => {
        let buffer = Buffer.concat(chunks);
        try {
          const enc = String((res.headers && res.headers['content-encoding']) || '').toLowerCase();
          if (enc.includes('gzip')) buffer = zlib.gunzipSync(buffer);
          else if (enc.includes('deflate')) buffer = zlib.inflateSync(buffer);
          else if (enc.includes('br') && typeof zlib.brotliDecompressSync === 'function') {
            buffer = zlib.brotliDecompressSync(buffer);
          }
        } catch (_e) {}
        if (options.returnMeta) {
          resolve({
            buffer,
            finalUrl: url,
            statusCode: res.statusCode,
            headers: res.headers || {}
          });
          return;
        }
        resolve(buffer);
      });
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
      timeout: options.timeout || 15000,
      lookup: options.lookup || lookupWithFallback
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        res.resume();
        if (loc) return fetchJSON(loc, options).then(resolve).catch(reject);
        return reject(new Error('Redirect without location'));
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
