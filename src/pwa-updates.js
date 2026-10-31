const UPDATE_QUERY_TIMEOUT_MS = 5000;
const UPDATE_CONFIRM_TIMEOUT_MS = 20000;

function answer(port, value) {
  port?.postMessage(value);
  port?.close();
}

function currentSafety(getSafety) {
  try {
    const state = getSafety();
    return {
      version: document.querySelector('meta[name="ehs-build"]')?.content || null,
      blockers: Array.isArray(state) ? state : []
    };
  } catch (error) {
    console.error('Could not verify whether an EggHeadStudio update is safe.', error);
    return {version: null, blockers: ['This tab could not verify update safety.']};
  }
}

export function mountPwaUpdates({getSafety,queryTimeoutMs=UPDATE_QUERY_TIMEOUT_MS,confirmTimeoutMs=UPDATE_CONFIRM_TIMEOUT_MS}) {
  const build = document.querySelector('meta[name="ehs-build"]')?.content;
  if (!build || !('serviceWorker' in navigator)) return null;

  let registration = null;
  let approvedVersion = null;
  let reloadStarted = false;
  let updateRequested = false;
  let updateDismissed = false;
  let versionCheckPending = false;
  let versionCheckTimer = 0;
  let activationTimer = 0;
  let heartbeatInterval = 0;
  let updateInterval = 0;
  const notice = document.getElementById('pwaUpdateNotice');
  const message = notice?.querySelector('[data-pwa-update-message]');
  const updateButton = notice?.querySelector('[data-pwa-update-now]');
  const laterButton = notice?.querySelector('[data-pwa-update-later]');
  if (!notice || !message || !updateButton || !laterButton) {
    throw new Error('PWA update notification markup is missing.');
  }

  const showUpdate = () => {
    if (!registration?.waiting || updateDismissed || approvedVersion) return;
    message.textContent = 'A tested app update is ready.';
    notice.hidden = false;
    updateButton.hidden = false;
    updateButton.disabled = false;
    updateButton.textContent = 'Update now';
    laterButton.hidden = false;
    laterButton.textContent = 'Later';
  };
  const showInstallFailure = () => {
    message.textContent = 'The update could not be installed. Your current version is still available.';
    notice.hidden = false;
    updateButton.hidden = true;
    laterButton.hidden = false;
    laterButton.textContent = 'Dismiss';
  };
  const showActivationFailure = () => {
    approvedVersion = null;
    clearTimeout(activationTimer);clearTimeout(versionCheckTimer);
    message.textContent = 'The update could not be confirmed. Your current version is still available; you can retry or dismiss this notice.';
    notice.hidden = false;
    updateButton.hidden = !registration?.waiting;
    updateButton.disabled = !registration?.waiting;
    updateButton.textContent = 'Retry update';
    laterButton.hidden = false;
    laterButton.disabled = false;
    laterButton.textContent = 'Dismiss';
  };
  const report = () => currentSafety(getSafety);
  const heartbeat = () => navigator.serviceWorker.controller?.postMessage({
    type: 'EHS_CLIENT_HEARTBEAT',
    version: build
  });
  const reloadApprovedVersion = async () => {
    if (!approvedVersion || !registration?.active || reloadStarted || versionCheckPending) return;
    versionCheckPending = true;
    const channel = new MessageChannel();
    const response = new Promise(resolve => {
      const timeout = setTimeout(() => {
        channel.port1.close();
        resolve(null);
      }, queryTimeoutMs);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data?.version || null);
      };
    });
    try {
      registration.active.postMessage({type: 'EHS_GET_BUILD_VERSION'}, [channel.port2]);
      if (await response === approvedVersion && approvedVersion !== build) {
        clearTimeout(activationTimer);clearTimeout(versionCheckTimer);
        reloadStarted = true;
        notice.hidden = true;
        location.reload();
      }
    } catch (error) {
      console.error('Could not verify the activated EggHeadStudio version.', error);
    } finally {
      versionCheckPending = false;
      if (approvedVersion && !reloadStarted) {
        versionCheckTimer = setTimeout(reloadApprovedVersion, 300);
      }
    }
  };
  const startApprovedUpdate = version => {
    if (typeof version !== 'string' || !version) {
      showActivationFailure();
      return;
    }
    approvedVersion = version;
    message.textContent = 'Update approved. Confirming the new version…';
    updateButton.disabled = true;
    updateButton.textContent = 'Updating…';
    laterButton.disabled = true;
    clearTimeout(activationTimer);clearTimeout(versionCheckTimer);
    activationTimer = setTimeout(showActivationFailure, confirmTimeoutMs);
    reloadApprovedVersion();
  };

  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'EHS_UPDATE_APPROVED') {
      startApprovedUpdate(event.data.version);
      return;
    }
    if (!event.ports?.[0]) return;
    if (event.data?.type === 'EHS_CLIENT_VERSION') {
      answer(event.ports[0], {version: build});
    } else if (event.data?.type === 'EHS_CHECK_UPDATE_SAFETY') {
      answer(event.ports[0], report());
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', reloadApprovedVersion);

  laterButton.addEventListener('click', () => {
    updateDismissed = true;
    notice.hidden = true;
  });

  updateButton.addEventListener('click', async () => {
    if (!registration?.waiting || updateRequested) return;
    updateRequested = true;
    updateButton.disabled = true;
    updateButton.textContent = 'Checking open tabs…';
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      updateRequested = false;
      updateButton.disabled = false;
      updateButton.textContent = 'Update now';
      message.textContent = 'Could not confirm update safety. Your current version is still running.';
    }, UPDATE_QUERY_TIMEOUT_MS + 10000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      updateRequested = false;
      const result = event.data;
      if (!result?.ok) {
        updateButton.disabled = false;
        updateButton.textContent = 'Update now';
        message.textContent = `Update paused: ${[...new Set(result?.blockers || ['Update safety could not be verified.'])].join(' ')}`;
        return;
      }
      startApprovedUpdate(result.version);
    };
    try {
      registration.waiting.postMessage({type: 'EHS_ACTIVATE_IF_SAFE'}, [channel.port2]);
    } catch (error) {
      clearTimeout(timeout);
      channel.port1.close();
      updateRequested = false;
      updateButton.disabled = false;
      updateButton.textContent = 'Update now';
      message.textContent = `Update request failed: ${error.message}. Your current version is still running.`;
    }
  });

  const inspectRegistration = () => {
    if (registration?.waiting) showUpdate();
    const installing = registration?.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && registration.active) showUpdate();
      if (installing.state === 'activated') reloadApprovedVersion();
      if (installing.state === 'redundant' && !registration.waiting) {
        showInstallFailure();
      }
    });
  };

  navigator.serviceWorker.register(new URL('./service-worker.js', document.baseURI), {
    updateViaCache: 'none'
  }).then(value => {
    registration = value;
    inspectRegistration();
    registration.addEventListener('updatefound', inspectRegistration);
    heartbeat();
    heartbeatInterval = setInterval(heartbeat, 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updateDismissed = false;
        showUpdate();
        heartbeat();
        registration.update().catch(error =>
          console.warn('EggHeadStudio could not check for an update.', error));
      }
    });
    updateInterval = setInterval(() => {
      if (!document.hidden) registration.update().catch(error =>
        console.warn('EggHeadStudio could not check for an update.', error));
    }, 60 * 60 * 1000);
  }).catch(error => {
    console.error('EggHeadStudio offline shell registration failed:', error);
    showInstallFailure();
  });

  return {
    report,
    dispose(){
      clearInterval(heartbeatInterval);clearInterval(updateInterval);
      clearTimeout(versionCheckTimer);clearTimeout(activationTimer);
    }
  };
}
