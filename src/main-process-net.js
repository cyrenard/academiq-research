const https = require('https');
const http = require('http');
const dns = require('dns');
const zlib = require('zlib');
const net = require('net');

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

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

function isPrivateIPv4(address) {
  const parts = String(address || '').split('.').map(v => Number(v));
  if (parts.length !== 4 || parts.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  if (parts[0] >= 224) return true;
  return false;
}

function isPrivateIPv6(address) {
  const value = String(address || '').toLowerCase();
  if (!value) return false;
  if (value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('fe80:')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) return isPrivateIPv4(mapped);
  }
  return false;
}

function isPrivateAddress(address) {
  const family = net.isIP(String(address || ''));
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return false;
}

function isBlockedHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === 'localhost') return true;
  if (host.endsWith('.localhost')) return true;
  if (host === 'local') return true;
  if (host.endsWith('.local')) return true;
  if (host === '0.0.0.0') return true;
  if (host === '[::1]') return true;
  if (net.isIP(host)) return isPrivateAddress(host);
  return false;
}

function isAllowedHost(hostname, allowedHosts) {
  if (!Array.isArray(allowedHosts) || !allowedHosts.length) return true;
  const host = normalizeHost(hostname);
  return allowedHosts.some(rule => {
    if (!rule) return false;
    if (typeof rule === 'string') return host === normalizeHost(rule);
    if (rule instanceof RegExp) return rule.test(host);
    return false;
  });
}

function ensureAllowedURL(rawUrl, options = {}) {
  const value = String(rawUrl || '').trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_e) {
    throw new Error('Invalid URL');
  }

  const protocol = String(parsed.protocol || '').toLowerCase();
  const allowedProtocols = Array.isArray(options.allowedProtocols) && options.allowedProtocols.length
    ? options.allowedProtocols.map(p => String(p || '').toLowerCase())
    : ['https:', 'http:'];
  if (!allowedProtocols.includes(protocol)) {
    throw new Error('Blocked protocol: ' + protocol);
  }

  const host = normalizeHost(parsed.hostname || '');
  if (!host) throw new Error('Missing host');
  if (!isAllowedHost(host, options.allowedHosts || null)) {
    throw new Error('Blocked host: ' + host);
  }
  if (options.blockPrivate && isBlockedHostname(host)) {
    throw new Error('Blocked private host');
  }

  return parsed;
}

function buildLookup(options = {}) {
  if (!options.blockPrivate) return options.lookup || lookupWithFallback;
  return function guardedLookup(hostname, lookupOptions, callback) {
    if (isBlockedHostname(hostname)) {
      callback(new Error('Blocked private host'));
      return;
    }
    lookupWithFallback(hostname, lookupOptions, (err, address, family) => {
      if (err) return callback(err);
      if (isPrivateAddress(address)) return callback(new Error('Blocked private address'));
      callback(null, address, family || 4);
    });
  };
}

function followRedirects(url, maxRedirects = 5, options = {}) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    let parsed;
    try {
      parsed = ensureAllowedURL(url, options);
    } catch (e) {
      reject(e);
      return;
    }
    const maxBytes = Math.max(64 * 1024, Math.min(Number(options.maxBytes) || (35 * 1024 * 1024), 200 * 1024 * 1024));
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(parsed.href, {
      headers: options.headers || {
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'application/pdf,*/*'
      },
      timeout: options.timeout || 30000,
      lookup: buildLookup(options)
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect without location'));
        const next = loc.startsWith('http') ? loc : new URL(loc, parsed.href).href;
        followRedirects(next, maxRedirects - 1, options).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      let total = 0;
      let aborted = false;
      function abortWith(error) {
        if (aborted) return;
        aborted = true;
        try { req.destroy(error); } catch (_e) {}
        try { res.destroy(error); } catch (_e) {}
        reject(error);
      }
      res.on('data', chunk => {
        chunks.push(chunk);
        total += chunk.length;
        if (total > maxBytes) abortWith(new Error('Response exceeds maximum size'));
      });
      res.on('end', () => {
        if (aborted) return;
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
            finalUrl: parsed.href,
            statusCode: res.statusCode,
            headers: res.headers || {}
          });
          return;
        }
        resolve(buffer);
      });
      res.on('error', (err) => {
        if (aborted) return;
        reject(err);
      });
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = ensureAllowedURL(url, options);
    } catch (e) {
      reject(e);
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(parsed.href, {
      headers: options.headers || {
        'User-Agent': 'AcademiQ-Updater/1.0',
        'Accept': 'application/json'
      },
      timeout: options.timeout || 15000,
      lookup: buildLookup(options)
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        res.resume();
        if (loc) {
          const next = loc.startsWith('http') ? loc : new URL(loc, parsed.href).href;
          return fetchJSON(next, options).then(resolve).catch(reject);
        }
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
    });
    req.on('error', reject);
    req.on('timeout', () => {
      try { req.destroy(new Error('Timeout')); } catch (_e) {}
      reject(new Error('Timeout'));
    });
  });
}

function postFormJSON(url, formData = {}, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = ensureAllowedURL(url, options);
    } catch (e) {
      reject(e);
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const params = new URLSearchParams();
    if (formData && typeof formData === 'object') {
      Object.keys(formData).forEach((key) => {
        if (!key) return;
        const value = formData[key];
        if (value == null) return;
        params.append(String(key), String(value));
      });
    }
    const payload = params.toString();
    const req = mod.request(parsed.href, {
      method: 'POST',
      headers: Object.assign({
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }, options.headers || {}),
      timeout: options.timeout || 15000,
      lookup: buildLookup(options)
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        res.resume();
        if (loc) {
          const next = loc.startsWith('http') ? loc : new URL(loc, parsed.href).href;
          return postFormJSON(next, formData, options).then(resolve).catch(reject);
        }
        return reject(new Error('Redirect without location'));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const bodySample = String(data || '').slice(0, 200).replace(/\s+/g, ' ').trim();
          return reject(new Error('HTTP ' + res.statusCode + (bodySample ? (': ' + bodySample) : '')));
        }
        try {
          resolve(JSON.parse(data || '{}'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      try { req.destroy(new Error('Timeout')); } catch (_e) {}
      reject(new Error('Timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = {
  ensureAllowedURL,
  isPrivateAddress,
  isBlockedHostname,
  followRedirects,
  fetchJSON,
  postFormJSON
};
