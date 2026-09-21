#!/usr/bin/env bash
#
# install.sh — configure a Viewpoint Arena deployment.
#
#   ./install.sh                        interactive
#   ./install.sh --defaults             non-interactive (what CI runs)
#   ./install.sh --defaults --configure-only --dir /tmp/x
#                                       write the two files and stop
#
# It writes exactly two configuration artefacts, and the split between them is
# the whole point of the master-config design
# (docs/plan/01-architecture-and-master-config.md):
#
#   viewpoint.config.ts   WHICH provider each connector uses, and the NAME of
#                         the environment variable holding each credential.
#                         Secret-free, read at runtime by lib/config/.
#   .env                  the VALUES. Generated secrets, pasted credentials,
#                         and the deployment settings docker-compose.yml
#                         interpolates. Never committed.
#
# Neither file is meaningful without the other, which is why one script writes
# both: an installer that wrote only .env would leave the app with no idea which
# connector those variables belong to, and one that wrote only the config would
# leave loadConfig() throwing about missing variables.
#
# docs/plan/06-deployment-and-installation.md §2 lists eight responsibilities.
# Steps 1-4 are the two files above. Steps 5-8 (compose up, ollama pull, the
# Postgres schema, polling /api/health) run after them unless --configure-only
# was given.
#
# SECURITY, NON-NEGOTIABLE
#   * Every secret is generated at install time from the OS CSPRNG. There is no
#     default value for any of them anywhere in this file, and if no source of
#     randomness exists the script exits rather than writing a placeholder — a
#     predictable token guarding a service that accepts meeting recordings is
#     worse than no token, because it looks configured.
#   * An existing .env / viewpoint.config.ts is never overwritten silently. It is
#     backed up first, and interactively you are asked what to do.
#   * .env is written 0600. It holds the capture-service shared secret and the
#     database password.
#
# STREAM DISCIPLINE — read this before editing.
#   say/note/env_comment look interchangeable and are not.
#     say, note        progress output, STDERR
#     env_comment      generated FILE CONTENT, STDOUT
#   The ask_* helpers return their answer on STDOUT so callers can write
#   `VALUE="$(ask_choice ...)"`. Anything printed to stdout inside them becomes
#   part of the value, which is why every prompt goes to stderr.

set -euo pipefail

readonly VERSION='0.1.0'
readonly SCRIPT_NAME='install.sh'

# Where the two files are written. Defaults to this script's own directory,
# because viewpoint.config.ts has to sit at the repo root for loadConfig() to
# find it and for its './lib/config/schema.ts' import to resolve.
TARGET_DIR=''
NON_INTERACTIVE=0
CONFIGURE_ONLY=0
ASSUME_YES=0
FORCE_GPU=''

# Populated by detect_os: linux | macos | wsl | windows | unknown.
OS=''
UNAME_S=''
# Populated by check_docker, e.g. (docker compose) or (docker-compose).
COMPOSE=()
COMPOSE_ARGS=()
PROFILES=()

# Names of variables written into .env with an empty value and a TODO(operator)
# marker. Collected via a temp file, not an array: render_env runs in a
# subshell (it is redirected into the file it generates), so an array it
# appended to would vanish when the subshell exited.
PENDING_FILE=''
PENDING_VARS=()

CONFIG_WRITTEN=0
ENV_WRITTEN=0

# ─── Output ─────────────────────────────────────────────────────────────────

say()  { printf '%s\n' "$*" >&2; }
note() { printf '  %s\n' "$*" >&2; }

# A comment line in a GENERATED FILE. Stdout, not stderr — see the note above.
env_comment() { printf '%s\n' "$*" ; }

die() {
  say ''
  say "$SCRIPT_NAME: $*"
  exit 1
}

banner() {
  say ''
  say '──────────────────────────────────────────────────────────────────'
  say " Viewpoint Arena installer  v${VERSION}"
  say '──────────────────────────────────────────────────────────────────'
}

usage() {
  cat >&2 <<'USAGE'
Usage: ./install.sh [options]

Writes .env and viewpoint.config.ts for this deployment, then (unless
--configure-only) brings the docker-compose stack up and proves it is ready.

Options:
  --defaults         Non-interactive: take every documented default. Used by CI
                     and by anyone who would rather edit the two files after.
  --configure-only   Write the two files and stop. Skips the Docker check, TLS
                     certificate generation, `compose up`, the model pull, the
                     schema load and the health poll.
  --dir PATH         Directory to write into. Default: this script's directory.
  -y, --yes          Back up an existing .env / viewpoint.config.ts and write
                     the new one without asking.
  --gpu              Force the GPU compose override on, skipping the prompt.
  --no-gpu           Force it off, skipping the prompt.
  -h, --help         This text.

Exit codes:
  0   success
  1   refused to run (native Windows, missing prerequisite, no entropy, an
      answer that cannot produce a valid config)
  2   bad command line
  3   the stack came up but at least one enabled connector reports degraded
USAGE
}

# ─── Arguments ──────────────────────────────────────────────────────────────

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --defaults)       NON_INTERACTIVE=1 ;;
      --configure-only) CONFIGURE_ONLY=1 ;;
      --dir)
        [[ $# -ge 2 ]] || die "--dir needs a path"
        TARGET_DIR="$2"
        shift
        ;;
      --dir=*)          TARGET_DIR="${1#--dir=}" ;;
      -y|--yes)         ASSUME_YES=1 ;;
      --gpu)            FORCE_GPU='yes' ;;
      --no-gpu)         FORCE_GPU='no' ;;
      -h|--help)        usage; exit 0 ;;
      *)
        say "$SCRIPT_NAME: unknown option '$1'"
        usage
        exit 2
        ;;
    esac
    shift
  done

  if [[ -z "$TARGET_DIR" ]]; then
    TARGET_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  fi
  [[ -d "$TARGET_DIR" ]] || die "--dir '$TARGET_DIR' is not a directory"
  # Absolute, because it is printed next to relative paths in the summary and a
  # mix of the two is how an operator edits the wrong file.
  TARGET_DIR="$(cd -- "$TARGET_DIR" && pwd)"
}

# ─── Step 1: OS detection ───────────────────────────────────────────────────

detect_os() {
  UNAME_S="$(uname -s 2>/dev/null || printf 'unknown')"

  case "$UNAME_S" in
    Linux*)                          OS='linux' ;;
    Darwin*)                         OS='macos' ;;
    CYGWIN*|MSYS*|MINGW*|Windows_NT) OS='windows' ;;
    *)                               OS='unknown' ;;
  esac

  # WSL reports Linux. It is SUPPORTED — Docker Desktop's engine or a native
  # Docker Engine inside the distro both work — so it is flagged, not rejected.
  if [[ "$OS" == 'linux' ]] && [[ -r /proc/version ]] \
     && grep -qiE 'microsoft|wsl' /proc/version; then
    OS='wsl'
  fi

  if [[ "$OS" == 'windows' ]]; then
    refuse_native_windows
  fi

  if [[ "$OS" == 'unknown' ]]; then
    say "warning: unrecognised operating system ('${UNAME_S}'). Continuing, but"
    say '         the Docker install instructions below may not apply.'
  fi
}

