/* jshint esversion: 6 */
/* globals self, caches */

const currentCache = '4.7.1';
const assets = [
	"/",
	"/index.html",
	"/styles/main.css",
	"/styles/colors.css",
	"/scripts/app.js",
	"/scripts/clock.js",
	"/scripts/calendar.js",
	"/libs/suncalc/suncalc.js",
	"/libs/astronomy/astronomy.browser.min.js"
];

// install event
self.addEventListener('install', event => {
	console.log('Service worker install event', event);

	// Cache assets
	event.waitUntil(
		caches.open(currentCache)
		.then(cache => {
			console.log('Caching assets');
			cache.addAll(assets);
		})
		.then(() => {
			// Skip waiting to activate the new service worker immediately
			return self.skipWaiting();
		})
	);
});

// activate event
self.addEventListener('activate', event => {
	console.log('Service worker activate event', event);

	// Delete old caches
	event.waitUntil(
		caches.keys().then(cacheNames => {
			return Promise.all(
				cacheNames.map(cacheName => {
					if (cacheName !== currentCache) {
						console.log(`Deleting old cache: ${cacheName}`);
						return caches.delete(cacheName);  // Delete old caches
					}
				})
			);
		}).then(() => {
			// Take control of all clients immediately
			return self.clients.claim();
		})
	);
});

// fetch event: network first for HTML, then cache first for assets
self.addEventListener('fetch', event => {
	console.log(`Fetching: ${event.request.url}`);

	// Network-first for HTML
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then(response => {
					// Cache the new response if it's valid
					return caches.open(currentCache).then(cache => {
						cache.put(event.request, response.clone());
						return response;
					});
				})
				.catch(() => {
					// Fallback to cached HTML if network fails
					return caches.match('/index.html');
				})
		);
		return;
	}

	// Cache-first for assets (JS, CSS, images, etc.)
	event.respondWith(
		caches.match(event.request)
			.then(response => {
				if (response) {
					console.log(`Getting from cache: ${response.url}`);
					return response;
				}

				// If not in cache, fetch and cache it
				return fetch(event.request.clone()).then(response => {
					if (response.status < 400) {
						console.log(`Caching: ${response.url}`);
						caches.open(currentCache).then(cache => {
							cache.put(event.request, response.clone());
						});
					}
					return response;
				});
			})
			.catch((error) => {
				console.error('Error fetching:', error);
				throw error;
			})
	);
});
