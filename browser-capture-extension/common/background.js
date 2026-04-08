(function(){
  'use strict';

  try {
    if (typeof importScripts === 'function') importScripts('config.js');
  } catch (_e) {}

  var config = globalThis.AQ_CAPTURE_CONFIG || {};

  function runtimeApi() {
    return (typeof browser !== 'undefined' && browser.runtime)
      ? browser.runtime
      : (typeof chrome !== 'undefined' ? chrome.runtime : null);
  }

  function bridgeUrl(path) {
    return String(config.bridgeBaseUrl || ('http://127.0.0.1:' + (config.port || 27183))) + path;
  }

  async function sendHello(reason) {
    var runtime = runtimeApi();
    var version = runtime && typeof runtime.getManifest === 'function'
      ? String((runtime.getManifest() || {}).version || '')
      : '';
    try {
      await fetch(bridgeUrl('/hello'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AQ-Token': String(config.token || '')
        },
        body: JSON.stringify({
          extensionVersion: version,
          protocolVersion: 1,
          browserFamily: String(config.browserFamily || ''),
          browserName: String(config.browserLabel || ''),
          reason: String(reason || ''),
          timestamp: Date.now()
        })
      });
    } catch (_e) {}
  }

  function markReady() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ aqCaptureReady: true, aqCaptureVersion: runtimeApi().getManifest().version || '' });
      }
    } catch (_e) {}
  }

  try {
    if (chrome && chrome.runtime && chrome.runtime.onInstalled) {
      chrome.runtime.onInstalled.addListener(function(){
        markReady();
        sendHello('installed');
      });
    }
  } catch (_e) {}

  try {
    if (chrome && chrome.runtime && chrome.runtime.onStartup) {
      chrome.runtime.onStartup.addListener(function(){
        markReady();
        sendHello('startup');
      });
    }
  } catch (_e) {}

  markReady();
  sendHello('background');
})();
