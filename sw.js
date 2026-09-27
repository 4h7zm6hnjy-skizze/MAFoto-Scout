const CACHE='mafoto-scout-app-v2-1';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>{
    const network=fetch(event.request).then(resp=>{
      if(resp&&resp.ok)caches.open(CACHE).then(c=>c.put(event.request,resp.clone()));
      return resp;
    }).catch(()=>cached);
    return cached||network;
  }));
});
