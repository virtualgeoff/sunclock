/*
	Sun Clock
	A 24-hour clock that shows sunrise, sunset, golden hour, and twilight times for your current location

	Geoff Pack, May 2022
	https://github.com/virtualgeoff/sunclock
*/

/* jshint esversion: 6 */
/* globals $, $All, debug, App, SunCalc */

var SunClock = (function() {
	'use strict';

	let now, then, timerStart;
	let hours, minutes, seconds;
	let hourHand, minuteHand, secondHand;
	let clockIconHours, clockIconMinutes;
	let sunTimes, sunPosition, noonPosition, nadirPosition, sunAlwaysUp, sunAlwaysDown;
	let periodsTemp, currentPeriod, nextPeriodTime;
	let moonTimes, moonPosition, moonPhase, moonHand, moonIcon, moonPath;
	let radius = 130;

	const periods = [
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
	];
	const textReplacements = {
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
	};

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
		let nowOffset = now.getTimezoneOffset();
		let dateOffset = date.getTimezoneOffset();
		let direction = App.settings.direction;
		//var angle = ((date.getHours() + date.getMinutes()/60 + date.getSeconds()/3600) / 24 * 2 * Math.PI); // radians
		var angle = ((date.getHours() + date.getMinutes()/60 + (dateOffset-nowOffset)/60 + date.getSeconds()/3600) / 24 * 2 * Math.PI); // radians
		return `${Math.sin(angle) * radius * -direction}, ${Math.cos(angle) * radius}`; // return as string for svg path attribute
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
		// get times from suncalc.js
		let location = App.settings.location;
		if (!location) { return; }

		sunTimes = null;
		sunTimes = SunCalc.getTimes(now, location.latitude, location.longitude, 0);
		// get the sun times for the next day so I can get the next nadir
		// (can't just add 24 hrs to first one, or hack SunCalc.js (nadir2: fromJulian(Jnoon + 0.5))
		sunTimes.nadir2 = SunCalc.getTimes(getLater(sunTimes.solarNoon), location.latitude, location.longitude, 0).nadir;

		if (debug) {
			console.log(`now: ${now}`);
			console.log(`location: ${location.latitude}, ${location.longitude}`);
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

		// write times to table and below date
		writeMainTimes();
		writeAllTimes();

		// draw time period arcs on clock face
		drawTimePeriods();
		if (App.settings.colorScheme === 'dynamic') { updateDynamicTheme(); }
	}

	function clearSunTimes() {
		// clear all times - called by App.clearLocation();
		sunTimes = null;
		clearTimePeriods();
		if (App.settings.colorScheme === 'dynamic') { updateDynamicTheme(); }
	}

	function writeMainTimes() {
		// write subset of times below date
		let subset = ['sunrise', 'solarNoon', 'sunset']; // subset of times to show below location
		if (!sunTimes) { return; }

		$('#mainTimes').innerHTML = '';
		for (let i=0; i<subset.length; i++) {
			$('#mainTimes').innerHTML += `${textReplacements[subset[i]]}: <span class="nobr">${App.formatTime(sunTimes[subset[i]])}</span><br>`;
		}
		$('#mainTimes').innerHTML += (sunAlwaysUp)   ? 'Sun is above horizon all day' : '';
		$('#mainTimes').innerHTML += (sunAlwaysDown) ? 'Sun is below horizon all day' : '';
	}

	function writeAllTimes() {
		// write all times to table
		let p;
		$('#allTimes table tbody').innerHTML = '';
		for (let i=0; i<periods.length; i++) {
			p = periods[i][1];
			$('#allTimes table tbody').innerHTML += `<tr><td>${textReplacements[p]}</td><td>${App.formatAllTimes(sunTimes[p])}</td></tr>`;
		}
		$('#allTimes table tbody').innerHTML += `<tr><td>${textReplacements.nadir2}</td><td>${App.formatAllTimes(sunTimes.nadir2)}</td></tr>`;
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
		let validTimeCount = 0;
		let direction = App.settings.direction;

		if (!sunTimes) { return; }

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
				path.setAttribute('cursor', 'crosshair');
				path.setAttribute('d',`M 0,0 L ${point1} A ${radius} ${radius} 0 0 ${(direction>0) ? 1 : 0} ${point2} z`); // sweep-flag depends on direction
				$('#arcs').appendChild(path);

				// add hover event to the arc
				App.showInfoOnHover(path, getPeriodInfo, i);
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

	function getPeriodInfo(i) {
		// get info for time periods
		let p = periodsTemp[i];

		let str = `<h3>${textReplacements[p[0]]}</h3>
			<p>${textReplacements[p[1]]}<br><span class="nobr">${App.formatTime(sunTimes[p[1]])}</span></p>
			<p class="to">— to —</p>
			<p>${textReplacements[p[2]]}<br><span class="nobr">${App.formatTime(sunTimes[p[2]])}</span></p>`;

		return str;
	}

	function getSunInfo() {
		// get info for Sun
		let location = App.settings.location;
		let str = '';

		if (!location) { return str; }

		sunPosition = SunCalc.getPosition(now, location.latitude, location.longitude);
		if (sunPosition) {
			str = `<h3>Sun</h3>
				<p>Altitude: ${toDegrees(sunPosition.altitude).toFixed(2)}°<br>
				Azimuth:  ${convertAzimuth(sunPosition.azimuth).toFixed(2)}°</p>
				<p>Altitude at:<br>
				noon: ${toDegrees(noonPosition.altitude).toFixed(2)}°<br>
				midnight: ${toDegrees(nadirPosition.altitude).toFixed(2)}°</p>`;
		}
		return str;
	}

	function getMoonPhase() {
		moonPhase = SunCalc.getMoonIllumination(now).phase; // note: does not require location
		if (debug) { console.log('moon phase: ' + moonPhase); }
		$('#moonIcon').innerHTML += drawMoonIcon(moonPhase);
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

	function drawMoonIcon(phase, radius) {
		// draw the moon icon (instead of using unicode characters)
		// get x radius and sweep direction for each half of the path
		let r = radius || 6; // moon radius
		let cosX = Math.cos( phase * 2 * Math.PI );
		let rx1 = (phase < 0.50) ? r * cosX : r;
		let rx2 = (phase < 0.50) ? r : r * -cosX;
		let sweep1 = (phase < 0.25) ? 0 : 1;
		let sweep2 = (phase < 0.75) ? 1 : 0;

		// return svg path element (2 elliptical arcs)
		return `<path fill="#ccc" stroke="#ccc" stroke-width="0" d="M 0,${r} A ${rx1} ${r} 0 1 ${sweep1} 0,${-r} A ${rx2} ${r} 0 1 ${sweep2} 0,${r} z" />`;
	}

	function getMoonInfo() {
		// get info for moon
		// note: moon phase does not require a location, but positon and times do
		let location = App.settings.location;
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
						str += `<p>Rises: <span class="nobr">${App.formatTime(moonTimes.rise)}</span><br>Sets: <span class="nobr">${App.formatTime(moonTimes.set)}</span></p>`;
					} else {
						str += `<p>Sets: <span class="nobr">${App.formatTime(moonTimes.set)}</span><br>Rises: <span class="nobr">${App.formatTime(moonTimes.rise)}</span></p>`;
					}
				} else if (moonTimes.rise) {
					str += `<p>Rises: <span class="nobr">${App.formatTime(moonTimes.rise)}</span></p>`;
				} else if (moonTimes.set) {
					str += `<p>Sets: <span class="nobr">${App.formatTime(moonTimes.set)}</span></p>`;
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

	function drawMarks2(parent, n, q, length) {
		// draw the number marks on the clock face
		var m;

		for (let i=0; i<=(n-1); i++) {
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

	function drawMarks() {
		drawMarks2('#hourMarks',  24, 0, -4);
		drawMarks2('#hourMarks2', 24, 2, -8);
		drawMarks2('#minuteMarks', 60, 0, 6);
	}

	function pad2(n) {
		// make 2 digits
		return (n < 10) ? ('0' + n) : n;
	}

	function drawNumbers2(parent, n, m, offset, startAtTop, vertical, zeroPad) {
		// draw the numbers on the clock face
		let g, angle, str;
		let p = $(parent);
		let h = parseInt(p.getAttribute('font-size'));
		let angleOffset = startAtTop ? 180 : 0;
		let direction = App.settings.direction;

		// clear any previous numbers (e.g. if changing direction)
		while (p.firstChild) {
			p.removeChild(p.firstChild);
		}

		// create new numbers
		for (let i=0; i<=n; i+=m) {
			if (i===0) { continue; } // start counting from zero, but don't draw zeros (can't just start at 1, since counting by m)
			g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			g.setAttribute('x', 0);
			g.setAttribute('y', 0);
			angle = ((i * direction * (360/n) + angleOffset + 360) % 360); // 0 <= angle < 360
			g.setAttribute('transform', `rotate(${angle}) translate(0,${radius + h * offset})`);

			if ((parent === '#hourNumbers') && App.settings.hour12) {
				let j = i;
				if (i>12) { j = i-12; }
				str = zeroPad ? pad2(j) : j;
			} else {
				str = zeroPad ? pad2(i) : i;
			}

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
		drawNumbers2('#hourNumbers',   24, 1, -1.5, false, true, false);
		drawNumbers2('#minuteNumbers', 60, 5, 0.25, true,  false, true);
	}

	function updateDirection() {
		// update direction after setOption or loadOptions
		// n.b. clock hands will update automatically on next animationFrame
		drawNumbers();
		if (sunTimes) { drawTimePeriods(); }
	}

	function clearDynamicTheme() {
		//reset values
		document.documentElement.setAttribute("data-theme", 'light');
		document.documentElement.style.backgroundColor = '';
		document.body.style.backgroundColor = '';
		// clear section background color
		$All('section.overlay').forEach((o) => { o.style.backgroundColor = ''; });

		$('#hourNumbers').style.fill   = '';
		$('#minuteNumbers').style.fill = '';
	}

	function RGBtoRGBA(s, a) {
		// convert RGB color (a string) to RGBA color
		let s2 = ', ' + a + ')';
		return s.replace(')', s2);
	}

	function updateDynamicTheme() {
		if (App.settings.colorScheme !== 'dynamic') { return; }

		clearDynamicTheme();

		if (sunTimes) {
			getCurrentTimePeriod();
			let p = periods[currentPeriod];
			let isDark = ((currentPeriod <= 2) || (currentPeriod >= 11)) ? true : false;

			if (isDark) {
				document.documentElement.setAttribute("data-theme", 'dark');
				document.documentElement.style.backgroundColor = p[4];
				document.body.style.backgroundColor = p[4];
				$('#hourNumbers').style.fill   = '#222';
				$('#minuteNumbers').style.fill = '#222';
			} else {
				document.documentElement.style.backgroundColor = p[3];
				document.body.style.backgroundColor = p[3];
			}

			// set section background color
			$All('section.overlay').forEach((o) => {
				o.style.backgroundColor = RGBtoRGBA(document.body.style.backgroundColor, 0.9);
			});

			// get time of next period change
			nextPeriodTime = sunTimes[p[2]];
			if (debug) { console.log(`Next theme update at ${sunTimes[p[2]]}`); }
		}
	}

	function writeDate() {
		// write the date to info1
		$('#dateText').innerHTML = `${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
	}

	function tick(timestamp) {
		// animation loop

		let direction = App.settings.direction;
		now = new Date();

		seconds = now.getSeconds() + (now.getMilliseconds())/1000;
		minutes = now.getMinutes() + seconds/60;
		hours   = now.getHours()   + minutes/60;

		// move hands
		secondHand.setAttribute('transform', `rotate(${ seconds * direction * 6 })`); //  6° per second
		minuteHand.setAttribute('transform', `rotate(${ minutes * direction * 6 })`); //  6° per minute
		hourHand.setAttribute('transform',   `rotate(${ hours  * direction * 15 })`); // 15° per hour
		moonHand.setAttribute('transform', `rotate(${ (hours * direction * 15) - (moonPhase * direction * 360) })`); // ~14.5° per hour
		moonIcon.setAttribute('transform', `translate(0 80) rotate(${90 + direction * 90})`); // only on direction change

		// clock icon hand
		clockIconHours.setAttribute('transform', `rotate(${ hours * direction * 15 })`);
		clockIconMinutes.setAttribute('transform', `rotate(${ minutes * direction * 6  })`);

		// one minute timer
		if (!timerStart) { timerStart = timestamp || 0; }
		if ((timestamp - timerStart) >= 60000) {
			// update moon phase every minute — does not need to be recalculated each frame
			// 29.53 days per 360° phase change = ~12.2° per day = ~0.51° per hour = ~0.0085° per minute (i.e. even every minute is excessive!)
			getMoonPhase();
			// reset
			timerStart = null;
		}

		// check if device clock has been changed
		// if the time/date has changed we need to get the moon phase and update the moon position on the next tick
		// (n.b. the timer above won't detect this)
		if ( then && (Math.abs(now - then) > 60000) ) {
			getMoonPhase();
			getSunTimes();
			writeDate();
			SunCalendar.update(); // force calendar to update also
		}

		// update the sun times at midnight
		if ( then && (now.getDate() !== then.getDate()) ) {
			console.log('midnight: updating sun times!');
			getSunTimes();
			writeDate();
		}

		// update the sun times at solar midnight
		if ( then && sunTimes && (now >= sunTimes.nadir2) ) {
			console.log('solar midnight: updating sun times!');
			getSunTimes();
		}

		// redraw time periods if the time zone changes (e.g. daylight savings changes)
		if ( then && (now.getTimezoneOffset() !== then.getTimezoneOffset()) ) {
			console.log('time zone change: redrawing time periods!');
			drawTimePeriods();
		}

		// update theme at next period change time
		if ( sunTimes && (App.settings.colorScheme === 'dynamic') && (now >= nextPeriodTime) ) {
			updateDynamicTheme();
		}

		// write date on first tick
		if (!then) { writeDate(); }

		then = now;
		window.requestAnimationFrame(tick);
	}

	function init() {
		hourHand   = $('#hourHand');
		minuteHand = $('#minuteHand');
		secondHand = $('#secondHand');
		moonHand   = $('#moonHand');
		moonIcon   = $('#moonIcon');
		moonPath   = $('#moonPath');

		clockIconHours   = $('#clockIconHours');
		clockIconMinutes = $('#clockIconMinutes');

		// draw clock
		drawMarks();
		drawNumbers();

		// start clock
		getMoonPhase();
		tick();

		// add hover events to the hour and moon hands
		App.showInfoOnHover(hourHand, getSunInfo);
		App.showInfoOnHover($('#centerCircle'), getSunInfo);
		App.showInfoOnHover(moonHand, getMoonInfo);
	}

	return {
		getSunTimes,
		clearSunTimes,
		writeMainTimes,
		clearDynamicTheme,
		updateDynamicTheme,
		updateDirection,
		drawNumbers,
		drawMoonIcon,
		init
	};
})();
