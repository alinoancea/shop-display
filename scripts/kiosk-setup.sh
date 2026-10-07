#!/bin/sh
# Raspberry Pi OS Bookworm (labwc): Docker + aplicatia + Chromium kiosk la boot.
# Rulare din radacina repo-ului, ca utilizatorul normal (nu root): sh scripts/kiosk-setup.sh http://192.168.1.10:5000
# Argument: SCREEN_SERVER_URL (serverul Flask). Idempotent, poate fi rulat de mai multe ori.
set -e
[ -n "$1" ] || { echo "Folosire: $0 <SCREEN_SERVER_URL>"; exit 1; }
URL="http://127.0.0.1"   # docker compose: 127.0.0.1:80 -> 3001
BROWSER=$(command -v chromium-browser || command -v chromium) || { echo "Chromium lipseste"; exit 1; }

# Docker (restart: unless-stopped + serviciul docker activ = aplicatia porneste la boot)
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # efectiv dupa re-login; de aceea mai jos folosim sudo

# Aplicatia
echo "SCREEN_SERVER_URL=$1" > .env
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d

# Desktop autologin, fara screen blanking
sudo raspi-config nonint do_boot_behaviour B4
sudo raspi-config nonint do_blanking 1

# Chromium kiosk + cursor ascuns (wtype apasa Alt+Super+H, legat la HideCursor; labwc >= 0.8.4)
sudo apt-get install -y wtype
mkdir -p ~/.config/labwc
cat > ~/.config/labwc/rc.xml <<EOF
<?xml version="1.0"?>
<labwc_config>
  <keyboard>
    <default />
    <keybind key="A-W-h">
      <action name="HideCursor" />
      <action name="WarpCursor" x="-1" y="-1" />
    </keybind>
  </keyboard>
</labwc_config>
EOF
cat > ~/.config/labwc/autostart <<EOF
wtype -M alt -M logo -k h -m logo -m alt
until curl -s -o /dev/null $URL; do sleep 2; done
$BROWSER --kiosk --noerrdialogs --disable-infobars --no-first-run \\
  --disable-session-crashed-bubble --password-store=basic $URL &
EOF

echo "Gata. Repornesti: sudo reboot"
