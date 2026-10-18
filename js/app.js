/* Homepage: event details, countdown, ticket form and the hype wall. */
(function () {
    const { C, get, post, eventDate, ordinal, nairobi, esc, ksh, store } = window.Dinner;
    const $ = (s, el) => (el || document).querySelector(s);
    const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

    let info = Object.assign({ open: true, maxPerOrder: 10 }, C);

    /* ------------------------------------------------------------------
       Event details (from config first, then from the sheet's Settings)
       ------------------------------------------------------------------ */
    function applyInfo() {
        const d = eventDate(info.date);
        const dl = /^(\d{4})-(\d{2})-(\d{2})/.exec(info.deadline || '');
        const dlTxt = dl ? ordinal(+dl[3]) + ' ' + new Date(Date.UTC(+dl[1], +dl[2] - 1, +dl[3])).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }) : '';
        const fields = {
            dateShort: d ? ordinal(+nairobi(d, { day: 'numeric' })) + ' ' + nairobi(d, { month: 'short', year: 'numeric' }) : '',
            time: d ? 'From ' + nairobi(d, { hour: 'numeric', hour12: true }).replace(' ', '').toUpperCase() : '',
            priceTxt: ksh(info.price),
            venue: info.venue, dressCode: info.dressCode,
            mpesaNumber: info.mpesaNumber, mpesaName: info.mpesaName,
            deadlineTxt: dlTxt, deadlineCaps: dlTxt.toUpperCase()
        };
        $$('[data-f]').forEach((el) => { const v = fields[el.dataset.f]; if (v) el.textContent = v; });
        qty.max = info.maxPerOrder;
        updateTotal();

        const pill = $('#guests-pill');
        const bits = [];
        if (info.guests >= 5) bits.push('🥂 ' + info.guests + ' guests confirmed');
        if (info.seatsLeft != null && info.seatsLeft <= 60) bits.push(info.seatsLeft + ' seats left');
        pill.textContent = bits.join(' · ');
        pill.classList.toggle('hidden', !bits.length);

        const closed = $('#buy-closed');
        let why = '';
        if (!C.apiUrl) why = 'Online ticket sales open soon. Meanwhile you can RSVP on WhatsApp.';
        else if (info.full) why = 'We are fully booked. Thank you! Reach us on WhatsApp to join the waiting list.';
        else if (info.open === false) why = 'Online ticket sales are closed. Reach us on WhatsApp for any questions.';
        closed.textContent = why;
        closed.classList.toggle('hidden', !why);
        $('#buy-btn').disabled = !!why;
    }

    /* ---------------- countdown ---------------- */
    const cd = $('#countdown');
    function tick() {
        const d = eventDate(info.date);
        if (!d) return;
        const left = d - Date.now();
        if (left <= 0) {
            const over = left < -6 * 3600e3;
            cd.classList.add('live');
            cd.innerHTML = '<div><strong>' + (over ? 'Thank you for coming! 🙏' : "It's dinner time! 🥂") + '</strong></div>';
            return;
        }
        const u = { d: Math.floor(left / 864e5), h: Math.floor(left / 36e5) % 24, m: Math.floor(left / 6e4) % 60, s: Math.floor(left / 1e3) % 60 };
        Object.keys(u).forEach((k) => { $('[data-u=' + k + ']', cd).textContent = String(u[k]).padStart(2, '0'); });
        setTimeout(tick, 1000 - (Date.now() % 1000));
    }

    /* ---------------- ticket form ---------------- */
    const form = $('#buy-form');
    const qty = $('#qty');
    const amount = $('#amount');
    let amountTouched = false;

    function count() { return Math.max(1, Math.min(+qty.max || 10, parseInt(qty.value, 10) || 1)); }
    function updateTotal() {
        const n = count(), total = n * (info.price || 2500);
        $('#total').textContent = ksh(total);
        if (!amountTouched) amount.value = total;
        $('#guests-field').classList.toggle('hidden', n < 2);
    }
    $$('[data-step]').forEach((b) => b.addEventListener('click', () => { qty.value = count() + +b.dataset.step; qty.value = count(); updateTotal(); }));
    qty.addEventListener('input', updateTotal);
    qty.addEventListener('change', () => { qty.value = count(); updateTotal(); });
    amount.addEventListener('input', () => { amountTouched = true; });

    $('#copy-num').addEventListener('click', (e) => {
        const num = String(info.mpesaNumber).replace(/\s/g, '').replace(/^\+254/, '0');
        const done = () => { e.target.textContent = 'Copied ✓'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(num).then(done, () => {});
        else { const t = document.createElement('textarea'); t.value = num; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (x) { /* ignore */ } t.remove(); }
    });

    const code = $('#code');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    // People often paste the whole SMS: pick out the code
    code.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        const m = /\b([A-Z0-9]{10})\b/.exec(String(text).toUpperCase());
        if (m) { e.preventDefault(); code.value = m[1]; }
    });

    const errors = {
        invalid: 'Please check your name, email and phone number.',
        code: 'An M-Pesa code has 10 letters and numbers, for example TKL4XYZ9AB.',
        closed: 'Online ticket sales are closed. Please reach us on WhatsApp.',
        full: 'Sorry, we are fully booked. Reach us on WhatsApp to join the waiting list.',
        used: 'This M-Pesa code is already on another order. Please check the code, or contact us if you think this is a mistake.',
        busy: 'Lots of people are buying right now. Please try again in a few minutes.',
        server: 'Something went wrong on our side. Please try again, or send your code on WhatsApp.'
    };

    function setBusy(btn, busy, label) {
        if (busy) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span> ' + label; btn.disabled = true; }
        else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
    }
    function show(el, text, kind) {
        el.textContent = text;
        el.className = 'msg ' + (kind || 'err');
        el.classList.toggle('hidden', !text);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#buy-error');
        const data = Object.fromEntries(new FormData(form));
        data.qty = count();
        data.code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (String(data.name).trim().length < 2) return show(err, 'Please enter your full name.'), $('#name').focus();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) return show(err, 'Please enter a valid email: your ticket is sent there.'), $('#email').focus();
        if (String(data.phone).replace(/\D/g, '').length < 9) return show(err, 'Please enter your phone number.'), $('#phone').focus();
        if (!/^[A-Z0-9]{10}$/.test(data.code)) return show(err, errors.code), code.focus();
        const total = data.qty * (info.price || 2500);
        if (+data.amount && +data.amount < total &&
            !confirm('You entered ' + ksh(data.amount) + ' but ' + data.qty + ' ticket(s) cost ' + ksh(total) + '. Submit anyway?')) return;
        show(err, '');
        const btn = $('#buy-btn');
        setBusy(btn, true, 'Sending…');
        try {
            const res = await post(Object.assign({ action: 'buy' }, data));
            if (!res.ok) {
                show(err, res.error === 'qty' ? 'You can buy up to ' + res.max + ' tickets per order.' : (errors[res.error] || errors.server));
                return;
            }
            store.set('dinner-order', { id: res.id, email: data.email, code: data.code });
            $('#done-id').textContent = res.id;
            $('#done-email').textContent = data.email;
            form.classList.add('hidden');
            $('#buy-done').classList.remove('hidden');
            $('#buy-done').scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (!$('#post-name').value) $('#post-name').value = String(data.name).split(' ')[0];
        } catch (x) {
            show(err, x.message === 'not-configured' ? 'Online ticket sales open soon.' : 'Could not reach the ticket desk. Check your internet and try again.');
        } finally {
            setBusy(btn, false);
        }
    });

    $('#buy-again').addEventListener('click', () => {
        form.reset(); amountTouched = false; qty.value = 1; updateTotal();
        $('#buy-done').classList.add('hidden');
        form.classList.remove('hidden');
    });

    // "Check your ticket status"
    const last = store.get('dinner-order', null);
    if (last) { $('#s-email').value = last.email || ''; $('#s-code').value = last.code || ''; }
    $('#status-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = $('#status-msg'), btn = e.submitter || $('#status-form button');
        const email = $('#s-email').value.trim(), c = $('#s-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!email || c.length < 8) return show(msg, 'Enter the email and M-Pesa code you used.');
        setBusy(btn, true, 'Checking…');
        try {
            const r = await post({ action: 'status', email, code: c });
            if (!r.ok) show(msg, errors[r.error] || errors.server);
            else if (!r.found) show(msg, 'We could not find an order with that email and code. Check them, or contact us on WhatsApp.');
            else if (r.status === 'Confirmed') show(msg, '✅ ' + r.id + ' is confirmed. ' + (r.emailed ? 'Your ticket was emailed: check spam/promotions too.' : 'Your ticket is being emailed now.'), 'ok');
            else if (r.status === 'Not received') show(msg, r.id + ': the treasurer could not find this payment. Please check the code and contact us on WhatsApp.');
            else if (r.status === 'Cancelled') show(msg, r.id + ' was cancelled. Contact us on WhatsApp if this is unexpected.');
            else show(msg, '⏳ ' + r.id + ' is waiting for the treasurer to confirm the payment. Your ticket arrives by email once it is confirmed.', 'info');
        } catch (x) {
            show(msg, 'Could not reach the ticket desk. Try again.');
        } finally {
            setBusy(btn, false);
        }
    });

    /* ------------------------------------------------------------------
       Hype wall
       ------------------------------------------------------------------ */
    const EMOJI = { fire: '🔥', love: '❤️', party: '🎉', clap: '🙌' };
    const list = $('#posts');
    let posts = [];
    let sort = 'new';
    const mine = store.get('dinner-reacted', {});      // { postId: ['fire', ...] }
    const myPosts = store.get('dinner-posts', []);

    const COLORS = ['#f4dc8a', '#e7b7a3', '#a8d5ba', '#a9c7f0', '#d8b4f0', '#f0c987', '#9fe0d8', '#f3a6b7'];
    function avatar(name) {
        let h = 0;
        for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '✨';
        return '<span class="avatar" style="background:' + COLORS[Math.abs(h) % COLORS.length] + '">' + esc(initials) + '</span>';
    }
    function ago(t) {
        if (!t) return '';
        const s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        if (s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
        return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    const score = (p) => p.r.fire + p.r.love + p.r.party + p.r.clap;

    function render() {
        const view = posts.slice().sort((a, b) => sort === 'top' ? score(b) - score(a) || b.at - a.at : b.at - a.at);
        $('#wall-count').textContent = posts.length ? posts.length + ' post' + (posts.length === 1 ? '' : 's') : '';
        if (!view.length) {
            list.innerHTML = '<div class="empty">' + (C.apiUrl ? 'No posts yet. Be the first to start the hype! 🎉' : 'The hype wall opens soon ✨') + '</div>';
            return;
        }
        list.innerHTML = view.map((p) => {
            const my = mine[p.id] || [];
            return '<article class="post' + (myPosts.indexOf(p.id) >= 0 ? ' mine' : '') + '" data-id="' + esc(p.id) + '">' +
                '<div class="post-head">' + avatar(p.name) + '<div><div class="post-name">' + esc(p.name) + '</div><div class="post-time">' + ago(p.at) + '</div></div></div>' +
                '<p class="post-text">' + esc(p.text) + '</p>' +
                '<div class="reacts">' + Object.keys(EMOJI).map((k) =>
                    '<button type="button" class="react" data-r="' + k + '" aria-pressed="' + (my.indexOf(k) >= 0) + '" aria-label="' + k + ' reaction">' +
                    EMOJI[k] + '<span>' + (p.r[k] || '') + '</span></button>').join('') + '</div></article>';
        }).join('');
    }

    function burst(btn, emoji) {
        const r = btn.getBoundingClientRect();
        for (let i = 0; i < 5; i++) {
            const s = document.createElement('span');
            s.className = 'burst';
            s.textContent = emoji;
            s.style.left = (r.left + r.width / 2 - 13) + 'px';
            s.style.top = (r.top - 6) + 'px';
            s.style.setProperty('--dx', ((Math.random() - .5) * 120) + 'px');
            s.style.animationDelay = (i * 60) + 'ms';
            document.body.appendChild(s);
            setTimeout(() => s.remove(), 1200);
        }
    }

    list.addEventListener('click', async (e) => {
        const btn = e.target.closest('.react');
        if (!btn || !C.apiUrl) return;
        const id = btn.closest('.post').dataset.id, k = btn.dataset.r;
        const p = posts.find((x) => x.id === id);
        if (!p) return;
        const my = mine[id] || (mine[id] = []);
        const on = my.indexOf(k) < 0;
        // Show it straight away; the sheet catches up in the background
        if (on) { my.push(k); p.r[k]++; burst(btn, EMOJI[k]); }
        else { my.splice(my.indexOf(k), 1); p.r[k] = Math.max(0, p.r[k] - 1); }
        store.set('dinner-reacted', mine);
        btn.setAttribute('aria-pressed', on);
        btn.querySelector('span').textContent = p.r[k] || '';
        btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
        try {
            const res = await post({ action: 'react', id, r: k, delta: on ? '1' : '-1' });
            if (res.ok && typeof res.count === 'number') { p.r[k] = res.count; btn.querySelector('span').textContent = res.count || ''; }
        } catch (x) { /* keep the optimistic count */ }
    });

    $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
        sort = b.dataset.sort;
        $$('.tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
        render();
    }));

    // Composer
    const text = $('#post-text');
    const pname = $('#post-name');
    pname.value = store.get('dinner-name', '');
    text.addEventListener('input', () => { $('#chars').textContent = text.value.length + '/280'; });
    $('#chips').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        text.value = (text.value ? text.value.trim() + ' ' : '') + chip.textContent;
        text.dispatchEvent(new Event('input'));
        text.focus();
    });

    $('#post-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = $('#post-msg'), btn = $('#post-btn');
        const t = text.value.trim();
        if (t.length < 2) return show(msg, 'Write something first ✍️'), text.focus();
        if (/https?:\/\/|www\./i.test(t)) return show(msg, 'Links are not allowed on the wall.');
        if (!C.apiUrl) return show(msg, 'The hype wall opens soon ✨', 'info');
        setBusy(btn, true, 'Posting…');
        try {
            const res = await post({ action: 'post', name: pname.value.trim(), text: t, botcheck: e.target.botcheck.checked ? '1' : '' });
            if (!res.ok) {
                show(msg, { busy: 'The wall is buzzing! Please try again in a few minutes.', links: 'Links are not allowed on the wall.' }[res.error] || 'Could not post. Please try again.');
                return;
            }
            store.set('dinner-name', pname.value.trim());
            text.value = ''; $('#chars').textContent = '0/280';
            if (res.pending) { show(msg, 'Thanks! Your post will appear once the organisers approve it.', 'ok'); return; }
            show(msg, '');
            myPosts.push(res.post.id); store.set('dinner-posts', myPosts.slice(-50));
            posts.unshift(res.post);
            sort = 'new'; $$('.tabs button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.sort === 'new'));
            render();
        } catch (x) {
            show(msg, 'Could not reach the wall. Check your internet and try again.');
        } finally {
            setBusy(btn, false);
        }
    });

    // Keep the wall fresh while the page is open (keeps your own reactions that are still on their way)
    async function refreshWall() {
        if (document.hidden || !C.apiUrl) return;
        try { const r = await get({ action: 'wall' }); if (r.posts) { posts = r.posts; render(); } } catch (x) { /* try again later */ }
    }

    /* ---------------- start ---------------- */
    $('#wa-link').href = 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent('Hi! I have a question about the End Year Dinner 🥂');
    $('#tel-link').href = 'tel:' + C.phone;
    applyInfo();
    tick();
    render();
    if (C.apiUrl) {
        get({ action: 'info' }).then((r) => {
            Object.keys(r).forEach((k) => { if (r[k] !== '' && r[k] != null && k !== 'posts') info[k] = r[k]; });
            info.open = r.open; info.full = r.full; info.seatsLeft = r.seatsLeft;
            posts = r.posts || [];
            applyInfo(); render();
        }).catch(() => { list.innerHTML = '<div class="empty">Could not load the wall right now. Refresh to try again.</div>'; });
        setInterval(refreshWall, 30000);
        document.addEventListener('visibilitychange', refreshWall);
    }
})();
