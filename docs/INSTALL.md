# Installing Viewpoint Arena on your own computer

This guide sets up the whole app on one machine with Docker: the 3D review
rooms, live collaboration, saved reviews, the action tracker, video calls, and
(optionally) meeting capture that runs entirely on your own hardware, with no
cloud AI and no accounts anywhere.

It was written by walking through it on Windows 11 with WSL2 and Docker
Desktop. Linux works the same way from step 3 on. macOS should work the same
way too but has not been tested.

---

## 1. What you need

| | Minimum | Comfortable |
|---|---|---|
| Memory | 16 GB | 32 GB |
| Free disk | 10 GB | 20 GB with local meeting capture |
| Processor | 4 cores | 8+ cores |
| Graphics card | not needed | an NVIDIA card with 8 GB+ for fast meeting capture |

Local meeting capture works without a graphics card, just slowly: a few
minutes per meeting instead of about 20 seconds. Everything else in the app
does not use the graphics card at all.

---

## 2. One-time setup (Windows)

Skip to step 3 on Linux; you need Docker Engine with the Compose plugin
(`docker compose version` must work) and `git`, `openssl` and `curl`.

**a. Turn on WSL2 (the Linux layer Docker runs on).** Open **PowerShell as
Administrator** (right-click the Start button → Terminal (Admin)) and run:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart the computer when it asks. After the restart an "Ubuntu" window opens
and asks you to pick a Linux user name and password; pick anything and
remember the password.

**b. Install Docker Desktop** from <https://www.docker.com/products/docker-desktop/>
and start it. Then in Docker Desktop open **Settings → Resources → WSL
integration**, switch on **Ubuntu-24.04**, and press **Apply & restart**.

**c. Check it works.** Open **Ubuntu** from the Start menu (every command from
here on goes in that Ubuntu window, not in PowerShell) and run:

```bash
docker run --rm hello-world
```

You should see "Hello from Docker!".

**d. Only if you have an NVIDIA graphics card:** keep your normal Windows
NVIDIA driver up to date; nothing else is needed on Windows. Check that
Docker can see the card:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

It should print a table naming your card. If it fails, answer **no** to the
graphics card question in step 4; capture will still work, just more slowly.

---

## 3. Get the code

In the Ubuntu window:

```bash
git clone -b planning/oss-enterprise-readiness \
  https://github.com/coacopacoXR/Viewpoint-arena-wtht-capture-system.git ~/viewpoint-arena
cd ~/viewpoint-arena
```

Keep it in your Linux home folder (`~`) as above, not under `/mnt/c/...`:
the Windows drive is several times slower for Docker builds.

---

## 4. Run the installer

```bash
./install.sh
```

It asks a few questions. Pressing **Enter** takes the suggested answer shown
in brackets, and every suggested answer works. The ones worth thinking about:

| Question | What to answer |
|---|---|
| Public hostname | **Enter** (`localhost`) if only this computer will use it. To let colleagues on your network join, type this computer's network address instead (on Windows: `ipconfig` in PowerShell, the "IPv4 Address" of your Wi-Fi or Ethernet adapter, e.g. `192.168.1.134`). |
| Which capture provider | **`local`** to record meetings and get insights from your own hardware (downloads a 4.7 GB AI model once). **Enter** (`mock`) for a quick look at the app with simulated insights and no download. |
| Database | **Enter** (bundled). |
| TURN relay | **Enter** (bundled). |
| GPU compose override | **yes** only if the `nvidia-smi` check in step 2d worked. |

Then it builds and starts everything. The first run takes 5 to 15 minutes
(most of it is downloading; with `local` capture, add the AI model download).
It finishes by checking the app and printing a line like

```
ready after 1 attempt(s)
{"ok":true,"connectors":{...every one "status":"ok"...}}
```

If instead it stops with an error, see **Troubleshooting** below; every exit
explains what to change.

---

## 5. Open the app

Go to **<https://localhost/>** in Chrome or Edge on the same computer (or
`https://<the address you typed>/` from another computer on your network).

You will see a certificate warning, because the installer made its own
certificate instead of buying one. Click **Advanced → Continue to localhost
(unsafe)**. This is expected and only needed once per browser.

---

## 6. Try each feature

**Saved reviews (the database).**
Type your name, press **Curate a design review →**, then **CAPTURE VIEW** to
save the current camera angle. Go back to the lobby (**LOBBY**, top left):
your review is listed under **Saved reviews**. Reload the page; it is still
there.

**Live collaboration.**
Press your review in the **Saved reviews** list: its review room opens.
Press **SHARE**, switch to the **COPY LINK** tab (it opens on a QR code for
phones), and press **Copy Link**. Paste the link into a private/incognito
window (or a browser on another computer), type a different name and press
**Join**. Both windows are now in the same room: press **PARTICIPANTS** to see
each other listed.

