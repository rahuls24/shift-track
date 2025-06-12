self.addEventListener('install', event => {
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
	event.respondWith(
		caches.open('shift-track-cache-v1').then(cache => {
			return cache.match(event.request).then(response => {
				const fetchPromise = fetch(event.request)
					.then(networkResponse => {
						if (
							event.request.method === 'GET' &&
							networkResponse.ok
						) {
							cache.put(event.request, networkResponse.clone());
						}
						return networkResponse;
					})
					.catch(() => response);
				return response || fetchPromise;
			});
		}),
	);
});
