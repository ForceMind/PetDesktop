#!/bin/sh

# Alpine does not install Bash by default. Bootstrap it before Bash parses the
# rest of this file, then re-enter the same script with the original arguments.
if [ -z "${BASH_VERSION:-}" ]; then
  if command -v bash >/dev/null 2>&1; then
    exec bash "$0" "$@"
  fi
  if command -v apk >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      apk add --no-cache bash
    elif command -v sudo >/dev/null 2>&1; then
      sudo apk add --no-cache bash
    else
      printf '[Coco] ERROR: Bash is required; install it as root and rerun this script.\n' >&2
      exit 1
    fi
    exec bash "$0" "$@"
  fi
  printf '[Coco] ERROR: Bash is required to run this deployment script.\n' >&2
  exit 1
fi

set -Eeuo pipefail

APP_NAME="coco-ai-game"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${ROOT_DIR}/ai-game-server"
ENV_FILE="${SERVER_DIR}/.env"
ENV_EXAMPLE="${SERVER_DIR}/.env.example"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
RUN_TESTS=1
ENABLE_NGINX="${COCO_ENABLE_NGINX:-0}"
DOMAIN="${COCO_DOMAIN:-}"
REQUESTED_PORT="${COCO_PORT:-}"

log() { printf '[Coco] %s\n' "$*"; }
fail() { printf '[Coco] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./deploy-linux.sh [options]

Options:
  --port PORT       Preferred direct-access port; finds the next free port if busy.
  --domain DOMAIN   Install/configure Nginx for this domain.
  --nginx           Install/configure Nginx with server_name _.
  --skip-tests      Build without running the test suite.
  --help            Show this help.

Environment variables:
  COCO_DOMAIN             Same as --domain.
  COCO_ENABLE_NGINX=1     Same as --nginx.
  COCO_PORT               Same as --port.
  COCO_SERVICE_USER       Service account; defaults to the repository owner.

The script is safe to run again after every git pull. It preserves
ai-game-server/.env and never prints secret values.
EOF
}

while (($#)); do
  case "$1" in
    --domain)
      (($# >= 2)) || fail "--domain requires a value"
      DOMAIN="$2"
      ENABLE_NGINX=1
      shift 2
      ;;
    --port)
      (($# >= 2)) || fail "--port requires a value"
      REQUESTED_PORT="$2"
      shift 2
      ;;
    --nginx)
      ENABLE_NGINX=1
      shift
      ;;
    --skip-tests)
      RUN_TESTS=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

case "${ENABLE_NGINX}" in
  1|true|TRUE|yes|YES) ENABLE_NGINX=1 ;;
  0|false|FALSE|no|NO|"") ENABLE_NGINX=0 ;;
  *) fail "COCO_ENABLE_NGINX must be 0/1, true/false, or yes/no." ;;
esac