**Video call.**
In the host window press **BOARDROOM**. Both windows switch to the call view;
allow camera and microphone when the browser asks.

**Meeting capture** (only with `local` capture).
In the host window, open the **Active Review** panel (bottom right, press the
small arrow to expand it) and press **OPEN MANAGER VIEW**. Press **START
RECORDING**, talk for half a minute about the design (for example: "Maria will
increase the clearance to one millimetre and send the model to the supplier by
Friday. The main risk is thermal expansion rubbing the headband."), then press
stop. After a short wait (20 seconds to a few minutes, see step 1) the panel
says **"N insights added"** and lists them as action, risk and rationale cards
you can approve, reject or edit.

**Tracker.**
From the lobby press **Open Tracker →** to see every saved meeting and its
action items across reviews.

**Health check.** <https://localhost/api/health> shows, for each part of the
system, whether it is working.

---

## 7. Everyday commands

Run these in the Ubuntu window from `~/viewpoint-arena`:

| To | Run |
|---|---|
| See what is running | `docker compose ps` |
| Stop everything (keeps all your data) | `docker compose stop` |
| Start it again | `docker compose up -d` |
| Read a part's log | `docker compose logs --tail 50 <name>`, e.g. `capture-service`, `api`, `db` |
| Change a setting | `./install.sh` again (see below) |

Docker Desktop must be running for any of these. It starts with Windows by
default; the app comes back on its own when Docker does.

**Changing settings.** Run `./install.sh` again and answer differently, e.g.
`local` instead of `mock` for capture. It is safe to repeat: your saved
reviews, the database password and the downloaded AI model are kept, and the
old settings files are backed up next to the new ones
(`.env.backup.<date>`).

---

## 8. Reset or remove

| To | Run |
|---|---|
| Remove the app but keep your data | `docker compose down` |
| **Delete everything, including all saved reviews and the AI model** | `docker compose down -v` |
| Also free the disk space used by the downloaded images | `docker system prune -a` (removes ALL unused Docker images on this computer, not only this app's) |

After `down -v`, `./install.sh` starts again from a clean slate.

---

## 9. Troubleshooting

| What you see | What it means and what to do |
|---|---|
| Installer exits with **"A port the stack needs is already in use"** (exit 5) | Another program uses port 80, 443 or 8443 (often IIS, Skype, or another web server). Stop that program, or set `HTTP_PORT` / `HTTPS_PORT` / `WSS_PORT` in `.env` to free numbers and run `./install.sh` again. |
| Installer ends with **"The stack did not answer"** (exit 4) | Something failed to start. `docker compose ps` shows which part is not "healthy"; `docker compose logs <name>` says why. |
| **"Permission denied"** on `./install.sh` | Run `chmod +x install.sh` once. |
| Browser says **"This site can't be reached"** | Docker Desktop is not running, or the stack is stopped: `docker compose up -d`. |
| Meeting capture says **"returned 504 (capture_upstream_timeout)"** | The AI model took longer than 10 minutes. Usually the graphics card is too small or busy: on a laptop, the screen and open apps share its memory. Close heavy apps (browsers with many tabs, games, video editors) and try again, or use a smaller model (`CAPTURE_OLLAMA_MODEL` in `.env`, then `docker compose up -d`). |
| Capture says **"transcriber_unavailable"** | `docker compose logs capture-service` names the cause. The first recording downloads the speech model (~150 MB), so the computer needs internet that first time. |
| Colleagues on the network cannot join | Use this computer's network address as the hostname (step 4), not `localhost`, and allow ports 443 and 8443 through the Windows firewall. |
| A video call connects only on the same network | See **Known limits** below. |

---

## 10. Known limits

- **Video calls across the internet.** Two people on the same network, or on
  the same computer, connect directly, and that is tested. For people on
  different networks the call relays through the bundled TURN server, and
  that path has **not** been verified under Docker Desktop, whose network
  forwarding gets in the way. For calls between offices, run the stack on a
  Linux server with a public address and set `TURN_EXTERNAL_IP` in `.env` to
  it, or choose the Cloudflare TURN option in the installer.
- **The graphics card on a laptop** also drives the screen, so open apps
  leave less room for the AI model and capture gets slower (see
  Troubleshooting).
- **Onshape, Teamcenter and Microsoft Teams** connections need your own
  accounts and keys; the installer asks for them if you pick those options.
- **Sign-in.** Anyone who can open the app can open any room whose link they
  have, and see saved reviews. Keep it on a trusted network.