refuse_native_windows() {
  cat >&2 <<WINDOWS

$SCRIPT_NAME: refusing to run on native Windows (${UNAME_S}).

This is not a missing dependency that installing something would fix. The
installer configures Linux containers, and bash on Windows (Git Bash, MSYS2,
Cygwin) cannot drive them:

  * Docker Desktop's engine runs in a VM this shell cannot address, so
    "docker compose up" would fail after the files were already written.
  * MSYS path translation rewrites ./deploy/certs into C:/... on the way into a
    container bind mount, which nginx then cannot find.
  * The generated .env would get CRLF line endings, and Docker Compose keeps the
    carriage return as part of the value — so every secret would silently carry
    a stray byte and nothing would authenticate.

Use WSL2 instead. From PowerShell as Administrator:

  1.  wsl --install -d Ubuntu-24.04
  2.  Reboot, then open "Ubuntu 24.04" from the Start menu.
  3.  Install Docker Desktop for Windows and enable
      Settings -> Resources -> WSL Integration for that distribution.
      (Or install Docker Engine inside WSL instead: https://get.docker.com)
  4.  Clone the repo INSIDE the WSL filesystem, not under /mnt/c:

          git clone <your-fork> ~/viewpoint-arena
          cd ~/viewpoint-arena

      A checkout on /mnt/c works but is several times slower for npm ci and for
      Docker build contexts, and this installer runs both.
  5.  Re-run:  ./install.sh

WINDOWS
  exit 1
}

# ─── Step 2: Docker + Compose ───────────────────────────────────────────────

check_docker() {
  local have_docker=0 have_compose=0 compose_version=''

  if command -v docker >/dev/null 2>&1; then
    have_docker=1
  fi
  if [[ "$have_docker" == '1' ]]; then
    if docker compose version >/dev/null 2>&1; then
      COMPOSE=(docker compose)
      have_compose=1
    elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE=(docker-compose)
      have_compose=1
    fi
  fi

  if [[ "$have_docker" == '1' && "$have_compose" == '1' ]]; then
    compose_version="$("${COMPOSE[@]}" version --short 2>/dev/null || printf 'unknown')"
    note "docker:  $(docker --version 2>/dev/null | head -n1)"
    note "compose: ${compose_version} (via ${COMPOSE[*]})"
    return 0
  fi

  say ''
  say 'Missing prerequisite(s):'
  [[ "$have_docker" == '1' ]] || say '  - Docker Engine (the `docker` command was not found)'
  [[ "$have_compose" == '1' ]] || say '  - Docker Compose v2 (`docker compose version` failed)'

  case "$OS" in
    macos)
      cat >&2 <<'MAC'

Install Docker Desktop, which bundles Compose v2:

    brew install --cask docker        # then start Docker once from Applications
    # or download: https://www.docker.com/products/docker-desktop/

Verify with:  docker compose version
MAC
      ;;
    wsl)
      cat >&2 <<'WSL'

Either enable Docker Desktop's WSL integration (Settings -> Resources -> WSL
Integration, for this distribution), or install Docker Engine inside WSL:

    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    # then log out and back in, or:  newgrp docker

Verify with:  docker compose version
WSL
      ;;
    *)
      cat >&2 <<'LINUX'

Docker's own convenience script installs the Engine and Compose v2 together:

    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    # then log out and back in, or:  newgrp docker

Verify with:  docker compose version

On an air-gapped host, install your distribution's packages instead
(docker.io + docker-compose-plugin on Debian/Ubuntu, docker-ce +
docker-compose-plugin from a mirrored repository on RHEL-family).
LINUX
      ;;
  esac

  # --configure-only writes two text files. It has no reason to demand a working
  # Docker, and refusing here would make the installer unusable on a laptop that
  # is preparing configuration for a machine that does have Docker.
  if [[ "$CONFIGURE_ONLY" == '1' ]]; then
    say ''
    say 'Continuing anyway: --configure-only writes the two files and does not'
    say 'touch Docker. Re-run without it once Docker is installed.'
    return 0
  fi

  say ''
  die 'Docker is required to bring the stack up. Install it and re-run, or use
       --configure-only to write .env and viewpoint.config.ts now and deploy
       later.'
}

# ─── Prompts ────────────────────────────────────────────────────────────────
#
# All four helpers print their prompt to stderr and the answer to stdout, so
# `VALUE="$(ask_choice ...)"` captures only the value. In --defaults mode they
# return the default without reading stdin, which is what makes the script
# runnable in CI.

ask() {
  local prompt="$1" default="${2-}" answer=''
  if [[ "$NON_INTERACTIVE" == '1' ]]; then
    printf '%s\n' "$default"
    return 0
  fi
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$prompt" "$default" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi
  # `|| answer=''`: with `set -e`, a read that hits EOF (piped input exhausted)
  # would otherwise abort the installer half-way and leave a truncated .env.
  IFS= read -r answer || answer=''
  printf '%s\n' "${answer:-$default}"
}

ask_secret() {
  local prompt="$1" default="${2-}" answer=''
  if [[ "$NON_INTERACTIVE" == '1' ]]; then
    printf '%s\n' "$default"
    return 0
  fi
  # -s: no echo. A credential typed on a shared screen or captured by a terminal
  # recorder is a leaked credential.
  printf '%s (input hidden; Enter to leave empty): ' "$prompt" >&2
  IFS= read -r -s answer || answer=''
  printf '\n' >&2
  printf '%s\n' "${answer:-$default}"
}

