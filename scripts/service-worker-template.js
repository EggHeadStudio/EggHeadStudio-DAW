const CACHE_NAME = 'ehs-shell-__EHS_BUILD_VERSION__';
const BUILD_VERSION = '__EHS_BUILD_VERSION__';
const SHELL_URLS = __EHS_SHELL_URLS__;
const CLIENT_TIMEOUT_MS = 2500;
const CACHE_META_URL = './__ehs_cache_meta__';

function respond(port, message) {
  port?.postMessage(message);
  port?.close();
}

function appClients() {
  return self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(clients =>
    clients.filter(client => client.url.startsWith(self.registration.scope)));
}

function requestClient(client, type) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, CLIENT_TIMEOUT_MS);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data || null);
    };
    try {
      client.postMessage({type}, [channel.port2]);
    } catch {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(null);
    }
  });
}

async function inspectClients(clients, query) {
  return Promise.all(clients.map(async client => ({
    client,
    status: await requestClient(client, query)
  })));
}

async function cleanOldCachesWhenSafe() {
  const clients = await appClients();
  if (!clients.length) return;
  const reports = await inspectClients(clients, 'EHS_CLIENT_VERSION');
  if (reports.some(({status}) => status?.version !== BUILD_VERSION)) return;
  const current = await caches.open(CACHE_NAME);
  const currentMeta = await current.match(new URL(CACHE_META_URL, self.registration.scope));
  if (!currentMeta) return;
  const currentInstallTime = (await currentMeta.json()).installedAt;
  if (!Number.isFinite(currentInstallTime)) return;
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('ehs-shell-') && name !== CACHE_NAME)
    .map(async name => {
      const cache = await caches.open(name);
      const metadata = await cache.match(new URL(CACHE_META_URL, self.registration.scope));
      const installedAt = metadata ? (await metadata.json()).installedAt : 0;
      if (Number.isFinite(installedAt) && installedAt < currentInstallTime) await caches.delete(name);
    }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_URLS.map(path => new URL(path, self.registration.scope)));
      await cache.put(new URL(CACHE_META_URL, self.registration.scope), new Response(
        JSON.stringify({version: BUILD_VERSION, installedAt: Date.now()}),
        {headers: {'Content-Type': 'application/json'}}
      ));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.resolve());
});

self.addEventListener('message', event => {
  const message = event.data;
  if (message?.type === 'EHS_GET_BUILD_VERSION') {
    respond(event.ports[0], {version: BUILD_VERSION});
    return;
  }
  if (message?.type === 'EHS_CLIENT_HEARTBEAT') {
    event.waitUntil(cleanOldCachesWhenSafe().catch(error =>
      console.error('EggHeadStudio could not safely clean an old app cache.', error)));
    return;
  }
  if (message?.type !== 'EHS_ACTIVATE_IF_SAFE' || !event.source) return;

  event.waitUntil((async () => {
    try {
      const clients = await appClients();
      const reports = await inspectClients(clients, 'EHS_CHECK_UPDATE_SAFETY');
      const blockers = reports.flatMap(({status}) =>
        !status || !status.version || !Array.isArray(status.blockers) ?
          ['Another open tab could not confirm update safety. Close it or reload it online.'] :
          status.blockers);
      if (!reports.some(({client}) => client.id === event.source.id)) {
        blockers.push('The requesting application tab is no longer available.');
      }
      if (blockers.length) {
        respond(event.ports[0], {ok: false, blockers: [...new Set(blockers)]});
        return;
      }

      await self.skipWaiting();
      for (const {client} of reports) {
        client.postMessage({type: 'EHS_UPDATE_APPROVED', version: BUILD_VERSION});
      }
      respond(event.ports[0], {ok: true, version: BUILD_VERSION});
    } catch (error) {
      console.error('EggHeadStudio could not safely activate the update.', error);
      respond(event.ports[0], {
        ok: false,
        blockers: ['The update could not be activated. Your current version is still running.']
      });
    }
  })());
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await caches.open(CACHE_NAME).then(cache =>
        cache.match(new URL('./', self.registration.scope)));
      return shell || Response.error();
    }));
    return;
  }

  event.respondWith((async () => {
    const current = await caches.open(CACHE_NAME);
    const cached = await current.match(request);
    if (cached) return cached;

    const names = (await caches.keys()).filter(name =>
      name.startsWith('ehs-shell-') && name !== CACHE_NAME);
    for (const name of names) {
      const older = await caches.open(name);
      const retained = await older.match(request);
      if (retained) return retained;
    }
    return fetch(request);
  })());
});
