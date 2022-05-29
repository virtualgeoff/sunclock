/*
	Sun Clock
	A 24-hour clock that shows sunrise, sunset, golden hour, and twilight times for your current location

	Geoff Pack, May 2022
	https://github.com/virtualgeoff/sunclock
*/

/* jshint esversion: 6 */
/* globals SunCalc */

// shortcuts
const $ = document.querySelector.bind(document);
const $All = document.querySelectorAll.bind(document);

var SunClock = (function() {
	'use strict';

	let now, then,
		hours, minutes, seconds,
		hourHand, minuteHand, secondHand, dateText,
		sunTimes, noonPosition, nadirPosition,
		radius,
		direction = -1, // 1 = clockwise, -1 = anticlockwise
		geoLocation = {latitude:0, longitude:167.5};

	const debug = true,
		testFlag = false,
		testDate = new Date('March 20, 2022 12:00:00'), 	// n.b. 2022 equinoxes and solstices: March 20, June 21, September 23, December 21
		geoOptions = {enableHighAccuracy: true, timeout: 5000, maximumAge: 0},
		//geoErrors = ['', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT'],
		periods = [
			// name:                        from:               to:                 color:
			['earlyMorning',                'nadir',            'nightEnd',         '#192029'],
			['astronomicalMorningTwilight', 'nightEnd',         'nauticalDawn',     '#213c66'],
			['nauticalMorningTwilight',     'nauticalDawn',     'dawn',             '#4574bc'],
			['civilMorningTwilight',        'dawn',             'sunrise',          '#88a6d4'],
			['sunrise',                     'sunrise',          'sunriseEnd',       '#ff9900'],
			['morningGoldenHour',           'sunriseEnd',       'goldenHourEnd',    '#ffe988'],
			['morning',                     'goldenHourEnd',    'solarNoon',        '#dceaff'],
			['afternoon',                   'solarNoon',        'goldenHour',       '#dceaff'],
			['eveningGoldenHour',           'goldenHour',       'sunsetStart',      '#ffe988'],
			['sunset',                      'sunsetStart',      'sunset',           '#ff9900'],
			['civilEveningTwilight',        'sunset',           'dusk',             '#88a6d4'],
			['nauticalEveningTwilight',     'dusk',             'nauticalDusk',     '#4574bc'],
			['astronomicalEveningTwilight', 'nauticalDusk',     'night',            '#213c66'],
			['lateEvening',                 'night',            'nadir',            '#192029']
		],
		textReplacements = {
			'nadir' : 'Midnight',
			'earlyMorning' : 'Early Morning',
			'nightEnd' : 'Astronomical Dawn',
			'astronomicalMorningTwilight' : 'Astronomical Morning Twilight',
			'nauticalDawn' : 'Nautical Dawn',
			'nauticalMorningTwilight' : 'Nautical Morning Twilight',
			'dawn' : 'Civil Dawn',
			'civilMorningTwilight' : 'Civil Morning Twilight',
			'sunrise' : 'Sunrise',
			'sunriseEnd' : 'End of Sunrise',
			'morningGoldenHour' : 'Morning Golden Hour',
			'goldenHourEnd' : 'End of Golden Hour',
			'morning' : 'Morning',
			'solarNoon' : ' Solar Noon',
			'afternoon' : 'Afternoon',
			'goldenHour' : 'Start of Golden Hour',
			'eveningGoldenHour' : 'Evening Golden Hour',
			'sunsetStart' : 'Beginning of Sunset',
			'sunset' : 'Sunset',
			'civilEveningTwilight' : 'Civil Evening Twilight',
			'dusk' : 'Civil Dusk',
			'nauticalEveningTwilight' : 'Nautical Evening Twilight',
			'nauticalDusk' : 'Nautical Dusk',
			'astronomicalEveningTwilight' : 'Astronomical Evening Twilight',
			'night' : 'Astronomical Dusk',
			'lateEvening' : 'Late Evening'
		};

	function getLocation() {
		if (testFlag) {
			now = testDate;
			showLocation({coords: geoLocation});
		} else if (getItem('manualLocation') === true) {
			showLocation({coords: geoLocation});
		} else if (navigator.geolocation) {
			// see: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
			navigator.geolocation.getCurrentPosition(showLocation, showLocationError, geoOptions);
		} else {
			$('#location').innerHTML = 'Geolocation is not supported by this browser. Please set location manually.';
		}
	}

	function showLocation(position) {
		geoLocation = position.coords;
		$('#location').innerHTML = `Location:
			${Math.abs(geoLocation.latitude.toFixed(3))}° ${(geoLocation.latitude >=0) ? 'N' : 'S'},
			${Math.abs(geoLocation.longitude.toFixed(3))}° ${(geoLocation.longitude >=0) ? 'E' : 'W'}`;
			//<br><small>(Accuracy: ${geoLocation.accuracy} m)</small>`;
		getSunTimes();
	}

	function showLocationError(err) {
		console.error(err);
		$('#location').innerHTML = `Location error: ${err.message}`;
	}

	function toDegrees(angle) {
		// convert radians to degrees
		return (angle / (2 * Math.PI) * 360);
	}

	function getAngleFromTime(date) {
		// get angle on clock from time
		return ((date.getHours() + date.getMinutes()/60 + date.getSeconds()/3600) / 24 * 2 * Math.PI); // radians
	}

	function getPointFromTime(date) {
		// get point on clock perimeter from time
		var angle = getAngleFromTime(date),
			x = Math.sin(angle) * radius * -direction,
			y = Math.cos(angle) * radius;

		return (x + "," + y); // return as string to paste straight into svg path attribute
	}

	function getSunTimes() {
		// get times from suncalc.js
		sunTimes = SunCalc.getTimes(now, geoLocation.latitude, geoLocation.longitude, 0);
		noonPosition = SunCalc.getPosition(sunTimes.solarNoon, geoLocation.latitude, geoLocation.longitude);
		nadirPosition = SunCalc.getPosition(sunTimes.nadir, geoLocation.latitude, geoLocation.longitude);

		if (debug) { console.log(sunTimes); }

		$('#times tbody').innerHTML = '';

		for (let i=0; i<periods.length; i++) {
			$('#times tbody').innerHTML += `
				<tr><td>${textReplacements[periods[i][1]]}</td>
				<td>${sunTimes[periods[i][1]].toLocaleTimeString()}</td></tr>`;
		}

		$('#times tbody').innerHTML += `
			<tr><td colspan="2"><br><b>Altitude of sun:</b></td></tr>
			<tr><td>at noon</td><td>${toDegrees(noonPosition.altitude).toFixed(2)}°</td></tr>
			<tr><td>at midnight</td><td>${toDegrees(nadirPosition.altitude).toFixed(2)}°</td></tr>
		`;

		drawTimeSegments();
	}

	function drawTimeSegments() {
		// draw time periods on clock face

		// clear any previous segments (i.e. if changing direction or setting location manually)
		while (periods.firstChild) {
			periods.removeChild(periods.firstChild);
		}

		// draw time periods
		for (let i=0; i<periods.length; i++) {
			let p = periods[i];
			let P1, P2, newPath;

			if (debug) { console.log(`${i}: ${p[0]}, ${p[1]}: ${Date.parse(sunTimes[p[1]])}, ${p[2]}: ${Date.parse(sunTimes[p[2]])} `); }

			// test if beginning and end times are valid
			if ( isNaN(Date.parse(sunTimes[p[1]])) && isNaN(Date.parse(sunTimes[p[2]])) ) {
				// both times are 'invalid' - period doesn't occur
				if (debug) { console.log(`${i}: skipping ${p[0]}`); }
				continue;
			} else {
				if ( isNaN(Date.parse(sunTimes[p[1]])) ) {
					// first time is invalid
					if ((i === 6) || (i === 13)){
						// skip morning and late evening 'filler' periods
						if (debug) { console.log(`${i}: skipping ${p[0]}`); }
						continue;
					}
					// use nadir (for morning periods) or noon (for evening periods) as start time instead
					p[1] = (i <= 6) ? 'nadir' : 'solarNoon';
				} else if ( isNaN(Date.parse(sunTimes[p[2]])) ) {
					// second time is invalid
					if ((i === 0) || (i === 7)){
						// skip early morning and afternoon 'filler' periods
						if (debug) { console.log(`${i}: skipping ${p[0]}`); }
						continue;
					}
					// use noon (for morning periods) or nadir (for evening periods) as end time instead
					p[2] = (i <= 6) ? 'solarNoon' : 'nadir';
				}

				if (debug) { console.log(`${i}: ${p[0]}, ${p[1]}, ${p[2]}`); }

				// draw the arc
				P1 = getPointFromTime(sunTimes[p[1]]);
				P2 = getPointFromTime(sunTimes[p[2]]);
				newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				newPath.setAttribute('id', p[0]);
				newPath.setAttribute('d',`M 0,0 L ${P1} A ${radius} ${radius} 0 0 ${(direction>0) ? 1 : 0} ${P2} z`); // sweep-flag depends on direction
				newPath.setAttribute('fill', p[3]);
				$('#periods').appendChild(newPath);
				newPath.onmouseover = (event) => showInfo(event, p);
				newPath.onmouseout = hideInfo;
			}
		}

		// draw solar noon and midnight lines
		$('#midnight').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.nadir)}`);
		$('#noon').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.solarNoon)}`);
	}

	function showInfo(event, period) {
		// display data on mouseover of time segments
		if (debug) { console.info(event); }
		$('#info').innerHTML = `
			<p>${textReplacements[period[0]]}:<br>
			from: ${sunTimes[period[1]].toLocaleTimeString()} (${textReplacements[period[1]]})<br>
			to:   ${sunTimes[period[2]].toLocaleTimeString()} (${textReplacements[period[2]]})</p>`;
	}

	function hideInfo() {
		$('#info').innerHTML = '';
	}

	function drawMarks(parent, n, length) {
		var m;

		for (let i=0; i<=(n-1); i++) {
			m = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			m.setAttribute('x1', 0);
			m.setAttribute('y1', 0);
			m.setAttribute('x2', 0);
			m.setAttribute('y2', length);
			m.setAttribute('transform', `rotate(${i * (360/n)}) translate(0,${radius})`);
			$(parent).appendChild(m);
		}
	}

	function drawNumbers(parent, n, offset, startAtTop) {
		var m, angle,
			p = $(parent),
			h = parseInt(p.getAttribute('font-size')),
			angleOffset = startAtTop ? 180 : 0;

		// clear any previous numbers (e.g. if changing direction)
		while (p.firstChild) {
			p.removeChild(p.firstChild);
		}

		// create new numbers
		for (let i=0; i<=(n-1); i++) {
			m = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			m.setAttribute('x', 0);
			m.setAttribute('y', 0);
			angle = ((i * direction * (360/n) + angleOffset + 360) % 360); // 0 <= angle < 360
			m.setAttribute('transform', `rotate(${angle}) translate(0,${radius + offset})`);

			if ((angle >= 90) && (angle <= 270)) {
				m.innerHTML = `<text x="0" y="0" transform="rotate(180)">${i}</text>`;
			} else {
				m.innerHTML = `<text x="0" y="${(h*0.75)}" transform="rotate(0)">${i}</text>`;
			}
			p.appendChild(m);
		}
	}

	function tick() {
		now = new Date();
		seconds = now.getSeconds() + (now.getMilliseconds())/1000;
		minutes = now.getMinutes() + seconds/60;
		hours   = now.getHours()   + minutes/60;

		// refresh the sunrise/sunset times at midnight
		if (then && (now.getDate() !== then.getDate())) {
			getSunTimes();
		}

		secondHand.setAttribute('transform', 'rotate(' + (seconds * direction * 6) + ')'); //  6° per second
		minuteHand.setAttribute('transform', 'rotate(' + (minutes * direction * 6) + ')'); //  6° per minute
		hourHand.setAttribute('transform',   'rotate(' + (hours  * direction * 15) + ')'); // 15° per hour
		dateText.innerHTML = `${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${now.toLocaleTimeString()}`;

		then = now;
		// TODO: if not showing seconds hand, then don't need to update so often
		window.requestAnimationFrame(tick);
	}

	function setItem(itemName, value) {
		// TODO: test if localStorage available and warn user?
		localStorage.setItem(itemName, value);
	}

	function getItem(itemName) {
		// TODO: test if localStorage available and warn user?
		return JSON.parse(localStorage.getItem(itemName));
	}

	function setOption(checkbox) {
		// handle options checkboxes
		switch (checkbox.name) {
		  case 'antiClockwise':
			direction = (checkbox.checked) ? -1 : 1;
			drawNumbers('#hourNumbers', 24, 9, false);
			drawNumbers('#minuteNumbers', 60, -8, true);
			drawTimeSegments();
			break;
		  case 'showMinuteHand':
			minuteHand.style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showMinuteNumbers':
			$('#minuteNumbers').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showMinuteMarks':
			$('#minuteMarks').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showSecondHand':
			secondHand.style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'manualLocation':
			$('#locationForm').style.display = (checkbox.checked) ? 'block' : 'none';
			setItem(event.target.name, checkbox.checked); // need to save *before* getLocation
			if (!checkbox.checked) { getLocation(); } // if it was checked and is now unchecked, need to get location again
			break;
		  default:
			alert('wot?');
		}
		setItem(checkbox.name, checkbox.checked);
	}

	function updateLocation(form) {
		// handle location form submit
		console.log(`updating geolocation to ${form.latitude.value}, ${form.longitude.value}`);
		geoLocation = {latitude:parseFloat(form.latitude.value), longitude:parseFloat(form.longitude.value)};
		showLocation({coords: geoLocation});
		setItem('location', JSON.stringify(geoLocation));
		return false;
	}

	function loadOptions() {
		// load options from localStorage, and set checkboxes, etc.
		if (getItem('antiClockwise') === false) {
			$('input[name="antiClockwise"]').checked = false;
			direction = 1;
			drawNumbers('#hourNumbers', 24, 9, false);
			drawNumbers('#minuteNumbers', 60, -8, true);
		}
		if (getItem('showMinuteHand') === false) {
			$('input[name="showMinuteHand"]').checked = false;
			minuteHand.style.display = 'none';
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
			secondHand.style.display = 'none';
		}
		if (getItem('manualLocation') === true) {
			$('input[name="manualLocation"]').checked = true;
			$('#locationForm').style.display = 'block';
			if (getItem('location') !== null) { geoLocation = getItem('location'); }
			$('input[name="latitude"]').value  = geoLocation.latitude || 0;
			$('input[name="longitude"]').value = geoLocation.longitude || 0;
		}
		if (getItem('location') !== null) {
			// fill in anyway, even if currently hidden
			$('input[name="latitude"]').value  = getItem('location').latitude || 0;
			$('input[name="longitude"]').value = getItem('location').longitude || 0;
		}
	}

	function init() {
		hourHand   = $('#hourHand');
		minuteHand = $('#minuteHand');
		secondHand = $('#secondHand');
		dateText   = $('#date');

		// draw clock
		radius = parseInt($('#clockFace').getAttribute('r'));
		drawMarks('#hourMarks', 24, 3);
		drawMarks('#quarterMarks', 4, 4);
		drawMarks('#minuteMarks', 60, -2);
		drawNumbers('#hourNumbers', 24, 9, false);
		drawNumbers('#minuteNumbers', 60, -8, true);

		// start clock
		loadOptions();
		tick();
		getLocation();

		// handle navigation links
		$All('#about, #settings').forEach(item => { item.classList.add('overlay'); }); // visible if JS disabled
		$All('#menu a').forEach(link => {
			link.addEventListener('click', function(e){
				$(link.hash).style.display = 'block';
				e.preventDefault();
			});
		});
		$All('a.close').forEach(link => {
			link.addEventListener('click', function(e){
				//history.back();
				link.parentNode.parentNode.style.display = 'none';
				e.preventDefault();
			});
		});
	}

	window.addEventListener('load', init);

	return {
		setOption: setOption,
		updateLocation: updateLocation
	};
})();
