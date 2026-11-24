// XPass HQ deliberately has no offline application shell. The dashboard needs
// live authentication and company data, so this worker removes an older
// cached shell that could otherwise keep a phone on obsolete sign-in code.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window' })
    await Promise.all((await self.caches.keys()).map(name => self.caches.delete(name)))
    await self.registration.unregister()
    for (const client of clients) client.navigate(client.url)
  })())
})
