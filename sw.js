// 甜品连连看 Service Worker v3：离线缓存 + 新版本提示（与 index.html 放在同一目录）
const CACHE = 'sweet-link-v3';
const ASSETS = ['./', './index.html', './sw.js'];
let updateReady = false;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function notifyUpdate() {
  updateReady = true;
  self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'update-ready' })));
}

// 页面启动几秒后会 ping 一下，防止错过通知
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'ping' && updateReady && e.source) e.source.postMessage({ type: 'update-ready' });
});

// 缓存优先（秒开、可离线）+ 后台检查更新；页面有变化时通知页面显示“新版本”按钮
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    // 统一用去掉 ?参数 的地址做缓存键，避免同一页面存出多份旧副本
    const u = new URL(req.url); u.search = ''; const key = u.href;
    const cached = await cache.match(key);
    // 先读出旧页面内容（cached 交给页面后就不能再读了）
    const oldTextP = cached && req.mode === 'navigate' ? cached.clone().text() : null;
    // 导航请求不能直接带参数重发，改用 URL 新建请求，并绕过 HTTP 缓存做校验
    const netReq = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req;
    const net = fetch(netReq).then(async res => {
      if (res && res.ok) {
        const toCache = res.clone();
        if (oldTextP) {
          const [oldText, newText] = await Promise.all([oldTextP, res.clone().text()]);
          await cache.put(key, toCache);
          if (oldText !== newText) notifyUpdate();
        } else {
          await cache.put(key, toCache);
        }
      }
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || (await cache.match('./'));
    return new Response('', { status: 504 });
  }));
});
