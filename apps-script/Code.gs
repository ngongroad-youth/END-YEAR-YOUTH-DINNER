/* =========================================================================
   END YEAR DINNER 2026 · Ngong Road SDA Youth
   Ticketing + hype wall "database" in a Google Sheet (free).

   TICKETS tab: every order from the website lands here as "To confirm".
   The treasurer checks the M-Pesa message for the code and sets Status to:
     Confirmed     → a ticket with a QR code is emailed to the buyer
     Not received  → the buyer is emailed to check their code / contact you
     Cancelled     → nothing is sent; the seats are released
   Ticket ID, ticket link and "Ticket emailed" fill in by themselves.
   At the door, ushers scan the QR on door.html: "Checked in" is stamped.

   WALL tab: posts from the website's hype wall, with their reactions.
   Type  hide  in a post's Status cell to remove it from the website.

   SETTINGS tab: price, M-Pesa number, door PIN, capacity, deadline, etc.

   Menu "Dinner" (top of the sheet): resend a ticket, email a summary.

   FIRST-TIME SET-UP (about 5 minutes)
   1. Open the sheet "Youth End Year Dinner 2026 – Tickets" in Google Drive.
   2. Menu: Extensions → Apps Script. Delete what's there, paste this whole
      file and click the save icon.
   3. Choose  setup  in the function list at the top and click Run. Allow
      the permissions Google asks for. This creates the tabs, a door PIN
      and the automatic emails.
   4. Click Deploy → New deployment → gear icon → Web app.
        Execute as:  Me          Who has access:  Anyone
      Click Deploy and copy the "Web app URL" (ends in /exec). Paste it
      into js/config.js on the website (apiUrl).
   5. In the Settings tab, set "Ticket page link" to the website's
      ticket.html address and "Treasurer email" to the treasurer's Gmail.
      Share the sheet with the treasurer (Editor) so they can confirm.

   UPDATING THIS SCRIPT LATER (the link stays the same)
   Paste the new version, save, Run  setup  once, then Deploy → Manage
   deployments → pencil → Version: New version → Deploy.
   ========================================================================= */

const TICKETS = 'Tickets';
const WALL = 'Wall';
const SETTINGS = 'Settings';
const TZ = 'Africa/Nairobi';

const THEAD = ['Date', 'Ticket ID', 'Name', 'Email', 'Phone', 'Tickets', 'Expected (KES)', 'Amount sent (KES)',
  'M-Pesa code', 'Paid from', 'Other guests', 'Status', 'Ticket emailed', 'Checked in', 'Reminder sent', 'Token', 'Notes'];
const T = THEAD.reduce((o, h, i) => (o[h] = i, o), {});         // column index by header
const STATUSES = ['To confirm', 'Confirmed', 'Not received', 'Cancelled'];

const WHEAD = ['Date', 'ID', 'Name', 'Message', '🔥', '❤️', '🎉', '🙌', 'Status'];
const REACTIONS = ['fire', 'love', 'party', 'clap'];               // columns 5–8

const DEFAULTS = [
  ['Event', 'End Year Dinner 2026'],
  ['Host', 'Seventh Day Adventist Church Ngong Road Youth'],
  ['Date and time', '2026-12-06 17:00'],
  ['Venue', 'Swiss Lenana'],
  ['Dress code', 'Elegance'],
  ['Ticket price (KES)', '2500'],
  ['M-Pesa number', '+254 759 098947'],
  ['M-Pesa name', 'Madeline'],
  ['Treasurer email', ''],
  ['Door PIN', ''],
  ['Ticket page link', ''],
  ['Ticket sales open', 'Yes'],
  ['RSVP deadline', '2026-11-30'],
  ['Capacity (seats)', ''],
  ['Max tickets per order', '10'],
  ['Show seats left', 'Yes'],
  ['Wall posts need approval', 'No'],
  ['Enquiries', 'WhatsApp +254 705 190443 · Call +254 759 098947']
];
const SETTING_NOTES = {
  'Treasurer email': 'Gets an email for every new payment to confirm. Blank = the sheet owner.',
  'Door PIN': 'Ushers type this on door.html to check guests in. Change it any time.',
  'Ticket page link': 'The website address of ticket.html, e.g. https://you.github.io/END-YEAR-YOUTH-DINNER/ticket.html',
  'Capacity (seats)': 'Leave blank for no limit. Orders stop when confirmed + pending seats reach it.',
  'RSVP deadline': 'Sales close after this day (yyyy-mm-dd). Leave blank to keep selling.',
  'Wall posts need approval': 'Yes = new posts only show after you type  show  in their Status cell.'
};

/* ---------------- sheet helpers ---------------- */

