// REV02: remove cache persistente da POC REV00; não intercepta solicitações.
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('sgfp-poc-')).map(k=>caches.delete(k)));await self.clients.claim();})());});
