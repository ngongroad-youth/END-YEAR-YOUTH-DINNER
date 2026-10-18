# End Year Dinner 2026 · Ngong Road SDA Youth

Ticketing site for the youth End Year Dinner (6th December 2026, Swiss Lenana, KSH 2,500 per person).
It's a static website on GitHub Pages, with a Google Sheet as the database, just like the Nexus CAD Studio site.

| Page | Who it's for | What it does |
| --- | --- | --- |
| `index.html` | Everyone | Event details, countdown, **buy a ticket** (M-Pesa code form), **check ticket status**, **hype wall** (post, react 🔥❤️🎉🙌) |
| `ticket.html?t=…` | Guests | Their ticket with QR code (linked from the ticket email) |
| `door.html` | Ushers | PIN sign-in, camera QR scanner, manual ticket-ID check, live "checked in" count |

## How it works

1. A guest sends money to **+254 759 098947 (Madeline)**, then fills in the form with their M-Pesa code.
2. The order lands in the **Tickets** tab as *To confirm*, and the treasurer gets an email.
3. The treasurer checks the M-Pesa SMS and sets **Status** to **Confirmed**.
4. The guest automatically receives their ticket by email: QR code, ticket ID, details and a PDF copy.
   (*Not received* asks them to check their code instead. *Cancelled* frees the seats.)
5. On the day, ushers open `door.html`, enter the door PIN and scan QR codes. A ticket can only be
   checked in once; a second scan shows **Already checked in** with the time.

Extras: the treasurer gets an 8am reminder of payments still waiting; every confirmed guest gets a
"see you tomorrow" email on 5th December; menu **Dinner → Email me a summary** totals guests and money.

## Set-up (about 10 minutes)

### 1. Google Sheet + script
The sheet **"Youth End Year Dinner 2026 – Tickets"** is already in your Google Drive (it's separate from the website one).

1. Open it → **Extensions → Apps Script**. Delete what's there, paste all of [`apps-script/Code.gs`](apps-script/Code.gs), save.
2. Pick **`setup`** in the function list and click **Run**. Allow the permissions.
   This creates the *Tickets*, *Wall* and *Settings* tabs, a random **Door PIN**, and the automatic emails.
3. **Deploy → New deployment → ⚙ → Web app**. *Execute as:* **Me**, *Who has access:* **Anyone**. Deploy, copy the **Web app URL**.
4. In the **Settings** tab fill in:
   - **Treasurer email**: the treasurer's Gmail (gets the "confirm payment" emails)
   - **Ticket page link**: `https://edisonengineer.github.io/END-YEAR-YOUTH-DINNER/ticket.html`
5. **Share** the sheet with the treasurer as *Editor* so they can confirm payments.

### 2. Website
1. Paste the Web app URL into [`js/config.js`](js/config.js) as `apiUrl`, commit.
2. On GitHub: **Settings → Pages → Deploy from a branch → `main` / root**. The site goes live at
   `https://edisonengineer.github.io/END-YEAR-YOUTH-DINNER/`.

### Updating the script later
Paste the new `Code.gs`, save, run `setup` once, then **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same.

## Settings tab

| Setting | Meaning |
| --- | --- |
| Ticket price (KES) | 2500 |
| Max tickets per order | One QR admits the whole group |
| Capacity (seats) | Blank = no limit. Pending + confirmed seats count. |
| RSVP deadline | Sales close after this day (blank = keep selling) |
| Ticket sales open | `No` closes sales straight away |
| Show seats left | Shows "N seats left" when 60 or fewer remain |
| Wall posts need approval | `Yes` = posts only show once you type `show` in their Status |
| Door PIN | What ushers type on `door.html`. Change it to log everyone out. |

## Moderating the hype wall
Posts appear straight away. To remove one, type **`hide`** in its *Status* cell in the **Wall** tab. Links are blocked automatically.

## Good to know
- **Email limit:** a free Gmail account can send about **100 emails a day** from Apps Script (Google Workspace: 1,500). If many people pay on one day, confirm in batches; anything that fails is marked *⚠ Email failed* in *Notes*. Select the row and use **Dinner → Resend ticket**.
- **Duplicate codes:** an M-Pesa code can only be used on one order.
- **Privacy:** the ticket page only shows a ticket to someone holding its secret link/QR; no one can browse the list of guests.
- The QR scanner (`js/vendor/html5-qrcode.min.js`, Apache-2.0) and QR generator (`js/vendor/qrcode.js`, MIT) are bundled in the repo.
