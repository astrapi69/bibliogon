# Offline mode and LAN access

Bibliogon is local-first: your books live on your own machine, not in a cloud. Two features build on that. Offline mode lets you keep editing a book even when the backend is temporarily unreachable, and LAN access lets a phone or tablet on the same network open Bibliogon and write straight back to your desktop.

Both features are opt-in. If you never turn them on, nothing changes: Bibliogon keeps talking to its backend exactly as before.

## What offline mode does

Normally the editor reads and writes through the online backend (the "API" storage). When you take a book offline, Bibliogon also keeps a copy of that book inside your browser's built-in database (IndexedDB, called the "Dexie" storage).

A small connectivity monitor watches whether the backend is actually reachable. It does not just trust the operating system's "you have Wi-Fi" signal: it quietly probes the backend's health endpoint every few seconds to be sure. As long as the backend answers, Bibliogon uses the online storage. The moment it stops answering, and you have at least one book offline, Bibliogon switches the editor over to the offline copy automatically. When the backend comes back, it switches back.

This whole machinery only ever starts after you take a book offline. On a plain desktop install it stays completely dormant.

## Taking a book offline

1. Open the book in the editor.
2. In the editor sidebar (where the chapter list lives), find the offline button. When the book is not offline yet it shows a cloud-with-download icon and reads "Take offline".
3. Click it. Bibliogon fetches the whole book in one request (the full book graph: metadata, chapters, and so on) and writes it into your browser's local database.
4. When it finishes you get a confirmation toast and the button changes to "Remove offline" (a cloud-off icon).

Once a book is offline, its card on the dashboard shows a small cloud badge so you can tell at a glance which books are available offline.

To stop keeping a book offline, click the same button again ("Remove offline"). This clears that book's local copy. If it was the last offline book, the connectivity monitor keeps running harmlessly until the next restart, which costs nothing while you are online.

Tip: take a book offline before you leave a reliable connection, not after. The download needs the backend, so do it while you are still connected.

## Editing while offline

When the backend is unreachable, Bibliogon shows a calm banner at the top of the app letting you know you are offline and that your changes are saved locally. You can keep writing as usual.

Every change you make offline is written to the local copy and also recorded in a write queue, in the order you made them (first in, first out). Nothing is lost and nothing is sent yet; the queue simply waits for the connection to come back.

The following content types support offline editing: books, chapters, and articles (create, update, and delete). Other content such as picture-book pages, comics, and Story Bible entities is not part of the offline write queue, so edit those while you are online.

## Syncing when you reconnect

As soon as the backend is reachable again, a background sync engine drains the queue. It replays your queued changes against the live backend in the same order you made them, which is also the safe order (a book is created before its chapters, and so on).

You get toasts telling you what happened:

- A success toast with the number of changes synced.
- A warning if a conflict was found that needs your decision.
- An error if some changes could not be synced. Those are kept, not dropped, so they can be retried later. Nothing is removed from the queue without a successful sync.

## Conflicts and how they are resolved

A conflict happens when the same record was changed on the desktop while your other device was offline, and your offline edit would overwrite that desktop change.

Bibliogon is careful about which cases can conflict:

- Book metadata uses last-write-wins, so it never raises a conflict.
- Newly created records never conflict (there was nothing to clash with).
- For a chapter or article update or delete, Bibliogon compares the desktop's current version against the snapshot taken when you downloaded the book. If the desktop moved on in the meantime, that change is parked as a conflict instead of silently overwriting.
- A special case is editing a record that was deleted on the desktop while you were offline. That is also flagged as a conflict so you can decide.

When a conflict is parked, the reconnect toast points you to resolve it. You then choose per conflict:

- Keep the mobile (offline) version: your offline edit is forced through to the desktop.
- Keep the desktop version: your offline edit is discarded and the desktop copy stays authoritative. This is the default leaning, because the desktop is the source of truth in Bibliogon.