# ask_choice <prompt> <default-value> <value|label>...
ask_choice() {
  local prompt="$1" default_value="$2"
  shift 2
  local options=("$@")
  local index=1 default_index=1 option answer

  printf '\n%s\n' "$prompt" >&2
  for option in "${options[@]}"; do
    if [[ "${option%%|*}" == "$default_value" ]]; then
      default_index="$index"
    fi
    printf '  %d) %-14s %s\n' "$index" "${option%%|*}" "${option#*|}" >&2
    index=$((index + 1))
  done

  if [[ "$NON_INTERACTIVE" == '1' ]]; then
    printf '%s\n' "$default_value"
    return 0
  fi

  printf 'Choice [%d]: ' "$default_index" >&2
  IFS= read -r answer || answer=''
  answer="${answer:-$default_index}"

  if [[ "$answer" =~ ^[0-9]+$ ]] && (( answer >= 1 && answer <= ${#options[@]} )); then
    option="${options[$((answer - 1))]}"
    printf '%s\n' "${option%%|*}"
    return 0
  fi
  # Typing the value instead of its number is the obvious thing to try.
  for option in "${options[@]}"; do
    if [[ "${option%%|*}" == "$answer" ]]; then
      printf '%s\n' "$answer"
      return 0
    fi
  done

  printf 'Unrecognised choice "%s" — using %s.\n' "$answer" "$default_value" >&2
  printf '%s\n' "$default_value"
}

ask_yes_no() {
  local prompt="$1" default="$2" answer=''
  if [[ "$NON_INTERACTIVE" == '1' ]]; then
    printf '%s\n' "$default"
    return 0
  fi
  printf '%s [y/N]: ' "$prompt" >&2
  IFS= read -r answer || answer=''
  case "${answer:-$default}" in
    y|Y|yes|YES|Yes) printf 'yes\n' ;;
    *)               printf 'no\n' ;;
  esac
}

# ─── Secret generation ──────────────────────────────────────────────────────

generate_secret() {
  # 32 bytes of CSPRNG output as 64 lowercase hex characters.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  if [[ -r /dev/urandom ]]; then
    # od's output is hex bytes separated by spaces and wrapped at 16 bytes;
    # tr collapses it to one 64-character line.
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
    printf '\n'
    return 0
  fi
  cat >&2 <<'NOENTROPY'

install.sh: no source of randomness on this machine (neither `openssl` nor a
readable /dev/urandom).

Refusing to continue rather than writing a placeholder. A predictable token
guarding capture-service — a service that accepts complete meeting recordings —
is worse than no token at all, because the deployment looks configured and the
value is guessable by anyone who has read this public script.

Install openssl (or any package providing /dev/urandom) and re-run.
NOENTROPY
  exit 1
}

# ─── Answers ────────────────────────────────────────────────────────────────
#
# Collected into globals. Bash has no structures, and threading nineteen values
# back through one function's stdout is worse than naming them.

A_HOSTNAME='' A_TLS=''
A_PLM='' A_PLM_BASE_URL=''
A_ONSHAPE_CLIENT_ID='' A_ONSHAPE_CLIENT_SECRET=''
A_TC_USERNAME='' A_TC_PASSWORD=''
A_CAPTURE='' A_CAPTURE_MODEL='' A_CAPTURE_API_KEY='' A_CAPTURE_API_KEY_NAME=''
A_CAPTURE_SERVICE_URL='' A_OLLAMA_MODEL='' A_WHISPER_MODEL='' A_OLLAMA_BROWSER_URL=''
A_DB='' A_SUPABASE_URL='' A_SUPABASE_ANON_KEY=''
A_TURN='' A_TURN_TOKEN_ID='' A_TURN_API_TOKEN='' A_COTURN_HOST='' A_COTURN_PORT=''
A_NOTIFY='' A_TEAMS_WEBHOOK=''
A_GPU='' A_N8N=''
S_CAPTURE_SECRET='' S_POSTGRES_PASSWORD='' S_N8N_KEY='' S_COTURN_SECRET=''

collect_answers() {
  say ''
  say 'Answer a few questions. Enter accepts the default in brackets.'

  A_HOSTNAME="$(ask 'Public hostname for this deployment' 'arena.local')"

  A_TLS="$(ask_choice \
    'How should TLS be terminated?' \
    'self-signed' \
    'self-signed|generate a certificate for this hostname now' \
    'own|I will mount my own certificate into deploy/certs')"

  # ── PLM ────────────────────────────────────────────────────────────────
  A_PLM="$(ask_choice \
    'Which PLM system should Viewpoint Arena connect to?' \
    'none' \
    'onshape|Onshape — OAuth2, cloud CAD (api/onshape/*)' \
    'teamcenter|Siemens Teamcenter — server-side login (api/teamcenter/*)' \
    'none|No PLM — upload .glb/.gltf manually (modelImport: genericGltf)')"

  case "$A_PLM" in
    onshape)
      A_PLM_BASE_URL="$(ask 'Onshape API base URL' 'https://cad.onshape.com')"
      A_ONSHAPE_CLIENT_ID="$(ask_secret 'ONSHAPE_CLIENT_ID')"
      A_ONSHAPE_CLIENT_SECRET="$(ask_secret 'ONSHAPE_CLIENT_SECRET')"
      ;;
    teamcenter)
      A_PLM_BASE_URL="$(ask 'Teamcenter REST base URL' 'https://teamcenter.internal')"
      A_TC_USERNAME="$(ask 'TC_USERNAME')"
      A_TC_PASSWORD="$(ask_secret 'TC_PASSWORD')"
      ;;
    *)
      A_PLM_BASE_URL=''
      ;;
  esac

  # ── Capture ────────────────────────────────────────────────────────────
  A_CAPTURE="$(ask_choice \
    'Which capture backend should generate insight cards?' \
    'mock' \
    'mock|Simulated insights — no AI, no infrastructure, the repo default' \
    'local|Self-hosted whisper + Ollama via the capture-service container' \
    'openai|OpenAI, proxied server-side by api/capture/extract.ts' \
    'anthropic|Anthropic, proxied server-side by api/capture/extract.ts' \
    'ollamaDirect|Browser talks straight to Ollama on your LAN — no proxy, no key')"

  case "$A_CAPTURE" in
    local)
      # The compose-internal name. It resolves on the `backend` network, which
      # is internal:true, so this URL is deliberately unreachable from outside.
      A_CAPTURE_SERVICE_URL="$(ask 'capture-service URL (as seen by the server)' 'http://capture-service:8080')"
      A_OLLAMA_MODEL="$(ask 'Ollama model to pull and extract with' 'qwen2.5:7b')"
      A_WHISPER_MODEL="$(ask 'Whisper model' 'base.en')"
      ;;
    openai)
      A_CAPTURE_MODEL="$(ask 'OpenAI model' 'gpt-4o-mini')"
      A_CAPTURE_API_KEY_NAME='OPENAI_API_KEY'
      A_CAPTURE_API_KEY="$(ask_secret 'OPENAI_API_KEY')"
      ;;
    anthropic)
      A_CAPTURE_MODEL="$(ask 'Anthropic model' 'claude-sonnet-4-5')"
      A_CAPTURE_API_KEY_NAME='ANTHROPIC_API_KEY'
      A_CAPTURE_API_KEY="$(ask_secret 'ANTHROPIC_API_KEY')"
      ;;
    ollamaDirect)
      # No default, on purpose — the same reason
      # lib/connectors/capture/ollamaDirect.ts refuses to default to localhost:
      # a guessed URL is how a design-review transcript ends up POSTed to
      # whatever is listening on somebody else's machine.
      A_OLLAMA_BROWSER_URL="$(ask 'Ollama base URL reachable FROM THE BROWSER (e.g. http://ollama.internal:11434)')"
      A_CAPTURE_MODEL="$(ask 'Ollama model' 'qwen2.5:7b')"
      say '  Note: this mode needs OLLAMA_ORIGINS set and the Ollama port published'
      say '  on a real interface — see the ollama service in docker-compose.yml.'
      ;;
    *) ;;
  esac

  # ── Database ───────────────────────────────────────────────────────────
  A_DB="$(ask_choice \
    'Where should the review tracker database live?' \
    'self-hosted' \
    'cloud|Hosted Supabase project — paste its URL and anon key' \
    'self-hosted|The postgres container in this compose stack')"

  if [[ "$A_DB" == 'cloud' ]]; then
    A_SUPABASE_URL="$(ask 'VITE_SUPABASE_URL (https://your-project.supabase.co)')"
    A_SUPABASE_ANON_KEY="$(ask_secret 'VITE_SUPABASE_ANON_KEY (client-safe by design; RLS enforces access)')"
  else
    # Left empty and marked TODO in .env, because this stack ships plain
    # postgres:16 and supabase-js needs a PostgREST/GoTrue gateway in front of
    # Postgres. See the KNOWN GAP block at the top of docker-compose.yml.
    # Inventing a plausible URL here would produce a config that looks complete
    # and cannot connect — worse than an honest blank.
    A_SUPABASE_URL=''
    A_SUPABASE_ANON_KEY=''
  fi

  # ── TURN ───────────────────────────────────────────────────────────────
  A_TURN="$(ask_choice \
    'Which WebRTC TURN relay should the app use?' \
    'cloudflare' \
    'cloudflare|Cloudflare Realtime TURN — metered, no extra container' \
    'selfHostedCoturn|Your own coturn — read the caveat this prints')"

  case "$A_TURN" in
    cloudflare)
      A_TURN_TOKEN_ID="$(ask 'CF_TURN_TOKEN_ID')"
      A_TURN_API_TOKEN="$(ask_secret 'CF_TURN_API_TOKEN')"
      ;;
    *)
      A_COTURN_HOST="$(ask 'coturn host' "$A_HOSTNAME")"
      A_COTURN_PORT="$(ask 'coturn port' '3478')"
      say '  Caveat: lib/connectors/turn/selfHostedCoturn.ts is still a stub and'
      say '  docker-compose.yml has no coturn service. This writes a valid config'
      say '  and generates the secret, but /api/health reports turn degraded until'
      say '  that adapter is implemented. To use a coturn you run yourself TODAY,'
      say '  set TURN_URL / TURN_USERNAME / TURN_CREDENTIAL instead — see the'
      say '  static override in api/turn-credentials.ts.'
      ;;
  esac

  # ── Notifications ──────────────────────────────────────────────────────
  A_NOTIFY="$(ask_choice \
    'Which notification sinks should be enabled?' \
    'none' \
    'teams|Microsoft Teams incoming webhook (api/notify/teams.ts)' \
    'none|None')"

  if [[ "$A_NOTIFY" == 'teams' ]]; then
    A_TEAMS_WEBHOOK="$(ask_secret 'TEAMS_WEBHOOK_URL (a bearer credential — whoever holds it can post)')"
  fi

  # ── Compute ────────────────────────────────────────────────────────────
  if [[ -n "$FORCE_GPU" ]]; then
    A_GPU="$FORCE_GPU"
  else
    A_GPU="$(ask_yes_no 'Enable the GPU compose override (NVIDIA Container Toolkit required)?' 'no')"
  fi
  A_N8N="$(ask_yes_no 'Enable the optional n8n workflow container (T4.8)?' 'no')"

  # Generated fresh on EVERY run. Never a default, and never carried over from
  # an existing .env: re-running the installer rotates them, and a rotated
  # secret that stops working is a visible, fixable problem — a stale one nobody
  # rotated is not.
  S_CAPTURE_SECRET="$(generate_secret)"
  S_POSTGRES_PASSWORD="$(generate_secret)"
  S_N8N_KEY="$(generate_secret)"
  if [[ "$A_TURN" == 'selfHostedCoturn' ]]; then
    S_COTURN_SECRET="$(generate_secret)"
  fi
}

