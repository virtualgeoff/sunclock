/* jshint esversion: 6 */
/* globals self, caches */

const currentCache = 'v4';
const assets = [
	"/",
	"/index.html",
	"/styles/main.css",
	"/styles/colors.css",
	"/scripts/app.js",
	"/scripts/clock.js",
	"/scripts/calendar.js",
	"/libs/suncalc/suncalc.js",
	"/libs/astronomy/astronomy.browser.js"
];

// install event
self.addEventListener('install', event => {
	console.log('Service worker install event', event);

	// cache assets
	event.waitUntil(
		caches.open(currentCache)
		.then(cache => {
			console.log('Caching assets');
			cache.addAll(assets);
		})
	);

});

// activate event
self.addEventListener('activate', event => {
	console.log('Service worker activate event', event);

	// delete old caches
	event.waitUntil(
		caches.keys()
		.then(cacheNames => {
			cacheNames.forEach(cacheName => {
				if (cacheName !== currentCache) {
					return caches.delete(cacheName);
				}
			});
		})
	);
});

// fetch event: cache first, then network
// see: https://developer.mozilla.org/en-US/docs/Web/API/Cache#examples
self.addEventListener('fetch', (event) => {
	console.log(`Fetching: ${event.request.url}`);

	event.respondWith(
		caches.open(currentCache)
		.then(cache => {
			return cache
				.match(event.request)
				.then(response => {
					if (response) {
						console.log(`Getting from cache: ${response.url}`);
						return response;
					}

					return fetch(event.request.clone()).then((response) => {
						if (response.status < 400) {
							console.log(`Response: ${response.status} ${response.statusText}, Caching: ${response.url}`);
							cache.put(event.request, response.clone());
						} else {
							console.log(`Response: ${response.status} ${response.statusText}, Not caching: ${event.request.url}`);
						}
						return response;
					});
				})
				.catch((error) => {
					console.error("Error fetching:", error);
					throw error;
				});
		})
	);
});
