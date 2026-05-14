'use strict';

/**
 * Capture Queue Poller
 *
 * Wraps a recurring `processQueue` callback in:
 *   - timer-based polling (start/stop)
 *   - reentrancy guard (running flag) so overlapping ticks no-op
 *   - agent-mode bypass (when this process IS the capture agent, polling
 *     should not run inside the renderer host)
 *
 * Encapsulates two pieces of mutable state (timer, running) so main.js
 * doesn't carry them as module-level lets.
 *
 * Required deps:
 *   processQueue   — async ({reason}) => result; called on each tick
 *
 * Optional:
 *   isAgentMode    — when true, start() / processNow() return immediately
 *   intervalMs     — polling interval (default 2500ms)
 *   skippedResult  — value returned when reentrant or agent-mode
 *                    (default { ok: false, skipped: true })
 */
function createCaptureQueuePoller({
  processQueue,
  isAgentMode = false,
  intervalMs = 2500,
  skippedResult = { ok: false, skipped: true }
}) {
  if (typeof processQueue !== 'function') {
    throw new Error('createCaptureQueuePoller: processQueue required');
  }

  let timer = null;
  let running = false;

  async function processNow(reason = 'app-poll') {
    if (running || isAgentMode) return skippedResult;
    running = true;
    try {
      return await processQueue({ reason });
    } finally {
      running = false;
    }
  }

  function start() {
    stop();
    if (isAgentMode) return;
    timer = setInterval(() => {
      processNow('interval').catch(() => {});
    }, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    processNow,
    isRunning: () => running,
    isPolling: () => timer != null
  };
}

module.exports = { createCaptureQueuePoller };
