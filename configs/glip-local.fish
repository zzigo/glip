# glip-local.fish — Dev local de GLIP contra el VPS remoto
#
# INSTALACIÓN:
#   source ~/path/to/glip/configs/glip-local.fish
#   O agrega esta línea a ~/.config/fish/config.fish
#
# USO:
#   glip-local          → tunnel + frontend dev server (modo recomendado)
#   glip-tunnel         → solo abre el SSH tunnel
#   glip-tunnel-close   → cierra el tunnel
#   glip-dev            → solo frontend (sin abrir tunnel)
#   glip-status         → muestra qué servicios están activos

# ─── CONFIGURA AQUÍ ──────────────────────────────────────────
# set -g: global para que las funciones definidas abajo puedan leer estas variables
set -g GLIP_VPS_USER "zz"
set -g GLIP_VPS_HOST "vps2.zztt.org"
set -g GLIP_REPO     "$HOME/dev/glip"   # fallback si no se auto-detecta
set -g GLIP_LILYPOND "/Applications/Lilypond/lilypond-2.25.80/bin/lilypond"

# Auto-detectar GLIP_REPO desde la ubicación del script
set -l _script_abs (realpath (status --current-filename) 2>/dev/null; or echo "")
if test -n "$_script_abs"
    set -l _script_dir (dirname "$_script_abs")
    if test -d "$_script_dir/../apps"
        set -g GLIP_REPO (realpath "$_script_dir/..")
    end
end

# ─── TUNNEL ──────────────────────────────────────────────────

function glip-tunnel
    if ssh -S /tmp/glip-ssh-tunnel.sock -O check "$GLIP_VPS_USER@$GLIP_VPS_HOST" 2>/dev/null
        echo "[glip] tunnel ya activo"
        return 0
    end

    echo "[glip] abriendo tunnel → $GLIP_VPS_USER@$GLIP_VPS_HOST"
    ssh -fNM \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -L 8000:localhost:8000 \
        -L 8090:localhost:8090 \
        -S /tmp/glip-ssh-tunnel.sock \
        "$GLIP_VPS_USER@$GLIP_VPS_HOST"

    if test $status -eq 0
        echo "[glip] tunnel abierto ✓"
        echo "       API → http://localhost:8000"
        echo "       PB  → http://localhost:8090"
    else
        echo "[glip] ERROR al abrir tunnel"
        return 1
    end
end

function glip-tunnel-close
    echo "[glip] cerrando tunnel..."
    ssh -S /tmp/glip-ssh-tunnel.sock -O exit "$GLIP_VPS_USER@$GLIP_VPS_HOST" 2>/dev/null
    echo "[glip] tunnel cerrado"
end

# ─── ENV ─────────────────────────────────────────────────────
# La fuente de verdad es local — el .env.development se escribe desde acá.
# En el VPS, el .env.production tiene su propia config fija.

function _glip-write-env
    set -l mode $argv[1]   # "tunnel" | "public"
    set -l env_file "$GLIP_REPO/apps/frontend/.env.development"

    if not test -d (dirname "$env_file")
        echo "[glip] no encuentro $GLIP_REPO/apps/frontend — revisá GLIP_REPO"
        return 1
    end

    if test "$mode" = "tunnel"
        printf "# glip-local.fish — modo tunnel (fuente de verdad: local)\n" > $env_file
        printf "VITE_VPS=http://localhost:8000\n"         >> $env_file
        printf "VITE_VPS_PB=http://localhost:8090\n"      >> $env_file
        printf "VITE_LILYPOND=%s\n" "$GLIP_LILYPOND"      >> $env_file
        echo "[glip] .env.development → tunnel (localhost:8000 / localhost:8090)"
    else
        printf "# glip-local.fish — modo público (sin tunnel)\n" > $env_file
        printf "VITE_VPS=https://glip.zztt.org\n"         >> $env_file
        printf "VITE_VPS_PB=https://glip.zztt.org\n"      >> $env_file
        printf "VITE_LILYPOND=%s\n" "$GLIP_LILYPOND"      >> $env_file
        echo "[glip] .env.development → público (glip.zztt.org)"
    end
end

# ─── DEV SERVER ──────────────────────────────────────────────

function glip-dev
    set -l frontend "$GLIP_REPO/apps/frontend"
    if not test -d "$frontend"
        echo "[glip] no encuentro $frontend"
        echo "       GLIP_REPO actual: $GLIP_REPO"
        echo "       Overrideá con:  set -gx GLIP_REPO /ruta/al/repo"
        return 1
    end

    echo "[glip] frontend → http://localhost:5174"
    cd "$frontend"
    pnpm dev
end

# ─── COMANDO PRINCIPAL ───────────────────────────────────────

function glip-local
    glip-tunnel
    if test $status -eq 0
        _glip-write-env tunnel
    else
        echo "[glip] sin tunnel — usando dominio público"
        _glip-write-env public
    end
    glip-dev
end

# ─── STATUS ──────────────────────────────────────────────────

function glip-status
    echo "──── GLIP LOCAL STATUS ────"
    echo ""
    echo "Repo:     $GLIP_REPO"
    echo "VPS:      $GLIP_VPS_USER@$GLIP_VPS_HOST"
    echo "LilyPond: $GLIP_LILYPOND"
    echo ""

    if ssh -S /tmp/glip-ssh-tunnel.sock -O check "$GLIP_VPS_USER@$GLIP_VPS_HOST" 2>/dev/null
        echo "Tunnel:  ✓ activo"
    else
        echo "Tunnel:  ✗ cerrado"
    end

    if curl -sf 'http://localhost:8000/api/near?k=1' > /dev/null 2>&1
        echo "API:     ✓ http://localhost:8000"
    else
        echo "API:     ✗ no responde"
    end

    if curl -sf http://localhost:8090/api/health > /dev/null 2>&1
        echo "PB:      ✓ http://localhost:8090"
    else
        echo "PB:      ✗ no responde"
    end

    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1
        echo "Ollama:  ✓ http://localhost:11434"
        set -l models (curl -sf http://localhost:11434/api/tags | python3 -c \
            "import sys,json; [print('         ·', m['name']) for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null)
        echo $models
    else
        echo "Ollama:  ✗ no responde"
    end

    if curl -sf http://localhost:5174 > /dev/null 2>&1
        echo "Dev:     ✓ http://localhost:5174"
    else
        echo "Dev:     ✗ no activo"
    end

    if test -f "$GLIP_LILYPOND"
        echo "Lily:    ✓ $GLIP_LILYPOND"
    else
        echo "Lily:    ✗ no encontrado en $GLIP_LILYPOND"
    end

    echo ""
    echo "────────────────────────────"
end

# ─── VPS SHORTCUTS ───────────────────────────────────────────

function glip-ssh
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST"
end

function glip-logs
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST" "journalctl -u glip-api -f --no-pager"
end

function glip-restart
    ssh "$GLIP_VPS_USER@$GLIP_VPS_HOST" "sudo systemctl restart glip-api glip-frontend"
    echo "[glip] servicios reiniciados en VPS"
end

function glip-build-push
    echo "[glip] push + build en VPS..."
    cd "$GLIP_REPO"
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

echo "[glip-local.fish] cargado"
echo "  Repo:     $GLIP_REPO"
echo "  VPS:      $GLIP_VPS_USER@$GLIP_VPS_HOST"
echo "  LilyPond: $GLIP_LILYPOND"
echo "  Comandos: glip-local · glip-tunnel · glip-status · glip-logs · glip-build-push"