[[ -f "${SERVER_DIR}/package.json" ]] || fail "Run this script from a complete PetDesktop checkout."
[[ -f "${ENV_EXAMPLE}" ]] || fail "Missing ${ENV_EXAMPLE}."
if [[ -n "${DOMAIN}" && ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  fail "COCO_DOMAIN contains unsupported characters."
fi
if [[ -n "${REQUESTED_PORT}" ]]; then
  [[ "${REQUESTED_PORT}" =~ ^[0-9]+$ ]] || fail "The requested port must be numeric."
  REQUESTED_PORT="$((10#${REQUESTED_PORT}))"
  ((REQUESTED_PORT >= 1024 && REQUESTED_PORT <= 65535)) \
    || fail "The port must be between 1024 and 65535."
fi

if ((EUID == 0)); then
  ROOT_CMD=()
else
  command -v sudo >/dev/null 2>&1 || fail "sudo is required when not running as root."
  ROOT_CMD=(sudo)
fi

as_root() { "${ROOT_CMD[@]}" "$@"; }

REPO_OWNER="$(stat -c '%U' "${ROOT_DIR}" 2>/dev/null || true)"
DEPLOY_USER="${COCO_SERVICE_USER:-${SUDO_USER:-${REPO_OWNER:-$(id -un)}}}"
id "${DEPLOY_USER}" >/dev/null 2>&1 || fail "Service user '${DEPLOY_USER}' does not exist."
DEPLOY_GROUP="$(id -gn "${DEPLOY_USER}")"

as_deploy() {
  if ((EUID == 0)) && [[ "${DEPLOY_USER}" != "root" ]]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "${DEPLOY_USER}" -- "$@"
    else
      sudo -u "${DEPLOY_USER}" -H -- "$@"
    fi
  else
    "$@"
  fi
}

detect_package_manager() {
  local candidate
  for candidate in apt-get dnf yum zypper pacman apk; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      printf '%s' "${candidate}"
      return
    fi
  done
  fail "Supported package manager not found (apt, dnf, yum, zypper, pacman, apk)."
}

PKG_MANAGER="$(detect_package_manager)"

install_packages() {
  case "${PKG_MANAGER}" in
    apt-get)
      as_root apt-get update
      as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf)
      as_root dnf install -y "$@"
      ;;
    yum)
      as_root yum install -y "$@"
      ;;
    zypper)
      as_root zypper --non-interactive install -y "$@"
      ;;
    pacman)
      as_root pacman -Sy --needed --noconfirm "$@"
      ;;
    apk)
      as_root apk add --no-cache "$@"
      ;;
  esac
}

install_base_tools() {
  log "Installing required system packages with ${PKG_MANAGER}."
  case "${PKG_MANAGER}" in
    apt-get) install_packages ca-certificates curl git xz-utils openssl ;;
    dnf|yum|zypper|pacman) install_packages ca-certificates curl git xz openssl ;;
    apk) install_packages ca-certificates curl git xz openssl nodejs npm ;;
  esac
}

node_major() {
  command -v node >/dev/null 2>&1 || return 1
  node --version | sed -E 's/^v([0-9]+).*/\1/'
}

ensure_node() {
  local major
  major="$(node_major 2>/dev/null || printf '0')"
  if [[ "${major}" =~ ^[0-9]+$ ]] && ((major >= 20)); then
    log "Using Node.js $(node --version)."
    return
  fi

  log "Installing Node.js 22 because Node.js 20 or newer is required."
  case "${PKG_MANAGER}" in
    apt-get)
      curl -fsSL https://deb.nodesource.com/setup_22.x | as_root bash -
      install_packages nodejs
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | as_root bash -
      install_packages nodejs
      ;;
    zypper|pacman)
      install_packages nodejs npm
      ;;
    apk)
      install_packages nodejs npm
      ;;
  esac

  major="$(node_major 2>/dev/null || printf '0')"
  [[ "${major}" =~ ^[0-9]+$ ]] && ((major >= 20)) \
    || fail "Node.js 20+ is still unavailable. Install it manually and rerun this script."
}

read_env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${ENV_FILE}"
}

replace_env_value() {
  local key="$1" value="$2" temp
  temp="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { replaced = 0 }
    $0 ~ ("^" key "=") {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "${ENV_FILE}" > "${temp}"
  as_root install -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 600 "${temp}" "${ENV_FILE}"
  rm -f -- "${temp}"
}

prepare_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    log "Creating private server configuration from .env.example."
    as_deploy cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  fi
  as_root chown "${DEPLOY_USER}:${DEPLOY_GROUP}" "${ENV_FILE}"
  as_root chmod 600 "${ENV_FILE}"

  local admin_token
  admin_token="$(read_env_value ADMIN_TOKEN || true)"
  if [[ -z "${admin_token}" || "${admin_token}" == "use-a-long-random-value" ]]; then
    admin_token="$(openssl rand -hex 32)"
    replace_env_value ADMIN_TOKEN "${admin_token}"
    log "Generated ADMIN_TOKEN and stored it only in ai-game-server/.env."
  fi

}

