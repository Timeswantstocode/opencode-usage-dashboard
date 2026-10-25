#!/bin/sh
set -eu

cd "$(dirname "$0")"

echo "=========================================="
echo "  OpenCode Usage Dashboard"
echo "=========================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on PATH."
  echo "Install Node 24 or newer from https://nodejs.org and run this script again."
  exit 1
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
case "$NODE_MAJOR" in
  ''|*[!0-9]*) NODE_MAJOR=0 ;;
esac
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node 24 or newer is required. Found $NODE_VERSION."
  echo "Install a newer Node.js and run this script again."
  exit 1
fi
echo "Node $NODE_VERSION found."

if command -v pnpm >/dev/null 2>&1; then
  INSTALL="pnpm install --silent"
  RUN="pnpm exec next dev"
else
  echo "pnpm was not found on PATH. Falling back to npm."
  INSTALL="npm install --silent --no-package-lock"
  RUN="npx next dev"
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies. This can take a minute..."
  $INSTALL
  echo "Dependencies installed."
  echo
fi

# Returns 0 when lsof or nc is available to probe a port.
have_probe() {
  if command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# Returns 0 when something is listening on the given port, 1 when it is free
# or when no probe is available (the runtime error then drives the retry).
port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    if lsof -i ":$1" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi
  if command -v nc >/dev/null 2>&1; then
    if nc -z localhost "$1" >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi
  return 1
}

# Asks once. Returns 0 to switch to 4322, 1 to cancel.
ask_for_alt_port() {
  echo
  echo "Port 4321 is already in use."
  printf 'Start on 4322 instead? [Y/N] '
  read -r answer || answer=""
  case "$answer" in
    [yY]) return 0 ;;
    *) echo "Cancelled."; return 1 ;;
  esac
}

# Starts the dev server on $PORT and opens the browser a few seconds later.
serve() {
  echo "Starting the dashboard on http://localhost:$PORT"
  echo "The browser opens in a few seconds. Press Ctrl+C to stop."
  echo
  (
    sleep 3
    if command -v open >/dev/null 2>&1; then
      open "http://localhost:$PORT"
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://localhost:$PORT"
    elif command -v start >/dev/null 2>&1; then
      start "http://localhost:$PORT"
    fi
  ) >/dev/null 2>&1 &
  $RUN -p "$PORT"
}

PORT=4321

if port_busy "$PORT"; then
  if ask_for_alt_port; then
    PORT=4322
  else
    exit 0
  fi
fi

if serve; then
  exit 0
fi

# A busy port can also surface only after next dev returns; offer 4322 once.
if [ "$PORT" = "4321" ] && { ! have_probe || port_busy 4321; }; then
  if ask_for_alt_port; then
    PORT=4322
  else
    exit 0
  fi
  if serve; then
    exit 0
  fi
fi

echo
echo "The dev server stopped with an error."
echo "If port 4321 is busy, run: pnpm exec next dev -p 4322"
exit 1
