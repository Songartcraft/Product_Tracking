# Handoff: Song Art & Craft — Product Photo Sales App

## Overview
A two-part system for a handmade glassware workshop ("Song Art & Craft"):

1. **Staff Capture App** — a **mobile-first** web app. Staff sign in with a numeric passkey, photograph a product, fill a short form (category, maker, price, quantity, payment method, note), and submit. Each submission is a **purchase record** tagged with who logged it, who made it, and a timestamp. Staff can browse and edit past records; every edit is version-logged.

2. **Admin Console** — a **desktop** web app. An administrator signs in with an ID + password and has full control: manage staff and their passkeys, manage the list of "makers", and view / filter / edit / delete every purchase (with full edit history).

Both apps talk to **one shared backend + database**. In the prototypes the two apps hold their own in-memory data; in production they MUST share one API and datastore so a passkey created in Admin instantly works in the staff app, etc.

> The business goal: quickly log every product made/sold with a photo, attribute it to a maker, and track sales and who made how many — over time.

## About the Design Files
The files in `design_references/` are **design references created in HTML** — prototypes showing the intended look, layout, and behavior. They are **not** production code to copy directly.

- `Product Capture.dc.html` — the staff mobile app (all screens).
- `Admin Console.dc.html` — the admin desktop console (all screens).
- `support.js` — the tiny runtime that renders these specific prototype files. **Ignore it for the real build** — it is only here so the HTML opens in a browser. Do not port it.
- `assets/song-logo.png` — the brand logo (white line-drawn flower on pink). Use as-is.

These files are authored in a lightweight component format (`<x-dc>` template + a `Component` logic class). Read them for exact **markup structure, inline styles, hex colors, font sizes, copy, and behavior** — then **recreate them in the target stack** (recommended below) using idiomatic components. Do not try to run the `.dc.html` format in production.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, shadows, copy, and interactions are final. Recreate the UI pixel-accurately. All exact values are in the **Design Tokens** section and inline in the reference files.

---

## Recommended Tech Stack (deployment-friendly)
Chosen so a single developer (or Claude Code / Codex) can build and deploy quickly, and so the user's "front-end on Vercel, backend wherever's easiest" goal is met.

- **Framework:** Next.js (App Router, TypeScript, React) — hosts **both** the staff app and the admin console as route groups in one project, and gives you API routes for the backend. Deploys to **Vercel** in one click.
  - `/` and `/app/*` → staff mobile app
  - `/admin/*` → admin console
  - `/api/*` → backend endpoints
- **Database:** **PostgreSQL** via **Supabase** (managed, free tier, easy) or **Neon**. Use **Prisma** as the ORM.
- **Auth:**
  - Admin → email + password. Use **NextAuth (Auth.js) Credentials provider** or a simple signed-JWT httpOnly cookie. Hash passwords with **bcrypt**.
  - Staff → numeric passkey (4–6 digits). Validated server-side against the `employees` table; on success issue a short-lived session/JWT identifying the employee. **Never** trust the passkey check on the client.
- **Photo storage:** **Supabase Storage** or **Cloudinary / S3**. Store the returned URL on the purchase row (do NOT store base64 in the DB). Prototype uses base64 data URLs — replace with an upload step.
- **Styling:** **Tailwind CSS** (map the tokens below) or plain CSS modules — either is fine; match the prototype exactly.
- **Fonts:** Google Fonts — **Hanken Grotesk** (UI) and **Instrument Serif** (display numbers/wordmark). Import both.
- **Icons:** All icons in the prototype are inline SVG (stroke-based, ~1.7–2px). Reuse them verbatim, or swap to **lucide-react** (visually equivalent).

If the user already has a preferred stack, adapt — the data model, auth rules, and screen specs below are stack-agnostic.

---

## Data Model (source of truth)