function tab_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#111').setFontColor('#e6c470');
    sh.setFrozenRows(1);
  }
  return sh;
}
const tickets_ = () => tab_(TICKETS, THEAD);
const wall_ = () => tab_(WALL, WHEAD);

function settings_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS);
  const out = {};
  DEFAULTS.forEach(([k, v]) => out[k] = v);
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach((r) => {
    if (!r[0]) return;
    out[String(r[0]).trim()] = r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd') : String(r[1]).trim();
  });
  return out;
}

const clean_ = (v, max) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const html_ = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kes_ = (n) => 'KES ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const yes_ = (v) => /^(yes|y|true|on|1)$/i.test(String(v || '').trim());
const num_ = (v) => Number(String(v || '').replace(/[^0-9.]/g, '')) || 0;
const validEmail_ = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const mpesaCode_ = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normId_ = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const when_ = (d) => d instanceof Date ? Utilities.formatDate(d, TZ, 'EEE d MMM, h:mm a') : String(d || '');

function randomCode_(len) {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';           // no 0/O, 1/I/L
  let s = '';
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// Simple flood protection shared by everyone (Apps Script can't see visitors' IPs)
function limit_(key, max, seconds) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key) || 0);
  if (n >= max) return false;
  cache.put(key, String(n + 1), seconds);
  return true;
}

function eventDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s['Date and time'] || '');
  if (!m) return null;
  // Nairobi is UTC+3 all year
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (+(m[4] || 17)) - 3, +(m[5] || 0)));
}

function salesOpen_(s) {
  if (!yes_(s['Ticket sales open'])) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s['RSVP deadline'] || '');
  if (m && Date.now() > Date.UTC(+m[1], +m[2] - 1, +m[3], 23 - 3, 59, 59)) return false;
  return true;
}

// Seats taken = confirmed + waiting to be confirmed
function seats_(rows) {
  let taken = 0, confirmed = 0, checkedIn = 0, pending = 0;
  rows.forEach((r) => {
    const st = String(r[T['Status']]).trim(), n = Number(r[T['Tickets']]) || 0;
    if (st === 'Confirmed') { confirmed += n; taken += n; if (r[T['Checked in']]) checkedIn += n; }
    else if (st === 'To confirm' || st === '') { if (r[T['Ticket ID']]) { pending += n; taken += n; } }
  });
  return { taken, confirmed, checkedIn, pending };
}

/* ---------------- web app ---------------- */

// The website sends everything as GET requests (the most reliable way for a
// browser to read Apps Script answers); doPost does the same for POSTs.
const WRITES = { buy: buy_, status: status_, post: post_, react: react_, pin: pin_, checkin: checkin_, guests: guests_ };

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  return handle_((e && e.parameter) || {});
}

function handle_(q) {
  try {
    if (WRITES[q.action]) {
      if (q.botcheck) return out_({ ok: true });              // bots fill the hidden box
      return out_(WRITES[q.action](q));
    }
    if (q.action === 'ticket') return out_(ticket_(q.t));
    if (q.action === 'wall') return out_({ posts: posts_() });
    return out_(info_());
  } catch (err) {
    console.error(err);
    return out_({ ok: false, error: 'server', detail: String(err).slice(0, 200) });
  }
}

function out_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// Everything the homepage needs in one request
function info_() {
  const s = settings_();
  const rows = tickets_().getDataRange().getValues().slice(1);
  const cap = num_(s['Capacity (seats)']);
  const seats = seats_(rows);
  const info = {
    event: s['Event'], date: s['Date and time'], venue: s['Venue'], dressCode: s['Dress code'],
    price: num_(s['Ticket price (KES)']) || 2500,
    mpesaNumber: s['M-Pesa number'], mpesaName: s['M-Pesa name'],
    deadline: s['RSVP deadline'], open: salesOpen_(s),
    maxPerOrder: Math.max(1, num_(s['Max tickets per order']) || 10),
    guests: seats.confirmed
  };
  if (cap) {
    info.full = seats.taken >= cap;
    if (yes_(s['Show seats left'])) info.seatsLeft = Math.max(0, cap - seats.taken);
  }
  info.posts = posts_();
  return info;
}

/* ---------------- tickets ---------------- */

