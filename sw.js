const OFFLINE_PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>101 COFFEE</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#536849;color:#f7e0c0;font:700 18px system-ui;text-align:center;padding:24px;box-sizing:border-box}main{max-width:28rem}</style>
<main><h1>101 COFFEE</h1><p>لا يوجد اتصال بالإنترنت حالياً. أعد المحاولة عند عودة الاتصال.</p></main>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Network-first by design: Firebase data, prices, products, bookings and auth
// are never written to Cache Storage and always use the live network response.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })));
});