# Refuse to write a config that lib/config/schema.ts would reject. An installer
# that produces an invalid master config is worse than one that fails loudly:
# the app starts, /api/public-config 500s, and the UI silently falls back to its
# default providers. This function is the reason that cannot happen.
validate_answers() {
  [[ -n "$A_HOSTNAME" ]] || die 'a public hostname is required'

  case "$A_PLM" in
    onshape|teamcenter)
      [[ -n "$A_PLM_BASE_URL" ]] || die "plm '$A_PLM' needs a base URL"
      case "$A_PLM_BASE_URL" in
        http://*|https://*) ;;
        *) die "plm.baseUrl must be an absolute http(s) URL — got '$A_PLM_BASE_URL'" ;;
      esac
      ;;
  esac

  case "$A_CAPTURE" in
    openai|anthropic)
      [[ -n "$A_CAPTURE_MODEL" ]] || die "capture '$A_CAPTURE' needs a model name (capture.model is required by the schema)"
      [[ -n "$A_CAPTURE_API_KEY_NAME" ]] || die "capture '$A_CAPTURE' has no api key variable name"
      ;;
    local)
      [[ -n "$A_CAPTURE_SERVICE_URL" ]] || die "capture 'local' needs capture.serviceUrl"
      [[ -n "$A_OLLAMA_MODEL" ]] || die "capture 'local' needs an Ollama model name"
      case "$A_CAPTURE_SERVICE_URL" in
        http://*|https://*) ;;
        *) die "capture.serviceUrl must be an absolute http(s) URL — got '$A_CAPTURE_SERVICE_URL'" ;;
      esac
      ;;
    ollamaDirect)
      [[ -n "$A_OLLAMA_BROWSER_URL" ]] || die "capture 'ollamaDirect' needs capture.baseUrl — the Ollama root URL, reachable from the browser"
      [[ -n "$A_CAPTURE_MODEL" ]] || die "capture 'ollamaDirect' needs capture.model"
      case "$A_OLLAMA_BROWSER_URL" in
        http://*|https://*) ;;
        *) die "capture.baseUrl must be an absolute http(s) URL — got '$A_OLLAMA_BROWSER_URL'" ;;
      esac
      ;;
  esac

  if [[ "$A_TURN" == 'selfHostedCoturn' ]]; then
    [[ -n "$A_COTURN_HOST" ]] || die "turn 'selfHostedCoturn' needs turn.host"
    [[ "$A_COTURN_PORT" =~ ^[0-9]+$ ]] || die "turn.port must be a whole number — got '$A_COTURN_PORT'"
    (( A_COTURN_PORT >= 1 && A_COTURN_PORT <= 65535 )) || die "turn.port must be 1-65535 — got '$A_COTURN_PORT'"
  fi

  if [[ "$A_DB" == 'cloud' ]]; then
    case "$A_SUPABASE_URL" in
      http://*|https://*) ;;
      *) die "VITE_SUPABASE_URL must be an absolute http(s) URL — got '$A_SUPABASE_URL'" ;;
    esac
  fi

  # An empty secret is allowed (it becomes a TODO), but a whitespace-only one is
  # a paste accident and would be written into .env verbatim.
  local name value
  for name in A_ONSHAPE_CLIENT_ID A_ONSHAPE_CLIENT_SECRET A_TC_PASSWORD \
              A_CAPTURE_API_KEY A_TEAMS_WEBHOOK A_SUPABASE_ANON_KEY \
              A_TURN_API_TOKEN; do
    value="${!name}"
    if [[ -n "$value" && -z "${value//[[:space:]]/}" ]]; then
      die "the value given for ${name#A_} was whitespace only — re-run and paste the real one"
    fi
  done
}

# ─── Existing-file handling ─────────────────────────────────────────────────

backup_file() {
  local path="$1" stamp backup
  stamp="$(date +%Y%m%d-%H%M%S)"
  backup="${path}.backup.${stamp}"
  cp -p -- "$path" "$backup"
  note "backed up $(basename -- "$path") -> $(basename -- "$backup")"
}

# Decide what to do about an existing target. Prints 'write' or 'skip'.
prepare_target() {
  local path="$1" label="$2" answer=''

  if [[ ! -e "$path" ]]; then
    printf 'write\n'
    return 0
  fi

  # Non-interactive, or -y: back up and write. NEVER overwrite in place —
  # requirement 4 is that the installer is re-runnable without destroying what
  # an operator hand-edited since the last run.
  if [[ "$NON_INTERACTIVE" == '1' || "$ASSUME_YES" == '1' ]]; then
    note "$label already exists — backing it up before writing a new one"
    backup_file "$path"
    printf 'write\n'
    return 0
  fi

  say ''
  say "$label already exists:"
  note "$path"
  say '  1) back it up and write a new one'
  say '  2) keep the existing file (skip)'
  say '  3) abort'
  printf 'Choice [1]: ' >&2
  IFS= read -r answer || answer=''
  case "${answer:-1}" in
    1) backup_file "$path"; printf 'write\n' ;;
    2) printf 'skip\n' ;;
    3) die "aborted at your request; $label was left untouched" ;;
    *) backup_file "$path"; printf 'write\n' ;;
  esac
}

# ─── Step 3a: viewpoint.config.ts ───────────────────────────────────────────

