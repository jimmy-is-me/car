const CACHE='car-manager-v1.0.0';
const ASSETS=['./','./index.html','./styles.css','./app.js','./core.js','./store.js','./sync.js','./privacy.html','./manifest.webmanifest','./assets/favicon.ico','./assets/favicon-48x48.png','./assets/apple-touch-icon.png','./assets/android-chrome-192x192.png','./assets/android-chrome-512x512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('car-manager-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // Never cache Google APIs, OAuth tokens, user records or other origins.
  if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return response;}).catch(async()=>await caches.match(e.request)||(e.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
