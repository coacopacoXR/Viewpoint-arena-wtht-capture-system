#!/bin/sh
# Start `partykit dev`, handing it the variables the room server needs.
#
# Why this exists: room code does NOT run in this container's Node process. It
# runs inside Cloudflare's workerd, which PartyKit starts, and workerd does not
# inherit the container environment — `process.env.ANON_KEY` inside
# party/room.server.ts is empty however the container was configured. The only
# way in is `partykit dev --var KEY=value`, which lands in `room.env`.
#
# Found the hard way: the audit log was configured correctly in
# docker-compose.yml, the container had both variables, and the room server
# still logged "ANON_KEY not set" and wrote nothing.
#
# Each variable is passed only when it is set, so a deployment that has not
# configured one gets the room server's own "not configured" behaviour rather
# than an empty string that looks configured.

set -e

# shellcheck disable=SC2039
args="--port ${PARTYKIT_PORT:-1999} --no-hotkeys"

if [ -n "$ANON_KEY" ]; then
  args="$args --var ANON_KEY=$ANON_KEY"
fi

if [ -n "$REST_URL" ]; then
  args="$args --var REST_URL=$REST_URL"
fi

# Unquoted on purpose: $args is a list of flags, not one argument. The values
# it carries (a JWT, a URL) contain no whitespace.
# shellcheck disable=SC2086
exec npx --no-install partykit dev $args