# Emits the config on stdout. Kept separate from the file write so the rendered
# output can be inspected (and tested) without touching the filesystem.
render_config() {
  local plm_block capture_block turn_block notifications_block model_import generated

  generated="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  case "$A_PLM" in
    onshape)
      plm_block="  plm: {
    provider: 'onshape',
    baseUrl: '${A_PLM_BASE_URL}',
    clientIdEnv: 'ONSHAPE_CLIENT_ID',
    clientSecretEnv: 'ONSHAPE_CLIENT_SECRET',
  },"
      ;;
    teamcenter)
      plm_block="  plm: {
    provider: 'teamcenter',
    baseUrl: '${A_PLM_BASE_URL}',
    usernameEnv: 'TC_USERNAME',
    passwordEnv: 'TC_PASSWORD',
  },"
      ;;
    *)
      # No *Env fields: there is nothing to authenticate. /api/health omits this
      # connector entirely rather than reporting it as failing.
      plm_block="  plm: { provider: 'none' },"
      ;;
  esac

  case "$A_CAPTURE" in
    mock)         capture_block="  capture: { provider: 'mock' }," ;;
    local)        capture_block="  capture: {
    provider: 'local',
    serviceUrl: '${A_CAPTURE_SERVICE_URL}',
  }," ;;
    openai|anthropic)
      capture_block="  capture: {
    provider: '${A_CAPTURE}',
    model: '${A_CAPTURE_MODEL}',
    apiKeyEnv: '${A_CAPTURE_API_KEY_NAME}',
  }," ;;
    ollamaDirect) capture_block="  capture: {
    provider: 'ollamaDirect',
    baseUrl: '${A_OLLAMA_BROWSER_URL}',
    model: '${A_CAPTURE_MODEL}',
  }," ;;
    *)            die "internal error: unhandled capture provider '$A_CAPTURE'" ;;
  esac

  case "$A_TURN" in
    selfHostedCoturn)
      turn_block="  turn: {
    provider: 'selfHostedCoturn',
    host: '${A_COTURN_HOST}',
    port: ${A_COTURN_PORT},
    sharedSecretEnv: 'COTURN_SHARED_SECRET',
  },"
      ;;
    *)
      turn_block="  turn: {
    provider: 'cloudflare',
    tokenIdEnv: 'CF_TURN_TOKEN_ID',
    apiTokenEnv: 'CF_TURN_API_TOKEN',
  },"
      ;;
  esac

  if [[ "$A_NOTIFY" == 'teams' ]]; then
    notifications_block="  notifications: [{ provider: 'teams', webhookUrlEnv: 'TEAMS_WEBHOOK_URL' }],"
  else
    # An empty list means "no sinks enabled". /api/health omits the category
    # rather than reporting a disabled connector as failing.
    notifications_block="  notifications: [],"
  fi

  # Derived, not prompted: the model-import provider follows from the PLM. An
  # Onshape deployment imports through the Onshape translation pipeline; every
  # other answer means there is no PLM to import from, so the app offers a file
  # picker. Prompting for it separately would let the two disagree, and
  # modelImport 'onshape' next to plm 'none' validates against the schema but
  # cannot possibly work.
  if [[ "$A_PLM" == 'onshape' ]]; then
    model_import="  modelImport: { provider: 'onshape' },"
  else
    model_import="  modelImport: { provider: 'genericGltf' },"
  fi

  cat <<CONFIG
// viewpoint.config.ts — the master config for this deployment.
//
// GENERATED BY install.sh on ${generated}. Re-run the installer to regenerate it
// (an existing file is backed up, never overwritten in place), or edit it
// directly: it is read at runtime by lib/config/loadConfig.ts, it is git-ignored,
// and nothing else depends on how it was produced.
//
// This file says WHICH provider each connector uses and NAMES the environment
// variable holding each credential. The VALUES live in .env beside it. It must
// never contain a secret — it is TypeScript, and a secret pasted here is one
// careless commit away from being public.
//
// lib/config/schema.ts validates this on every load. The schema rejects a
// VITE_-prefixed name on every field except db.urlEnv and db.anonKeyEnv, because
// Vite inlines VITE_* into the client bundle.

import { defineConfig } from './lib/config/schema.ts';

export default defineConfig({
${plm_block}
${capture_block}
${turn_block}
  db: {
    provider: 'supabase',
    // The one documented exception to the no-VITE_ rule: the browser reads both
    // of these, and the anon key is client-safe by design with access control
    // enforced by Postgres Row Level Security.
    urlEnv: 'VITE_SUPABASE_URL',
    anonKeyEnv: 'VITE_SUPABASE_ANON_KEY',
  },
${notifications_block}
${model_import}
});
CONFIG
}

write_config() {
  local path="${TARGET_DIR}/viewpoint.config.ts" decision
  decision="$(prepare_target "$path" 'viewpoint.config.ts')"
  if [[ "$decision" == 'skip' ]]; then
    CONFIG_WRITTEN=0
    note 'keeping the existing viewpoint.config.ts'
    return 0
  fi

  local tmp
  tmp="$(mktemp "${path}.XXXXXX")"
  if ! render_config > "$tmp"; then
    rm -f -- "$tmp"
    die 'failed to render viewpoint.config.ts'
  fi
  mv -f -- "$tmp" "$path"
  CONFIG_WRITTEN=1
  note "wrote ${path}"
}

# ─── Step 3b: .env ──────────────────────────────────────────────────────────

# A value the operator still owes us: written empty and marked. The marker is
# load-bearing, not decoration — the installer's own test asserts that EVERY
# empty value in the generated .env carries one, so a blank can never be
# unexplained, and nothing the installer could have generated is ever left out.
todo_var() {
  local name="$1" why="$2"
  printf '# TODO(operator): %s\n%s=\n' "$why" "$name"
  if [[ -n "$PENDING_FILE" ]]; then
    printf '%s\n' "$name" >> "$PENDING_FILE"
  fi
}

