#!/bin/bash
# Runs after the .deb installs (electron-builder `deb.afterInstall`).
# Same as electron-builder's default script, plus an AppArmor profile: Ubuntu 23.10+
# blocks unprivileged user namespaces, which Electron's sandbox needs, so without the
# profile the app aborts on launch ("SUID sandbox helper binary ... not configured").

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# AppArmor profile that lets the app create user namespaces (the same approach as
# VS Code, Chrome and Slack on Ubuntu). Unconfined: it only grants userns.
APPARMOR_PROFILE='/etc/apparmor.d/${executable}'
PROFILE_LOADED=0
if [ -d /etc/apparmor.d ] && [ -f /etc/apparmor.d/abi/4.0 ] && hash apparmor_parser 2>/dev/null; then
    cat > "$APPARMOR_PROFILE" <<'PROFILE'
# Installed by the ${executable} package. Lets Electron's sandbox use user namespaces.
abi <abi/4.0>,
include <tunables/global>

profile ${executable} "/opt/${sanitizedProductName}/${executable}" flags=(unconfined) {
  userns,

  include if exists <local/${executable}>
}
PROFILE
    if { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; } || [ ! -d /sys/kernel/security/apparmor ]; then
        PROFILE_LOADED=1  # loads on next boot
    elif apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE" >/dev/null 2>&1; then
        PROFILE_LOADED=1
    else
        rm -f "$APPARMOR_PROFILE"
    fi
fi

# Fallback sandbox: the setuid helper, when user namespaces are missing or restricted
# and no profile could be loaded.
USERNS_RESTRICTED=0
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then
    USERNS_RESTRICTED=1
fi
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; } || { [ "$USERNS_RESTRICTED" = "1" ] && [ "$PROFILE_LOADED" = "0" ]; }; then
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
