/*
	SunClock Calendar

	Geoff Pack, January 2024
	https://github.com/virtualgeoff/sunclock
*/

/* jshint esversion: 6 */
/* globals $, $All, debug, App, SunClock, Astronomy */

const SunCalendar = (function() {
	'use strict';

	const tau = 2 * Math.PI;
	const msPerDay = 24 * 60 * 60 * 1000; // milliseconds per day
	const snap = true;

	let radius = 136;
	let angleDegrees = 0;
	let now, then = null;
	let thisYear, yearStart, yearEnd, leapYear;
	let daysPerYear, msPerYear;

	function dateToAngle(date) {
		// get angle on face for date
		let angle = (date - yearStart) / msPerYear * 360;
		return angle;
	}

	function angleToDate(angle) {
		// get date from angle (of pointer)
		let ms = yearStart.valueOf() + (angle/360) * msPerYear;
		return new Date(ms);
	}

	function getPointFromAngle(angle, radius) {
		// get point from angle and radius
		let theta = (angle + 180) * -tau/360;  // convert to radians
		return `${Math.sin(theta) * radius}, ${Math.cos(theta) * radius}`; // return as string for svg path attribute
	}

	function deltaT(date2, date1) {
		// get the time delta (in days) between 2 dates
		let delta = (date2.valueOf() - date1.valueOf())	/ msPerDay;
		return delta;
	}

	function formatDelta(date2, date1) {
		// format the time delta between 2 dates
		// TODO: format as days, (months, weeks, days, hours, minutes)
		let delta = deltaT(date2, date1);
		let str = `∆: ${delta.toFixed(1)} days`;
		return str.replace('-', '−'); // replace hyphen-minus with minus
	}

	function getDate() {
		// get the current date
		now = new Date();
		thisYear  = now.getFullYear();
		yearStart = new Date(thisYear, 0, 1);
		yearEnd   = new Date(thisYear+1, 0, 1);
		leapYear  = (new Date(thisYear, 1, 29).getDate() === 29);
		daysPerYear = leapYear ? 366 : 365;
		msPerYear = daysPerYear * msPerDay; // milliseconds per year
	}

	function update() {
		// set hand position, repeat on the minute
		now = new Date();
		if (debug) { console.log(`updating calendar: ${now.toTimeString()}`); }

		if (then && (now.getFullYear() !== then.getFullYear())) {
			alert("Happy New Year!\nupdating calendar");
			getDate();
			// redraw face
			drawFace();
			// clear moon phases and redraw astronomical events
			$All('.moonPhase').forEach((o) => { o.remove(); });
			drawAstronomicalEvents();
			drawMoonPhases();
		}

		// set date hand
		$('#dateHand').setAttribute('transform', `rotate(${dateToAngle(now)})`);

		// calendar icon text
		$('#calendarIconMonth').textContent = (now.toLocaleString('default', { month: 'short' })).toUpperCase();
		$('#calendarIconDate').textContent  = now.getDate();

		// update every minute, on the minute
		then = now;
		let delay = 60000 - now.getSeconds() * 1000 - now.getMilliseconds();
		setTimeout(update, delay);
	}

	function drawFace() {
		// draw the calendar face: month arcs and names, day marks
		let length, angle, month, d1, d2, d3, p1, p2;
		let str1 = '', str2 = '', str3 = '';
		let r1 = radius - 17;
		let r2 = radius - 28;
		let r3 = radius - 24.5;
		let daysPerMonth = [31, (leapYear ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
		let j;

		// months
		for (let i=0; i<12; i++) {
			// get dates for beginning and end of month
			d1 = new Date(thisYear, i, 1);
			d2 = new Date(thisYear, i+1, 1);
			month = d1.toLocaleString('default', { month: 'long' });

			// month background colors (sets style via a class) - offset 6 months for southern latitudes
			if ((App.settings.location) && (App.settings.location.latitude < 0)) {
				j = i + 6;
				if (j >= 12) { j -= 12; }
			} else {
				j = i;
			}

			// get points for each date and draw an arc
			p1 = getPointFromAngle(dateToAngle(d1), r1);
			p2 = getPointFromAngle(dateToAngle(d2), r1);
			str1 += `<path class="m${j+1}" d="M ${p1} A ${r1} ${r1} 0 0 1 ${p2}" stroke-width="34" />`;

			// write month name on arc
			if ((i < 3) || (i > 8)) {
				p1 = getPointFromAngle(dateToAngle(d1), r2);
				p2 = getPointFromAngle(dateToAngle(d2), r2);
				str2 += `<path id="m${i+1}" d="M ${p1} A ${r2} ${r2} 0 0 1 ${p2}" fill="none" stroke="none" stroke-width="0.5" />`;
			} else {
				p1 = getPointFromAngle(dateToAngle(d1), r3);
				p2 = getPointFromAngle(dateToAngle(d2), r3);
				str2 += `<path id="m${i+1}" d="M ${p2} A ${r3} ${r3} 0 0 0 ${p1}" fill="none" stroke="none" stroke-width="0.5" />`;
			}
			str2 += `<text><textPath href="#m${i+1}" startOffset="50%">${month}</textPath></text>`;

			// days
			for (let j=1; j<=daysPerMonth[i]; j++) {
				d3 = new Date(thisYear, i, j);

				length = 5;
				if ((d3.getDay() === 0) || (d3.getDay() === 6)) { length = 8; }
				angle = dateToAngle(d3);
				if (d3.getDate() === 1) {
					str3 += `<line x1="0" y1="${-radius}" x2="0" y2="${-radius+34}" stroke="#777" stroke-width="0.25" transform="rotate(${angle})" />`;
				}
				str3 += `<line x1="0" y1="${-radius}" x2="0" y2="${-radius+length}" transform="rotate(${angle})" />`;
			}
		}
		$('#monthArcs').innerHTML  = str1;
		$('#monthNames').innerHTML = str2;
		$('#dayMarks').innerHTML   = str3;

		drawAstronomicalEvents();
		drawMoonPhases();
	}

	function drawAstronomicalEvents() {
		// draw astronomical events: moon phases, equinoxes, solstices, perihelion, aphelion
		let seasons = Astronomy.Seasons(thisYear);
		let perihelion = Astronomy.SearchPlanetApsis(Astronomy.Body.Earth, yearStart);
		let aphelion = Astronomy.NextPlanetApsis(Astronomy.Body.Earth, perihelion);
		let South = ((App.settings.location) && (App.settings.location.latitude < 0));

		let thisYearsEvents = {
			'springEquinox':  (South ? seasons.sep_equinox  : seasons.mar_equinox),
			'summerSolstice': (South ? seasons.dec_solstice : seasons.jun_solstice),
			'autumnEquinox':  (South ? seasons.mar_equinox  : seasons.sep_equinox),
			'winterSolstice': (South ? seasons.jun_solstice : seasons.dec_solstice),
			'perihelion':     perihelion.time,
			'aphelion':       aphelion.time,

			// solar midpoints, or 'mid-quarter days' are halfway between the equinoxes and solstices (by angle, not time)
			// they are close to but not the same as the 'cross-quarter' days
			'febMidpoint': ( Astronomy.SearchSunLongitude(315, (new Date(thisYear, 1,  1)), 20) ),
			'mayMidpoint': ( Astronomy.SearchSunLongitude(45,  (new Date(thisYear, 4,  1)), 20) ),
			'augMidpoint': ( Astronomy.SearchSunLongitude(135, (new Date(thisYear, 7,  1)), 20) ),
			'novMidpoint': ( Astronomy.SearchSunLongitude(225, (new Date(thisYear, 10, 1)), 20) )
		};

		if (debug) { console.group('Astronomical events'); }
		$All('#astronomicalEvents > g').forEach((o) => {
			o.dataset.date = thisYearsEvents[o.id]; // date gets stringified to UTC date (ISO 8601)
			o.setAttribute('transform', `rotate(${ dateToAngle(new Date(thisYearsEvents[o.id])) })`);
			if (debug) { console.log(`${o.id}: ${thisYearsEvents[o.id].date}:`); }
		});
		if (debug) { console.groupEnd(); }

		// add hover events to all astronomicalEvents
		$All('#astronomicalEvents > g').forEach((o) => {
			App.showInfoOnHover(o, getAstronomicalEventInfo, o.id);
		});
	}

	function drawMoonPhases() {
		// draw phases of the moon
		let quarters = [];
		let qAngle, qDate, qDate2, qTitle, qIcon, str;

		const moons = [
			['New Moon',           '🌑'],
			['First Quarter Moon', '🌓'],
			['Full Moon',          '🌕'],
			['Third Quarter Moon', '🌗']
		];

		// get first quarter of year
		quarters[0] = Astronomy.SearchMoonQuarter(yearStart);
		// get the other quarters of year
		for (let i=1; i<51; i++) {
			quarters[i] = Astronomy.NextMoonQuarter(quarters[i-1]);
		}

		// draw all the quarters
		if (debug) { console.group('Moon quarters'); }
		for (let i=0; i<quarters.length; i++) {
			qDate  = quarters[i].time.date;
			qDate2 = quarters[i].time.toString();
			qTitle = moons[quarters[i].quarter][0];
			qIcon  = moons[quarters[i].quarter][1];
			if (qDate > yearEnd) { continue; }
			if (debug) { console.log(`${i}: ${qTitle}: ${qDate}`); }

			qAngle = dateToAngle(qDate);

			// old: use unicode icons for moon phase
			/* str += `
				<g class="moonPhase" data-title="${qTitle}" data-date="${qDate2}" stroke="currentColor" transform="rotate(${qAngle})">
					<line x1="0" y1="${-radius}" x2="0" y2="${-radius-3}" />
					<text x="-2.5" y="${-radius-5}" font-size="5px">${qIcon}</text>
				</g>`; */

			// new: use SVG path element
			str += `
				<g id="moonQuarter${i}" data-title="${qTitle}" data-date="${qDate2}" stroke="currentColor" transform="rotate(${qAngle})">
					<g transform="translate(0 ${-radius+15})">
						<circle cx="0" cy="0" r="${App.supportsHover ? '5' : '7.5'}" fill="rgba(0,255,0,0)" stroke="none" />
						<circle cx="0" cy="0" r="3" fill="#000" stroke="#000" stroke-width="0" />
						${SunClock.drawMoonIcon(quarters[i].quarter/4, 3)}
					</g>
				</g>`;
		}
		if (debug) { console.groupEnd(); }
		$('#moonPhases').innerHTML += str;

		// add hover events to all moonPhases
		$All('#moonPhases > g').forEach((o) => {
			App.showInfoOnHover(o, getAstronomicalEventInfo, o.id);
		});
	}

	function getAstronomicalEventInfo(id) {
		// get info for astronomical events
		let obj = $('#'+id);
		let title = obj.dataset.title;
		let now  = new Date();
		let date = new Date(obj.dataset.date);

		// shouldn't be needed, but on touch pointerout event doesn't always fire when astro events are tapped on
		$('#dateHand2').style.display = 'none';

		return `<h3>${title}</h3><p>${App.formatDate(date)}</p><p>${formatDelta(date, now)}</p>`;
	}

	function updateAngle() {
		// update the angle of dateHand2 and text
		let date = angleToDate(angleDegrees);
		let str, date2, dayOfYear;

		if (snap) {
			date2 = new Date(thisYear, date.getMonth(), date.getDate(), 0, 0, 0, 0); // round down
			// rotate indicator line
			$('#dateHand2').setAttribute('transform', `rotate(${ dateToAngle(date2) })`);
		} else {
			date2 = date;
			// rotate indicator line
			$('#dateHand2').setAttribute('transform', `rotate(${ angleDegrees })`);
		}
		dayOfYear = Math.round((date2 - yearStart) / msPerDay) + 1; // no day 0

		// update info2
		str =  `<h3>Day ${dayOfYear}</h3><p>${App.formatDate(date2)}</p><p>${formatDelta(date2, now)}</p>`;
		if (debug) { str += `<p>${angleDegrees.toFixed(3)}°</p>`; }
		App.showInfo(str);
	}

	function getPointerAngle(e) {
		// get pointer position and calculate angle
		// note atan2(y,x) gives the counterclockwise angle, in radians, between the +ve x-axis and the point (x,y)
		e.preventDefault();
		let x = e.offsetX - $('#calendar').clientWidth/2;
		let y = e.offsetY - $('#calendar').clientHeight/2;
		angleDegrees = Math.atan2(y,x) * 360/tau + 90;
		if (angleDegrees < 0) { angleDegrees += 360; }
		updateAngle();
	}

	function showPointer(e) {
		// show dateHand2
		$('#dateHand2').style.display = 'block';
		getPointerAngle(e);
	}

	function hidePointer(e) {
		// hide dateHand2 and clear info2
		if (App.supportsHover) {
			$('#dateHand2').style.display = 'none';
			App.hideInfo();
		}
	}

	function init() {
		getDate();
		drawFace();
		update();

		// mouse & touch
		$('#calendarOverlay').addEventListener("pointermove", getPointerAngle);
		$('#calendarOverlay').addEventListener("pointerover", showPointer);
		$('#calendarOverlay').addEventListener("pointerout",  hidePointer);
	}

	return {
		update,
		drawFace,
		init
	};
})();
