/*
	Sun Clock
	A 24-hour clock that shows sunrise, sunset, golden hour, and twilight times for your current location

	Geoff Pack, May 2022
	https://github.com/virtualgeoff/sunclock
*/

/* jshint esversion: 6 */
/* globals SunClock, SunCalendar */

// shortcuts
const $ = document.querySelector.bind(document);
const $All = document.querySelectorAll.bind(document);
const debug = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.search.includes('debug=1');
const version = '4.8.1';

if (debug) { console.info('version: ' + version); }

/*
	App handles navigation, routes, settings, dark mode, and date formatting
*/

const App = (function() {
	'use strict';

	let prefersDark   = window.matchMedia('(prefers-color-scheme: dark)');
	let supportsHover = window.matchMedia('(hover: hover)').matches;
	let isPortrait    = window.matchMedia('(orientation:portrait)').matches;
	let isLandscape   = window.matchMedia('(orientation:landscape)').matches;
	let lastSection   = '';

	// app settings - single source of truth for defaults and current values
	let settings = {
		showMoon           : true,
		showPlanets        : true,
		showConstellations : true,
		showHourNumbers    : true,
		showOddHourNumbers : false,
		showHourMarks      : true,
		showMinuteHand     : true,
		showMinuteMarks    : true,
		showMinuteNumbers  : true,
		showSecondHand     : true,
		sweepHand          : true,
		hour12             : false,
		setDirectionManually : false,
		direction          : 1,         // 1 = clockwise, -1 = anticlockwise
		setLocationManually : false,
		location           : null,      // { latitude, longitude }
		colorScheme        : 'dynamic'  // 'light' | 'dark' | 'auto' | 'dynamic'
	};

	const geoOptions = {enableHighAccuracy: true, timeout: 5000, maximumAge: 0};
	const geoErrors = ['', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT'];


	/* --- full screen --- */

	function toggleFullscreen(e) {
		// toggle fullscreen mode
		e.preventDefault();
		var d = document, dE = d.documentElement;

		if (d.fullscreenElement || d.webkitFullscreenElement) {
			if (d.exitFullscreen) {
				d.exitFullscreen();
			} else if (d.webkitCancelFullScreen) {
				d.webkitCancelFullScreen();
			}
			// change icon
			setTimeout(() => { $('#fullscreen .enter').style.display = 'block'; }, 600);
			setTimeout(() => { $('#fullscreen .exit').style.display  = 'none'; },  600);
		} else {
			if (dE.requestFullscreen) {
				dE.requestFullscreen();
			} else if (dE.webkitRequestFullScreen) {
				dE.webkitRequestFullScreen();
			}
			// change icon
			setTimeout(() => { $('#fullscreen .enter').style.display = 'none'; },  600);
			setTimeout(() => { $('#fullscreen .exit').style.display  = 'block'; }, 600);
		}
	}

	function fullscreenAvailable() {
		// check if fullscreen mode is available (iPhone does not support fullscreen)
		var dE = document.documentElement;
		if (dE.requestFullscreen || dE.webkitRequestFullScreen) {
			return true;
		}
		return false;
	}


	/* --- resize --- */

	function handleResize(e) {
		// on resizing (esp. orientation change), make sure #info1 is visible
		// otherwise if you go from portrait to landscape (on touch devices) with #info2 visible then #info1 stays hidden
		// n.b. Screen.orientation does not work in Safari < 16.4
		$('#info1').style.display = 'block';
		//$('#info2').style.display = 'none';
	}


	/* --- dark mode --- */

	function isDarkModeEnabled() {
		return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	function setDark(e) {
		// set dark mode based on OS settings
		if (settings.colorScheme === 'auto') {
			document.documentElement.setAttribute("data-theme", ((e.matches) ? 'dark' : 'light'));
		}
	}

	function updateColorScheme() {
		if (debug) { console.log('updateColorScheme: ' + settings.colorScheme); }
		SunClock.clearDynamicTheme(); // clear in case previously set

		if (settings.colorScheme === 'auto') {
			// set based on OS settings
			setDark({matches: prefersDark.matches});
		} else if (settings.colorScheme === 'dynamic') {
			SunClock.updateDynamicTheme();
		} else {
			document.documentElement.setAttribute("data-theme", settings.colorScheme);
		}
	}


	/* --- navigation --- */

	function showSection(e) {
		// hide all sections, show one
		let hash = window.location.hash;
		if (debug) { console.log('section: ' + hash, e); }
		$All('section').forEach( section => { section.style.display = 'none'; });

		// show section, and clock or calendar
        if (hash) {
			if (hash === '#calendar') {
				$('#clock').style.display = 'none';
				$('#calendar').style.display = 'block';
				$('#nav1 a[title="Clock"]').style.display = 'inline';
				$('#nav1 a[title="Calendar"]').style.display = 'none';
			} else {
         		if ($(hash)) { $(hash).style.display = 'block'; }
			}
        } else {
			$('#clock').style.display = 'block';
			$('#calendar').style.display = 'none';
			$('#nav1 a[title="Clock"]').style.display = 'none';
			$('#nav1 a[title="Calendar"]').style.display = 'inline';
        }

        // save lastSection, unless user came to page via direct link to a section
        if (e && e.type === 'hashchange') { lastSection = hash; }
	}

	function closeSection(e) {
		// use back instead of #link when closing section overlays
		// unless user came to page via direct link to a section
		if (debug) { console.log(e); }
		if (lastSection) {
			if (e) { e.preventDefault(); }
			history.back();
		}
	}

	function showInfo(str) {
		// show info2 + hide info1 if portrait
		if (isPortrait) { $('#info1').style.display = 'none'; }
		$('#info2').style.display = 'block';
		$('#info2').innerHTML = str + '\n<p class="done"><a href="#">ok</a></p>';
		$('p.done').onclick = (e) => { e.preventDefault(); hideInfo(); };
	}

	function hideInfo() {
		// hide info2 + show info1 if portrait
		if (isPortrait) { $('#info1').style.display = 'block'; }
		$('#info2').style.display = 'none';
		$('#info2').innerHTML = '';
	}

	function showInfoOnHover(object, func, arg) {
		// add hover or click events to a dom object
		if (supportsHover) {
			object.onmouseover = (e) => { e.stopPropagation(); showInfo( func(arg) ); }
			object.onmouseout  = () => hideInfo();
		} else {
			object.onclick = (e) => { e.stopPropagation(); showInfo( func(arg) ); }
		}
	}

	function decodeURL(anchor) {
		// decodes data in data-address attribute of an anchor tag — used to obfuscate mailto link
		// if email addresses are present in the HTML Cloudflare will obfuscate them itself and add its own decoder
		let input = anchor.dataset.address.replace(/\s+/g, ',').split(',');
		let output = '';

		for (let i=0; i<input.length; i++) {
			output += String.fromCodePoint(parseInt(input[i],16));
		}
		anchor.href = output;
	}


	/* --- local storage --- */

	function storageAvailable(type) {
		// check if localStorage is both supported and available
		// source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
		let storage;
		try {
			storage = window[type];
			const x = "__storage_test__";
			storage.setItem(x, x);
			storage.removeItem(x);
			return true;
		} catch (e) {
			return (
				e instanceof DOMException &&
				// everything except Firefox
				(e.code === 22 ||
					// Firefox
					e.code === 1014 ||
					// test name field too, because code might not be present
					// everything except Firefox
					e.name === "QuotaExceededError" ||
					// Firefox
					e.name === "NS_ERROR_DOM_QUOTA_REACHED") &&
				// acknowledge QuotaExceededError only if there's something already stored
				storage &&
				storage.length !== 0
			);
		}
	}

	function setItem(itemName, value) {
		// save item to browser local storage
		if (storageAvailable('localStorage')) {
			localStorage.setItem(itemName, value);
		}
	}

	function getItem(itemName) {
		// get item from browser local storage
		if (storageAvailable('localStorage')) {
			return JSON.parse(localStorage.getItem(itemName));
		}
	}


	/* --- options (settings) --- */

	function syncFormFromSettings() {
		$('input[name="showMoon"]').checked           = settings.showMoon;
		$('input[name="showPlanets"]').checked        = settings.showPlanets;
		$('input[name="showConstellations"]').checked = settings.showConstellations;
		$All('#nav1 a[data-setting]').forEach(a => {
			let on = !!settings[a.dataset.setting];
			a.classList.toggle('off', !on);
			a.setAttribute('aria-pressed', on);
		});
		$('input[name="showHourNumbers"]').checked    = settings.showHourNumbers;
		$('input[name="showOddHourNumbers"]').checked = settings.showOddHourNumbers;
		$('input[name="showHourMarks"]').checked      = settings.showHourMarks;
		$('input[name="showMinuteHand"]').checked     = settings.showMinuteHand;
		$('input[name="showMinuteMarks"]').checked    = settings.showMinuteMarks;
		$('input[name="showMinuteNumbers"]').checked  = settings.showMinuteNumbers;
		$('input[name="showSecondHand"]').checked     = settings.showSecondHand;
		$('input[name="sweepHand"]').checked          = settings.sweepHand;
		$('input[name="hour12"]').checked             = settings.hour12;
		$('input[name="setDirectionManually"]').checked = settings.setDirectionManually;
		$('#direction_cw').checked                    = (settings.direction > 0);
		$('#direction_ccw').checked                   = (settings.direction < 0);
		$('input[name="setLocationManually"]').checked = settings.setLocationManually;
		if (settings.location) {
			$('input[name="latitude"]').value  = settings.location.latitude;
			$('input[name="longitude"]').value = settings.location.longitude;
		}
		$('#scheme_light').checked   = (settings.colorScheme === 'light');
		$('#scheme_dark').checked    = (settings.colorScheme === 'dark');
		$('#scheme_auto').checked    = (settings.colorScheme === 'auto');
		$('#scheme_dynamic').checked = (settings.colorScheme === 'dynamic');

		$('#setDirection').style.display = settings.setDirectionManually ? 'block' : 'none';
		$('#setLocation').style.display  = settings.setLocationManually ? 'block' : 'none';
	}

	function applySettingsToDOM() {
		// Clock display visibility
		$('#moonHand').style.display       = settings.showMoon ? 'block' : 'none';
		$('#planetHands').style.display    = settings.showPlanets ? 'block' : 'none';
		$('#skyMap').style.display         = settings.showConstellations ? 'block' : 'none';
		$('#hourNumbers').style.display    = settings.showHourNumbers ? 'block' : 'none';
		$('#hourMarks2').setAttribute('transform', settings.showHourNumbers ? 'rotate(0)' : 'rotate(15)');

		$('#hourNumbers').classList.toggle('showOdd', settings.showOddHourNumbers);
		$('#hourMarks2').style.display = (settings.showHourMarks && !settings.showOddHourNumbers) ? 'block' : 'none';

		$('#hourMarks').style.display    = settings.showHourMarks ? 'block' : 'none';
		$('#minuteHand').style.display   = settings.showMinuteHand ? 'block' : 'none';
		$('#minuteMarks').style.display  = settings.showMinuteMarks ? 'block' : 'none';
		$('#minuteNumbers').style.display = settings.showMinuteNumbers ? 'block' : 'none';
		$('#secondHand').style.display   = settings.showSecondHand ? 'block' : 'none';

		// SunClock methods (requires SunClock.init to have run)
		if (typeof SunClock !== 'undefined' && SunClock.writeMainTimes) {
			SunClock.writeMainTimes();
			SunClock.drawNumbers();
			SunClock.updateDirection();
		}

		updateColorScheme();
	}

	function loadOptions() {
		if (!storageAvailable('localStorage')) {
			$('#settingsForm').insertAdjacentHTML('beforebegin', '<p class="error"><strong>Storage not available: settings can not be&nbsp;saved!</strong></p>');
			return;
		}

		// Overwrite settings from localStorage where values exist
		const keys = Object.keys(settings);
		for (const key of keys) {
			const stored = getItem(key);
			if (stored !== null) {
				settings[key] = stored;
			}
		}

		syncFormFromSettings();
		applySettingsToDOM();
	}

	function setOption(e) {
		const input = e.target;
		let key = input.name;
		let value = input.checked;

		if (input.type === 'radio') {
			key = (input.name === 'setDirection') ? 'direction' : (input.name === 'setColorScheme') ? 'colorScheme' : input.name;
			value = (input.name === 'setDirection') ? (input.value === 'clockwise' ? 1 : -1) : input.value;
		}

		if (debug) { console.log(key, value); }

		// Update settings
		if (settings.hasOwnProperty(key)) {
			settings[key] = value;
		} else {
			if (debug) { console.error('Unknown option: ' + key); }
			return;
		}

		// Save (stringify colorScheme and location for JSON round-trip)
		if (key === 'colorScheme' || key === 'location') {
			setItem(key, JSON.stringify(settings[key]));
		} else {
			setItem(key, settings[key]);
		}

		// Special handling for setLocationManually: when unchecked, fetch location from geolocation
		if (key === 'setLocationManually' && !value) {
			getLocation();
		}

		// Special handling for setDirectionManually: when unchecked, derive direction from latitude
		if (key === 'setDirectionManually' && !value) {
			if (settings.location && settings.location.latitude !== undefined) {
				settings.direction = (settings.location.latitude >= 0) ? 1 : -1;
			} else {
				settings.direction = 1;
			}
			setItem('direction', settings.direction);
		}

		// Special handling for setLocationManually: when checked, show current location
		if (key === 'setLocationManually' && value && settings.location) {
			syncFormFromSettings();
			showLocation({ coords: settings.location });
		}

		syncFormFromSettings();
		applySettingsToDOM();
	}


	/* --- location --- */

	function updateLocation(form) {
		// handle location form submit
		const lat = parseFloat(form.latitude.value);
		const lng = parseFloat(form.longitude.value);

		if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			alert('Please enter valid coordinates. Latitude: -90 to 90. Longitude: -180 to 180.');
			return false;
		}

		settings.location = { latitude: lat, longitude: lng };
		setItem('location', JSON.stringify(settings.location));
		showLocation({ coords: settings.location });
		closeSection();
		return false;
	}

	function getLocation() {
		// get location from localStorage or Geolocation API
		if (settings.setLocationManually) {
			showLocation({ coords: settings.location });
		} else if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(showLocation, showLocationError, geoOptions);
		} else {
			showLocationError({message: 'Geolocation is not supported. Please set location manually.'});
		}
	}

	function showLocation(position) {
		// show location then get times
		let location = position.coords;
		settings.location = location;
		if (debug) { console.log(location); }

		if (location) {
			$('#location').innerHTML = `Location:
				${Math.abs(location.latitude.toFixed(3))}°${(location.latitude >=0) ? 'N' : 'S'},
				${Math.abs(location.longitude.toFixed(3))}°${(location.longitude >=0) ? 'E' : 'W'}`;
				//<br><small>(Accuracy: ${location.accuracy} m)</small>`;

			// if setDirectionManually option is not set (or false), choose direction based on latitude
			if (!settings.setDirectionManually) {
				settings.direction = (location.latitude >= 0) ? 1 : -1;
				setItem('direction', settings.direction); // save direction for next time - to prevent jump when geolocation loads
				SunClock.updateDirection();
			}

			// get times for this location
			SunClock.getSunTimes();
			// localise calendar
			SunCalendar.localiseFace();
		} else {
			$('#location').innerHTML = 'Location not set';
			clearLocation();
		}
	}

	function showLocationError(err) {
		if (debug) { console.error(err); }
		$('#location').innerHTML = `Location error: ${err.message || geoErrors[err.code]}`;
		clearLocation();
	}

	function clearLocation() {
		// clear previous (e.g. if going from location to no location)
		settings.location = null;
		$('#mainTimes').innerHTML = '';
		$('#info2').innerHTML = '';
		$('#allTimes table tbody').innerHTML = '';

		// update times from clock
		SunClock.clearSunTimes();
		// localise calendar to northern default (no location)
		SunCalendar.localiseFace();
	}


	/* --- date and time formatting --- */

	function zeroPad(num, n) {
		// zero pad number
		return num.toString().padStart(n, '0');
	}

	function formatDateUTC(d) {
		// format date in UTC (ISO-8601)
		if (d == 'Invalid Date') { return 'Does not occur'; }

		//return d.toISOString(); // overly precise — construct myself
		let date = new Date( Math.round(d/60000) * 60000 ); // round to nearest minute
		let yyyy = date.getUTCFullYear();
		let mm   = zeroPad(date.getUTCMonth()+1, 2);
		let dd   = zeroPad(date.getUTCDate(), 2);
		let HH   = zeroPad(date.getUTCHours(), 2);
		let MM   = zeroPad(date.getUTCMinutes(), 2);
		return `${yyyy}-${mm}-${dd}<span>T</span>${HH}:${MM}Z`;
	}

	function formatAllTimes(d) {
		// shows time + timezone
		// if time is yesterday or tomorrow, also show the date (in compact form)
		if (d == 'Invalid Date') { return 'Does not occur'; }

		let now  = new Date();
		let date = new Date( Math.round(d/60000) * 60000 ); // round to nearest minute
		let yyyy = date.getUTCFullYear();
		let mm   = zeroPad(date.getMonth()+1, 2);
		let dd   = zeroPad(date.getDate(), 2);

		let timeOptions = {
			hour: "numeric",
			minute: "numeric",
			timeZoneName: "short",
			//hour12: settings.hour12, // hour12 is broken in Chrome (12:00 shows as 0:00), so:
			hourCycle: (settings.hour12) ? 'h12' : 'h23'
		};

		if (date.getDate() === now.getDate()) {
			return date.toLocaleTimeString([], timeOptions);
		}
		return `${yyyy}-${mm}-${dd}<br>${date.toLocaleTimeString([], timeOptions)}`;
	}

	function formatDate(d) {
		// format date in local time
		if (d == 'Invalid Date') { return 'Does not occur'; }

		let date = new Date( Math.round(d/60000) * 60000 ); // round to nearest minute
		let dateOptions = {
			dateStyle: 'full',
		};
		let timeOptions = {
			hour: "numeric",
			minute: "numeric",
			timeZoneName: "short",
			//hour12: settings.hour12, // hour12 is broken in Chrome (12:00 shows as 0:00), so:
			hourCycle: (settings.hour12) ? 'h12' : 'h23'
		};
		return `${new Intl.DateTimeFormat(undefined, dateOptions).format(date)}<br>
			${new Intl.DateTimeFormat(undefined, timeOptions).format(date)}`;
	}

	function formatTime(t) {
		// local time, in 12 or 24 hour format, rounded to nearest minute
		if (t == 'Invalid Date') { return 'Does not occur'; }

		let time = new Date( Math.round(t/60000) * 60000 ); // round to nearest minute
		let timeOptions = {
			hour: "numeric",
			minute: "numeric",
			//hour12: settings.hour12, // hour12 is broken in Chrome (12:00 shows as 0:00), so:
			hourCycle: (settings.hour12) ? 'h12' : 'h23'
		};
		//return t.toLocaleTimeString(); // hh:mm:ss
		return time.toLocaleTimeString([], timeOptions);
	}


	/* --- initialise --- */

	function init() {
		// load settings from localStorage
		loadOptions();

		// initialise the clock and calendar
		SunClock.init();
		SunCalendar.init();

		// re-apply settings now that SunClock is initialised (ensures writeMainTimes, drawNumbers, updateDirection run)
		applySettingsToDOM();

		// make overlays, handle section links
		$All('section').forEach(item => { item.classList.add('overlay'); }); // visible if JS disabled
		$All('a.close').forEach(link => { link.addEventListener('click', closeSection); }); // handle close links
		window.addEventListener('hashchange', showSection); // listen to hashchange events
		if (window.location.hash) { showSection(); } // open section if initial URL has a hash

		// note links
		$All('#note1, #note2, #note3').forEach(link => { link.classList.add('hide'); });
		$('a[href="#note1"]').onclick = (e) => { e.preventDefault(); $('#note1').classList.toggle('hide'); };
		$('a[href="#note2"]').onclick = (e) => { e.preventDefault(); $('#note2').classList.toggle('hide'); $('#note3').classList.add('hide'); };
		$('a[href="#note3"]').onclick = (e) => { e.preventDefault(); $('#note3').classList.toggle('hide'); $('#note2').classList.add('hide'); };

		// show fullscreen link
		if (fullscreenAvailable()) { $('#fullscreen').style.display = 'inline'; }
		$('#fullscreen').addEventListener('click', toggleFullscreen);

		// decode email URL
		$All('a[data-address]').forEach( (a) => { decodeURL(a); });

		// handle resize events
		window.addEventListener('resize', handleResize);

		// clock-face layer toggles in the top-left nav
		$All('#nav1 a[data-setting]').forEach(a => {
			a.addEventListener('click', (e) => {
				e.preventDefault();
				let key = a.dataset.setting;
				settings[key] = !settings[key];
				setItem(key, settings[key]);
				syncFormFromSettings();
				applySettingsToDOM();
			});
		});

		// handle form input onchange events
		$All('#settingsForm input:not([type="number"])').forEach(input => { input.addEventListener('change', setOption); });

		// listen for color scheme change
		prefersDark.addEventListener("change", e => { setDark(e); });

		// finally, get location (so geolocation prompt doesn't block)
		getLocation();
	}

	return {
		supportsHover,
		settings,
		isDarkModeEnabled,
		toggleFullscreen,
		showInfo,
		hideInfo,
		showInfoOnHover,
		formatDateUTC,
		formatAllTimes,
		formatDate,
		formatTime,
		setOption,
		updateLocation,
		init
	};
})();

window.addEventListener('DOMContentLoaded', App.init);



/*
	Service worker for PWA
*/

if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register('worker.js?v=' + version) 
	.then(registration => {
		if (debug) { console.log('Service Worker registered:', registration); }
	})
	.catch(error => {
		if (debug) { console.error('Service Worker registration failed:', error); }
	});
} else {
	if (debug) { console.error("Service workers are not supported"); }
}
