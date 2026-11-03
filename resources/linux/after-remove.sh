#!/bin/bash
# Runs after the .deb is removed (electron-builder `deb.afterRemove`).

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/usr/bin/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

# Drop the AppArmor profile on remove/purge (not on upgrade; the new version reinstalls it).
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    if [ -f '/etc/apparmor.d/${executable}' ]; then
        if hash apparmor_parser 2>/dev/null; then
            apparmor_parser --remove '/etc/apparmor.d/${executable}' >/dev/null 2>&1 || true
        fi
        rm -f '/etc/apparmor.d/${executable}'
    fi
fi
