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
var supportsHover = window.matchMedia('(hover: hover)').matches;
var isPortrait = window.matchMedia('(orientation:portrait)').matches;
var isLandscape = window.matchMedia('(orientation:landscape)').matches;

function fullscreen(e) {
	// toggle fullscreen mode
	//e.preventDefault();
	var d = document, dE = d.documentElement;

	if (d.fullscreenElement || d.webkitFullscreenElement) {
		if (d.exitFullscreen) {
			d.exitFullscreen();
		} else if (d.webkitCancelFullScreen) {
			d.webkitCancelFullScreen();
		}
	} else {
		if (dE.requestFullscreen) {
			dE.requestFullscreen();
		} else if (dE.webkitRequestFullScreen) {
			dE.webkitRequestFullScreen();
		}
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

var SunClock = (function() {
	'use strict';

	let now, then, timerStart,
		hours, minutes, seconds,
		hourHand, minuteHand, secondHand, timeText, dateText,
		hour12 = false,
		sunTimes, sunPosition, noonPosition, nadirPosition, sunAlwaysUp, sunAlwaysDown, periodsTemp, currentPeriod, nextPeriodTime,
		moonTimes, moonPosition, moonPhase, moonHand, moonIcon, moonPath,
		radius,
		direction = 1, 		// 1 = clockwise, -1 = anticlockwise
		location,      		// {"latitude":0,"longitude":0}
		theme = 'light'; 	// 'light' | 'dark' | 'auto'

	const geoOptions = {enableHighAccuracy: true, timeout: 5000, maximumAge: 0},
		//geoErrors = ['', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT'],
		periods = [
			// name:                        from:               to:                 color:		darkColor:
			['earlyMorning',                'nadir',            'nightEnd',         '#192029',	'#030303'],
			['astronomicalMorningTwilight', 'nightEnd',         'nauticalDawn',     '#213c66',	'#101d33'],
			['nauticalMorningTwilight',     'nauticalDawn',     'dawn',             '#4574bc',	'#325489'],
			['civilMorningTwilight',        'dawn',             'sunrise',          '#88a6d4',	'#677ea1'],
			['sunrise',                     'sunrise',          'sunriseEnd',       '#ff9900',	'#cc7a00'],
			['morningGoldenHour',           'sunriseEnd',       'goldenHourEnd',    '#ffe988',	'#ccba6c'],
			['morning',                     'goldenHourEnd',    'solarNoon',        '#dceaff', 	'#b0bbcc'],
			['afternoon',                   'solarNoon',        'goldenHour',       '#dceaff',	'#b0bbcc'],
			['eveningGoldenHour',           'goldenHour',       'sunsetStart',      '#ffe988',	'#ccba6c'],
			['sunset',                      'sunsetStart',      'sunset',           '#ff9900',	'#cc7a00'],
			['civilEveningTwilight',        'sunset',           'dusk',             '#88a6d4',	'#677ea1'],
			['nauticalEveningTwilight',     'dusk',             'nauticalDusk',     '#4574bc',	'#325489'],
			['astronomicalEveningTwilight', 'nauticalDusk',     'night',            '#213c66',	'#101d33'],
			['lateEvening',                 'night',            'nadir2',           '#192029',	'#030303']
		],
		textReplacements = {
			'nadir' : 'Solar Midnight',
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
			'lateEvening' : 'Late Evening',
			'nadir2' : 'Solar Midnight'
		},
		// Test Dates
		testDate = null,

		// 2022 Daylight Savings (Australian Eastern) 	(First Sunday in October - First Sunday in April)
		//testDate = new Date("2022-04-03T00:00:00+1100") - 5000, // AEDT -> AEST -3h (just before midnight)
		//testDate = new Date("2022-04-03T00:59:47+1100") - 5000, // AEDT -> AEST -3h (just before solar midnight)
		//testDate = new Date("2022-04-03T03:00:00+1100") - 5000, // AEDT -> AEST -5s

		//testDate = new Date("2022-10-01T23:45:58+1000") - 5000, // AEST -> AEDT -2h 15m (just before solar midnight)
		//testDate = new Date("2022-10-02T00:00:00+1000") - 5000, // AEST -> AEDT -2h (just before midnight)
		//testDate = new Date("2022-10-02T02:00:00+1000") - 5000, // AEST -> AEDT -5s

		// 2022 Equinoxes and Solstices
		//testDate = new Date("2022-03-20T15:33Z"), // Equinox
		//testDate = new Date("2022-06-21T09:14Z"), // Solstice
		//testDate = new Date("2022-09-23T01:04Z"), // Equinox
		//testDate = new Date("2022-12-21T21:48Z"), // Solstice

		// **** breaking getCurrentPeriod: ****
		//testDate = new Date("2022-04-03T00:56:29+1100"), // ** works  **
		//testDate = new Date("2022-04-03T00:56:30+1100"), // ** one SECOND later breaks!
		// Solar Midnight   Sat Apr 02 2022 01:00:05 GMT+1100 (AEDT)
		// Solar Midnight   Sun Apr 03 2022 00:59:47 GMT+1100 (AEDT)
		// Solar Midnight	Sun Apr 03 2022 23:59:29 GMT+1000 (AEST)

		// *** solar midnight can also break, even with the while blocks ~line 230
		//testDate = new Date("2022-04-01T01:00:24+1100"), // ** also breaks - but one second before or after doesn't !
		//testDate = new Date("2022-04-02T01:00:05+1100"), // ** also breaks - but one second before or after doesn't !
		//testDate = new Date("2022-04-03T00:59:47+1100"), // ** also breaks - but one second before or after doesn't !

		//testDate = new Date("2022-11-08T05:44:32") - 1000,

		// finally
		startTime = new Date(),
		debug = true;

	function getLocation() {
		// get location from localStorage or Geolocation API
		if (getItem('setLocationManually') === true) {
			showLocation({coords: location});
		} else if (navigator.geolocation) {
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
			$('#location').innerHTML = 'Location not set';
			clearLocation();
		}
	}

	function showLocationError(err) {
		console.error(err);
		$('#location').innerHTML = `Location error: ${err.message}`;
		clearLocation();
	}

	function clearLocation() {
		// clear previous (e.g. if going from location to no location)
		location = null;
		sunTimes = null;
		$('#times').innerHTML = '';
		$('#info2').innerHTML = '';
		$('#allTimes table tbody').innerHTML = '';
		clearTimePeriods();
		updateTheme();
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
		// note: when daylight savings changes, some times may be in a different time zone to current time, so check offsets
		var nowOffset = now.getTimezoneOffset();
		var dateOffset = date.getTimezoneOffset();
		//var angle = ((date.getHours() + date.getMinutes()/60 + date.getSeconds()/3600) / 24 * 2 * Math.PI); // radians
		var angle = ((date.getHours() + date.getMinutes()/60 + (dateOffset-nowOffset)/60 + date.getSeconds()/3600) / 24 * 2 * Math.PI); // radians
		return `${Math.sin(angle) * radius * -direction}, ${Math.cos(angle) * radius}`; // return as string for svg path attribute
	}

	function formatTime(time) {
		// keep in one place
		if (time == 'Invalid Date') return time;
		//return time.toLocaleTimeString(); // hh:mm:ss
		return (new Date(Math.round(time/60000)*60000)).toLocaleTimeString([], { hour:'numeric', minute:'2-digit', hour12: hour12 }); // hh:mm - rounded to nearest minute
	}

	function formatDateString(time) {
		// format date string with an optional <br> if time zone descriptor is >6 characters
		if (time === 'Does not occur') { return time; }
		var str = `<span class="nobr">${time.toDateString()}</span> <span class="nobr">${time.toTimeString().substring(0, 17)}</span>`;
		str += (time.toTimeString().length > 24 ) ? '<br>' : ' ';
		str += time.toTimeString().substring(17);
		return str;
	}

	function getEarlier(time) {
		// get now - 24 hours
		return new Date(time.valueOf() - 86400000);
	}
	function getLater(time) {
		// get now + 24 hours
		return new Date(time.valueOf() + 86400000);
	}

	function getSunTimes() {
		let event;
		let subset = ['sunrise', 'solarNoon', 'sunset']; // subset of times to show below location

		// get times from suncalc.js
		sunTimes = null;
		sunTimes = SunCalc.getTimes(now, location.latitude, location.longitude, 0);
		// get the sun times for the next day so I can get the next nadir
		// (can't just add 24 hrs to first one, or hack SunCalc.js (nadir2: fromJulian(Jnoon + 0.5))
		sunTimes.nadir2 = SunCalc.getTimes(getLater(sunTimes.solarNoon), location.latitude, location.longitude, 0).nadir;

		if (debug) {
			console.log(`now: ${now}`);
			console.log(sunTimes);
		}

		// sometimes now is not in the range of times output by SunCalc (e.g. "2022-04-03T00:59:00+1100")
		while (now < sunTimes.nadir) {
			if (debug) { console.log('now is earlier than nadir: get earlier sun times'); }
			sunTimes = SunCalc.getTimes(getEarlier(sunTimes.solarNoon), location.latitude, location.longitude, 0);
			sunTimes.nadir2 = SunCalc.getTimes(getLater(sunTimes.solarNoon), location.latitude, location.longitude, 0).nadir;
		}
		while (now > sunTimes.nadir2) {
			// is this possible?
			if (debug) { console.log('now is later than nadir2: get later time sun times'); }
			sunTimes = SunCalc.getTimes(getLater(sunTimes.solarNoon), location.latitude, location.longitude, 0);
			sunTimes.nadir2 = SunCalc.getTimes(getLater(sunTimes.solarNoon), location.latitude, location.longitude, 0).nadir;
		}

		noonPosition = SunCalc.getPosition(sunTimes.solarNoon, location.latitude, location.longitude);
		nadirPosition = SunCalc.getPosition(sunTimes.nadir, location.latitude, location.longitude);
		sunAlwaysUp   = (toDegrees(nadirPosition.altitude) > -0.833) ? true : false; // sun is always above horizon
		sunAlwaysDown = (toDegrees(noonPosition.altitude)  < -0.833) ? true : false; // sun is always below horizon

		if (debug) {
			console.log(sunTimes);
			console.log(`sunAlwaysUp: ${sunAlwaysUp}, sunAlwaysDown: ${sunAlwaysDown}`);
		}

		// write subset of times below date
		$('#times').innerHTML = '';
		for (let i=0; i<subset.length; i++) {
			event = formatTime(sunTimes[subset[i]]);
			if (event == 'Invalid Date') { event = 'Does not occur'; }
			$('#times').innerHTML += `${textReplacements[subset[i]]}: <span class="nobr">${event}</span><br>`;
		}
		$('#times').innerHTML += (sunAlwaysUp)   ? 'Sun is above horizon all day' : '';
		$('#times').innerHTML += (sunAlwaysDown) ? 'Sun is below horizon all day' : '';

		// write all times to table
		$('#allTimes table tbody').innerHTML = '';
		for (let i=0; i<periods.length; i++) {
			event = (sunTimes[periods[i][1]]);
			if (event == 'Invalid Date') { event = 'Does not occur'; }
			$('#allTimes table tbody').innerHTML += `<tr><td>${textReplacements[periods[i][1]]}</td><td>${formatDateString(event)}</td></tr>`;
		}
		$('#allTimes table tbody').innerHTML += `<tr><td>${textReplacements.nadir2}</td><td>${formatDateString(sunTimes.nadir2)}</td></tr>`; // date is always valid

		// draw time period arcs on clock face
		drawTimePeriods();
		if (theme === 'auto') { updateTheme(); }
	}

	function clearTimePeriods() {
		// clear any previous arcs (i.e. if changing direction or setting location manually)
		let arcs = $('#arcs');
		while (arcs.firstChild) {
			arcs.removeChild(arcs.firstChild);
		}
		// clear solar noon and midnight lines
		$('#noon').setAttribute('d','M 0,0 L 0,0');
		$('#midnight').setAttribute('d','M 0,0 L 0,0');
	}

	function drawTimePeriods() {
		// draw time periods on clock face
		let p, t1, t2, point1, point2, path;
		let fillThemeCol = (theme === 'dark') ? 4 : 3;
		let validTimeCount = 0;

		// clear any previous arcs
		clearTimePeriods();

		// make a deep copy of periods (so can modify 'from' and 'to', but keep original for next time);
		periodsTemp = JSON.parse(JSON.stringify(periods));

		// check time periods for valid times
		for (let i=0; i<periodsTemp.length; i++) {
			p = periodsTemp[i];
			t1 = Date.parse(sunTimes[p[1]]);
			t2 = Date.parse(sunTimes[p[2]]);
			//if (debug) { console.log(`${i}: ${p[0]}, ${p[1]}: ${t1}, ${p[2]}: ${t2} `); }
			if (!isNaN(t1)) validTimeCount++; // count sunTimes events with valid dates

			// test if beginning and end times are valid - and modify from/to times if needed
			// note nadir and noon are always valid times
			if ( isNaN(t1) && isNaN(t2) ) {
				// both times are invalid - period doesn't occur
				continue;
			} else if ( isNaN(t1) ) {
				// beginning time is invalid, end time valid
				if (i === 6)  continue; // morning
				if (i === 13) continue; // lateEvening
				// use nadir (for morning periods) or noon (for evening periods) as t1 instead
				p[1] = (i <= 6) ? 'nadir' : 'solarNoon';
			} else if ( isNaN(t2) ) {
				// beginning time valid, end time invalid
				if (i === 0) continue; // earlyMorning
				if (i === 7) continue; // afternoon
				// use noon (for morning periods) or nadir2 (for evening periods) as t2 instead
				p[2] = (i <= 6) ? 'solarNoon' : 'nadir2';
			} else {
				// both times valid - yay!
			}
			// draw the arc - except...
		}

		if (validTimeCount <= 3) {
			// nadir/noon/nadir2 are the only valid times, so 24 hrs of the same time period.
			// check altitude of sun at noon (note: only happens at high latitudes)
			let pT = periodsTemp;
			let alt1 = toDegrees(noonPosition.altitude);  // degrees above horizon
			let alt2 = toDegrees(nadirPosition.altitude);
			let alt  = (alt1 + alt2) / 2;
			let pt1, pt2;
			if (debug) { console.log(`only 3 valid times (noon and nadir). noon.altitude: ${alt}, nadir.altitude: ${alt2}`); }

			if (alt >= 6) {
				pt1 = 6; pt2 = 7; // morning/afternoon (daytime)
			} else if ((alt < 6) && (alt >= -0.3)) {
				pt1 = 5; pt2 = 8; // morning/evening goldenHour
			} else if ((alt < -0.3) && (alt >= -0.833)) {
				pt1 = 4; pt2 = 9; // sunrise/sunset
			} else if ((alt <= -0.833) && (alt > -6)) {
				pt1 = 3; pt2 = 10; // civil twilight
			} else if ((alt <= -6) && (alt > -12)) {
				pt1 = 2; pt2 = 11; // nautical twilight
			} else if ((alt <= -12) && (alt > -18)) {
				pt1 = 1; pt2 = 12; // astronomical twilight
			} else if (alt <= -18) {
				pt1 = 0; pt2 = 13; // night
			}
			if (debug) { console.log(pt1, pt2); }
			pT[pt1][1] = 'nadir';
			pT[pt1][2] = 'solarNoon';
			pT[pt2][1] = 'solarNoon';
			pT[pt2][2] = 'nadir2';
		}

		// draw time periods - finally
		for (let i=0; i<periodsTemp.length; i++) {
			p = periodsTemp[i];
			t1 = Date.parse(sunTimes[p[1]]);
			t2 = Date.parse(sunTimes[p[2]]);

			if ( isNaN(t1) || isNaN(t2) ) {
				continue;
			} else {
				// draw the arc
				point1 = getPointFromTime(sunTimes[p[1]]);
				point2 = getPointFromTime(sunTimes[p[2]]);
				path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				path.setAttribute('id', p[0]);
				path.setAttribute('fill', p[fillThemeCol]);
				path.setAttribute('cursor', 'crosshair');
				path.setAttribute('d',`M 0,0 L ${point1} A ${radius} ${radius} 0 0 ${(direction>0) ? 1 : 0} ${point2} z`); // sweep-flag depends on direction
				$('#arcs').appendChild(path);

				// add hover event to the arc
				addHoverEvent(path, getPeriodInfo, i);
			}
		}

		// draw solar noon and midnight lines
		$('#noon').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.solarNoon)}`);
		$('#midnight').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.nadir2)}`);
	}

	function getCurrentTimePeriod() {
		// find the time period are we in now
		let t0, t1, t2, p;
		t0 = now.valueOf();

		for (let i=0; i<periodsTemp.length; i++) {
			p = periodsTemp[i];
			t1 = Date.parse(sunTimes[p[1]]);
			t2 = Date.parse(sunTimes[p[2]]);

			if ((isNaN(t1)) || (isNaN(t2))) {
				continue;
			} else if ((t0 > t1) && (t0 < t2)) {
				currentPeriod = i;
				break;
			} else {
				continue;
			}
		}
		if (debug) { console.log(`currentPeriod is ${currentPeriod}: ${periodsTemp[currentPeriod][0]}`); }
	}

	function addHoverEvent(object, func, a) {
		// add hover or click events to a dom object
		if (supportsHover) {
			object.onmouseover = () => showInfo(func, a);
			object.onmouseout = () => hideInfo();
		} else {
			object.onclick = () => showInfo(func, a);
		}
	}

	function getPeriodInfo(i) {
		// get info for time periods
		let p = periodsTemp[i];

		let str = `<h3>${textReplacements[p[0]]}</h3>
			<p>${textReplacements[p[1]]}<br><span class="nobr">${formatTime(sunTimes[p[1]])}</span></p>
			<p class="to">— to —</p>
			<p>${textReplacements[p[2]]}<br><span class="nobr">${formatTime(sunTimes[p[2]])}</span></p>`;

		return str;
	}

	function getSunInfo() {
		// get info for Sun
		let str = '';

		if (location) {
			sunPosition = SunCalc.getPosition(now, location.latitude, location.longitude);
			if (sunPosition) {
				str = `<h3>Sun</h3>
					<p>Altitude: ${toDegrees(sunPosition.altitude).toFixed(2)}°<br>
					Azimuth:  ${convertAzimuth(sunPosition.azimuth).toFixed(2)}°</p>
					<p>Altitude at:<br>
					noon: ${toDegrees(noonPosition.altitude).toFixed(2)}°<br>
					midnight: ${toDegrees(nadirPosition.altitude).toFixed(2)}°</p>`;
			}
		}
		return str;
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

	function getMoonInfo() {
		// get info for moon
		// note: moon phase does not require a location, but positon and times do
		let str = `<h3>Moon</h3>
			<p>${getMoonPhaseName(moonPhase).name}<br>(${(moonPhase * 29.53).toFixed(1)} days old)</p>`;

		if (location) {
			moonTimes = SunCalc.getMoonTimes(now, location.latitude, location.longitude);
			moonPosition = SunCalc.getMoonPosition(now, location.latitude, location.longitude);
			//if (debug) { console.log(moonTimes, moonPosition); };

			if (moonTimes) {
				if ((moonTimes.rise) && (moonTimes.set)) {
					// sort by time
					if (moonTimes.rise <= moonTimes.set) {
						str += `<p>Rises: <span class="nobr">${formatTime(moonTimes.rise)}</span><br>Sets: <span class="nobr">${formatTime(moonTimes.set)}</span></p>`;
					} else {
						str += `<p>Sets: <span class="nobr">${formatTime(moonTimes.set)}</span><br>Rises: <span class="nobr">${formatTime(moonTimes.rise)}</span></p>`;
					}
				} else if (moonTimes.rise) {
					str += `<p>Rises: <span class="nobr">${formatTime(moonTimes.rise)}</span></p>`;
				} else if (moonTimes.set) {
					str += `<p>Sets: <span class="nobr">${formatTime(moonTimes.set)}</span></p>`;
				} else if (moonTimes.alwaysUp) {
					str += '<p>Moon is up all day</p>';
				} else if (moonTimes.alwaysDown) {
					str += '<p>Moon is down all day</p>';
				} else {
					// ???
				}
			}
			if (moonPosition) {
				str += `
					<p>Altitude: ${toDegrees(moonPosition.altitude).toFixed(2)}°<br>
					Azimuth:  ${convertAzimuth(moonPosition.azimuth).toFixed(2)}°</p>`;
			}
		}
		return str;
	}

	function showInfo(func, a) {
		// get the info and show it
		let str = func(a);
		str += `<p class="done"><a href="#">ok</a></p>`;

		if (isPortrait) { $('#info1').style.display = 'none'; }
		$('#info2').style.display = 'block';
		$('#info2').innerHTML = str;
		$('p.done').onclick = (e) => { e.preventDefault(); hideInfo(); };
	}

	function hideInfo() {
		if (isPortrait) { $('#info1').style.display = 'block'; }
		$('#info2').style.display = 'none';
		$('#info2').innerHTML = '';
	}

	function drawMarks(parent, n, q, length) {
		// draw the number marks on the clock face
		var m;

		for (let i=0; i<=(n-1); i++) {
			//if ((q != 0) && (i%q === 0)) { continue; }
			if ((i%q === 0)) { continue; }
			m = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			m.setAttribute('x1', 0);
			m.setAttribute('y1', 0);
			m.setAttribute('x2', 0);
			m.setAttribute('y2', length);
			m.setAttribute('transform', `rotate(${i * (360/n)}) translate(0,${radius})`);
			$(parent).appendChild(m);
		}
	}

	function pad2(n) {
		// make 2 digits
		return (n < 10) ? ('0' + n) : n;
	}

	function drawNumbers2(parent, n, m, offset, startAtTop, vertical, zeroPad) {
		// draw the numbers on the clock face
		var g, angle,
			p = $(parent),
			h = parseInt(p.getAttribute('font-size')),
			angleOffset = startAtTop ? 180 : 0,
			str;

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
			str = zeroPad ? (i ? pad2(i) : pad2(n)) : (i ? i : n);  // if i==0, i=n

			if (vertical) {
				g.innerHTML = `<circle cx="0" cy="0" r="${(h*0.833)}" fill="rgba(255,255,255,0.33)" stroke="none" />`;
				g.innerHTML += `<text x="0" y="${(h*0.375)}" transform="rotate(${angle*-1})">${str}</text>`;
			} else {
				if ((angle >= 90) && (angle <= 270)) {
					g.innerHTML = `<text x="0" y="0" transform="rotate(180)">${str}</text>`;
				} else {
					g.innerHTML = `<text x="0" y="${(h*0.75)}" transform="rotate(0)">${str}</text>`;
				}
			}
			p.appendChild(g);
		}
	}

	function drawNumbers() {
		drawNumbers2('#hourNumbers',  24, 2, -1.5, false, true, false);
		drawNumbers2('#minuteNumbers', 60, 5, 0.27, true, false, true);
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
			// if hour numbers are hidden, make the even hour marks the longer ones (rotate long marks 15° = 1 hr)
			$('#hourMarks2').setAttribute('transform', ((checkbox.checked) ? 'rotate(0)' : 'rotate(15)'));
			break;
		  case 'showHourMarks':
			$('#hourMarks').style.display = (checkbox.checked) ? 'block' : 'none';
			$('#hourMarks2').style.display = (checkbox.checked) ? 'block' : 'none';
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
		  case 'hour12':
			hour12 = checkbox.checked;
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

		  case 'setTheme':
			theme = checkbox.value;
			setItem('theme', JSON.stringify(theme));
			updateTheme();
			break;

		  default:
			alert('wot?');
		}
		setItem(checkbox.name, checkbox.checked);
	}

	function updateDirection() {
		// update direction after setOption or loadOptions
		// n.b. clock hands will update automatically on next animationFrame
		drawNumbers();
		if (sunTimes) { drawTimePeriods(); }
	}

	function updateTheme() {
		//reset values
		document.documentElement.classList.remove('dark');
		document.body.style.backgroundColor = '';
		document.documentElement.style.backgroundColor = '';

		if (theme === 'dark') { document.documentElement.classList.add('dark'); }
		$('#hourNumbers').style.fill   = (theme === 'dark') ? '#222' : '#000';
		$('#minuteNumbers').style.fill = (theme === 'dark') ? '#aaa' : '#000';

		if (sunTimes) {
			if (theme === 'auto') {
				getCurrentTimePeriod();
				let p = periods[currentPeriod];
				document.body.style.backgroundColor = p[3]; // or maybe p[4] ?
				document.documentElement.style.backgroundColor = p[3];

				if ((currentPeriod <= 2) || (currentPeriod >= 11)) {
					document.documentElement.classList.add('dark');
					$('#hourNumbers').style.fill   = '#222';
					$('#minuteNumbers').style.fill = '#aaa';
				}

				// get time of next period change
				nextPeriodTime = sunTimes[p[2]];
				if (debug) { console.log(`Next theme update at ${sunTimes[p[2]]}`); }
			}
			// update period arc colors (don't redraw)
			for (let i=0; i<periods.length; i++) {
				if ($('#arcs > #' + periods[i][0])) {
					$('#arcs > #' + periods[i][0]).style.fill = (theme === 'dark') ? periods[i][4] : periods[i][3];
				}
			}
		}
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
			// if hour numbers are hidden, make the even hour marks the longer ones (rotate long marks 15° = 1 hr)
			$('#hourMarks2').setAttribute('transform', 'rotate(15)');
		}
		if (getItem('showHourMarks') === false) {
			$('input[name="showHourMarks"]').checked = false;
			$('#hourMarks').style.display = 'none';
			$('#hourMarks2').style.display = 'none';
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
		if (getItem('hour12') === true) {
			$('input[name="hour12"]').checked = true;
			hour12 = true;
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
			$('input[name="latitude"]').value  = location.latitude;
			$('input[name="longitude"]').value = location.longitude;
		}

		// theme
		if (getItem('theme') !== null) {
			theme = getItem('theme');
			$('#theme_light').checked = (theme === 'light') ? true : false;
			$('#theme_dark').checked  = (theme === 'dark')  ? true : false;
			$('#theme_auto').checked  = (theme === 'auto')  ? true : false;
			updateTheme();
		}
	}

	function showSection(e) {
		// hide all sections, show the one you want
		$All('section').forEach( item => { item.style.display = 'none'; });
		if ($(window.location.hash)) { $(window.location.hash).style.display = 'block'; }
	}

	function decodeURL(anchor) {
		// decodes data in data-address attribute of an anchor tag — used to obfuscate mailto link
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
		if (testDate) { now = new Date(now.valueOf() - startTime.valueOf() + testDate.valueOf()); }

		seconds = now.getSeconds() + (now.getMilliseconds())/1000;
		minutes = now.getMinutes() + seconds/60;
		hours   = now.getHours()   + minutes/60;

		// move hands
		secondHand.setAttribute('transform', `rotate(${ seconds * direction * 6 })`); //  6° per second
		minuteHand.setAttribute('transform', `rotate(${ minutes * direction * 6 })`); //  6° per minute
		hourHand.setAttribute('transform',   `rotate(${ hours  * direction * 15 })`); // 15° per hour
		moonHand.setAttribute('transform', `rotate(${ (hours * direction * 15) - (moonPhase * direction * 360) })`);  // ~14.5° per hour
		moonIcon.setAttribute('transform', `translate(0 80) rotate(${90 + direction * 90})`); // only on direction change

		// moon phase
		// get every minute — does not need to be recalculated each frame
		// 29.53 days per 360° phase change = ~12° per day / 0.5° per hour / 0.00833° per minute
		if (!timerStart) {
			//console.log('timerStart: ' + timerStart);
			moonPhase = SunCalc.getMoonIllumination(now).phase; // note: does not require location
			drawMoonIcon(moonPhase);
			timerStart = timestamp || 0;
		}
		if ((timestamp - timerStart) >= 60000) { timerStart = null; }

		// refresh the sun times at midnight
		if ( then && (now.getDate() !== then.getDate()) ) {
			console.log('midnight: refreshing sun times!');
			getSunTimes();
			then = null;
		}

		// refresh the sun times at solar midnight
		if ( then && sunTimes && (now >= sunTimes.nadir2) ) {
			console.log('solar midnight: refreshing sun times!');
			getSunTimes();
			then = null;
		}

		// redraw time periods if the time zone changes (e.g. daylight savings changes)
		if ( then && (now.getTimezoneOffset() !== then.getTimezoneOffset()) ) {
			console.log('redrawing time periods!');
			drawTimePeriods();
			then = null;
		}

		// update theme at next period change time
		if ( sunTimes && (theme === 'auto') && (now >= nextPeriodTime) ) {
			updateTheme();
		}

		// write date on first tick (and at midnight)
		if (!then) {
			dateText.innerHTML = `${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
		}

		// display time as text if testing dates
		if (testDate) {
			timeText.style.display = 'block';
			timeText.innerHTML = `${now.toLocaleTimeString()}`;
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
		timeText   = $('#timeText');
		dateText   = $('#dateText');

		// load settings from localStorage
		loadOptions();

		// draw clock
		radius = parseFloat($('#clockFace').getAttribute('r')) - parseFloat($('#clockFace').getAttribute('stroke-width'))/2;
		drawMarks('#hourMarks',  24, 0, -4);
		drawMarks('#hourMarks2', 24, 2, -8);
		drawMarks('#minuteMarks', 60, 0, 6);
		drawNumbers();

		// add hover events to the hour and moon hands
		addHoverEvent(hourHand, getSunInfo);
		addHoverEvent($('#centerCircle'), getSunInfo);
		addHoverEvent(moonHand, getMoonInfo);

		// start clock
		tick();

		// make overlays, handle section links
		$All('section').forEach(item => { item.classList.add('overlay'); }); // visible if JS disabled
		if (window.location.hash) { showSection(); }
		window.addEventListener('hashchange', showSection);

		// show fullscreen link
		if (fullscreenAvailable()) { $('#fullscreen').style.display = 'inline'; }

		// note links
		$All('#note1, #note2, #note3').forEach(link => { link.classList.add('hide'); });
		$('a[href="#note1"]').onclick = (e) => { e.preventDefault(); $('#note1').classList.toggle('hide'); };
		$('a[href="#note2"]').onclick = (e) => { e.preventDefault(); $('#note2').classList.toggle('hide'); $('#note3').classList.add('hide'); };
		$('a[href="#note3"]').onclick = (e) => { e.preventDefault(); $('#note3').classList.toggle('hide'); $('#note2').classList.add('hide'); };

		// decode email URL
		// if email addresses are present in the HTML Cloudflare will obfuscate them itself and add its own decoder
		$All('a[data-address]').forEach( (a) => { decodeURL(a); });

		// get location last (so geolocation prompt doesn't block)
		getLocation();
	}

	window.addEventListener('load', init);

	window.addEventListener('resize', () => {
		// n.b. Screen.orientation does not work in Safari < 16.4
		isPortrait  = window.matchMedia('(orientation:portrait)').matches;
		isLandscape = window.matchMedia('(orientation:landscape)').matches;

		// on resizing (esp. orientation change), make sure #info1 is visible
		// otherwise if you go from portrait to landscape (on touch devices) with #info2 visible then #info1 stays hidden
		$('#info1').style.display = 'block';
		$('#info2').style.display = 'none';
	});

	return {
		setOption: setOption,
		updateLocation: updateLocation
	};
})();
