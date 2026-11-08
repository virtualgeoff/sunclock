/* jshint esversion: 8 */
/* globals $, debug, App, SunCalc, Astronomy, SkyData */

/*
	SunSky
	- the constellation at the zenith through the day (Astronomy Engine)
	- progress from the previous solstice to the next, with daylight hours (SunCalc)
	- a sky map of the constellations on the dark part of the clock face (skydata.js)
	- planet hands, like the moon's, pointing to the time each planet transits
*/

const SunSky = (function() {
	'use strict';

	const STEP = 5 * 60000; // zenith sample interval (ms)
	const HOUR = 3600000;
	let cacheKey = '';
	let data = null;
	let timer = null;

	/* --- calculations --- */

	// Astronomy Engine misspells these two IAU names
	const NAME_FIXES = {Ant: 'Antlia', Cam: 'Camelopardalis'};

	function zenithConstellation(date, lat, lon) {
		let time = Astronomy.MakeTime(date);
		let rot  = Astronomy.Rotation_HOR_EQJ(time, new Astronomy.Observer(lat, lon, 0));
		let vec  = Astronomy.RotateVector(rot, new Astronomy.Vector(0, 0, 1, time));
		let eq   = Astronomy.EquatorFromVector(vec);
		let c = Astronomy.Constellation(eq.ra, eq.dec);
		return {symbol: c.symbol, name: NAME_FIXES[c.symbol] || c.name};
	}

	function refineBoundary(a, b, symbol, lat, lon) {
		// constellation at a is `symbol`, at b it isn't: bisect to ~15 s
		while (b - a > 15000) {
			let m = (a + b) / 2;
			if (zenithConstellation(new Date(m), lat, lon).symbol === symbol) { a = m; } else { b = m; }
		}
		return b;
	}

	function nextBoundary(t, symbol, lat, lon) {
		let limit = t + 24 * HOUR;
		for (let s = t + STEP; s <= limit; s += STEP) {
			if (zenithConstellation(new Date(s), lat, lon).symbol !== symbol) {
				return new Date(refineBoundary(s - STEP, s, symbol, lat, lon));
			}
		}
		return null;
	}

	function sunAltitude(date, lat, lon) {
		return SunCalc.getPosition(date, lat, lon).altitude * 180 / Math.PI;
	}

	function skyClass(alt) {
		if (alt >= -0.833) { return 'day'; }
		if (alt >= -6)     { return 'civil'; }
		if (alt >= -12)    { return 'nautical'; }
		if (alt >= -18)    { return 'astronomical'; }
		return 'night';
	}

	function zenithSegments(start, end, lat, lon) {
		let segs = [];
		let cur = null;
		for (let t = start.getTime(); t < end.getTime(); t += STEP) {
			let c = zenithConstellation(new Date(t), lat, lon);
			if (!cur || c.symbol !== cur.symbol) {
				let boundary = cur ? refineBoundary(t - STEP, t, cur.symbol, lat, lon) : t;
				if (cur) { cur.end = new Date(boundary); segs.push(cur); }
				cur = {symbol: c.symbol, name: c.name, start: new Date(boundary)};
			}
		}
		cur.end = new Date(end);
		segs.push(cur);

		segs.forEach(seg => {
			// how much of the time this constellation is overhead is it actually dark (sun below -12°)?
			let n = 0, dark = 0, day = 0;
			for (let t = seg.start.getTime(); t <= seg.end.getTime(); t += STEP) {
				n++;
				let alt = sunAltitude(new Date(t), lat, lon);
				if (alt < -12) { dark++; } else if (alt >= -0.833) { day++; }
			}
			seg.dark = (dark === n) ? 'dark' : (day === n) ? 'daylight' : (dark > 0) ? 'partly dark' : (day > 0) ? 'daylight, twilight' : 'twilight';
		});
		return segs;
	}

	function daylightHours(day, lat, lon) {
		let noon = new Date(day);
		noon.setHours(12, 0, 0, 0);
		let t = SunCalc.getTimes(noon, lat, lon, 0);
		if (!isNaN(t.sunrise) && !isNaN(t.sunset)) { return (t.sunset - t.sunrise) / HOUR; }
		return (sunAltitude(t.solarNoon, lat, lon) > -0.833) ? 24 : 0; // polar day / night
	}

	function solstices(now) {
		let list = [], equinoxes = [];
		for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
			let s = Astronomy.Seasons(y);
			list.push({date: s.jun_solstice.date, month: 'June'}, {date: s.dec_solstice.date, month: 'December'});
			equinoxes.push({date: s.mar_equinox.date, month: 'March'}, {date: s.sep_equinox.date, month: 'September'});
		}
		list.sort((a, b) => a.date - b.date);
		let i = list.findIndex(s => s.date > now);
		let prev = list[i - 1], next = list[i];
		let equinox = equinoxes.find(e => e.date > prev.date && e.date < next.date);
		return {prev, next, equinox};
	}

	function solsticeData(now, lat, lon) {
		let {prev, next, equinox} = solstices(now);
		let days = [];
		let d = new Date(prev.date);
		d.setHours(12, 0, 0, 0);
		let last = new Date(next.date);
		last.setHours(12, 0, 0, 0);
		while (d <= last) {
			days.push({date: new Date(d), hours: daylightHours(d, lat, lon)});
			d.setDate(d.getDate() + 1);
		}
		prev.hours = daylightHours(prev.date, lat, lon);
		next.hours = daylightHours(next.date, lat, lon);
		return {prev, next, equinox, days};
	}

	/* --- formatting --- */

	function fmtDuration(h) {
		let m = Math.round(h * 60);
		return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
	}

	function fmtDelta(h) {
		let s = Math.round(h * 3600);
		let sign = (s < 0) ? '−' : '+';
		s = Math.abs(s);
		return (s >= 3600) ? `${sign}${fmtDuration(s / 3600)}` : `${sign}${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
	}

	function fmtDay(d) {
		return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
	}

	function hue(symbol) {
		let h = 0;
		for (let i = 0; i < symbol.length; i++) { h = (h * 31 + symbol.charCodeAt(i)) % 360; }
		return h;
	}

	function daysBetween(a, b) {
		return Math.ceil((b - a) / (24 * HOUR));
	}

	/* --- rendering --- */

	function drawZenith(now) {
		const W = 720, H = 132, top = 18, bandH = 62, skyY = 84, skyH = 16;
		let {dayStart, dayEnd, segs} = data;
		let span = dayEnd - dayStart;
		let x = t => (t - dayStart) / span * W;
		let svg = [];

		segs.forEach(seg => {
			let x1 = x(seg.start), w = x(seg.end) - x1;
			let current = (now >= seg.start && now < seg.end) ? ' current' : '';
			let range = `${App.formatTime(seg.start)}–${App.formatTime(seg.end)}`;
			svg.push(`<g class="band${current}"><title>${seg.name} (${seg.symbol}) ${range}</title>` +
				`<rect x="${x1.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${bandH}" style="fill:hsl(${hue(seg.symbol)} 55% 62%)" />`);
			let label = (w > seg.name.length * 6.5 + 6) ? seg.name : (w > 26) ? seg.symbol : '';
			if (label) { svg.push(`<text x="${(x1 + w / 2).toFixed(1)}" y="${top + bandH / 2 + 4}" text-anchor="middle">${label}</text>`); }
			svg.push('</g>');
		});

		data.sky.forEach(s => {
			svg.push(`<rect class="sky-${s.cls}" x="${x(s.start).toFixed(1)}" y="${skyY}" width="${(x(s.end) - x(s.start) + 0.5).toFixed(1)}" height="${skyH}" />`);
		});

		let h = new Date(dayStart);
		for (let i = 0; i <= 24; i++) {
			let hx = x(h);
			if (hx > W + 1) { break; }
			let major = (h.getHours() % 3 === 0);
			svg.push(`<line class="grid" x1="${hx.toFixed(1)}" y1="${skyY + skyH}" x2="${hx.toFixed(1)}" y2="${skyY + skyH + (major ? 6 : 3)}" />`);
			if (major && hx > 8 && hx < W - 8) {
				svg.push(`<text x="${hx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${App.formatTime(h)}</text>`);
			}
			h = new Date(h.getTime() + HOUR);
		}

		let nx = x(now).toFixed(1);
		svg.push(`<line class="now" x1="${nx}" y1="${top - 6}" x2="${nx}" y2="${skyY + skyH + 2}"><title>now</title></line>`);
		svg.push(`<text x="${nx}" y="10" text-anchor="middle" class="nowlabel">now</text>`);

		$('#skyChart').innerHTML = `<svg class="skychart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Constellation at the zenith through the day">${svg.join('')}</svg>`;

		$('#skyTable tbody').innerHTML = segs.map(seg => {
			let current = (now >= seg.start && now < seg.end) ? ' class="current"' : '';
			return `<tr${current}><td>${App.formatTime(seg.start)}</td><td>${App.formatTime(seg.end)}</td>` +
				`<td><span class="swatch" style="background:hsl(${hue(seg.symbol)} 55% 62%)"></span>${seg.name} <small>(${seg.symbol})</small></td><td>${seg.dark}</td></tr>`;
		}).join('');
	}

	function solsticeSVG(now, compact) {
		const W = compact ? 360 : 720, H = compact ? 190 : 290;
		const m = compact ? {l: 34, r: 10, t: 14, b: 26} : {l: 44, r: 16, t: 34, b: 46};
		let {prev, next, equinox, days} = data.solstice;
		let min = Math.min(...days.map(d => d.hours)), max = Math.max(...days.map(d => d.hours));
		let yMin = Math.max(0, Math.floor(min) - 1), yMax = Math.min(24, Math.ceil(max) + 1);
		let grid = (yMax - yMin <= 6) ? 1 : (yMax - yMin <= 12) ? 2 : 4;
		let x = t => m.l + Math.min(1, Math.max(0, (t - prev.date) / (next.date - prev.date))) * (W - m.l - m.r);
		let y = h => m.t + (yMax - h) / (yMax - yMin) * (H - m.t - m.b);
		let base = y(yMin);
		let today = data.today;
		let svg = [];

		for (let g = Math.ceil(yMin / grid) * grid; g <= yMax; g += grid) {
			svg.push(`<line class="grid" x1="${m.l}" y1="${y(g).toFixed(1)}" x2="${W - m.r}" y2="${y(g).toFixed(1)}" />`);
			svg.push(`<text x="${m.l - 6}" y="${(y(g) + 4).toFixed(1)}" text-anchor="end">${g}h</text>`);
		}

		let month = new Date(prev.date.getFullYear(), prev.date.getMonth() + 1, 1);
		while (month < next.date) {
			let mx = x(month).toFixed(1);
			svg.push(`<line class="grid" x1="${mx}" y1="${base}" x2="${mx}" y2="${base + 5}" />`);
			svg.push(`<text x="${mx}" y="${base + 17}" text-anchor="middle">${month.toLocaleDateString([], {month: 'short'})}</text>`);
			month.setMonth(month.getMonth() + 1);
		}

		let pts = days.map(d => [x(d.date), y(d.hours)]);
		let past = days.filter(d => d.date <= now).map(d => [x(d.date), y(d.hours)]);
		past.push([x(now), y(today.hours)]);
		let future = [[x(now), y(today.hours)]].concat(days.filter(d => d.date > now).map(d => [x(d.date), y(d.hours)]));
		let poly = p => p.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
		let area = p => `${p[0][0].toFixed(1)},${base} ${poly(p)} ${p[p.length - 1][0].toFixed(1)},${base}`;
		svg.push(`<polygon class="future" points="${area(future)}" />`);
		svg.push(`<polygon class="past" points="${area(past)}" />`);
		svg.push(`<polyline class="curve" points="${poly(pts)}" />`);

		if (equinox) {
			let ex = x(equinox.date).toFixed(1);
			svg.push(`<line class="equinox" x1="${ex}" y1="${m.t - 6}" x2="${ex}" y2="${base}" />`);
			if (!compact) { svg.push(`<text x="${ex}" y="${m.t - 10}" text-anchor="middle">${equinox.month} equinox ${fmtDay(equinox.date)}</text>`); }
		}

		let nx = x(now), ny = y(today.hours);
		[[prev, 'start'], [next, 'end']].forEach(([s, anchor]) => {
			let sx = x(s.date);
			svg.push(`<circle class="endpoint" cx="${sx.toFixed(1)}" cy="${y(s.hours).toFixed(1)}" r="4"><title>${s.month} solstice ${fmtDay(s.date)}: ${fmtDuration(s.hours)}</title></circle>`);
			if (!compact) { svg.push(`<text x="${sx.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" class="strong">${s.month} solstice ${fmtDay(s.date)}</text>`); }
			if (Math.abs(nx - sx) < 120) { return; }  // today's label is close by and already shows (nearly) this value
			let ly = y(s.hours) + ((s.hours > (yMin + yMax) / 2) ? 18 : -10);
			svg.push(`<text x="${(sx + (anchor === 'start' ? 8 : -8)).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${fmtDuration(s.hours)}</text>`);
		});

		svg.push(`<line class="now" x1="${nx.toFixed(1)}" y1="${m.t}" x2="${nx.toFixed(1)}" y2="${base}" />`);
		svg.push(`<circle class="today" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="5"><title>Today: ${fmtDuration(today.hours)}</title></circle>`);
		let tAnchor = (nx > W * 0.75) ? 'end' : 'start';
		svg.push(`<text x="${(nx + (tAnchor === 'start' ? 9 : -9)).toFixed(1)}" y="${(ny + ((today.hours > (yMin + yMax) / 2) ? 20 : -10)).toFixed(1)}" text-anchor="${tAnchor}" class="strong">today ${fmtDuration(today.hours)}</text>`);

		return `<svg class="skychart${compact ? ' mini' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daylight hours from the ${prev.month} solstice to the ${next.month} solstice">${svg.join('')}</svg>`;
	}

	function drawSolstice(now) {
		let {prev, next} = data.solstice;
		let today = data.today;
		$('#solsticeChart').innerHTML = solsticeSVG(now, false);

		let pct = progress(now);
		let toGo = daysBetween(now, next.date);
		let kind = (next.hours >= prev.hours) ? 'longest day' : 'shortest day';
		$('#solsticeProgress').innerHTML = `${pct.toFixed(0)}% of the way from the ${prev.month} solstice to the ${next.month} solstice (${kind})` +
			`<span class="progress wide"><span style="width:${pct.toFixed(1)}%"></span></span>`;
		$('#solsticeStats tbody').innerHTML = [
			['Daylight today', `${fmtDuration(today.hours)} (${fmtDelta(today.delta)} vs yesterday)`],
			[`${prev.month} solstice`, `${prev.date.toLocaleDateString()} ${App.formatTime(prev.date)} — ${fmtDuration(prev.hours)}`],
			[`${next.month} solstice`, `${next.date.toLocaleDateString()} ${App.formatTime(next.date)} — ${fmtDuration(next.hours)}, in ${toGo} day${toGo === 1 ? '' : 's'}`],
			['Daylight still to ' + ((next.hours >= today.hours) ? 'gain' : 'lose'), fmtDuration(Math.abs(next.hours - today.hours))]
		].map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td></tr>`).join('');
	}

	function progress(now) {
		let {prev, next} = data.solstice;
		return Math.min(100, Math.max(0, (now - prev.date) / (next.date - prev.date) * 100));
	}

	function writeMainLines(now) {
		let seg = data.segs.find(s => now >= s.start && now < s.end);
		if (seg) {
			let until = (seg.end.getTime() === data.dayEnd.getTime()) ? nextBoundary(now.getTime(), seg.symbol, data.lat, data.lon) : seg.end;
			$('#zenithNow').innerHTML = `Overhead: <strong>${seg.name}</strong>` + (until ? ` until ${App.formatTime(until)}` : '') + ` · <a href="#sky">zenith sky</a>`;
		}
		let {next} = data.solstice;
		let toGo = daysBetween(now, next.date);
		let pct = progress(now);
		$('#solsticeNow').innerHTML = `${toGo} day${toGo === 1 ? '' : 's'} to the ${next.month} solstice<br>` +
			`<span class="progress" title="${pct.toFixed(0)}% of the way to the ${next.month} solstice"><span style="width:${pct.toFixed(1)}%"></span></span> ${pct.toFixed(0)}%<br>` +
			`${fmtDuration(data.today.hours)} daylight (${fmtDelta(data.today.delta)}/day) · <a href="#solstice">chart</a>`;
		let mini = $('#solsticeMini');
		if (mini) { mini.innerHTML = solsticeSVG(now, true); }
	}

	/* --- planet hands --- */

	const PLANETS = [
		['Mercury', 40, '#c9c2b8'], ['Venus', 50, '#fff1c1'], ['Mars', 60, '#ff7a50'],
		['Jupiter', 92, '#f0c890'], ['Saturn', 100, '#e6d08a']
	];

	function planetInfo(body) {
		let location = App.settings.location;
		if (!location) { return `<h3>${body}</h3>`; }
		let now = new Date();
		let obs = new Astronomy.Observer(location.latitude, location.longitude, 0);
		let eq = Astronomy.Equator(body, now, obs, true, true);
		let j2000 = Astronomy.Equator(body, now, obs, false, true);
		let alt = Astronomy.Horizon(now, obs, eq.ra, eq.dec, 'normal').altitude;
		let c = Astronomy.Constellation(j2000.ra, j2000.dec);
		let mag = Astronomy.Illumination(body, now).mag;
		let start = new Date(now);
		start.setHours(0, 0, 0, 0);
		let times = [
			['Rises', Astronomy.SearchRiseSet(body, obs, +1, start, 1)],
			['Highest', Astronomy.SearchHourAngle(body, obs, 0, start).time],
			['Sets', Astronomy.SearchRiseSet(body, obs, -1, start, 1)]
		].filter(e => e[1]).sort((a, b) => a[1].date - b[1].date)
			.map(e => `${e[0]}: <span class="nobr">${App.formatTime(e[1].date)}</span>`).join('<br>');
		return `<h3>${body}</h3><p>In ${NAME_FIXES[c.symbol] || c.name}, magnitude ${mag.toFixed(1)}<br>` +
			`${(alt > 0) ? `${alt.toFixed(0)}° above the horizon` : 'Below the horizon'}</p><p>${times}</p>`;
	}

	function drawPlanets(now, rot, dir) {
		// a planet at RA α transits when the hour hand reaches the same angle as on the sky map
		let g = $('#planetHands'), location = App.settings.location;
		if (!g || !location) { return; }
		if (!g.childElementCount) {
			g.innerHTML = PLANETS.map(([body, r, color]) =>
				`<g class="planet" id="planet${body}"><line x1="0" y1="0" x2="0" y2="${r}" stroke="${color}" />` +
				`<g class="planetIcon"><circle r="7" fill="transparent" /><circle class="disc" r="3.2" fill="${color}" /><text x="5" y="1.6">${body}</text></g></g>`).join('');
			PLANETS.forEach(([body]) => App.showInfoOnHover($(`#planet${body}`), planetInfo, body));
		}
		let obs = new Astronomy.Observer(location.latitude, location.longitude, 0);
		PLANETS.forEach(([body, r]) => {
			let eq = Astronomy.Equator(body, now, obs, true, true);
			let a = dir * (eq.ra * 15 + rot);
			let p = $(`#planet${body}`);
			p.setAttribute('transform', `rotate(${a.toFixed(2)})`);
			p.querySelector('.planetIcon').setAttribute('transform', `translate(0 ${r}) rotate(${(-a).toFixed(2)})`);
		});
	}

	/* --- sky map on the clock face --- */

	const DARK_PERIODS = ['earlyMorning', 'astronomicalMorningTwilight', 'astronomicalEveningTwilight', 'lateEvening'];

	// J2000 catalogue RA/Dec (degrees) to apparent place of date: annual aberration, then precession and nutation
	function apparentPlace(time) {
		let m = Astronomy.Rotation_EQJ_EQD(time).rot;
		let v = Astronomy.BaryState(Astronomy.Body.Earth, time), c = Astronomy.C_AUDAY;
		let vx = v.vx / c, vy = v.vy / c, vz = v.vz / c, D = Math.PI / 180;
		return (ra, dec) => {
			let cd = Math.cos(dec * D);
			let x = cd * Math.cos(ra * D) + vx, y = cd * Math.sin(ra * D) + vy, z = Math.sin(dec * D) + vz;
			let X = m[0][0] * x + m[1][0] * y + m[2][0] * z;
			let Y = m[0][1] * x + m[1][1] * y + m[2][1] * z;
			let Z = m[0][2] * x + m[1][2] * y + m[2][2] * z;
			return [Math.atan2(Y, X) / D, Math.atan2(Z, Math.hypot(X, Y)) / D];
		};
	}

	// how far the moon is east of the sun in apparent topocentric RA (degrees); drives the moon hand
	let moonLead = null;
	function updateMoonLead(now, lat, lon) {
		let obs = new Astronomy.Observer(lat, lon, 0);
		let moon = Astronomy.Equator(Astronomy.Body.Moon, now, obs, true, true);
		let sun = Astronomy.Equator(Astronomy.Body.Sun, now, obs, true, true);
		moonLead = (((moon.ra - sun.ra) * 15) % 360 + 360) % 360;
	}

	function drawSkyMap(now) {
		let g = $('#skyMap'), clip = $('#nightClip'), dayClip = $('#dayClip'), location = App.settings.location;
		if (!g || !clip || !dayClip || !location || typeof SkyData === 'undefined') { return; }
		now = now || new Date();
		let lat = location.latitude, lon = location.longitude, dir = App.settings.direction || 1;

		// azimuthal equidistant map centred on the visible celestial pole; the zenith (dec = latitude) is at radius rz
		let s = (lat < 0) ? -1 : 1;
		let k = Math.min(100 / Math.max(90 - Math.abs(lat), 10), 2.2);
		let rz = k * (90 - Math.abs(lat)), R = 134;
		// the RA on the meridian (local sidereal time) lies under the hour hand
		let hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
		let rot = 15 * hours - (Astronomy.SiderealTime(now) * 15 + lon);
		drawPlanets(now, rot, dir);
		updateMoonLead(now, lat, lon);
		let place = apparentPlace(Astronomy.MakeTime(now));
		let pt = (ra, dec) => {
			[ra, dec] = place(ra, dec);
			let r = k * (90 - s * dec), a = dir * (ra + rot) * Math.PI / 180;
			return [-r * Math.sin(a), r * Math.cos(a), r];
		};
		let f = n => n.toFixed(1);
		let current = zenithConstellation(now, lat, lon).symbol;

		let out = [`<circle class="zenithCircle" r="${f(rz)}" />`];
		Object.keys(SkyData.lines).forEach(abbr => {
			let d = SkyData.lines[abbr].map(seg => seg.map(p => pt(p[0], p[1]))).filter(seg => seg.some(p => p[2] <= R))
				.map(seg => 'M' + seg.map(p => `${f(p[0])},${f(p[1])}`).join('L')).join('');
			if (d) { out.push(`<path class="figure${(abbr === current) ? ' current' : ''}" d="${d}" />`); }
		});
		SkyData.stars.forEach(([ra, dec, mag]) => {
			let p = pt(ra, dec);
			if (p[2] <= R) { out.push(`<circle class="star" cx="${f(p[0])}" cy="${f(p[1])}" r="${Math.max(0.35, 1.5 - 0.27 * mag).toFixed(2)}" />`); }
		});
		Object.keys(SkyData.names).forEach(abbr => {
			let [ra, dec, rank, name] = SkyData.names[abbr];
			let p = pt(ra, dec);
			if (p[2] > 124 || (rank > 1 && abbr !== current)) { return; }
			out.push(`<text${(abbr === current) ? ' class="current"' : ''} x="${f(p[0])}" y="${f(p[1])}">${name}</text>`);
		});
		let a = dir * 15 * hours * Math.PI / 180;
		out.push(`<circle class="zenithMark" cx="${f(-rz * Math.sin(a))}" cy="${f(rz * Math.cos(a))}" r="3.5" />`);

		// the whole sky is drawn twice: bright where it is dark enough to see, faint where the sun washes it out
		let map = out.join('');
		g.innerHTML = `<g class="day" clip-path="url(#dayClip)">${map}</g><g class="night" clip-path="url(#nightClip)">${map}</g>`;
		let arcs = Array.from($All('#arcs path')).filter(p => p.id && p.getAttribute('d'));
		let paths = list => list.map(p => `<path d="${p.getAttribute('d')}" />`).join('');
		clip.innerHTML = paths(arcs.filter(p => DARK_PERIODS.includes(p.id)));
		dayClip.innerHTML = paths(arcs.filter(p => !DARK_PERIODS.includes(p.id)));
	}

	/* --- public --- */

	function update() {
		let location = App.settings.location;
		if (!location) { return; }
		let now = new Date();
		let lat = location.latitude, lon = location.longitude;
		let key = `${lat},${lon},${now.toDateString()},${App.settings.hour12}`;

		if (key !== cacheKey) {
			let dayStart = new Date(now);
			dayStart.setHours(0, 0, 0, 0);
			let dayEnd = new Date(dayStart);
			dayEnd.setDate(dayEnd.getDate() + 1);
			let sky = [];
			for (let t = dayStart.getTime(); t < dayEnd.getTime(); t += 10 * 60000) {
				sky.push({start: new Date(t), end: new Date(Math.min(t + 10 * 60000, dayEnd.getTime())), cls: skyClass(sunAltitude(new Date(t + 5 * 60000), lat, lon))});
			}
			let yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			let todayHours = daylightHours(now, lat, lon);
			data = {
				lat, lon, dayStart, dayEnd, sky,
				segs: zenithSegments(dayStart, dayEnd, lat, lon),
				solstice: solsticeData(now, lat, lon),
				today: {hours: todayHours, delta: todayHours - daylightHours(yesterday, lat, lon)}
			};
			cacheKey = key;
			if (debug) { console.log('SunSky data', data); }
		}

		writeMainLines(now);
		drawSkyMap(now);
		if (window.location.hash === '#sky') { drawZenith(now); }
		if (window.location.hash === '#solstice') { drawSolstice(now); }

		if (!timer) { timer = setInterval(update, 60000); }
	}

	function init() {
		window.addEventListener('hashchange', update);
	}

	return {
		zenithConstellation,
		daylightHours,
		drawSkyMap,
		moonLead: () => moonLead,
		update,
		init
	};
})();

window.addEventListener('DOMContentLoaded', SunSky.init);