render_env() {
  local generated
  generated="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  cat <<HEADER
# ─────────────────────────────────────────────────────────────────────────────
# Viewpoint Arena — deployment environment
# GENERATED BY install.sh on ${generated}
# ─────────────────────────────────────────────────────────────────────────────
#
# The VALUES. WHICH connector each one belongs to is decided by
# viewpoint.config.ts beside this file: that file holds the NAMES, this one
# holds the secrets, and lib/config/loadConfig.ts fails at start-up naming any
# variable the config references that has no value here.
#
# This file is git-ignored and written 0600. Do not commit it, do not paste it
# into an issue, and do not copy it between deployments — every secret in
# section 1 was generated for THIS one.
#
# Anything still empty is marked TODO(operator) and listed when the installer
# finishes. Re-run ./install.sh to regenerate (the old file is backed up first).
#
# THE VITE_ PREFIX RULE: a VITE_-prefixed variable is inlined into the browser
# bundle at build time and shipped to every visitor. Only client-safe values may
# use it — scripts/check-public-env.mjs fails the build on anything else.
# Changing one means rebuilding the app image, not just restarting it.
HEADER

  cat <<SECRETS

# ── 1. Generated secrets ─────────────────────────────────────────────────────
# Random, unique to this install, and required. Do not replace any of them with
# a value copied from a tutorial, a README or another deployment.

# Guards capture-service on EVERY route, /health included. That service accepts
# complete meeting recordings and has no other authentication of its own.
# docker-compose.yml gives it no published port at all; this is the control that
# still holds if somebody adds one. capture-service/capture_service/auth.py
# explains the pairing, and lib/health/probes.ts sends it.
CAPTURE_SHARED_SECRET=${S_CAPTURE_SECRET}

# The postgres container's password. postgres publishes no port either.
POSTGRES_PASSWORD=${S_POSTGRES_PASSWORD}

# Encrypts n8n's own stored credentials. Only used with --profile n8n; losing it
# makes every credential n8n already holds unreadable.
N8N_ENCRYPTION_KEY=${S_N8N_KEY}
SECRETS

  env_comment ''
  env_comment '# ── 2. Deployment settings (interpolated by docker-compose.yml) ──────────────'
  printf 'PUBLIC_HOSTNAME=%s\n' "$A_HOSTNAME"
  # PartyKit over TLS. partysocket chooses wss:// because the page is https, and
  # a page served over TLS cannot open ws:// to a published 1999 — that is why
  # nginx-proxy terminates the socket on 8443 (deploy/nginx/proxy.conf).
  printf 'VITE_PARTYKIT_HOST=%s:%s\n' "$A_HOSTNAME" "${WSS_PORT:-8443}"
  printf 'HTTP_PORT=%s\n' "${HTTP_PORT:-80}"
  printf 'HTTPS_PORT=%s\n' "${HTTPS_PORT:-443}"
  printf 'WSS_PORT=%s\n' "${WSS_PORT:-8443}"
  printf 'POSTGRES_DB=%s\n' "${POSTGRES_DB:-viewpoint}"
  printf 'POSTGRES_USER=%s\n' "${POSTGRES_USER:-viewpoint}"

  env_comment ''
  env_comment '# ── 3. PLM ─────────────────────────────────────────────────────────────────'
  case "$A_PLM" in
    onshape)
      if [[ -n "$A_ONSHAPE_CLIENT_ID" ]]; then
        printf 'ONSHAPE_CLIENT_ID=%s\n' "$A_ONSHAPE_CLIENT_ID"
      else
        todo_var 'ONSHAPE_CLIENT_ID' 'Onshape OAuth client id (plm.clientIdEnv). Create one at https://dev-portal.onshape.com/'
      fi
      if [[ -n "$A_ONSHAPE_CLIENT_SECRET" ]]; then
        printf 'ONSHAPE_CLIENT_SECRET=%s\n' "$A_ONSHAPE_CLIENT_SECRET"
      else
        todo_var 'ONSHAPE_CLIENT_SECRET' 'Onshape OAuth client secret (plm.clientSecretEnv). Server-side only.'
      fi
      ;;
    teamcenter)
      if [[ -n "$A_TC_USERNAME" ]]; then
        printf 'TC_USERNAME=%s\n' "$A_TC_USERNAME"
      else
        todo_var 'TC_USERNAME' 'Teamcenter service account (plm.usernameEnv)'
      fi
      if [[ -n "$A_TC_PASSWORD" ]]; then
        printf 'TC_PASSWORD=%s\n' "$A_TC_PASSWORD"
      else
        todo_var 'TC_PASSWORD' 'Teamcenter service password (plm.passwordEnv). Server-side only — it never reaches a browser.'
      fi
      ;;
    *)
      env_comment '# plm.provider is "none": no PLM credentials, and modelImport is'
      env_comment '# genericGltf (a file picker). Nothing to set in this section.'
      ;;
  esac

  env_comment ''
  env_comment '# ── 4. AI capture ──────────────────────────────────────────────────────────'
  case "$A_CAPTURE" in
    mock)
      env_comment '# capture.provider is "mock": insights are simulated from the scene tree.'
      env_comment '# No model, no key, no network. This is the repo default and needs nothing.'
      ;;
    local)
      printf 'CAPTURE_OLLAMA_BASE_URL=%s\n' "${CAPTURE_OLLAMA_BASE_URL:-http://ollama:11434}"
      printf 'CAPTURE_OLLAMA_MODEL=%s\n' "$A_OLLAMA_MODEL"
      printf 'CAPTURE_WHISPER_MODEL=%s\n' "$A_WHISPER_MODEL"
      if [[ "$A_GPU" == 'yes' ]]; then
        printf 'CAPTURE_WHISPER_DEVICE=cuda\n'
        printf 'CAPTURE_WHISPER_COMPUTE_TYPE=float16\n'
      else
        printf 'CAPTURE_WHISPER_DEVICE=cpu\n'
        printf 'CAPTURE_WHISPER_COMPUTE_TYPE=int8\n'
      fi
      env_comment '# CAPTURE_SHARED_SECRET in section 1 is the token the app sends. The URL'
      env_comment '# above is the compose-internal name on the internal:true backend network,'
      env_comment '# so it deliberately does not resolve from outside the stack.'
      ;;
    openai|anthropic)
      if [[ -n "$A_CAPTURE_API_KEY" ]]; then
        printf '%s=%s\n' "$A_CAPTURE_API_KEY_NAME" "$A_CAPTURE_API_KEY"
      else
        todo_var "$A_CAPTURE_API_KEY_NAME" "capture.apiKeyEnv for the ${A_CAPTURE} provider. Read server-side by api/capture/extract.ts and never sent to a browser."
      fi
      ;;
    ollamaDirect)
      env_comment '# capture.provider is "ollamaDirect": the BROWSER calls Ollama directly, so'
      env_comment '# there is no key and no proxy — and Ollama must be reachable from every'
      env_comment '# client machine, with CORS allowed and no mixed-content problem.'
      printf 'OLLAMA_ORIGINS=https://%s\n' "$A_HOSTNAME"
      printf 'CAPTURE_OLLAMA_MODEL=%s\n' "$A_CAPTURE_MODEL"
      env_comment '# docker-compose.yml publishes Ollama on 127.0.0.1 only. For this mode you'
      env_comment '# must change that mapping to a real interface, accepting that Ollama has no'
      env_comment '# authentication of its own — read the ollama service comment there first.'
      ;;
  esac

  env_comment ''
  env_comment '# ── 5. Database ────────────────────────────────────────────────────────────'
  if [[ -n "$A_SUPABASE_URL" ]]; then
    printf 'VITE_SUPABASE_URL=%s\n' "$A_SUPABASE_URL"
  else
    todo_var 'VITE_SUPABASE_URL' 'Supabase-compatible project URL (db.urlEnv). This stack ships plain postgres:16, which supabase-js cannot talk to directly — read the KNOWN GAP block in docker-compose.yml.'
  fi
  if [[ -n "$A_SUPABASE_ANON_KEY" ]]; then
    printf 'VITE_SUPABASE_ANON_KEY=%s\n' "$A_SUPABASE_ANON_KEY"
  else
    todo_var 'VITE_SUPABASE_ANON_KEY' 'Supabase anon key (db.anonKeyEnv). Client-safe by design; Row Level Security enforces access.'
  fi
  env_comment '# Both are VITE_-prefixed because the browser reads them. That is the one'
  env_comment '# approved exception to the prefix rule, and it is why the anon key is not a'
  env_comment '# secret: RLS is the access control, not key secrecy.'

  env_comment ''
  env_comment '# ── 6. TURN relay ──────────────────────────────────────────────────────────'
  if [[ "$A_TURN" == 'selfHostedCoturn' ]]; then
    printf 'COTURN_SHARED_SECRET=%s\n' "$S_COTURN_SECRET"
    env_comment '# turn.provider is "selfHostedCoturn". NOTE: that adapter is still a stub'
    env_comment '# (lib/connectors/turn/selfHostedCoturn.ts) and this compose file has no'
    env_comment '# coturn service, so /api/health reports turn degraded until both exist.'
    env_comment '# To use a coturn you run yourself TODAY, set these three instead and'
    env_comment "# api/turn-credentials.ts's static override will serve them:"
    env_comment '#   TURN_URL=turn:your-host:3478'
    env_comment '#   TURN_USERNAME=...'
    env_comment '#   TURN_CREDENTIAL=...'
  else
    if [[ -n "$A_TURN_TOKEN_ID" ]]; then
      printf 'CF_TURN_TOKEN_ID=%s\n' "$A_TURN_TOKEN_ID"
    else
      todo_var 'CF_TURN_TOKEN_ID' 'Cloudflare Realtime TURN application token id (turn.tokenIdEnv)'
    fi
    if [[ -n "$A_TURN_API_TOKEN" ]]; then
      printf 'CF_TURN_API_TOKEN=%s\n' "$A_TURN_API_TOKEN"
    else
      todo_var 'CF_TURN_API_TOKEN' 'Cloudflare Realtime TURN API token (turn.apiTokenEnv)'
    fi
  fi

  env_comment ''
  env_comment '# ── 7. Notifications ───────────────────────────────────────────────────────'
  if [[ "$A_NOTIFY" == 'teams' ]]; then
    if [[ -n "$A_TEAMS_WEBHOOK" ]]; then
      printf 'TEAMS_WEBHOOK_URL=%s\n' "$A_TEAMS_WEBHOOK"
    else
      todo_var 'TEAMS_WEBHOOK_URL' 'Teams incoming webhook URL (notifications[0].webhookUrlEnv). A bearer credential: whoever holds it can post to that channel.'
    fi
  else
    env_comment '# notifications is empty: no sinks enabled. Sessions stay in the app.'
  fi

  cat <<'FOOTER'

