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
const supportsHover = window.matchMedia('(hover: hover)').matches;

var SunClock = (function() {
	'use strict';

	let now, then, timerStartTime,
		hours, minutes, seconds,
		hourHand, minuteHand, secondHand, dateText,
		sunTimes, sunPosition, noonPosition, nadirPosition, sunAlwaysUp, sunAlwaysDown, periodsTemp,
		moonTimes, moonPosition, moonPhase, moonHand, moonIcon, moonPath,
		radius,
		direction = 1, // 1 = clockwise, -1 = anticlockwise
		location;      // {"latitude":0,"longitude":0}

	const debug = true,
		//testFlag = false,
		//testDate = new Date('March 20, 2022 12:00:00'), // n.b. 2022 equinoxes and solstices: March 20, June 21, September 23, December 21
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
		// get location from local Storage or Geolocation API
		if (getItem('setLocationManually') === true) {
			//location = getItem('location');
			showLocation({coords: location});
		} else if (navigator.geolocation) {
			// see: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
			navigator.geolocation.getCurrentPosition(showLocation, showLocationError, geoOptions);
		} else {
			showLocationError({message: 'Geolocation is not supported. Please set location manually.'});
		}
	}

	function showLocation(position) {
		// show location then get times
		location = position.coords;

		if (location) {
			$('#location').innerHTML = `Location:
				${Math.abs(location.latitude.toFixed(3))}°${(location.latitude >=0) ? 'N' : 'S'},
				${Math.abs(location.longitude.toFixed(3))}°${(location.longitude >=0) ? 'E' : 'W'}`;
				//<br><small>(Accuracy: ${location.accuracy} m)</small>`;

			// if setDirectionManually option is not set (or false), choose direction based on latitude
			if (getItem('setDirectionManually') !== true) {
				direction = (location.latitude >= 0) ? 1 : -1;
				setItem('direction', direction); // save direction for next time - to prevent jump when geolocation loads
				updateDirection();
			}

			// get times for this location
			getSunTimes();
		} else {
			clearTimePeriods();
			$('#location').innerHTML = 'Location not set';
		}
	}

	function showLocationError(err) {
		console.error(err);
		$('#location').innerHTML = `Location error: ${err.message}`;
	}

	function toDegrees(angle) {
		// convert radians to degrees
		return (angle / (2 * Math.PI) * 360);
	}

	function convertAzimuth(angle) {
		// convert azimuth to degrees clockwise from North. SunCalc returns radians clockwise from South
		return ((360 + 180 + toDegrees(angle)) % 360);
	}

	function getPointFromTime(date) {
		// get point on clock perimeter from time
		var angle = ((date.getHours() + date.getMinutes()/60 + date.getSeconds()/3600) / 24 * 2 * Math.PI); // radians
		return `${Math.sin(angle) * radius * -direction}, ${Math.cos(angle) * radius}`; // return as string for svg path attribute
	}

	function getSunTimes() {
		let event;
		let subset = ['sunrise', 'solarNoon', 'sunset']; // subset of times to show below location

		// get times from suncalc.js
		sunTimes = null;
		sunTimes = SunCalc.getTimes(now, location.latitude, location.longitude, 0);
		noonPosition = SunCalc.getPosition(sunTimes.solarNoon, location.latitude, location.longitude);
		nadirPosition = SunCalc.getPosition(sunTimes.nadir, location.latitude, location.longitude);
		sunAlwaysUp   = (toDegrees(nadirPosition.altitude) > -0.833) ? true : false; // sun does not set
		sunAlwaysDown = (toDegrees(noonPosition.altitude)  < -0.833) ? true : false; // sun does not rise

		if (debug) {
			console.log(sunTimes);
			console.log(`sunAlwaysUp: ${sunAlwaysUp}, sunAlwaysDown: ${sunAlwaysDown}`);
		}

		// write subset of times below date
		$('#times tbody').innerHTML = '';
		for (let i=0; i<subset.length; i++) {
			event = sunTimes[subset[i]].toLocaleTimeString();
			if (event == 'Invalid Date') { event = 'Does not occur'; }
			$('#times tbody').innerHTML += `<tr><td>${textReplacements[subset[i]]}</td><td>${event}</td></tr>`;
		}

		// draw time period arcs on clock face
		drawTimePeriods();
	}

	function clearTimePeriods() {
		// clear any previous arcs (i.e. if changing direction or setting location manually)
		let arcs = $('#arcs');
		while (arcs.firstChild) {
			arcs.removeChild(arcs.firstChild);
		}
	}

	function drawTimePeriods() {
		// draw time periods on clock face
		let p, t1, t2, point1, point2, path;

		// clear any previous arc
		clearTimePeriods();

		// make a deep copy of periods (so can modify 'from' and 'to', but keep original for next time);
		periodsTemp = JSON.parse(JSON.stringify(periods));

		// draw time periods
		for (let i=0; i<periodsTemp.length; i++) {
			p = periodsTemp[i];
			t1 = Date.parse(sunTimes[p[1]]);
			t2 = Date.parse(sunTimes[p[2]]);
			if (debug) { console.log(`${i}: ${p[0]}, ${p[1]}: ${t1}, ${p[2]}: ${t2} `); }

			// test if beginning and end times are valid
			if ( isNaN(t1) && isNaN(t2) ) {
				// both times are invalid - period doesn't occur
				continue;
			} else if ( isNaN(t1) ) {
				// beginning time is invalid, end time valid
				if ((i === 6) && !sunAlwaysUp) { continue; }    // morning
				if ((i === 13) && !sunAlwaysDown) { continue; } // lateEvening
				// use nadir (for morning periods) or noon (for evening periods) as t1 instead
				p[1] = (i <= 6) ? 'nadir' : 'solarNoon';
			} else if ( isNaN(t2) ) {
				// beginning time valid, end time invalid
				if ((i === 0) && !sunAlwaysDown) { continue; } // earlyMorning
				if ((i === 7) && !sunAlwaysUp) { continue; }   // afternoon
				// use noon (for morning periods) or nadir (for evening periods) as t2 instead
				p[2] = (i <= 6) ? 'solarNoon' : 'nadir';
			} else {
				// both times valid - yay!
			}

			// draw the arc
			point1 = getPointFromTime(sunTimes[p[1]]);
			point2 = getPointFromTime(sunTimes[p[2]]);
			path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('id', p[0]);
			path.setAttribute('fill', p[3]);
			path.setAttribute('cursor', 'crosshair');
			path.setAttribute('d',`M 0,0 L ${point1} A ${radius} ${radius} 0 0 ${(direction>0) ? 1 : 0} ${point2} z`); // sweep-flag depends on direction
			$('#arcs').appendChild(path);

			// add hover event to the arc
			addHoverEvent(path, showPeriodInfo, event, i);
		}

		// draw solar noon and midnight lines
		$('#midnight').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.nadir)}`);
		$('#noon').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.solarNoon)}`);

		// add hover event to hour hand
		addHoverEvent(hourHand, showSunInfo);

		// add hover event to moon hand
		addHoverEvent(moonHand, showMoonInfo);
	}

	function addHoverEvent(object, func, a, b) {
		// add hover or click event to a dom object
		if (supportsHover) {
			object.onmouseover = (e) => func(e, a, b);
			object.onmouseout = hideInfo;
		} else {
			object.onclick = (e) => func(e, a, b);
		}
	}

	function showPeriodInfo(e, event, i) {
		// show info for time periods
		let dir = (e.clientX <= window.innerWidth/2) ? 'left' : 'right';
		let p = periodsTemp[i];

		let str = `<h3>${textReplacements[p[0]]}</h3>
			<p>${textReplacements[p[1]]}<br>${sunTimes[p[1]].toLocaleTimeString()}</p>
			<p class="to">— to —</p>
			<p>${textReplacements[p[2]]}<br>${sunTimes[p[2]].toLocaleTimeString()}</p>
			<p class="done"><a href="#">ok</a></p>`;

		showInfo(str, dir);
	}

	function showSunInfo(e) {
		// show info for Sun
		let dir = (e.clientX <= window.innerWidth/2) ? 'left' : 'right';
		sunPosition = SunCalc.getPosition(now, location.latitude, location.longitude);

		let str = `<h3>Sun</h3>
			<p>Altitude: ${toDegrees(sunPosition.altitude).toFixed(2)}°<br>
			Azimuth:  ${convertAzimuth(sunPosition.azimuth).toFixed(2)}°</p>
			<p>Altitude at:<br>
			noon: ${toDegrees(noonPosition.altitude).toFixed(2)}°<br>
			midnight: ${toDegrees(nadirPosition.altitude).toFixed(2)}°</p>
			<p class="done"><a href="#">ok</a></p>`;

		showInfo(str, dir);
	}

	function getMoonPhaseName(phase) {
		// get name of moon phase
		const moons = [
			['New Moon',        '🌑'],
			['Waxing Crescent', '🌒'],
			['First Quarter',   '🌓'],
			['Waxing Gibbous',  '🌔'],
			['Full Moon',       '🌕'],
			['Waning Gibbous',  '🌖'],
			['Last Quarter',    '🌗'],
			['Waning Crescent', '🌘']
		];

		const d = 0.0167; // 1.67 % ~= 1/2 day per month ?
		let i = 0;

		// there's probably a really elegant way to do this, but...
		if ((phase > 0.0 + d) && (phase < 0.25 - d)) {
			i = 1;
		} else if ((phase >= 0.25 - d) && (phase <= 0.25 + d)) {
			i = 2;
		} else if ((phase > 0.25 + d) && (phase < 0.50 - d)) {
			i = 3;
		} else if ((phase >= 0.50 - d) && (phase <= 0.50 + d)) {
			i = 4;
		} else if ((phase > 0.50 + d) && (phase < 0.75 - d)) {
			i = 5;
		} else if ((phase >= 0.75 - d) && (phase <= 0.75 + d)) {
			i = 6;
		} else if ((phase > 0.75 + d) && (phase < 1.0 - d)) {
			i = 7;
		}
		return {'index':i, 'name':moons[i][0], 'icon':moons[i][1]};
	}

	function drawMoonIcon(phase) {
		// draw the moon icon (instead of using unicode characters)
		// get x radius and sweep direction for each half of the path
		let mr = 6; // moon radius
		let cosX = Math.cos( phase * 2 * Math.PI );
		let rx1 = (phase < 0.50) ? mr * cosX : mr;
		let rx2 = (phase < 0.50) ? mr : mr * -cosX;
		let sweep1 = (phase < 0.25) ? 0 : 1;
		let sweep2 = (phase < 0.75) ? 1 : 0;

		// draw a new path (2 elliptical arcs)
		moonPath.setAttribute('d', `M 0,${mr}
			A ${rx1} ${mr} 0 1 ${sweep1} 0,${-mr}
			A ${rx2} ${mr} 0 1 ${sweep2} 0,${mr} z`);
	}

	function showMoonInfo(e) {
		// show info for moon
		let dir = (e.clientX <= window.innerWidth/2) ? 'left' : 'right';
		moonTimes = SunCalc.getMoonTimes(now, location.latitude, location.longitude);
		moonPosition = SunCalc.getMoonPosition(now, location.latitude, location.longitude);
		moonPhase = SunCalc.getMoonIllumination(now).phase;
		//if (debug) { console.log(moonTimes, moonPosition); };

		let str = `<h3>Moon</h3>
			<p>${getMoonPhaseName(moonPhase).name} (${moonPhase.toFixed(2)})</p>`;

		if ((moonTimes.rise) || (moonTimes.set)) {
			str += '<p>';
			if (moonTimes.rise) { str += `Rises: ${moonTimes.rise.toLocaleTimeString()}<br>`; }
			if (moonTimes.set) {  str += `Sets:  ${moonTimes.set.toLocaleTimeString()}`; }
			str += '</p>';
		} else if (moonTimes.alwaysUp) {
			str += '<p>Moon is up all day</p>';
		} else if (moonTimes.alwaysDown) {
			str += '<p>Moon is down all day</p>';
		}
		str += `
			<p>Altitude: ${toDegrees(moonPosition.altitude).toFixed(2)}°<br>
			Azimuth:  ${convertAzimuth(moonPosition.azimuth).toFixed(2)}°</p>
			<p class="done"><a href="#">ok</a></p>`;

		showInfo(str, dir);
	}

	function showInfo(str, dir) {
		// show info panel/overlay
		$('#info').classList.remove('left','right'); // remove both before adding (hideInfo may not be called on touch devices before next showInfo)
		$('#info').classList.add(dir);
		$('#info').classList.remove('hide');
		$('#info').innerHTML = str;

		if (!supportsHover) {
			$('p.done').onclick = (e) => { e.preventDefault(); hideInfo(); };
		}
	}

	function hideInfo() {
		// hide info panel/overlay
		$('#info').classList.add('hide');
		$('#info').classList.remove('left','right');
		$('#info').innerHTML = '';
	}

	function drawMarks(parent, n, length) {
		// draw the number marks on the clock face
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

	function drawNumbers(parent, n, m, offset, startAtTop) {
		// draw the numbers on the clock face
		var g, angle,
			p = $(parent),
			h = parseInt(p.getAttribute('font-size')),
			angleOffset = startAtTop ? 180 : 0;

		// clear any previous numbers (e.g. if changing direction)
		while (p.firstChild) {
			p.removeChild(p.firstChild);
		}

		// create new numbers
		for (let i=0; i<=(n-1); i+=m) {
			g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			g.setAttribute('x', 0);
			g.setAttribute('y', 0);
			angle = ((i * direction * (360/n) + angleOffset + 360) % 360); // 0 <= angle < 360
			g.setAttribute('transform', `rotate(${angle}) translate(0,${radius + h * offset})`);

			if ((angle >= 90) && (angle <= 270)) {
				g.innerHTML = `<text x="0" y="0" transform="rotate(180)">${i}</text>`;
			} else {
				g.innerHTML = `<text x="0" y="${(h*0.75)}" transform="rotate(0)">${i}</text>`;
			}
			p.appendChild(g);
		}
	}

	function setItem(itemName, value) {
		// save item to browser local storage
		// TODO: test if localStorage available and warn user?
		localStorage.setItem(itemName, value);
	}

	function getItem(itemName) {
		// get item from browser local storage
		// TODO: test if localStorage available and warn user?
		return JSON.parse(localStorage.getItem(itemName));
	}

	function setOption(checkbox) {
		// handle options checkboxes (and radio buttons)
		switch (checkbox.name) {
		  case 'showMoon':
			moonHand.style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showHourNumbers':
			$('#hourNumbers').style.display = (checkbox.checked) ? 'block' : 'none';
			break;
		  case 'showHourMarks':
			$('#hourMarks').style.display = (checkbox.checked) ? 'block' : 'none';
			$('#quarterMarks').style.display = (checkbox.checked) ? 'block' : 'none';
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

		  case 'setDirectionManually':
			$('#setDirection').style.display = (checkbox.checked) ? 'block' : 'none';
			if (checkbox.checked) {
				// was unchecked, now checked - set radio buttons to current direction, and save direction
				$('#direction_cw').checked  = (direction > 0) ? true : false;
				$('#direction_ccw').checked = (direction > 0) ? false : true;
				setItem('direction', direction);
			} else {
				// was checked, now unchecked - update direction
				if (location && location.latitude) {
					direction = (location.latitude >= 0) ? 1 : -1;
				} else {
					direction = 1;
				}
				setItem('direction', direction);
				updateDirection();
			}
			break;
		  case 'setDirection':
			direction = (checkbox.value === 'clockwise') ? 1 : -1;
			setItem('direction', direction);
			updateDirection();
			break;

		  case 'setLocationManually':
			$('#setLocation').style.display = (checkbox.checked) ? 'block' : 'none';
			if (checkbox.checked) {
				// was unchecked, now checked - show location
				location = getItem('location');
				if (location) {
					// in case text fields have been modified or cleared:
					$('input[name=latitude]').value  = location.latitude;
					$('input[name=longitude]').value = location.longitude;
				}
				showLocation({coords: location});
			} else {
				// was checked, now unchecked - need to get location again
				setItem(event.target.name, checkbox.checked); // need to save *before* getLocation
				getLocation();
			}
			break;

		  default:
			alert('wot?');
		}
		setItem(checkbox.name, checkbox.checked);
	}

	function updateDirection() {
		// update direction after setOption or loadOptions
		// n.b. clock hands will update automatically on next animationFrame
		drawNumbers('#hourNumbers', 24, 1, 1, false);
		drawNumbers('#minuteNumbers', 60, 5, -1.7, true);
		if (sunTimes) { drawTimePeriods(); }
	}

	function updateLocation(form) {
		// handle location submit
		console.log(`updating location to ${form.latitude.value}, ${form.longitude.value}`);
		location = {latitude:parseFloat(form.latitude.value), longitude:parseFloat(form.longitude.value)};
		// TODO: check values are valid, or use default values
		// parseFloat returns a number or NaN
		setItem('location', JSON.stringify(location));
		showLocation({coords: location});
		$('#settings').style.display = 'none'; // close settings
		return false;
	}

	function loadOptions() {
		// load options from localStorage, and set checkboxes, etc. on page load
		if (getItem('showMoon') === false) {
			$('input[name="showMoon"]').checked = false;
			moonHand.style.display = 'none';
		}
		if (getItem('showHourNumbers') === false) {
			$('input[name="showHourNumbers"]').checked = false;
			$('#hourNumbers').style.display = 'none';
		}
		if (getItem('showHourMarks') === false) {
			$('input[name="showHourMarks"]').checked = false;
			$('#hourMarks').style.display = 'none';
			$('#quarterMarks').style.display = 'none';
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

		// direction
		if (getItem('setDirectionManually') === true) {
			$('input[name="setDirectionManually"]').checked = true;
			$('#setDirection').style.display = 'block';
		}
		if (getItem('direction') !== null) {
			direction = getItem('direction');
			$('#direction_cw').checked  = (direction > 0) ? true : false;
			$('#direction_ccw').checked = (direction > 0) ? false : true;
		}

		// location
		if (getItem('setLocationManually') === true) {
			$('input[name="setLocationManually"]').checked = true;
			$('#setLocation').style.display = 'block';
		}
		if (getItem('location') !== null) {
			location = getItem('location');
			$('input[name="latitude"]').value  = getItem('location').latitude;
			$('input[name="longitude"]').value = getItem('location').longitude;
		}
	}

	function decodeURL(anchor) {
		let input = anchor.dataset.address.replace(/\s+/g, ',').split(',');
		let output = '';

		for (let i=0; i<input.length; i++) {
			output += String.fromCodePoint(parseInt(input[i],16));
		}
		anchor.href = output;
	}

	function tick(timestamp) {
		// animation loop
		now = new Date();

		// get moonPhase on first tick, then every minute — does not need to be recalculated each frame
		// 29.53 days per 360° phase change = ~12° per day / 0.5° per hour / 0.00833° per minute
		if (timerStartTime === undefined) {
			timerStartTime = timestamp || 0;
			//console.log('timerStartTime: ' + timerStartTime);
			moonPhase = SunCalc.getMoonIllumination(now).phase; // note: does not require location
			drawMoonIcon(moonPhase);
		}
		if ((timestamp - timerStartTime) >= 60000) { timerStartTime = undefined; }

		seconds = now.getSeconds() + (now.getMilliseconds())/1000;
		minutes = now.getMinutes() + seconds/60;
		hours   = now.getHours()   + minutes/60;

		// move hands, update text
		secondHand.setAttribute('transform', `rotate(${ seconds * direction * 6 })`); //  6° per second
		minuteHand.setAttribute('transform', `rotate(${ minutes * direction * 6 })`); //  6° per minute
		hourHand.setAttribute('transform',   `rotate(${ hours  * direction * 15 })`); // 15° per hour
		moonHand.setAttribute('transform', `rotate(${ (hours * direction * 15) - (moonPhase * direction * 360) })`);  // ~14.5° per hour
		moonIcon.setAttribute('transform', `translate(0 80) rotate(${90 + direction * 90})`); // only on direction change
		dateText.innerHTML = `${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, <span>${now.toLocaleTimeString()}</span>`;

		// refresh the sun times at midnight
		if (then && (now.getDate() !== then.getDate())) {
			getSunTimes();
		}

		then = now;
		// TODO: if not showing seconds hand, then don't need to update so often
		window.requestAnimationFrame(tick);
	}

	function init() {
		hourHand   = $('#hourHand');
		minuteHand = $('#minuteHand');
		secondHand = $('#secondHand');
		moonHand   = $('#moonHand');
		moonIcon   = $('#moonIcon');
		moonPath   = $('#moonPath');
		dateText   = $('#dateText');

		loadOptions();

		// draw clock
		radius = parseFloat($('#clockFace').getAttribute('r')) - parseFloat($('#clockFace').getAttribute('stroke-width'))/2;
		drawMarks('#hourMarks', 24, 3);
		drawMarks('#quarterMarks', 4, 4);
		drawMarks('#minuteMarks', 60, -2);
		drawNumbers('#hourNumbers', 24, 1, 1, false);
		drawNumbers('#minuteNumbers', 60, 5, -1.7, true);

		// start clock
		tick();

		// make overlays
		$All('#about, #settings').forEach(item => { item.classList.add('overlay'); }); // visible if JS disabled

		// note link
		$('#note').classList.add('hide');
		$('a[href="#note"]').onclick = (e) => { e.preventDefault(); $('#note').classList.toggle('hide'); };

		// handle navigation links
		$All('a.menu').forEach(link => {
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

		// decode email URL
		// if email addresses are present in the HTML Cloudflare will obfuscate them itself and add its own decoder
		document.querySelectorAll('a[data-address]').forEach( (a) => { decodeURL(a); });

		// get location last (so geolocation prompt doesn't block)
		getLocation();
	}

	window.addEventListener('load', init);

	return {
		setOption: setOption,
		updateLocation: updateLocation
	};
})();
