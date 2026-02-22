#!/bin/bash

# Modern Electron defaults to Wayland when WAYLAND_DISPLAY is set in the environment.
# When Wayland is available we enhance it with IME support.
# When Wayland is absent we explicitly force X11 so Electron does not attempt
# auto-detection and fall back awkwardly.

WAYLAND_SOCKET="${WAYLAND_DISPLAY:-wayland-0}"
EXTRA_ARGS=""

if [[ -e "${XDG_RUNTIME_DIR}/${WAYLAND_SOCKET}" || -e "${WAYLAND_DISPLAY}" ]]; then
    EXTRA_ARGS="--enable-wayland-ime --wayland-text-input-version=3"
else
    EXTRA_ARGS="--ozone-platform=x11"
fi

# TMPDIR must point to XDG_RUNTIME_DIR so that Chromium's shared-memory
# segments are on a tmpfs that is visible to all processes in the sandbox.
exec env TMPDIR="${XDG_RUNTIME_DIR}" \
    zypak-wrapper /app/extra/mailspring/mailspring \
    ${EXTRA_ARGS} "$@"
