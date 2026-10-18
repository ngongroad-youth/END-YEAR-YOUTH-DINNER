/* Shared helpers for every page: talking to the Google Sheet, formatting. */
(function () {
    const C = window.DINNER_CONFIG || {};

    async function get(params) {
        if (!C.apiUrl) throw new Error('not-configured');
        const res = await fetch(C.apiUrl + '?' + new URLSearchParams(params));
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
    }

    // Writes go as GET requests too: Apps Script answers GETs to browsers most reliably
    const post = (params) => get(Object.assign({}, params, { _: Date.now() }));

    // "2026-12-06 17:00" in Nairobi time (UTC+3, no daylight saving)
    function eventDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s || '');
        if (!m) return null;
        return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (+(m[4] || 17)) - 3, +(m[5] || 0)));
    }

    const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    const nairobi = (d, opts) => d.toLocaleString('en-GB', Object.assign({ timeZone: 'Africa/Nairobi' }, opts));

    function prettyDate(s) {
        const d = eventDate(s);
        if (!d) return s || '';
        return nairobi(d, { weekday: 'long' }) + ' ' + ordinal(+nairobi(d, { day: 'numeric' })) + ' ' + nairobi(d, { month: 'long', year: 'numeric' }) +
            ' · ' + nairobi(d, { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
    }

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ksh = (n) => 'KSH ' + Math.round(Number(n) || 0).toLocaleString('en-US');

    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
    };

    window.Dinner = { C, get, post, eventDate, prettyDate, ordinal, nairobi, esc, ksh, store };
})();
