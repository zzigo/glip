# glip-local.fish — Dev local de GLIP contra el VPS remoto
#
# INSTALACIÓN:
#   source ~/path/to/glip/config/glip-local.fish
#   O agrega esta línea a ~/.config/fish/config.fish
#
# USO:
#   glip-local          → tunnel + frontend dev server (modo recomendado)
#   glip-tunnel         → solo abre el SSH tunnel
#   glip-tunnel-close   → cierra el tunnel
#   glip-dev            → solo frontend (asume tunnel ya abierto o usa dominio público)
#   glip-status         → muestra qué puertos están activos

# ─── CONFIGURA AQUÍ ──────────────────────────────────────────
set -l GLIP_VPS_USER "zz"                     # usuario SSH en el VPS
set -l GLIP_VPS_HOST "vps2.zztt.org"          # host del VPS
set -l GLIP_REPO     "$HOME/dev/glip"          # ruta local del repo
# Si el repo está en otro lugar, puedes overridear con:
#   set -x GLIP_REPO /ruta/a/glip

# Detectar ruta del repo desde el directorio del script
set -l _script_dir (dirname (status --current-filename))
if test -d "$_script_dir/../apps"
    set GLIP_REPO (realpath "$_script_dir/..")
end

# ─── TUNNEL ──────────────────────────────────────────────────

function glip-tunnel
    # Abre SSH tunnel en background:
    #   localhost:8000 → VPS:8000   (Rust API)
    #   localhost:8090 → VPS:8090   (PocketBase)
    #   localhost:11434 → VPS:11434 (Ollama)
    if pgrep -f "glip-ssh-tunnel" > /dev/null
        echo "[glip] tunnel ya activo"
        return 0
    end

    echo "[glip] abriendo tunnel → $GLIP_VPS_USER@$GLIP_VPS_HOST"
    ssh -fN \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -L 8000:localhost:8000 \
        -L 8090:localhost:8090 \
        -L 11434:localhost:11434 \
        -S /tmp/glip-ssh-tunnel.sock \
        "$GLIP_VPS_USER@$GLIP_VPS_HOST"

    if test $status -eq 0
        echo "[glip] tunnel abierto ✓"
        echo "       API    → http://localhost:8000"
        echo "       PB     → http://localhost:8090"
        echo "       Ollama → http://localhost:11434"
    else
        echo "[glip] ERROR al abrir tunnel"
    end
end

function glip-tunnel-close
    echo "[glip] cerrando tunnel..."
    ssh -S /tmp/glip-ssh-tunnel.sock -O exit "$GLIP_VPS_USER@$GLIP_VPS_HOST" 2>/dev/null
    pkill -f "glip-ssh-tunnel" 2>/dev/null
    echo "[glip] tunnel cerrado"
end

# ─── .ENV.DEVELOPMENT ────────────────────────────────────────

function _glip-write-env-tunnel
    set -l env_file "$GLIP_REPO/apps/frontend/.env.development"
    printf "# generado por glip-local.fish — SSH tunnel\n" > $env_file
    printf "VITE_VPS=http://localhost:8000\n"              >> $env_file
    printf "VITE_VPS_PB=http://localhost:8090\n"           >> $env_file
    echo "[glip] .env.development → tunnel mode"
end

function _glip-write-env-public
    set -l env_file "$GLIP_REPO/apps/frontend/.env.development"
    printf "# generado por glip-local.fish — dominio público\n" > $env_file
    printf "VITE_VPS=https://glip.zztt.org\n"                   >> $env_file
    printf "VITE_VPS_PB=https://glip.zztt.org\n"                >> $env_file
    echo "[glip] .env.development → public mode"
end

# ─── DEV SERVER ──────────────────────────────────────────────

function glip-dev
    set -l frontend "$GLIP_REPO/apps/frontend"
    if not test -d $frontend
        echo "[glip] no encuentro $frontend"
        echo "       set -x GLIP_REPO /ruta/a/tu/repo"
        return 1
    end

    echo "[glip] iniciando frontend en http://localhost:5174"
    cd $frontend
    pnpm dev
end

# ─── COMANDO PRINCIPAL ───────────────────────────────────────

function glip-local
    # Todo en uno: tunnel → env → dev server
    glip-tunnel
    if test $status -ne 0
        echo "[glip] fallback: usando dominio público"
        _glip-write-env-public
    else
        _glip-write-env-tunnel
    end

    glip-dev
end

# ─── STATUS ──────────────────────────────────────────────────

function glip-status
    echo "──── GLIP LOCAL STATUS ────"
    echo ""
    echo "Repo:    $GLIP_REPO"
    echo "VPS:     $GLIP_VPS_USER@$GLIP_VPS_HOST"
    echo ""

    # Tunnel
    if ssh -S /tmp/glip-ssh-tunnel.sock -O check "$GLIP_VPS_USER@$GLIP_VPS_HOST" 2>/dev/null
        echo "Tunnel:  ✓ activo"
    else
        echo "Tunnel:  ✗ cerrado"
    end

    # API
    if curl -sf http://localhost:8000/api/near?k=1 > /dev/null 2>&1
        echo "API:     ✓ http://localhost:8000"
    else
        echo "API:     ✗ no responde"
    end

    # PocketBase
    if curl -sf http://localhost:8090/api/health > /dev/null 2>&1
        echo "PB:      ✓ http://localhost:8090"
    else
        echo "PB:      ✗ no responde"
    end

    # Ollama
    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1
        echo "Ollama:  ✓ http://localhost:11434"
        set -l models (curl -sf http://localhost:11434/api/tags | python3 -c "import sys,json; [print('         ·', m['name']) for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null)
        echo $models
    else
        echo "Ollama:  ✗ no responde"
    end

    # Dev server
    if curl -sf http://localhost:5174 > /dev/null 2>&1
        echo "Dev:     ✓ http://localhost:5174"
    else
        echo "Dev:     ✗ no activo"
    end

    echo ""
    echo "────────────────────────────"
end

# ─── VPS SHORTCUTS ───────────────────────────────────────────

function glip-ssh
    # Shell directo al VPS
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST"
end

function glip-logs
    # Logs del API en tiempo real
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST" "journalctl -u glip-api -f --no-pager"
end

function glip-restart
    # Reinicia servicios en el VPS
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST" "sudo systemctl restart glip-api glip-frontend"
    echo "[glip] servicios reiniciados"
end

function glip-build-push
    # Push local → VPS y recompila
    set -l repo $GLIP_REPO
    echo "[glip] pushing to VPS..."
    cd $repo
    git push
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST" "
        cd /opt/glip &&
        git pull &&
        sudo /root/.cargo/bin/cargo build --release --manifest-path apps/api/Cargo.toml &&
        cd apps/frontend && pnpm build &&
        sudo systemctl restart glip-api glip-frontend &&
        echo '✓ build+restart done'
    "
end

echo "[glip-local.fish] cargado — comandos: glip-local · glip-tunnel · glip-status · glip-logs · glip-build-push"