For the in-editor case where a single chapter save clashes with a newer server version (for example, another tab saved first), Bibliogon shows a side-by-side preview dialog so you can compare "your changes" against the "server version" before choosing to keep yours, discard yours, or save yours as a new chapter.

## Offline tips and limitations

- Offline support covers books, chapters, and articles only. Plan around that for picture-books, comics, and Story Bible work.
- The local copy is per browser. Taking a book offline in one browser does not make it offline in another.
- Keep the desktop as the place where the real, merged copy lives. The desktop is authoritative by design, which is why "keep desktop" is the safe default for conflicts.
- If you remove a book from offline storage, make sure any pending offline changes for it have already synced.

## What LAN access does

LAN access serves the whole app, both the user interface and the backend, on a single network address so another device on the same Wi-Fi (a phone or a tablet) can open Bibliogon in its browser and edit your books. Combined with offline mode, that turns a second device into a comfortable on-the-go writing surface.

This is opt-in and guarded behind an environment switch, `BIBLIOGON_LAN_MODE`. In the normal development flow it is off and Bibliogon is reachable only from your own machine.

## Enabling LAN access

LAN mode serves the built frontend and the backend together on one port (`0.0.0.0:8000`), so the phone reaches everything at one URL with no cross-origin hop.

To start it:

```
make dev-lan
```

This first builds the production frontend bundle (the same as `make build-frontend`) and then runs the backend with LAN mode enabled, bound to all network interfaces on port 8000. It runs in the foreground as a single process; press Ctrl+C to stop it. There is deliberately no auto-reload, because reloading would regenerate the PIN and drop existing sessions.

When it starts, the terminal prints a banner with:

- A scannable QR code for the access URL (with the PIN already embedded).
- The plain access URL, of the form `http://<your-LAN-IP>:8000`.
- The 6-digit PIN.

Bibliogon detects your machine's LAN IP automatically for the banner.

## The PIN gate

Bibliogon has no user accounts, so LAN mode adds a lightweight pre-shared PIN to stop another device on the network from reading or writing your books.

- A random 6-digit PIN is generated each time LAN mode starts.
- After a correct PIN, the device holds a session (via a cookie) that stays valid for 24 hours.
- Wrong PINs are limited: three failed attempts lock that device out for 10 minutes.

This is meant for trusted home networks. It is not a defence against a determined attacker on a hostile network, so only use LAN mode on networks you trust.

## Connecting a phone, step by step

1. On your computer, start LAN mode with `make dev-lan`.
2. Make sure the phone is on the same Wi-Fi network as the computer.
3. On the phone, either scan the QR code from the startup banner, or type the access URL (`http://<your-LAN-IP>:8000`) into the phone's browser.
4. If you scanned the QR, the PIN page opens with the PIN already filled in and submits itself. If you typed the URL, the PIN page appears and you enter the 6-digit PIN, then tap Unlock.
5. Bibliogon opens and you can edit your books from the phone.

## Onboarding a second device from inside the app

Once one device is connected, you do not have to look back at the terminal banner to add another. Open Settings, go to the About tab, and find the LAN-access card. It shows the current access URL, the PIN, and a scannable QR code, so you can point the next device at it without leaving Bibliogon. This card only appears when LAN mode is running.

You can reach Settings from the gear or Settings entry in the app. For an overview of the Settings tabs, see [Settings](settings/sidebar.md).

## LAN tips and security

- All devices must be on the same local network. LAN access does not reach across the internet.
- Treat the PIN like a password for your books while LAN mode is on. Anyone on your network who has it can read and edit your work.
- The PIN changes every time you restart LAN mode, so a fresh start invalidates old sessions.
- Use LAN mode on trusted networks only (home, not public Wi-Fi).

## Related pages

- [Settings](settings/sidebar.md) for the About tab and the LAN-access card.
- [Dashboard pagination](dashboard/pagination.md) for finding books on the dashboard, where the offline cloud badge appears.
- [Git backup](git-backup/basics.md) for keeping a versioned backup of your work, which complements local-first editing.
