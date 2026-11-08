/* jshint esversion: 8 */
/* globals $, App */

/*
	Forecast
	- today's and tomorrow's forecast and the next 24 hours for the clock's location
	- data from Open-Meteo (https://open-meteo.com, no API key, CC BY 4.0)
	- the location is rounded to 2 decimal places (~1 km) before it is sent
*/

const Forecast = (function() {
	'use strict';

	const API = 'https://api.open-meteo.com/v1/forecast';
	const REFRESH = 30 * 60000;  // refetch after
	const STALE = 6 * 3600000;   // stop showing after
	const RETRY = 5 * 60000;     // wait after a failed fetch
	const STORE = 'forecast';
	const WMO = {
		0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
		51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
		61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
		71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
		80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers',
		95: 'Thunderstorms', 96: 'Thunderstorms, hail', 99: 'Thunderstorms, hail'
	};
	let state = null; // {key, fetched, failed, data}
	let pending = '';
	let timer = null;

	function imperial() {
		return /-(US|LR|MM)$/i.test(navigator.language || '');
	}

	function query(location) {
		let q = `latitude=${location.latitude.toFixed(2)}&longitude=${location.longitude.toFixed(2)}` +
			'&hourly=temperature_2m,precipitation_probability,is_day' +
			'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max' +
			'&current=temperature_2m,weather_code,is_day&timezone=auto&timeformat=unixtime&forecast_days=2';
		if (imperial()) { q += '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch'; }
		return q;
	}

	function load() {
		try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; }
	}

	function save() {
		try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
	}

	function fetchForecast(key) {
		pending = key;
		fetch(`${API}?${key}`)
			.then(r => { if (!r.ok) { throw new Error(`HTTP ${r.status}`); } return r.json(); })
			.then(json => { state = {key, fetched: Date.now(), data: json}; save(); })
			.catch(err => {
				console.warn(`forecast: ${err.message}`);
				state = (state && state.key === key) ? Object.assign(state, {failed: Date.now()}) : {key, fetched: 0, failed: Date.now(), data: null};
			})
			.finally(() => { pending = ''; draw(); });
	}

	/* --- rendering --- */

	const deg = v => `${Math.round(v)}°`;
	const unit = u => (u || '').replace('mp/h', 'mph').replace('inch', 'in');

	function dayLine(d, i, label) {
		let dl = d.daily, du = d.daily_units;
		let extra = [`${dl.precipitation_probability_max[i] || 0}% precip`];
		if (dl.precipitation_sum[i] > 0) { extra[0] += ` (${dl.precipitation_sum[i]} ${unit(du.precipitation_sum)})`; }
		extra.push(`wind ${Math.round(dl.wind_speed_10m_max[i])} ${unit(du.wind_speed_10m_max)}`);
		return `<p class="fcDay"><b>${label}</b> ${deg(dl.temperature_2m_max[i])} / ${deg(dl.temperature_2m_min[i])} · ${WMO[dl.weather_code[i]] || ''}` +
			`<br><small>${extra.join(' · ')}</small></p>`;
	}

	function niceStep(range) {
		return [1, 2, 5, 10, 20, 50].find(s => range / s <= 4) || 100;
	}

	function chart(d, now) {
		const W = 360, H = 190, m = {l: 34, r: 10, t: 26, b: 26};
		let h = d.hourly;
		let first = h.time.findIndex(t => t * 1000 > now);
		let i0 = (first < 0) ? h.time.length - 1 : Math.max(0, first - 1);
		let idx = [];
		for (let i = i0; i < Math.min(h.time.length, i0 + 25); i++) { idx.push(i); }
		if (idx.length < 2) { return ''; }

		let t0 = h.time[idx[0]] * 1000, t1 = h.time[idx[idx.length - 1]] * 1000;
		let temps = idx.map(i => h.temperature_2m[i]);
		let tMin = Math.min(...temps), tMax = Math.max(...temps);
		let step = niceStep(tMax - tMin);
		let lo = Math.floor(tMin / step) * step, hi = Math.ceil(tMax / step) * step;
		if (hi === lo) { hi = lo + step; }
		let x = t => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
		let y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
		let base = H - m.b, bw = (W - m.l - m.r) / (idx.length - 1);
		let f = n => n.toFixed(1);
		let svg = [];

		idx.slice(0, -1).forEach(i => {
			if (h.is_day[i] === 0) { svg.push(`<rect class="nightband" x="${f(x(h.time[i] * 1000))}" y="${m.t}" width="${f(bw + 0.5)}" height="${base - m.t}" />`); }
		});
		for (let v = lo; v <= hi; v += step) {
			svg.push(`<line class="grid" x1="${m.l}" y1="${f(y(v))}" x2="${W - m.r}" y2="${f(y(v))}" />`);
			svg.push(`<text x="${m.l - 6}" y="${f(y(v) + 5)}" text-anchor="end">${v}°</text>`);
		}
		idx.forEach(i => {
			let p = h.precipitation_probability[i] || 0;
			if (p > 0) {
				let ph = (base - m.t) * p / 100;
				svg.push(`<rect class="precip" x="${f(x(h.time[i] * 1000) - bw * 0.35)}" y="${f(base - ph)}" width="${f(bw * 0.7)}" height="${f(ph)}"><title>${p}% precip</title></rect>`);
			}
		});
		svg.push(`<path class="temp" d="M${idx.map(i => `${f(x(h.time[i] * 1000))},${f(y(h.temperature_2m[i]))}`).join('L')}" />`);

		idx.forEach(i => {
			let t = new Date(h.time[i] * 1000), hx = x(t);
			if (t.getMinutes() === 0 && t.getHours() % 6 === 0 && hx > m.l + 16 && hx < W - 16) {
				svg.push(`<line class="grid" x1="${f(hx)}" y1="${base}" x2="${f(hx)}" y2="${base + 5}" />`);
				svg.push(`<text x="${f(hx)}" y="${H - 6}" text-anchor="middle">${App.formatTime(t)}</text>`);
			}
		});

		let iMax = idx[temps.indexOf(tMax)], iMin = idx[temps.indexOf(tMin)];
		[[iMax, -9], [iMin, 21]].forEach(([i, dy]) => {
			let px = x(h.time[i] * 1000), anchor = (px < m.l + 24) ? 'start' : (px > W - 24) ? 'end' : 'middle';
			svg.push(`<circle class="endpoint" cx="${f(px)}" cy="${f(y(h.temperature_2m[i]))}" r="3" />`);
			svg.push(`<text x="${f(px)}" y="${f(Math.min(base - 4, Math.max(m.t - 9, y(h.temperature_2m[i]) + dy)))}" text-anchor="${anchor}" class="strong">${deg(h.temperature_2m[i])}</text>`);
		});

		return `<svg class="skychart mini" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature and chance of precipitation for the next 24 hours">${svg.join('')}</svg>`;
	}

	function draw() {
		let el = $('#forecast'), location = App.settings.location;
		if (!el) { return; }
		let ok = location && state && state.data && state.key === query(location) && (Date.now() - state.fetched < STALE);
		if (!ok) {
			el.innerHTML = !location ? '' : pending ? '<p class="fcNote">Loading forecast…</p>' : (state && state.failed) ? '<p class="fcNote">Forecast unavailable</p>' : '';
			return;
		}
		let d = state.data, now = Date.now();
		let today = Math.max(0, d.daily.time.filter(t => t * 1000 <= now).length - 1);
		let html = [`<p class="fcNow"><span class="fcTemp">${deg(d.current.temperature_2m)}${unit(d.current_units.temperature_2m).replace('°', '')}</span> ${WMO[d.current.weather_code] || ''}</p>`];
		html.push(dayLine(d, today, 'Today'));
		if (today + 1 < d.daily.time.length) { html.push(dayLine(d, today + 1, 'Tomorrow')); }
		html.push(chart(d, now));
		html.push(`<p class="fcNote">Next 24 h · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>`);
		el.innerHTML = html.join('');
	}

	function update() {
		let location = App.settings.location;
		if (!location || !$('#forecast')) { draw(); return; }
		let key = query(location), now = Date.now();
		if (!state) { state = load(); }
		let mine = state && state.key === key;
		let fresh = mine && state.data && (now - state.fetched < REFRESH);
		let backoff = mine && state.failed && (now - state.failed < RETRY);
		if (!fresh && !backoff && pending !== key) { fetchForecast(key); }
		draw();
	}

	function init() {
		if (!timer) { timer = setInterval(update, 60000); }
		update();
	}

	return {
		update,
		init
	};
})();

window.addEventListener('DOMContentLoaded', Forecast.init);