function buy_(p) {
  const s = settings_();
  const name = clean_(p.name, 80), email = clean_(p.email, 120).toLowerCase(), phone = clean_(p.phone, 30);
  const qty = Math.floor(num_(p.qty)), code = mpesaCode_(p.code), sent = Math.round(num_(p.amount));
  const maxQty = Math.max(1, num_(s['Max tickets per order']) || 10);
  if (name.length < 2 || !validEmail_(email) || phone.replace(/\D/g, '').length < 9) return { ok: false, error: 'invalid' };
  if (!(qty >= 1 && qty <= maxQty)) return { ok: false, error: 'qty', max: maxQty };
  if (!/^[A-Z0-9]{10}$/.test(code)) return { ok: false, error: 'code' };
  if (!salesOpen_(s)) return { ok: false, error: 'closed' };
  if (!limit_('buy', 60, 3600)) return { ok: false, error: 'busy' };

  const price = num_(s['Ticket price (KES)']) || 2500;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let id;
  try {
    const sh = tickets_(), rows = sh.getDataRange().getValues().slice(1);
    const dup = rows.find((r) => mpesaCode_(r[T['M-Pesa code']]) === code);
    if (dup) {
      // The same person pressing Send twice is fine; someone else reusing a code is not
      if (String(dup[T['Email']]).toLowerCase() === email) return { ok: true, id: String(dup[T['Ticket ID']]), again: true };
      return { ok: false, error: 'used' };
    }
    const cap = num_(s['Capacity (seats)']);
    if (cap && seats_(rows).taken + qty > cap) return { ok: false, error: 'full' };
    const ids = new Set(rows.map((r) => String(r[T['Ticket ID']])));
    do { id = 'NRY-' + randomCode_(5); } while (ids.has(id));
    const row = new Array(THEAD.length).fill('');
    row[T['Date']] = new Date();
    row[T['Ticket ID']] = id;
    row[T['Name']] = name;
    row[T['Email']] = email;
    row[T['Phone']] = phone;
    row[T['Tickets']] = qty;
    row[T['Expected (KES)']] = price * qty;
    row[T['Amount sent (KES)']] = sent || price * qty;
    row[T['M-Pesa code']] = code;
    row[T['Paid from']] = clean_(p.payer, 80);
    row[T['Other guests']] = clean_(p.guests, 300);
    row[T['Status']] = 'To confirm';
    if (sent && sent < price * qty) row[T['Notes']] = '⚠ Paid less than expected';
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  const short = sent && sent < price * qty;
  const to = treasurer_(s);
  if (to) MailApp.sendEmail({
    to: to, name: 'Youth Dinner tickets',
    subject: '💰 Confirm payment: ' + kes_(sent || price * qty) + ' · ' + name + ' · ' + qty + ' ticket' + (qty > 1 ? 's' : ''),
    htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;color:#222">' +
      '<p><b>' + html_(name) + '</b> says they sent <b>' + kes_(sent || price * qty) + '</b> for <b>' + qty + ' ticket' + (qty > 1 ? 's' : '') + '</b> (expected ' + kes_(price * qty) + ').</p>' +
      (short ? '<p style="color:#b00"><b>⚠ This is less than the ticket price.</b></p>' : '') +
      '<p style="font-size:20px">M-Pesa code: <b style="letter-spacing:2px">' + html_(code) + '</b>' +
      (p.payer ? '<br><span style="font-size:13px;color:#555">Paid from: ' + html_(clean_(p.payer, 80)) + '</span>' : '') + '</p>' +
      '<p>Phone: ' + html_(phone) + ' · Email: ' + html_(email) + ' · Order: ' + id + '</p>' +
      '<p>Check the M-Pesa messages for this code, then set its <b>Status</b> in the Tickets tab to <b>Confirmed</b>: the ticket with its QR code is emailed automatically. Can\'t find it? Choose <b>Not received</b>.</p>' +
      '<p><a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '">Open the sheet</a></p></div>'
  });
  return { ok: true, id: id };
}

function treasurer_(s) {
  const t = String(s['Treasurer email'] || '').split(/[,;\s]+/).filter(validEmail_).join(',');
  return t || Session.getEffectiveUser().getEmail();
}

// "Check my ticket": email + M-Pesa code → where the order is
function status_(p) {
  const email = clean_(p.email, 120).toLowerCase(), code = mpesaCode_(p.code);
  if (!validEmail_(email) || code.length < 8) return { ok: false, error: 'invalid' };
  if (!limit_('status', 120, 600)) return { ok: false, error: 'busy' };
  const r = tickets_().getDataRange().getValues().slice(1)
    .find((x) => mpesaCode_(x[T['M-Pesa code']]) === code && String(x[T['Email']]).toLowerCase() === email);
  if (!r) return { ok: true, found: false };
  return { ok: true, found: true, id: String(r[T['Ticket ID']]), status: String(r[T['Status']] || 'To confirm'), emailed: !!r[T['Ticket emailed']] };
}

// The ticket page (and the door scanner) look tickets up by their secret token
function ticket_(token) {
  token = String(token || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
  if (token.length < 20) return { found: false };
  if (!limit_('ticket', 600, 600)) return { error: 'busy' };
  const r = tickets_().getDataRange().getValues().slice(1).find((x) => String(x[T['Token']]).toLowerCase() === token);
  return r ? publicTicket_(r) : { found: false };
}

function publicTicket_(r) {
  const s = settings_();
  return {
    found: true,
    id: String(r[T['Ticket ID']]),
    name: String(r[T['Name']]),
    tickets: Number(r[T['Tickets']]) || 1,
    guests: String(r[T['Other guests']] || ''),
    status: String(r[T['Status']] || ''),
    valid: String(r[T['Status']]).trim() === 'Confirmed',
    checkedIn: r[T['Checked in']] ? when_(r[T['Checked in']]) : '',
    event: s['Event'], date: s['Date and time'], venue: s['Venue'], dressCode: s['Dress code']
  };
}

/* ---------------- door check-in ---------------- */

function pinOk_(pin) {
  const want = String(settings_()['Door PIN'] || '').trim();
  if (!want) return false;
  if (String(pin || '').trim() === want) return true;
  limit_('pin-miss', 1000, 600);                                  // count wrong PINs
  return false;
}
function pinBlocked_() {
  return Number(CacheService.getScriptCache().get('pin-miss') || 0) >= 15;
}

function pin_(p) {
  if (pinBlocked_()) return { ok: false, error: 'busy' };
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  return { ok: true, stats: seats_(tickets_().getDataRange().getValues().slice(1)) };
}

// Guest list for the door page (PIN only): everyone with a ticket that isn't cancelled
function guests_(p) {
  if (pinBlocked_()) return { ok: false, error: 'busy' };
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  const rows = tickets_().getDataRange().getValues().slice(1);
  const list = rows
    .filter((r) => r[T['Ticket ID']] && String(r[T['Status']]).trim() !== 'Cancelled')
    .map((r) => ({
      id: String(r[T['Ticket ID']]),
      name: String(r[T['Name']]),
      guests: String(r[T['Other guests']] || ''),
      tickets: Number(r[T['Tickets']]) || 1,
      phone: String(r[T['Phone']] || ''),
      status: String(r[T['Status']] || 'To confirm').trim(),
      checkedIn: r[T['Checked in']] ? when_(r[T['Checked in']]) : ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, guests: list, stats: seats_(rows) };
}

// Find a ticket by its QR token or its printed ID (e.g. NRY-7KQ2M), then stamp "Checked in"
function checkin_(p) {
  if (pinBlocked_()) return { ok: false, error: 'busy' };
  if (!pinOk_(p.pin)) return { ok: false, error: 'pin' };
  const token = String(p.t || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
  const id = normId_(p.id);
  if (token.length < 20 && id.length < 6) return { ok: false, error: 'invalid' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = tickets_(), rows = sh.getDataRange().getValues();
    const i = rows.findIndex((x, n) => n > 0 && (token.length >= 20 ? String(x[T['Token']]).toLowerCase() === token : normId_(x[T['Ticket ID']]) === id));
    if (i < 1) return { ok: true, found: false };
    const r = rows[i], t = publicTicket_(r);
    if (!t.valid) return { ok: true, ticket: t, result: 'invalid' };
    if (r[T['Checked in']]) return { ok: true, ticket: t, result: 'already', stats: seats_(rows.slice(1)) };
    if (p.dry === '1') return { ok: true, ticket: t, result: 'ready' };     // look only, don't admit yet
    const now = new Date();
    sh.getRange(i + 1, T['Checked in'] + 1).setValue(now);
    r[T['Checked in']] = now;
    return { ok: true, ticket: t, result: 'admitted', stats: seats_(rows.slice(1)) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- hype wall ---------------- */

function posts_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('posts');
  if (hit) return JSON.parse(hit);
  const needApproval = yes_(settings_()['Wall posts need approval']);
  const rows = wall_().getDataRange().getValues().slice(1);
  const posts = rows
    .filter((r) => {
      const st = String(r[8] || '').trim();
      if (/^(hide|hidden|no|spam|delete)$/i.test(st)) return false;
      return needApproval ? /^(show|yes|ok|approved?)$/i.test(st) : true;
    })
    .reverse()
    .slice(0, 150)
    .map((r) => ({
      id: String(r[1]), name: String(r[2]), text: String(r[3]),
      at: r[0] instanceof Date ? r[0].getTime() : 0,
      r: { fire: +r[4] || 0, love: +r[5] || 0, party: +r[6] || 0, clap: +r[7] || 0 }
    }));
  cache.put('posts', JSON.stringify(posts), 20);
  return posts;
}

function post_(p) {
  const name = clean_(p.name, 40) || 'Anonymous', text = clean_(p.text, 280);
  if (text.length < 2) return { ok: false, error: 'invalid' };
  if (/https?:\/\/|www\./i.test(text)) return { ok: false, error: 'links' };
  if (!limit_('post', 40, 600)) return { ok: false, error: 'busy' };
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    wall_().appendRow([new Date(), id, name, text, 0, 0, 0, 0, '']);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove('posts');
  const pending = yes_(settings_()['Wall posts need approval']);
  return { ok: true, pending: pending, post: { id: id, name: name, text: text, at: Date.now(), r: { fire: 0, love: 0, party: 0, clap: 0 } } };
}

// delta is +1 (react) or -1 (take it back)
function react_(p) {
  const k = REACTIONS.indexOf(p.r), delta = p.delta === '-1' ? -1 : 1;
  const id = String(p.id || '').replace(/[^a-f0-9]/gi, '');
  if (k < 0 || id.length < 6) return { ok: false, error: 'invalid' };
  if (!limit_('react', 600, 600)) return { ok: false, error: 'busy' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = wall_(), ids = sh.getRange(2, 2, Math.max(1, sh.getLastRow() - 1), 1).getValues();
    const i = ids.findIndex((x) => String(x[0]) === id);
    if (i < 0) return { ok: false, error: 'gone' };
    const cell = sh.getRange(i + 2, 5 + k);
    const n = Math.max(0, (Number(cell.getValue()) || 0) + delta);
    cell.setValue(n);
    CacheService.getScriptCache().remove('posts');
    return { ok: true, count: n };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- emails ---------------- */

// Installable trigger (made by setup): the treasurer changed a Status
function onSheetEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== TICKETS) return;
  const col = T['Status'] + 1;
  if (e.range.getColumn() > col || e.range.getLastColumn() < col) return;
  const first = Math.max(2, e.range.getRow()), last = e.range.getLastRow();
  for (let row = first; row <= last; row++) {
    try { statusChanged_(sh, row); } catch (err) {
      console.error('row ' + row + ': ' + err);
      sh.getRange(row, T['Notes'] + 1).setValue('⚠ Email failed: ' + String(err).slice(0, 120));
    }
  }
}

function statusChanged_(sh, row, force) {
  const r = sh.getRange(row, 1, 1, THEAD.length).getValues()[0];
  const status = String(r[T['Status']]).trim(), email = String(r[T['Email']]).trim();
  if (!validEmail_(email) || !r[T['Ticket ID']]) return;
  if (status === 'Confirmed' && (force || !r[T['Ticket emailed']])) {
    let token = String(r[T['Token']] || '');
    if (!token) {
      token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      sh.getRange(row, T['Token'] + 1).setValue(token);
      r[T['Token']] = token;
    }
    sendTicket_(r, token);
    sh.getRange(row, T['Ticket emailed'] + 1).setValue(new Date());
    if (String(r[T['Notes']]).indexOf('Email failed') >= 0) sh.getRange(row, T['Notes'] + 1).setValue('');
  } else if (status === 'Not received' && !String(r[T['Notes']]).includes('Asked to check')) {
    sendNotReceived_(r);
    sh.getRange(row, T['Notes'] + 1).setValue((r[T['Notes']] ? r[T['Notes']] + ' · ' : '') + 'Asked to check code ' + when_(new Date()));
  }
}

function ticketLink_(token) {
  const base = String(settings_()['Ticket page link'] || '').trim();
  return base ? base + (base.indexOf('?') >= 0 ? '&' : '?') + 't=' + token : '';
}

function qrBlob_(text) {
  const urls = [
    'https://quickchart.io/qr?size=520&margin=2&ecLevel=M&dark=000000&light=ffffff&text=' + encodeURIComponent(text),
    'https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=10&data=' + encodeURIComponent(text)
  ];
  for (const u of urls) {
    try {
      const res = UrlFetchApp.fetch(u, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) return res.getBlob().setName('ticket-qr.png');
    } catch (err) { console.error('QR ' + u + ': ' + err); }
  }
  throw new Error('Could not make the QR code. Try again in a minute (Dinner → Resend ticket).');
}

function prettyDate_(s) {
  const d = eventDate_(s);
  return d ? Utilities.formatDate(d, TZ, 'EEEE d MMMM yyyy · h:mm a') : s['Date and time'];
}

function ticketHtml_(r, s, qrSrc, link) {
  const qty = Number(r[T['Tickets']]) || 1;
  const gold = '#d4af37';
  return '<div style="background:#0b0b0b;padding:24px 12px;font-family:Georgia,\'Times New Roman\',serif">' +
    '<div style="max-width:520px;margin:0 auto;background:#141414;border:1px solid ' + gold + ';border-radius:14px;overflow:hidden;color:#f3ead2">' +
    '<div style="padding:26px 24px 10px;text-align:center">' +
    '<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:3px;color:#bfa25a;text-transform:uppercase">' + html_(s['Host']) + '</div>' +
    '<div style="font-size:30px;color:' + gold + ';margin:10px 0 2px;letter-spacing:1px">' + html_(s['Event']) + '</div>' +
    '<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:4px;color:#d9cfb4">GOOD FOOD · GOOD COMPANY · FELLOWSHIP</div></div>' +
    '<div style="text-align:center;padding:16px"><img src="' + qrSrc + '" width="240" height="240" alt="Ticket QR code" style="background:#fff;padding:10px;border-radius:10px;display:inline-block"></div>' +
    '<div style="text-align:center;font-family:Arial,sans-serif;font-size:22px;letter-spacing:3px;color:#fff;font-weight:bold">' + html_(r[T['Ticket ID']]) + '</div>' +
    '<div style="text-align:center;font-family:Arial,sans-serif;font-size:13px;color:#bfa25a;margin-top:4px">ADMITS ' + qty + ' · ' + kes_(r[T['Expected (KES)']]) + ' PAID</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:18px;font-family:Arial,sans-serif;font-size:14px;color:#f3ead2">' +
    row_('Guest', html_(r[T['Name']]) + (r[T['Other guests']] ? '<br><span style="color:#bbb;font-size:12px">+ ' + html_(r[T['Other guests']]) + '</span>' : '')) +
    row_('Date', html_(prettyDate_(s))) +
    row_('Venue', html_(s['Venue'])) +
    row_('Dress code', html_(s['Dress code'])) +
    '</table>' +
    '<div style="padding:18px 24px 24px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#d9cfb4;text-align:center">' +
    'Show this QR code at the entrance (on your phone or printed). One code admits your whole group.' +
    (link ? '<br><a href="' + link + '" style="display:inline-block;margin-top:14px;background:' + gold + ';color:#111;text-decoration:none;padding:11px 22px;border-radius:30px;font-weight:bold">View my ticket online</a>' : '') +
    '</div></div>' +
    '<p style="text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:14px">Questions? ' + html_(s['Enquiries']) + '</p></div>';
}
function row_(k, v) {
  return '<tr><td style="padding:9px 24px;color:#bfa25a;width:34%;border-top:1px solid #2a2a2a;vertical-align:top">' + k + '</td><td style="padding:9px 24px 9px 0;border-top:1px solid #2a2a2a">' + v + '</td></tr>';
}

function sendTicket_(r, token) {
  const s = settings_();
  const link = ticketLink_(token);
  // The QR holds the ticket page link, so any phone camera opens it; without a link it holds the token
  const qr = qrBlob_(link || ('NRY:' + token));
  const pdfHtml = '<html><body style="margin:0;background:#0b0b0b">' +
    ticketHtml_(r, s, 'data:image/png;base64,' + Utilities.base64Encode(qr.getBytes()), link) + '</body></html>';
  const pdf = Utilities.newBlob(pdfHtml, 'text/html', 'ticket.html').getAs('application/pdf').setName('Dinner ticket ' + r[T['Ticket ID']] + '.pdf');
  const first = String(r[T['Name']]).split(' ')[0];
  MailApp.sendEmail({
    to: String(r[T['Email']]).trim(),
    name: 'Ngong Road SDA Youth',
    replyTo: treasurer_(s).split(',')[0],
    subject: '🎟️ Your ticket: ' + s['Event'] + ' (' + r[T['Ticket ID']] + ')',
    htmlBody: '<p style="font-family:Arial,sans-serif;font-size:15px">Hi ' + html_(first) + ',<br>Your payment is confirmed. Here is your ticket. We can\'t wait to see you!</p>' +
      ticketHtml_(r, s, 'cid:qr', link),
    body: 'Hi ' + first + ', your payment is confirmed. Ticket ' + r[T['Ticket ID']] + ' admits ' + r[T['Tickets']] + '. ' + (link ? 'View it: ' + link : 'The QR code is attached.'),
    inlineImages: { qr: qr },
    attachments: [pdf]
  });
}

function sendNotReceived_(r) {
  const s = settings_();
  MailApp.sendEmail({
    to: String(r[T['Email']]).trim(),
    name: 'Ngong Road SDA Youth',
    replyTo: treasurer_(s).split(',')[0],
    subject: 'About your dinner ticket payment (' + r[T['Ticket ID']] + ')',
    htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;font-size:15px;line-height:1.5">' +
      '<p>Hi ' + html_(String(r[T['Name']]).split(' ')[0]) + ',</p>' +
      '<p>Thank you for getting a ticket for the <b>' + html_(s['Event']) + '</b>. Our treasurer could not find an M-Pesa payment with the code <b>' + html_(r[T['M-Pesa code']]) + '</b>.</p>' +
      '<p>Please check the code in your M-Pesa message and reply to this email with the correct code or a screenshot, or reach us on ' + html_(s['Enquiries']) + '.</p>' +
      '<p>Payment: Send Money to <b>' + html_(s['M-Pesa number']) + '</b> (' + html_(s['M-Pesa name']) + ').</p></div>'
  });
}

/* ---------------- daily helpers ---------------- */

// Runs every hour (made by setup)
function hourlyJob() {
  const s = settings_();
  const hour = Number(Utilities.formatDate(new Date(), TZ, 'H'));
  if (hour === 8) pendingReminder_(s);
  eveReminders_(s);
}

// 8am: remind the treasurer of payments still waiting
function pendingReminder_(s) {
  const rows = tickets_().getDataRange().getValues().slice(1)
    .filter((r) => r[T['Ticket ID']] && String(r[T['Status']]).trim() === 'To confirm');
  if (!rows.length) return;
  MailApp.sendEmail({
    to: treasurer_(s), name: 'Youth Dinner tickets',
    subject: '⏳ ' + rows.length + ' dinner payment' + (rows.length > 1 ? 's' : '') + ' waiting to be confirmed',
    htmlBody: '<div style="font-family:Arial,sans-serif;color:#222"><p>These are still <b>To confirm</b>:</p><ul>' +
      rows.map((r) => '<li>' + html_(r[T['Name']]) + ' · ' + r[T['Tickets']] + ' ticket(s) · ' + kes_(r[T['Amount sent (KES)']]) + ' · <b>' + html_(r[T['M-Pesa code']]) + '</b></li>').join('') +
      '</ul><p><a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '">Open the sheet</a></p></div>'
  });
}

// The day before the dinner: a "see you tomorrow" email with the ticket link
function eveReminders_(s) {
  const d = eventDate_(s);
  if (!d) return;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const eve = Utilities.formatDate(new Date(d.getTime() - 864e5), TZ, 'yyyy-MM-dd');
  if (today !== eve) return;
  const sh = tickets_(), rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[T['Status']]).trim() !== 'Confirmed' || r[T['Reminder sent']] || !validEmail_(r[T['Email']]) || !r[T['Token']]) continue;
    if (MailApp.getRemainingDailyQuota() <= 5) break;                   // carries on next hour / tomorrow
    const link = ticketLink_(r[T['Token']]);
    MailApp.sendEmail({
      to: String(r[T['Email']]).trim(), name: 'Ngong Road SDA Youth',
      subject: '✨ See you tomorrow! ' + s['Event'],
      htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;font-size:15px;line-height:1.5">' +
        '<p>Hi ' + html_(String(r[T['Name']]).split(' ')[0]) + ',</p>' +
        '<p>The <b>' + html_(s['Event']) + '</b> is tomorrow: <b>' + html_(prettyDate_(s)) + '</b> at <b>' + html_(s['Venue']) + '</b>. Dress code: <b>' + html_(s['Dress code']) + '</b>.</p>' +
        '<p>Your ticket <b>' + html_(r[T['Ticket ID']]) + '</b> admits ' + r[T['Tickets']] + '. Have your QR code ready at the entrance' +
        (link ? ': <a href="' + link + '">open my ticket</a>' : ' (it is in your ticket email)') + '.</p></div>'
    });
    sh.getRange(i + 1, T['Reminder sent'] + 1).setValue(new Date());
  }
}

/* ---------------- menu ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Dinner')
    .addItem('Resend ticket (selected row)', 'resendTicket')
    .addItem('Email me a summary', 'emailSummary')
    .addSeparator()
    .addItem('Set up / repair', 'setup')
    .addToUi();
}

function resendTicket() {
  const ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet(), row = sh.getActiveRange().getRow();
  if (sh.getName() !== TICKETS || row < 2) return ui.alert('Click a row in the Tickets tab first.');
  if (String(sh.getRange(row, T['Status'] + 1).getValue()).trim() !== 'Confirmed') return ui.alert('Only Confirmed tickets can be sent.');
  statusChanged_(sh, row, true);
  ui.alert('Ticket sent to ' + sh.getRange(row, T['Email'] + 1).getValue());
}

function emailSummary() {
  const s = settings_(), rows = tickets_().getDataRange().getValues().slice(1).filter((r) => r[T['Ticket ID']]);
  const seats = seats_(rows);
  const money = rows.filter((r) => String(r[T['Status']]).trim() === 'Confirmed').reduce((a, r) => a + num_(r[T['Amount sent (KES)']]), 0);
  const posts = wall_().getLastRow() - 1;
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(), name: 'Youth Dinner tickets',
    subject: 'Dinner summary: ' + seats.confirmed + ' confirmed guests, ' + kes_(money),
    htmlBody: '<div style="font-family:Arial,sans-serif;color:#222;font-size:15px;line-height:1.6">' +
      '<b>' + html_(s['Event']) + '</b><br>Confirmed guests: <b>' + seats.confirmed + '</b><br>Waiting to confirm: ' + seats.pending +
      '<br>Collected (confirmed): <b>' + kes_(money) + '</b><br>Checked in: ' + seats.checkedIn +
      (num_(s['Capacity (seats)']) ? '<br>Seats left: ' + Math.max(0, num_(s['Capacity (seats)']) - seats.taken) : '') +
      '<br>Hype wall posts: ' + Math.max(0, posts) + '</div>'
  });
  try { SpreadsheetApp.getUi().alert('Summary emailed to you.'); } catch (e) { /* run from the editor */ }
}

/* ---------------- set-up ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);

  const t = tickets_();
  t.getRange(1, 1, 1, THEAD.length).setValues([THEAD]).setFontWeight('bold').setBackground('#111').setFontColor('#e6c470');
  t.getRange(2, T['Status'] + 1, t.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  t.getRange(2, T['Date'] + 1, t.getMaxRows() - 1, 1).setNumberFormat('d mmm yyyy, h:mm am/pm');
  [T['Ticket emailed'], T['Checked in'], T['Reminder sent']].forEach((c) => t.getRange(2, c + 1, t.getMaxRows() - 1, 1).setNumberFormat('d mmm, h:mm am/pm'));
  t.getRange(2, T['M-Pesa code'] + 1, t.getMaxRows() - 1, 1).setNumberFormat('@').setFontWeight('bold');
  [T['Phone'], T['Token']].forEach((c) => t.getRange(2, c + 1, t.getMaxRows() - 1, 1).setNumberFormat('@'));   // keep leading 0s / long codes as text
  const statusCol = t.getRange(2, T['Status'] + 1, t.getMaxRows() - 1, 1);
  const rules = [
    ['Confirmed', '#d9f2d9'], ['To confirm', '#fff2cc'], ['Not received', '#f4cccc'], ['Cancelled', '#e0e0e0']
  ].map(([v, c]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(c).setRanges([statusCol]).build());
  t.setConditionalFormatRules(rules);
  t.setColumnWidth(T['Token'] + 1, 80);
  t.getRange(1, T['Status'] + 1).setNote('Set to Confirmed after checking the M-Pesa message: the ticket is emailed automatically.');

  const w = wall_();
  w.getRange(1, 1, 1, WHEAD.length).setValues([WHEAD]).setFontWeight('bold').setBackground('#111').setFontColor('#e6c470');
  w.getRange(1, 9).setNote('Type  hide  to remove a post from the website (or  show  to approve it when approval is on).');
  w.setColumnWidth(4, 420);

  let st = ss.getSheetByName(SETTINGS);
  if (!st) {
    st = ss.insertSheet(SETTINGS);
    st.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]).setFontWeight('bold').setBackground('#111').setFontColor('#e6c470');
    st.setFrozenRows(1);
    st.setColumnWidth(1, 220);
    st.setColumnWidth(2, 420);
  }
  st.getRange('B:B').setNumberFormat('@');
  const have = st.getDataRange().getValues().map((r) => String(r[0]).trim());
  DEFAULTS.forEach(([k, v]) => {
    if (have.indexOf(k) >= 0) return;
    if (k === 'Door PIN') v = String(100000 + Math.floor(Math.random() * 900000));
    st.appendRow([k, v]);
    if (SETTING_NOTES[k]) st.getRange(st.getLastRow(), 1).setNote(SETTING_NOTES[k]);
  });

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  ScriptApp.getProjectTriggers().forEach((tr) => {
    if (['onSheetEdit', 'hourlyJob'].indexOf(tr.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('hourlyJob').timeBased().everyHours(1).create();

  // Touch the services once so Google asks for every permission now
  UrlFetchApp.fetch('https://quickchart.io/qr?size=50&text=test', { muteHttpExceptions: true });
  MailApp.getRemainingDailyQuota();
  ss.setActiveSheet(t);
}