service_is_active() {
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    systemctl is-active --quiet "${APP_NAME}.service"
    return
  fi
  if command -v rc-service >/dev/null 2>&1; then
    rc-service "${APP_NAME}" status >/dev/null 2>&1
    return
  fi
  return 1
}

port_is_available() {
  local host="$1" port="$2"
  node -e '
    const net = require("node:net");
    const server = net.createServer();
    server.unref();
    server.once("error", () => process.exit(1));
    server.listen(Number(process.argv[2]), process.argv[1], () => server.close(() => process.exit(0)));
  ' "${host}" "${port}"
}

configure_network() {
  local configured_port desired_port candidate bind_host existing_service=0
  configured_port="$(read_env_value PORT || true)"
  desired_port="${REQUESTED_PORT:-${configured_port:-8787}}"
  [[ "${desired_port}" =~ ^[0-9]+$ ]] || fail "The requested port must be numeric."
  desired_port="$((10#${desired_port}))"
  if [[ "${configured_port}" =~ ^[0-9]+$ ]]; then
    configured_port="$((10#${configured_port}))"
  fi
  ((desired_port >= 1024 && desired_port <= 65535)) || fail "The port must be between 1024 and 65535."

  if ((ENABLE_NGINX == 1)); then
    bind_host="127.0.0.1"
  else
    bind_host="0.0.0.0"
  fi

  service_is_active && existing_service=1
  candidate="${desired_port}"
  if ! ((existing_service == 1)) || [[ "${candidate}" != "${configured_port}" ]]; then
    while ! port_is_available "${bind_host}" "${candidate}"; do
      ((candidate++))
      ((candidate <= 65535)) || fail "No free TCP port is available after ${desired_port}."
    done
  fi
  if [[ "${candidate}" != "${desired_port}" ]]; then
    log "Port ${desired_port} is already in use; selected free port ${candidate} without stopping that service."
  fi

  APP_PORT="${candidate}"
  APP_BIND_HOST="${bind_host}"
  replace_env_value PORT "${APP_PORT}"
  replace_env_value HOST "${APP_BIND_HOST}"
}

build_server() {
  log "Installing locked Node dependencies."
  as_deploy env npm_config_audit=false npm ci --prefix "${SERVER_DIR}"
  if ((RUN_TESTS)); then
    log "Running the server test suite."
    as_deploy npm --prefix "${SERVER_DIR}" test
  fi
  log "Building the production server."
  as_deploy npm --prefix "${SERVER_DIR}" run build
  log "Removing development-only Node packages."
  as_deploy npm --prefix "${SERVER_DIR}" prune --omit=dev
}

install_systemd_service() {
  local node_bin temp
  node_bin="$(command -v node)"
  temp="$(mktemp)"
  cat > "${temp}" <<EOF
[Unit]
Description=Coco AI Game Pet
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${DEPLOY_USER}
Group=${DEPLOY_GROUP}
WorkingDirectory=${SERVER_DIR}
Environment=NODE_ENV=production
ExecStart=${node_bin} ${SERVER_DIR}/dist/server.mjs
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=${SERVER_DIR}

[Install]
WantedBy=multi-user.target
EOF
  as_root install -m 644 "${temp}" "${SERVICE_FILE}"
  rm -f -- "${temp}"
  as_root systemctl daemon-reload
  as_root systemctl enable "${APP_NAME}.service"
  as_root systemctl restart "${APP_NAME}.service"
}

