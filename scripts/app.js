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
const debug = true;


/*
	App handles navigation, routes, settings, dark mode, and date formatting
*/

var App = (function() {
	'use strict';

	let prefersDark   = window.matchMedia('(prefers-color-scheme: dark)');
	let supportsHover = window.matchMedia('(hover: hover)').matches;
	let isPortrait    = window.matchMedia('(orientation:portrait)').matches;
	let isLandscape   = window.matchMedia('(orientation:landscape)').matches;
	let lastSection   = '';

	// app settings - stored in localStorage
	let settings = {
		direction  : 1,         // 1 = clockwise, -1 = anticlockwise
    	location   : null,      // {"latitude":0,"longitude":0}
		hour12     : false,     // use 24 hr times
		colorScheme: 'dynamic'  // 'light' | 'dark' | 'auto' | 'dynamic'
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
		console.log(e);
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
			$('#nav1 a[title="Calendar"').style.display = 'inline';
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

	function loadOptions() {
		// load options from localStorage, and set checkboxes, etc. on page load
		if (!storageAvailable('localStorage')) {
			alert('Settings can not be loaded: using default settings');
			$('#settingsForm').insertAdjacentHTML('beforebegin', '<p style="color:#d00"><strong>Storage not available: settings can not be saved!</strong></p>');
			return;
		}
		if (getItem('showMoon') === false) {
			$('input[name="showMoon"]').checked = false;
			$('#moonHand').style.display = 'none';
		}
		if (getItem('showHourNumbers') === false) {
			$('input[name="showHourNumbers"]').checked = false;
			$('#hourNumbers').style.display = 'none';
			// if hour numbers are hidden, make the even hour marks the longer ones (rotate long marks 15° = 1 hr)
			$('#hourMarks2').setAttribute('transform', 'rotate(15)');
		}
		if (getItem('showOddHourNumbers') === true) {
			$('input[name="showOddHourNumbers"]').checked = true;
			$('#hourNumbers').classList.add('showOdd');
			$('#hourMarks2').style.display = 'none';
		}
		if (getItem('showHourMarks') === false) {
			$('input[name="showHourMarks"]').checked = false;
			$('#hourMarks').style.display = 'none';
			$('#hourMarks2').style.display = 'none';
		}
		if (getItem('showMinuteHand') === false) {
			$('input[name="showMinuteHand"]').checked = false;
			$('#minuteHand').style.display = 'none';
		}
		if (getItem('showMinuteNumbers') === false) {
			$('input[name="showMinuteNumbers"]').checked = false;
			$('#minuteNumbers').style.display = 'none';
		}
		if (getItem('showMinuteMarks') === false) {
			$('input[name="showMinuteMarks"]').checked = false;
			$('#minuteMarks').style.display = 'none';
		}
		if (getItem('showSecondHand') === false) {
			$('input[name="showSecondHand"]').checked = false;
			$('#secondHand').style.display = 'none';
		}
		if (getItem('hour12') === true) {
			$('input[name="hour12"]').checked = true;
			settings.hour12 = true;
		}

		// direction
		if (getItem('setDirectionManually') === true) {
			$('input[name="setDirectionManually"]').checked = true;
			$('#setDirection').style.display = 'block';
		}
		if (getItem('direction') !== null) {
			settings.direction = getItem('direction');
			$('#direction_cw').checked  = (settings.direction > 0) ? true : false;
			$('#direction_ccw').checked = (settings.direction > 0) ? false : true;
		}

		// location
		if (getItem('setLocationManually') === true) {
			$('input[name="setLocationManually"]').checked = true;
			$('#setLocation').style.display = 'block';
		}
		if (getItem('location') !== null) {
			settings.location = getItem('location');
			$('input[name="latitude"]').value  = settings.location.latitude;
			$('input[name="longitude"]').value = settings.location.longitude;
		}

		// color scheme
		if (getItem('colorScheme') !== null) {
			settings.colorScheme = getItem('colorScheme');
			$('#scheme_light').checked   = (settings.colorScheme === 'light') ? true : false;
			$('#scheme_dark').checked    = (settings.colorScheme === 'dark')  ? true : false;
			$('#scheme_auto').checked    = (settings.colorScheme === 'auto')  ? true : false;
			$('#scheme_dynamic').checked = (settings.colorScheme === 'dynamic') ? true : false;
			updateColorScheme();
		}
	}

	function setOption(checkbox) {
		// handle options checkboxes and radio buttons
		if (debug) { console.log(checkbox.name, checkbox.checked); }
		switch (checkbox.name) {
		  case 'showMoon':
			$('#moonHand').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showHourNumbers':
			$('#hourNumbers').style.display = (checkbox.checked) ? 'block' : 'none';
			// if hour numbers are hidden, make the even hour marks the longer ones (rotate long marks 15° = 1 hr)
			$('#hourMarks2').setAttribute('transform', ((checkbox.checked) ? 'rotate(0)' : 'rotate(15)'));
			break;
		  case 'showOddHourNumbers':
			$('#hourNumbers').classList.toggle('showOdd');
			$('#hourMarks2').style.display = (checkbox.checked) ? 'none' : 'block';
			break;
		  case 'showHourMarks':
			$('#hourMarks').style.display = (checkbox.checked) ? 'block' : 'none';
			let oddHours = $('input[name="showOddHourNumbers"]');
			$('#hourMarks2').style.display = (checkbox.checked && !oddHours.checked) ? 'block' : 'none';
			break;
		  case 'showMinuteHand':
			$('#minuteHand').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showMinuteNumbers':
			$('#minuteNumbers').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showMinuteMarks':
			$('#minuteMarks').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showSecondHand':
			$('#secondHand').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'hour12':
			settings.hour12 = checkbox.checked;
			SunClock.writeMainTimes(); // rewrite the main times (the info2 times update when shown)
			SunClock.drawNumbers();    // redraw the numbers on the clock face
			break;

		  case 'setDirectionManually':
			$('#setDirection').style.display = (checkbox.checked) ? 'block' : 'none';
			if (checkbox.checked) {
				// was unchecked, now checked - set radio buttons to current direction, and save direction
				$('#direction_cw').checked  = (settings.direction > 0) ? true : false;
				$('#direction_ccw').checked = (settings.direction > 0) ? false : true;
				setItem('direction', settings.direction);
			} else {
				// was checked, now unchecked - update direction
				if (settings.location && settings.location.latitude) {
					settings.direction = (settings.location.latitude >= 0) ? 1 : -1;
				} else {
					settings.direction = 1;
				}
				setItem('direction', settings.direction);
				SunClock.updateDirection();
			}
			break;
		  case 'setDirection':
		    // note: radio buttons have name="setDirection" but the *setting* is 'direction';
			settings.direction = (checkbox.value === 'clockwise') ? 1 : -1;
			setItem('direction', settings.direction);
			SunClock.updateDirection();
			break;

		  case 'setLocationManually':
			$('#setLocation').style.display = (checkbox.checked) ? 'block' : 'none';
			if (checkbox.checked) {
				// was unchecked, now checked - show location
				settings.location = getItem('location');
				if (settings.location) {
					// in case text fields have been modified or cleared:
					$('input[name=latitude]').value  = settings.location.latitude;
					$('input[name=longitude]').value = settings.location.longitude;
				}
				showLocation({coords: settings.location});
			} else {
				// was checked, now unchecked - need to get location again
				setItem(event.target.name, checkbox.checked); // need to save *before* getLocation
				getLocation();
			}
			break;

		  case 'setColorScheme':
		    // note: radio buttons have name="setColorScheme" but the *setting* is 'colorScheme';
			settings.colorScheme = checkbox.value;
			setItem('colorScheme', JSON.stringify(settings.colorScheme));
			updateColorScheme();
			break;

		  default:
			alert('wot?');
		}
		setItem(checkbox.name, checkbox.checked);
	}


	/* --- location --- */

	function updateLocation(form) {
		// handle location form submit
		console.log(`updating location to ${form.latitude.value}, ${form.longitude.value}`);
		// parseFloat returns a number or NaN
		// TODO: check values are valid, or use default values (should be handled by input type/min/max)
		settings.location = {latitude:parseFloat(form.latitude.value), longitude:parseFloat(form.longitude.value)};
		setItem('location', JSON.stringify(settings.location));
		showLocation({coords: settings.location});
		closeSection(); // close settings on location submit
		return false;
	}

	function getLocation() {
		// get location from localStorage or Geolocation API
		if (getItem('setLocationManually') === true) {
			showLocation({coords: settings.location});
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
			if (getItem('setDirectionManually') !== true) {
				settings.direction = (location.latitude >= 0) ? 1 : -1;
				setItem('direction', settings.direction); // save direction for next time - to prevent jump when geolocation loads
				SunClock.updateDirection();
			}

			// get times for this location
			SunClock.getSunTimes();
			// update calendar face to reflect latidude
			SunCalendar.drawFace();
		} else {
			$('#location').innerHTML = 'Location not set';
			clearLocation();
		}
	}

	function showLocationError(err) {
		console.error(err);
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
	navigator.serviceWorker.register("worker.js").then(
		(registration) => {
			console.log("Service worker registration successful");
		},
		(error) => {
			console.error("Service worker registration failed:", error);
		}
	);
} else {
	console.error("Service workers are not supported");
}