```
Employee
  id            uuid / cuid   (PK)
  firstName     string        required
  lastName      string        required
  email         string        unique-ish, optional but recommended
  phone         string        optional
  passkey       string        4–6 digits, UNIQUE across active employees. Store HASHED (bcrypt). Never return to client.
  role          enum          'Employee' | 'Manager'
  status        enum          'Active' | 'Inactive'   (Inactive passkeys must NOT authenticate)
  createdAt     timestamp
  updatedAt     timestamp

Maker            // "Made by" — who physically made the product
  id            uuid          (PK)
  name          string        UNIQUE (case-insensitive)
  isDefault     boolean       exactly one default: "Song Art & Craft". Default cannot be deleted.
  createdAt     timestamp

Purchase
  id            uuid          (PK)
  photoUrl      string|null   URL to stored image (null allowed)
  category      enum/string   'Glass Flower' | 'Glass Petals' | 'Glass Artifact'  (make this a table if it must be editable later)
  price         decimal(10,2) > 0
  quantity      int           >= 1
  payment       enum          'Cash' | 'Online'
  note          string|null
  makerId       fk -> Maker   default = the "Song Art & Craft" maker
  employeeId    fk -> Employee  who LOGGED it (from the authenticated session)
  createdAt     timestamp     the capture date/time (record this server-side)
  updatedAt     timestamp|null last edit time (null if never edited)

PurchaseHistory   // one row per edit = version log; newest first when displayed
  id            uuid          (PK)
  purchaseId    fk -> Purchase
  category      string        value BEFORE this edit
  price         decimal
  quantity      int
  payment       string
  note          string|null
  makerName     string        snapshot of maker name at that time
  editedById    fk -> Employee|Admin  who made the edit
  createdAt     timestamp     when this prior version was superseded

Admin
  id            uuid
  email         string        e.g. admin@songartcraft.com
  passwordHash  string        bcrypt
```

**History rule:** editing a Purchase writes a `PurchaseHistory` snapshot of the **previous** values, then updates the Purchase and sets `updatedAt`. The detail view shows "Current version" + each prior version (newest first) with its date/time and a one-line summary: `Category · £Price · Qty N · Payment · Maker`.

