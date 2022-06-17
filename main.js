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

	let now, then,
		hours, minutes, seconds,
		hourHand, minuteHand, secondHand, dateText,
		sunTimes, sunPosition, noonPosition, nadirPosition, sunAlwaysUp, sunAlwaysDown, periodsTemp,
		moonTimes, moonPosition, moonHand, moonPhase, moonPhaseName, moonIcon, 
		radius,
		direction = 1, // 1 = clockwise, -1 = anticlockwise
		showMoon = true, 
		geoLocation;

	const debug = true,
		testFlag = false,
		testDate = new Date('March 20, 2022 12:00:00'), // n.b. 2022 equinoxes and solstices: March 20, June 21, September 23, December 21
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
		},
		moonPhaseIcons = {
			'New Moon':        '🌑',
			'Waxing Crescent': '🌒',
			'First Quarter':   '🌓',
			'Waxing Gibbous':  '🌔',
			'Full Moon':       '🌕',
			'Waning Gibbous':  '🌖',
			'Last Quarter':    '🌗',
			'Waning Cresent':  '🌘'
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
			showLocationError({message: 'Geolocation is not supported. Please set location manually.'});
		}
	}

	function showLocation(position) {
		geoLocation = position.coords;
		$('#location').innerHTML = `Location:
			${Math.abs(geoLocation.latitude.toFixed(3))}° ${(geoLocation.latitude >=0) ? 'N' : 'S'},
			${Math.abs(geoLocation.longitude.toFixed(3))}° ${(geoLocation.longitude >=0) ? 'E' : 'W'}`;
			//<br><small>(Accuracy: ${geoLocation.accuracy} m)</small>`;

		// if antiClockwise option not set, choose direction based on latitude
		if (getItem('antiClockwise') === null) {
			direction = (geoLocation.latitude >= 0) ? 1 : -1;
			$('input[name="antiClockwise"]').checked = (geoLocation.latitude >= 0) ? false : true;
			drawNumbers('#hourNumbers', 24, 1, false);
			drawNumbers('#minuteNumbers', 60, -1.7, true);
		}

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

	function convertAzimuth(angle) {
		// SunCalc uses “sun azimuth in radians (direction along the horizon, measured from south to west), e.g. 0 is south and Math.PI * 3/4 is northwest”
		// We want degrees clockwise from North. See also: https://en.wikipedia.org/wiki/Azimuth
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
		sunTimes = SunCalc.getTimes(now, geoLocation.latitude, geoLocation.longitude, 0);
		noonPosition = SunCalc.getPosition(sunTimes.solarNoon, geoLocation.latitude, geoLocation.longitude);
		nadirPosition = SunCalc.getPosition(sunTimes.nadir, geoLocation.latitude, geoLocation.longitude);
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

		drawTimePeriods();

		// draw solar noon and midnight lines
		$('#midnight').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.nadir)}`);
		$('#noon').setAttribute('d',`M 0,0 L ${getPointFromTime(sunTimes.solarNoon)}`);

		// add hover event to hour hand
		addHoverEvent(hourHand, showSunInfo);

		// add hover event to moon hand
		addHoverEvent(moonHand, showMoonInfo);
	}

	function drawTimePeriods() {
		// draw time periods on clock face
		let p, t1, t2, point1, point2, path;

		// clear any previous arcs (i.e. if changing direction or setting location manually)
		let arcs = $('#arcs');
		while (arcs.firstChild) {
			arcs.removeChild(arcs.firstChild);
		}

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
	}

	function addHoverEvent(object, func, a, b) {
		// add hover or click event to object
		if (supportsHover) {
			object.onmouseover = (event) => func(a, b);
			object.onmouseout = hideInfo;
		} else {
			object.onclick = (event) => func(a, b);
		}
	}

	function showPeriodInfo(event, i) {
		let dir;
		let p = periodsTemp[i];

		if (i < periodsTemp.length/2) {
			dir = (direction > 0) ? 'left' : 'right';
		} else {
			dir = (direction > 0) ? 'right' : 'left';
		}

		let str = `<h3>${textReplacements[p[0]]}</h3>
			<p>${textReplacements[p[1]]}<br>${sunTimes[p[1]].toLocaleTimeString()}</p>
			<p class="to">— to —</p>
			<p>${textReplacements[p[2]]}<br>${sunTimes[p[2]].toLocaleTimeString()}</p>
			<p class="done"><a href="#">ok</a></p>`;

		showInfo(str, dir);
	}

	function showSunInfo() {
		let dir;
		sunPosition = SunCalc.getPosition(now, geoLocation.latitude, geoLocation.longitude);

		// get info direction
		if (direction === 1) {  
			dir = (hours >= 12) ? 'right' : 'left';
		} else {
			dir = (hours >= 12) ? 'left' : 'right';
		}

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
		// there's probably a really elegant way to do this, but...
		let d = 0.0167; // 1.67 % ~= 1/2 day per month ?
		let phaseName = 'New Moon';
		
		if ((phase > 0.0 + d) && (phase < 0.25 - d)) {
			phaseName = 'Waxing Crescent';
		} else if ((phase >= 0.25 - d) && (phase <= 0.25 + d)) {
			phaseName = 'First Quarter';
		} else if ((phase > 0.25 + d) && (phase < 0.50 - d)) {
			phaseName = 'Waxing Gibbous';
		} else if ((phase >= 0.50 - d) && (phase <= 0.50 + d)) {
			phaseName = 'Full Moon';
		} else if ((phase > 0.50 + d) && (phase < 0.75 - d)) {
			phaseName = 'Waning Gibbous';
		} else if ((phase >= 0.75 - d) && (phase <= 0.75 + d)) {
			phaseName = 'Last Quarter';
		} else if ((phase > 0.75 + d) && (phase < 1.0 - d)) {
			phaseName = 'Waning Crescent';
		}
		return phaseName;	
	}

	function showMoonInfo() {
		let dir;
		moonTimes = SunCalc.getMoonTimes(now, geoLocation.latitude, geoLocation.longitude);
		moonPosition = SunCalc.getMoonPosition(now, geoLocation.latitude, geoLocation.longitude);
		moonPhase = SunCalc.getMoonIllumination(now).phase;
		moonPhaseName = getMoonPhaseName(moonPhase);
		if (debug) { console.log(moonTimes, moonPosition); };

		let angleFraction = parseFloat(moonHand.getAttribute('transform').substring(7)) / 360;	
		//console.log(angleFraction);	
		if (direction === 1) {  
			dir = ((angleFraction <= -0.5) || (angleFraction >= 0.5)) ? 'left' : 'right';
		} else {
			dir = ((angleFraction <= -0.5) || (angleFraction >= 0.5)) ? 'right' : 'left';
		}

		let str = `<h3>Moon</h3>
			<p>${moonPhaseName} (${moonPhase.toFixed(2)})</p>`;

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
		$('#info').classList.add(dir);
		$('#info').classList.remove('hide');
		$('#info').innerHTML = str;

		if (!supportsHover) {
			$('p.done').onclick = (e) => { e.preventDefault(); hideInfo(); };
		}		
	}

	function hideInfo() {
		$('#info').classList.add('hide');
		$('#info').classList.remove('left','right');
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
			m.setAttribute('transform', `rotate(${angle}) translate(0,${radius + h * offset})`);

			if ((angle >= 90) && (angle <= 270)) {
				m.innerHTML = `<text x="0" y="0" transform="rotate(180)">${i}</text>`;
			} else {
				m.innerHTML = `<text x="0" y="${(h*0.75)}" transform="rotate(0)">${i}</text>`;
			}
			p.appendChild(m);
		}
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
			drawNumbers('#hourNumbers', 24, 1, false);
			drawNumbers('#minuteNumbers', 60, -1.7, true);
			drawTimePeriods();
			break;
		  case 'showMoon':
			moonHand.style.display = (checkbox.checked) ? 'block' : 'none';
			showMoon = (checkbox.checked) ? 'true' : 'false';
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
		setItem('location', JSON.stringify(geoLocation));
		showLocation({coords: geoLocation});
		return false;
	}

	function loadOptions() {
		// load options from localStorage, and set checkboxes, etc.
		if (getItem('antiClockwise') !== null) {
			direction = (getItem('antiClockwise')) ? -1 : 1;
			$('input[name="antiClockwise"]').checked = (getItem('antiClockwise'));
			drawNumbers('#hourNumbers', 24, 1, false);
			drawNumbers('#minuteNumbers', 60, -1.7, true);
		} else {
			//$('input[name="antiClockwise"]').indeterminate = true;
		}
		if (getItem('showMoon') === false) {
			showMoon = false;
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

	function tick() {
		now = new Date();
		seconds = now.getSeconds() + (now.getMilliseconds())/1000;
		minutes = now.getMinutes() + seconds/60;
		hours   = now.getHours()   + minutes/60;
		
		// refresh the sunrise/sunset times at midnight
		if (then && (now.getDate() !== then.getDate())) {
			getSunTimes();
		}

		secondHand.setAttribute('transform', `rotate(${ seconds * direction * 6 })`); //  6° per second
		minuteHand.setAttribute('transform', `rotate(${ minutes * direction * 6 })`); //  6° per minute
		hourHand.setAttribute('transform',   `rotate(${ hours  * direction * 15 })`); // 15° per hour
		dateText.innerHTML = `${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${now.toLocaleTimeString()}`;

		// TODO: does not need to be recalculated each animation frame
		if (showMoon) {
			moonPhase = SunCalc.getMoonIllumination(now).phase; // note: does not require location
			moonIcon.innerHTML = moonPhaseIcons[getMoonPhaseName(moonPhase)];
			moonHand.setAttribute('transform', (`rotate(${ (hours  * direction * 15) + (moonPhase * -direction * 360) })`));
		}

		then = now;
		// TODO: if not showing seconds hand, then don't need to update so often
		window.requestAnimationFrame(tick);
	}

	function init() {
		hourHand   = $('#hourHand');
		minuteHand = $('#minuteHand');
		secondHand = $('#secondHand');
		dateText   = $('#date');

		moonHand   = $('#moonHand');
		moonIcon   = $('#moonIcon');

		// draw clock
		radius = parseInt($('#clockFace').getAttribute('r'));
		drawMarks('#hourMarks', 24, 3);
		drawMarks('#quarterMarks', 4, 4);
		drawMarks('#minuteMarks', 60, -2);
		drawNumbers('#hourNumbers', 24, 1, false);
		drawNumbers('#minuteNumbers', 60, -1.7, true);

		// start clock
		loadOptions();
		tick();
		getLocation();

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
	}

	window.addEventListener('load', init);

	return {
		setOption: setOption,
		updateLocation: updateLocation
	};
})();
