# Jellybook — getting set up (for Kal)

Jellybook is a comic reader for iPad/iPhone that reads your existing library — no cloud
storage subscription needed. It runs against **your own Jellyfin server** pointed at the
external drive you already have; you reach it remotely over **Tailscale**. Free, all yours.

## Beta 1 = the reader (what to set up now)

The self-contained core: your library + a great reader (guided panel-by-panel view,
resume-anywhere, offline downloads). No extra services required beyond Jellyfin + the plugin.

### 1. Install Jellyfin (free) on the machine with your comics drive
<https://jellyfin.org/downloads> — Windows/macOS/Linux/Docker. Point it at the drive.

### 2. Add a Books library
Dashboard → Libraries → Add → **Content type: Books** → folder = your comics.
- CBZ/CBR are read directly. A `Series / Volume (Year) / Issue NNN.cbz` layout scans best.
- `ComicInfo.xml` inside the archives improves metadata but isn't required.

### 3. Tailscale for remote access (so it works away from home)
Install Tailscale on the Jellyfin machine **and** your iPad, same account. You'll reach
the server at its Tailscale name/IP — no ports opened, no storage bill.

### 4. Install the Jellybook plugin
Dashboard → Plugins → **Install from disk** → the `jellybook-x.x.x.x.zip` Alex sends →
restart Jellyfin.

### 5. Install the app
Accept the **TestFlight** invite → install TestFlight → install Jellybook → sign in to
your Jellyfin server (Tailscale address). Your library appears; start reading.

## What's in this build
Library, immersive reader, **guided view** (pan panel-to-panel), read progress + offline
downloads. **No "grab"/download-acquire** — that's intentional; you already own your library.

## Coming next (Beta 2)
- **Guided view** needs one-time panel-map generation over your library (a script Alex
  runs against your files, or you run locally) — until then it falls back to full pages.
- **X-Ray** (who's in this issue) and **Discover** (browse/new releases/recommendations)
  need the intelligence backend reachable for your setup — Alex will wire that once the
  reader's proven on your (much larger) library.