# ── 8. Optional ──────────────────────────────────────────────────────────────
# Uncomment to override; docker-compose.yml documents every one of these.
#
# Image tags — pin these before a production deploy. `latest` is a moving
# target, and a stack that builds on Monday can fail to pull on Tuesday.
#NGINX_IMAGE_TAG=alpine
#POSTGRES_IMAGE_TAG=16-alpine
#OLLAMA_IMAGE_TAG=latest
#N8N_IMAGE_TAG=latest
#
# Resource ceilings, so a runaway model cannot take the host down
# (docs/local-capture-plan.md §"Open questions").
#CAPTURE_CPUS=4
#CAPTURE_MEMORY=6g
#WHISPER_CPUS=4
#WHISPER_MEMORY=6g
#OLLAMA_MEMORY=10g
#
# Publishing PartyKit or n8n on a real interface. Both default to loopback and
# neither authenticates at the protocol level — read the comment on the service
# in docker-compose.yml before changing either.
#PARTYKIT_BIND=0.0.0.0
#N8N_BIND=0.0.0.0
FOOTER
}

write_env() {
  local path="${TARGET_DIR}/.env" decision tmp

  decision="$(prepare_target "$path" '.env')"
  if [[ "$decision" == 'skip' ]]; then
    ENV_WRITTEN=0
    note 'keeping the existing .env'
    return 0
  fi

  # Rendered to a temp file in the SAME directory and moved into place, so a
  # failure half-way through cannot leave a truncated .env behind. Same
  # directory because mv across filesystems is a copy, which would create the
  # file with the default umask before it could be tightened.
  tmp="$(mktemp "${path}.XXXXXX")"
  # 0600 BEFORE writing, not after: this file holds the capture-service shared
  # secret and the database password, and the gap between create and chmod is a
  # window on a shared host.
  chmod 600 "$tmp"

  PENDING_FILE="$(mktemp)"
  if ! render_env > "$tmp"; then
    rm -f -- "$tmp" "$PENDING_FILE"
    die 'failed to render .env'
  fi

  PENDING_VARS=()
  local name
  while IFS= read -r name; do
    [[ -n "$name" ]] && PENDING_VARS+=("$name")
  done < "$PENDING_FILE"
  rm -f -- "$PENDING_FILE"
  PENDING_FILE=''

  mv -f -- "$tmp" "$path"
  chmod 600 "$path"

  ENV_WRITTEN=1
  note "wrote ${path} (mode 0600)"
}

# ─── Steps 5-8: bring the stack up and prove it is ready ───────────────────

compose_files() {
  COMPOSE_ARGS=(-f "${TARGET_DIR}/docker-compose.yml")
  if [[ "$A_GPU" == 'yes' ]]; then
    COMPOSE_ARGS+=(-f "${TARGET_DIR}/docker-compose.gpu.yml")
  fi
  if [[ "$A_CAPTURE" == 'local' || "$A_CAPTURE" == 'ollamaDirect' ]]; then
    PROFILES+=(capture-local)
  fi
  if [[ "$A_N8N" == 'yes' ]]; then
    PROFILES+=(n8n)
  fi
}

profile_args() {
  PROFILE_ARGS=()
  if [[ "${#PROFILES[@]}" -gt 0 ]]; then
    local profile
    for profile in "${PROFILES[@]}"; do
      PROFILE_ARGS+=(--profile "$profile")
    done
  fi
}
PROFILE_ARGS=()

generate_certs() {
  local dir="${TARGET_DIR}/deploy/certs" crt="${TARGET_DIR}/deploy/certs/tls.crt" key="${TARGET_DIR}/deploy/certs/tls.key"

  if [[ -f "$crt" && -f "$key" ]]; then
    note 'deploy/certs already holds a certificate — leaving it alone'
    return 0
  fi

  if [[ "$A_TLS" == 'own' ]]; then
    die 'you chose to supply your own certificate, but deploy/certs/tls.crt or
       tls.key is missing. Put them there (the directory is git-ignored) and
       re-run.'
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    say 'warning: openssl not found; cannot generate a self-signed certificate.'
    say '         nginx-proxy will not start until these exist:'
    say "           mkdir -p deploy/certs && openssl req -x509 -newkey rsa:4096 \\"
    say "             -nodes -days 365 -keyout deploy/certs/tls.key \\"
    say "             -out deploy/certs/tls.crt -subj \"/CN=${A_HOSTNAME}\" \\"
    say "             -addext \"subjectAltName=DNS:${A_HOSTNAME}\""
    return 0
  fi

  mkdir -p "$dir"
  chmod 700 "$dir"
  note "generating a self-signed certificate for ${A_HOSTNAME}"
  # -addext subjectAltName is not optional in practice: browsers have ignored CN
  # since 2017, so without a SAN the certificate is rejected even after the
  # operator clicks through the self-signed warning.
  openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
    -keyout "$key" -out "$crt" \
    -subj "/CN=${A_HOSTNAME}" \
    -addext "subjectAltName=DNS:${A_HOSTNAME}" >/dev/null 2>&1
  chmod 600 "$key"
  chmod 644 "$crt"
}

compose_up() {
  profile_args
  say ''
  say "Bringing the stack up: ${COMPOSE[*]} ${PROFILE_ARGS[*]+"${PROFILE_ARGS[*]}"} up -d --build"
  say '(the first build runs npm ci and pip install; give it several minutes)'
  ( cd -- "$TARGET_DIR" && "${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" \
      ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} up -d --build )
}