**Seed data** (matches the prototypes; replace names with the client's real staff):
- Admin: `admin@songartcraft.com` / `$Aurabh2695` (hash it).
- Employees: Sovrat Rana `123456` (Manager, Active), Amelia Hart `4021` (Employee, Active), Priya Nair `778812` (Employee, Inactive).
- Makers: **Song Art & Craft** (default), Amir, Mei Ling, Luca.
- Categories: Glass Flower, Glass Petals, Glass Artifact.

---

## API Endpoints (suggested REST shape)

```
# Staff auth
POST /api/staff/login            { passkey }            -> { token, employee:{id,name,role} }  | 401 if no match or Inactive

# Staff (auth required: employee session)
GET  /api/purchases              ?category=&maker=      -> [Purchase]  (all staff can see all recent purchases)
POST /api/purchases              multipart: photo + {category,price,quantity,payment,note,makerId}
                                                        -> Purchase   (employeeId from session, createdAt server-side)
GET  /api/purchases/:id                                 -> Purchase + history[]
PATCH /api/purchases/:id         {category,price,quantity,payment,note,makerId,photo?}
                                                        -> Purchase   (writes a PurchaseHistory snapshot first)
DELETE /api/purchases/:id                               -> 204        (allowed for staff on their records; always for admin)
GET  /api/makers                                        -> [Maker]

# Admin auth
POST /api/admin/login            { email, password }    -> { token }  (httpOnly cookie preferred)

# Admin (auth required: admin session) — full control over everything above, plus:
GET    /api/admin/employees                             -> [Employee]  (never include raw passkey; return masked + a reveal endpoint if needed)
POST   /api/admin/employees      {first,last,email,phone,passkey,role,status}
PATCH  /api/admin/employees/:id  {...}                  (passkey uniqueness enforced; 4–6 digits)
DELETE /api/admin/employees/:id
GET    /api/admin/makers
POST   /api/admin/makers         { name }               (reject duplicate, case-insensitive)
DELETE /api/admin/makers/:id     (reject if isDefault)
GET    /api/admin/overview       -> { totalRevenue, todayRevenue, todayCount, purchaseCount, activeStaff, totalStaff }
```

Revenue = `sum(price * quantity)`. "Today" = same calendar day as server now. Currency default **£ (GBP)**; keep it configurable (£/$/€).

---

## Screens / Views

### STAFF APP (mobile, max-width 430px, single column)

**1. Passkey Gate** (landing — first thing shown)
- Full-height cream (`#f7f4ef`) screen, centered column.
- Logo image (120×120, `border-radius:24px`, soft pink shadow) → wordmark "Song Art & Craft" in Instrument Serif 26px → heading "Enter your passkey" (23px/800) → subtext (14px `#9a9088`).
- **6 PIN dots** (14px circles; filled `#d24d84` + scale 1.12 when entered, empty `#e4ddd3`), 13px gap. Error message slot (13px `#c0392b`) with a horizontal **shake** animation on wrong code.
- **Numeric keypad**: 3-column grid, keys `1–9`, blank, `0`, `⌫`. Keys are 64px tall white rounded (`border-radius:18px`, 24px digits, subtle shadow).
- Behavior: typing digits fills dots. Auto-submit when the entered string **matches any employee passkey**, OR when it reaches 6 digits. On match → set session employee, go Home. On no match → clear, shake, show "Passkey not recognised. Try again." Inactive employees must be rejected.

**2. Home**
- Top bar: hamburger (42px white rounded square) · centered label "CAPTURE" (12px/700, letterspaced, `#a89e92`) · **employee badge** top-right (pink 30px avatar circle with initial + name pill on white).
- Greeting ("Good morning/afternoon/evening" by hour) + shop name (Instrument Serif 40px).
- **Stats card** (white, radius 20px): "Today" count + "Takings" today (Instrument Serif; takings in pink `#d24d84`), split by a hairline divider.
- **Recent captures**: section title + "See all" (pink text button) → 2-column grid of cards. Each card: square photo thumbnail (or diagonal-stripe placeholder + "no photo"), category (13px/700), price (pink 13px/600), and a small "Made by {maker}" line with a flower icon.
- **Bottom nav** (fixed, 82px, `#fffdf9`, top hairline): Home (left) · Purchases (right) · **raised circular camera FAB** in the center (66px, pink, white 5px ring, drop shadow, camera icon). Active tab tinted pink, inactive `#b3aa9f`.

**3. Camera Capture**
- Full-screen dark (`#1a1613`). Live `<video>` fill (rear camera via `getUserMedia({video:{facingMode:'environment'}})`). Rounded inset frame guide overlay. Cancel (×) top-left.
- Bottom bar: **Upload** button (icon+label, opens file picker as fallback) · **Shutter** (78px white-ringed pink circle) · spacer.
- Behavior: shutter draws the current video frame to a canvas → JPEG (quality ~0.82) → becomes the draft photo → go to Form. If no live camera (desktop/denied), shutter/Upload open the native file input (`accept="image/*" capture="environment"`). **In production, upload the file to storage and keep the URL.**

**4. Capture Form**
- Header: back (←) + "Product details" (or "Edit product" when editing).
- Photo-preview card: 72px thumbnail + "Photo captured" + "Signed in as {employee}" + a **Retake** button.
- Fields (labels 13px/700 `#6b625a`; inputs white, radius 14px, 1.5px border `#e9e3da`):
  1. **Category** — select: Select category… / Glass Flower / Glass Petals / Glass Artifact.
  2. **Made by** — select, options = makers list, **default "Song Art & Craft"**.
  3. **Price** — number input with leading currency symbol.
  4. **Quantity** — stepper (− / value / +), min 1.
  5. **Payment method** — two toggle buttons **Cash** / **Online** (selected = pink border, `#fbe4ef` bg, `#a83168` text).
  6. **Note** — optional textarea.
- Sticky footer: **Save purchase** button (pink; disabled grey until category set AND price > 0). "Save changes" when editing.
- Behavior: submit builds the record (employee from session, timestamp server-side) → toast "Purchase saved" → go to Purchases list. Editing writes a history snapshot then updates.

**5. Purchases (records) list**
- Header (hamburger · "PURCHASES" · employee badge).
- **Dark summary card** (`#2b2622`, white text): Today's revenue + Captures count (Instrument Serif).
- **Category filter chips** row (All / 3 categories). Below it a **"Made by" filter chips** row (All + each maker). Active chip = solid pink.
- List of rows (white cards): thumbnail · category (15px/700) · "date · time · payment" (12.5px `#9a9088`) · **"Made by {maker}"** (pink 12px/700 with flower icon) · price (pink 16px/700) + "Qty N" on the right.
- Same bottom nav with center FAB. Empty state message when a filter has no results.

**6. Purchase Detail**
- Back + "Purchase". Large 4:3 photo (or placeholder). Centered category + big pink price (Instrument Serif 44px).
- Info card rows: Quantity · Payment · **Made by** (pink) · Captured by · Date & time.
- Optional Note block (pink `#fbe4ef` tint).
- **Edit purchase** button (pink) → opens the form pre-filled.
- **Edit history** timeline (only if edits exist): "Current version" node (pink dot) + prior versions (grey dots) each in a white card: "Version N", date/time, and summary line.
- **Delete purchase** (outlined red) → inline confirm ("Delete this purchase permanently?") → Cancel / Delete.

**7. Side menu (drawer)**: Home · Purchases · New capture · **Sign out ({employee})** + a note that passkeys are managed from the admin database.

### ADMIN CONSOLE (desktop, ~1440×900, sidebar + main)

**Login**: centered card on cream. Logo + "Song Art & Craft / ADMIN CONSOLE". "Sign in" heading. Admin ID + Password fields. Pink "Enter console" button. Wrong credentials → shake + "Incorrect ID or password." Demo creds: `admin@songartcraft.com` / `$Aurabh2695`.

**Shell**: dark sidebar (`#2b2622`, 250px) with logo lockup, nav items (icon + label + count badge), and an admin card at the bottom with "Sign out". Main area: header (page title + subtitle, plus context action e.g. "Add user"), scrollable content.

Nav tabs:
- **Overview** — 4 stat cards (Total revenue, Today, Purchases, Staff active/total) + "Recent purchases" table (product, employee, amount, payment, date) with "View all".
- **Employees** — table: employee (avatar+name) · contact (email/phone) · **passkey** (masked `••••••` with an eye reveal toggle) · role · status pill (Active green / Inactive tan) · actions (edit ✎ / delete 🗑). "Add user" button opens a modal (first, last, email, phone, passkey 4–6 digits, role, status). Validation: names required, passkey 4–6 digits and unique. Delete → confirm modal ("Their passkey stops working immediately. Purchases they logged are kept.").
- **Made by** — "Add a maker" card (text input + Add). Table of makers: name (+ "Default" pill for Song Art & Craft) · attributed product count · remove (🗑, hidden for the default). Reject duplicate names (case-insensitive).
- **Purchases** — category filter chips + **"Made by" filter chips**. Table: product (thumb + category, "edited" tag) · **Made by** (pink) · employee · amount (pink) · qty · payment · date · view (›). Clicking a row opens a **right slide-over**.
  - Slide-over: photo, editable **Category**, **Made by**, Price, Quantity, Payment (Cash/Online toggle), Note. "Logged by {employee} · date, time". **Save changes** (writes history) · **Delete** (inline confirm). **Edit history** timeline (Current + prior versions with summaries).
- **Settings** — Shop name (read-only display), product categories (chips), and an Access note describing admin capabilities.

**Toast**: dark pill, bottom-center, green check, auto-dismiss ~2.6s, used for save/add/delete confirmations across both apps.

---

## Interactions & Behavior (cross-cutting)
- **Auth gating:** staff app is unusable until a valid passkey is entered; admin console until valid login. Both should persist a session (cookie/JWT) and restore it on reload.
- **Timestamps** are set by the server on create; edits set `updatedAt` and append history.
- **Filtering** is client- or server-side by category AND maker together (AND logic).
- **Payment** is exactly two options: Cash, Online.
- **Currency** default £; keep configurable.
- **Animations:** PIN/login **shake** on error (~0.4s); toast slide-up; drawer/slide-over fade+slide (~0.18–0.22s); keypad key press feedback. Keep them subtle.
- **Empty states** everywhere a list can be empty.
- **Accessibility:** all icon-only buttons have aria-labels (already in the prototype); hit targets ≥44px on mobile.

## State Management
- **Staff app:** `session.employee`, current `screen`, `pinEntry`, `draftPhoto`, `form{category,maker,price,qty,payment,note}`, `records[]`, `categoryFilter`, `makerFilter`, `editingId`, `detailId`, `toast`. Server-backed: records, makers, employee validation.
- **Admin:** `session.admin`, active `tab`, `employees[]`, `makers[]`, `purchases[]` (+ history), modal/slide-over open states, `filter`, `makerFilter`, `newMaker`, `toast`. All lists come from the API.
- Prefer server state via React Query/SWR (or server components + actions in Next.js). Local UI state with `useState`.

## Design Tokens
**Colors**
- Brand pink (primary/accent): `#d24d84`
- Deep pink (pressed text on tint): `#a83168`
- Light pink (tint fill / selected bg): `#fbe4ef`
- Ink / dark surfaces (sidebar, summary card, text): `#2b2622`
- Body text: `#2b2622`; muted text: `#9a9088`; faint text: `#b3aa9f` / `#c0b8ac`; label text: `#6b625a`
- App background (cream): `#f7f4ef`; admin main bg: `#f4f0ea`; near-white surfaces: `#fff` / `#fffdf9` / `#faf7f2`
- Borders / hairlines: `#e9e3da`, `#e4ddd3`, `#ece6dd`, `#f0ebe3`, `#f4efe8`, `#f2ece3`
- Success (status/toast check): green `#3f7d4f` on `#e4f1e6`; inactive pill: `#9a8b78` on `#efe7db`
- Danger (delete): text `#c0392b`, border `#e7c9bf`, tint bg `#fbeeeb`, strong `#8f2d20`
- Dark camera bg: `#1a1613`
- Placeholder image: `repeating-linear-gradient(45deg,#efe7db,#efe7db 6px,#f6f0e6 6px,#f6f0e6 12px)`
- Pink shadow: `rgba(210,77,132, .26–.4)`; neutral shadow: `rgba(60,45,30, .05–.1)`; overlay scrim: `rgba(30,22,16,.42–.5)`

**Typography**
- UI font: **Hanken Grotesk** (weights 400/500/600/700/800).
- Display font: **Instrument Serif** (regular; used for the wordmark and big numbers/prices).
- Mono (passkeys): `ui-monospace, 'SF Mono', monospace`.
- Scale seen: 40/38/36/34 (display), 24/23/22/20/19 (headings), 17/16/15/14 (body/inputs), 13/12.5/12/11.5/11 (labels/meta). Mobile body ≥14px, hit targets ≥44px.

**Radii**: pills `999px`; large cards `18–24px`; inputs/buttons `11–16px`; small chips/thumbs `9–12px`.
**Spacing**: page padding 20–34px; card padding 12–24px; gaps 8–18px.
**Shadows**: cards `0 2px 10px rgba(60,45,30,.05–.06)`; FAB `0 10px 22px rgba(210,77,132,.4)`; buttons `0 6–8px 16–20px rgba(210,77,132,.26–.3)`; modals `0 24–30px 60–70px rgba(30,22,16,.2–.4)`.

## Assets
- `assets/song-logo.png` — brand logo (white line-drawn flower on pink). Use for gate/login lockups and the sidebar mark. All other graphics are inline stroke SVG icons (recreate or use lucide-react).
- Fonts from Google Fonts (Hanken Grotesk, Instrument Serif).
- No other image assets — product photos come from the camera/upload at runtime.

## Files (in this bundle)
- `design_references/Product Capture.dc.html` — staff mobile app, all screens + behavior.
- `design_references/Admin Console.dc.html` — admin desktop console, all screens + behavior.
- `design_references/assets/song-logo.png` — logo.
- `design_references/support.js` — prototype runtime only; **do not port**.

## Suggested build order (for Claude Code / Codex)
1. Scaffold Next.js + TypeScript + Tailwind; add fonts + tokens; drop in the logo.
2. Prisma schema from the Data Model; migrate; seed (admin, employees, makers, a few sample purchases).
3. Auth: admin login + staff passkey login (hashed, server-validated, session cookie).
4. Backend API routes per the endpoint list (+ photo upload to storage).
5. Staff app screens 1→7, wired to the API; camera capture + upload.
6. Admin console screens, wired to the API; employee/maker CRUD; purchase edit + history + delete; filters; overview stats.
7. Polish: toasts, empty states, animations, validation, responsive checks.
8. Deploy: push to GitHub → Vercel (app + API); provision Supabase/Neon DB + storage; set env vars; run migrations/seed.

## Deployment notes
- **Front end + API:** Vercel (the Next.js project covers both).
- **Database:** Supabase or Neon (Postgres). Set `DATABASE_URL`.
- **Photo storage:** Supabase Storage / Cloudinary / S3. Set the relevant keys.
- **Env vars:** `DATABASE_URL`, `AUTH_SECRET`/`JWT_SECRET`, storage keys, `ADMIN_EMAIL`, seeded admin hash. Never commit secrets.
- Two "apps" = one deployment with `/` (staff) and `/admin` route groups. If the user wants truly separate domains, split into two Next.js apps sharing the same API + DB, or put the API in its own small service (Render/Railway) — but one project is simplest.