install_openrc_service() {
  local node_bin service_path temp log_dir
  node_bin="$(command -v node)"
  service_path="/etc/init.d/${APP_NAME}"
  log_dir="/var/log/${APP_NAME}"
  as_root install -d -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" -m 750 "${log_dir}"
  temp="$(mktemp)"
  cat > "${temp}" <<EOF
#!/sbin/openrc-run
name="Coco AI Game Pet"
description="Coco AI Game Pet"
command="${node_bin}"
command_args="${SERVER_DIR}/dist/server.mjs"
command_user="${DEPLOY_USER}:${DEPLOY_GROUP}"
directory="${SERVER_DIR}"
command_background="yes"
pidfile="/run/${APP_NAME}.pid"
output_log="${log_dir}/output.log"
error_log="${log_dir}/error.log"
export NODE_ENV="production"

depend() {
  need net
}
EOF
  as_root install -m 755 "${temp}" "${service_path}"
  rm -f -- "${temp}"
  as_root rc-update add "${APP_NAME}" default
  if as_root rc-service "${APP_NAME}" status >/dev/null 2>&1; then
    as_root rc-service "${APP_NAME}" restart
  else
    as_root rc-service "${APP_NAME}" start
  fi
}

install_service() {
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    log "Installing the systemd service."
    install_systemd_service
  elif command -v rc-service >/dev/null 2>&1; then
    log "Installing the OpenRC service."
    install_openrc_service
  else
    fail "Neither systemd nor OpenRC is available."
  fi
}

install_nginx() {
  ((ENABLE_NGINX == 1)) || return
  log "Installing and configuring Nginx."
  install_packages nginx
  local server_name="_" target temp enabled_path
  [[ -n "${DOMAIN}" ]] && server_name="${DOMAIN}"
  target="/etc/nginx/conf.d/${APP_NAME}.conf"
  if [[ "${PKG_MANAGER}" == "apt-get" ]]; then
    target="/etc/nginx/sites-available/${APP_NAME}"
  fi
  temp="$(mktemp)"
  cat > "${temp}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
EOF
  as_root install -m 644 "${temp}" "${target}"
  rm -f -- "${temp}"
  if [[ "${PKG_MANAGER}" == "apt-get" ]]; then
    enabled_path="/etc/nginx/sites-enabled/${APP_NAME}"
    as_root ln -sfn "${target}" "${enabled_path}"
  fi
  as_root nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    as_root systemctl enable nginx
    as_root systemctl restart nginx
  else
    as_root rc-update add nginx default
    as_root rc-service nginx restart || as_root rc-service nginx start
  fi
}

open_firewall_port() {
  local public_port="${APP_PORT}"
  ((ENABLE_NGINX == 1)) && public_port=80
  if command -v ufw >/dev/null 2>&1 && as_root ufw status 2>/dev/null | grep -q '^Status: active'; then
    log "Allowing TCP port ${public_port} in the active UFW firewall."
    as_root ufw allow "${public_port}/tcp"
    return
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && as_root firewall-cmd --quiet --state; then
    log "Allowing TCP port ${public_port} in the active firewalld firewall."
    as_root firewall-cmd --quiet --add-port="${public_port}/tcp"
    as_root firewall-cmd --quiet --permanent --add-port="${public_port}/tcp"
    return
  fi
  log "No active UFW/firewalld rule was changed; allow TCP ${public_port} in any cloud firewall or security group."
}

verify_service() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${APP_PORT}/" >/dev/null; then
      log "Deployment health check passed."
      return
    fi
    sleep 1
  done
  if command -v systemctl >/dev/null 2>&1; then
    as_root systemctl status "${APP_NAME}.service" --no-pager || true
  fi
  fail "The service did not become healthy on port ${APP_PORT}."
}

install_base_tools
ensure_node
prepare_env
configure_network
build_server
install_service
install_nginx
open_firewall_port
verify_service

log "Deployment complete."
if ((ENABLE_NGINX == 1)); then
  if [[ -n "${DOMAIN}" ]]; then
    log "Open http://${DOMAIN}/ after DNS points to this server."
  else
    log "Open the server's HTTP address."
  fi
else
  log "Open http://SERVER_IP:${APP_PORT}/ (replace SERVER_IP with this server's public IP)."
fi
log "Secrets remain only in ${ENV_FILE}; no secret value was printed."