pull_model() {
  [[ "$A_CAPTURE" == 'local' ]] || return 0
  say ''
  say "Pulling ${A_OLLAMA_MODEL} into the Ollama container"
  say '(gigabytes; this is the slowest step in the install)'
  # Runs INSIDE the container. The published port is loopback-only by default, so
  # a host `ollama` client cannot reach it — and pulling on the host would fill
  # the wrong cache anyway, because the models live in the ollama-models volume.
  if ! ( cd -- "$TARGET_DIR" && "${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" \
           ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} exec -T ollama \
           ollama pull "$A_OLLAMA_MODEL" ); then
    say "warning: pulling ${A_OLLAMA_MODEL} failed. Re-run it with:"
    say "  docker compose --profile capture-local exec ollama ollama pull ${A_OLLAMA_MODEL}"
    say 'capture-service answers capture_model_not_found until it succeeds.'
  fi
}

apply_schema() {
  local schema="${TARGET_DIR}/docs/supabase-schema.sql"
  [[ -f "$schema" ]] || return 0

  say ''
  say 'Applying docs/supabase-schema.sql to the postgres container'
  # ON_ERROR_STOP=0, deliberately. The schema ends with a DO block that adds
  # review_curations to the `supabase_realtime` publication and catches only
  # `duplicate_object`. On plain postgres:16 that publication does not exist, so
  # the statement raises `undefined_object` — and with ON_ERROR_STOP=1 the whole
  # load would abort on its last line, leaving an operator convinced the schema
  # is broken. It is not; that one statement is Supabase-only. docker-compose.yml
  # explains why this is not done through /docker-entrypoint-initdb.d instead.
  if ! ( cd -- "$TARGET_DIR" && "${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" \
           exec -T postgres psql -v ON_ERROR_STOP=0 \
             -U "${POSTGRES_USER:-viewpoint}" -d "${POSTGRES_DB:-viewpoint}" ) \
         < "$schema"; then
    say 'warning: the schema load reported errors. Inspect with:'
    say '  docker compose exec postgres psql -U viewpoint -d viewpoint -c "\dt"'
  fi
}

poll_health() {
  local url="https://${A_HOSTNAME}/api/health"
  local attempts=30 attempt=1 raw='' body='' status=''

  if ! command -v curl >/dev/null 2>&1; then
    say ''
    say "warning: curl not found; cannot poll ${url}."
    say '         Check it yourself once the stack is up.'
    return 0
  fi

  say ''
  say "Polling ${url} until the enabled connectors report ok"
  say '(docs/plan/06-deployment-and-installation.md §2 step 8: containers starting'
  say ' is not the same as the config resolving, so this does not take their word'
  say ' for it.)'

  while (( attempt <= attempts )); do
    # One request, status appended. -k because the default certificate is
    # self-signed; --max-time so a hung proxy cannot eat the whole retry budget.
    raw="$(curl -sS -k --max-time 10 -w $'\n%{http_code}' "$url" 2>/dev/null || printf '\n000')"
    status="${raw##*$'\n'}"
    body="${raw%$'\n'*}"

    if [[ "$status" == '200' ]]; then
      note "ready after ${attempt} attempt(s)"
      printf '%s\n' "$body" >&2
      return 0
    fi

    if [[ "$status" == '503' && "$body" == *'"connectors"'* ]]; then
      # The endpoint answered with a COMPLETE report and something in it is
      # degraded. That is a result, not a "not up yet", so stop retrying.
      say ''
      say 'The stack is up, but at least one enabled connector reports degraded:'
      printf '%s\n' "$body" >&2
      say ''
      say 'Fill in the values marked TODO(operator) in .env, then re-check with:'
      say "  curl -sk ${url}"
      return 3
    fi

    printf '  attempt %d/%d: HTTP %s\n' "$attempt" "$attempts" "$status" >&2
    attempt=$((attempt + 1))
    sleep 5
  done

  say ''
  say "warning: ${url} did not answer after ${attempts} attempts."
  say '         The containers may still be starting — a first Ollama pull and a'
  say '         first Whisper model download both take minutes. Check with:'
  say '           docker compose ps'
  say '           docker compose logs app nginx-proxy'
  return 0
}

print_summary() {
  local model_import='genericGltf'
  [[ "$A_PLM" == 'onshape' ]] && model_import='onshape'

  say ''
  say '──────────────────────────────────────────────────────────────────'
  say ' What was written'
  say '──────────────────────────────────────────────────────────────────'
  if [[ "$CONFIG_WRITTEN" == '1' ]]; then
    note "${TARGET_DIR}/viewpoint.config.ts"
  else
    note "${TARGET_DIR}/viewpoint.config.ts  (kept the existing file)"
  fi
  if [[ "$ENV_WRITTEN" == '1' ]]; then
    note "${TARGET_DIR}/.env  (mode 0600)"
  else
    note "${TARGET_DIR}/.env  (kept the existing file)"
  fi

  say ''
  say "  plm              ${A_PLM}"
  say "  modelImport      ${model_import}"
  say "  capture          ${A_CAPTURE}"
  say "  db               supabase (${A_DB})"
  say "  turn             ${A_TURN}"
  say "  notifications    ${A_NOTIFY}"
  say "  gpu override     ${A_GPU}"
  say "  n8n profile      ${A_N8N}"

  if [[ "${#PENDING_VARS[@]}" -gt 0 ]]; then
    say ''
    say '──────────────────────────────────────────────────────────────────'
    say ' STILL REQUIRED — empty in .env, each marked TODO(operator)'
    say '──────────────────────────────────────────────────────────────────'
    local name
    for name in "${PENDING_VARS[@]}"; do
      note "$name"
    done
    say ''
    say '  Nothing the installer could generate was left blank: every value above'
    say '  is a credential only you can supply. Until they are filled in,'
    say '  lib/config/loadConfig.ts throws naming the missing variable and'
    say '  /api/health reports that connector as degraded.'
  fi

  say ''
  say '──────────────────────────────────────────────────────────────────'
  say ' URLs'
  say '──────────────────────────────────────────────────────────────────'
  note "app             https://${A_HOSTNAME}/"
  note "partykit (wss)  wss://${A_HOSTNAME}:${WSS_PORT:-8443}/<room>"
  note "health          https://${A_HOSTNAME}/api/health"
  if [[ "$A_N8N" == 'yes' ]]; then
    note "n8n             http://127.0.0.1:${N8N_PORT:-5678}/  (loopback only)"
  fi
  say ''
  say '  capture-service is deliberately NOT in that list. It accepts meeting'
  say '  recordings and publishes no host port. Reach it with:'
  say '    docker compose exec capture-service curl -sS \'
  say '      -H "X-Capture-Token: $CAPTURE_SHARED_SECRET" http://127.0.0.1:8080/health'
  say ''
  say "  Next: point DNS (or your hosts file) at this box for ${A_HOSTNAME},"
  say '  then open the app. A self-signed certificate means one browser warning.'
  say '──────────────────────────────────────────────────────────────────'
}

# ─── main ───────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"
  banner
  detect_os
  note "target directory: ${TARGET_DIR}"
  note "operating system: ${OS} (${UNAME_S})"

  check_docker

  collect_answers
  validate_answers

  write_config
  write_env
  print_summary

  if [[ "$CONFIGURE_ONLY" == '1' ]]; then
    say ''
    say '--configure-only: stopping here. Nothing was built, started or pulled.'
    say "When Docker is ready:  cd '${TARGET_DIR}' && ./install.sh"
    exit 0
  fi

  [[ "${#COMPOSE[@]}" -gt 0 ]] || die 'no compose command available'

  compose_files
  generate_certs
  compose_up
  pull_model
  apply_schema

  local health_status=0
  poll_health || health_status=$?
  exit "$health_status"
}

main "$@"
