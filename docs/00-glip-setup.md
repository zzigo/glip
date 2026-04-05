# =========================================================
# GLIP SYSTEM SETUP (Ubuntu 24.04 / Bun / Caddy)
# Root: /opt/glip
# =========================================================

# ---------------------------------------------------------
# 1. SYSTEM SETUP
# ---------------------------------------------------------

apt update && apt upgrade -y

apt install -y \
  curl \
  git \
  ffmpeg \
  unzip \
  build-essential \
  pkg-config \
  libssl-dev \
  python3 \
  python3-pip \
  python3-venv \
  caddy

# ---------------------------------------------------------
# 2. INSTALL BUN (Frontend + tooling)
# ---------------------------------------------------------

curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# ---------------------------------------------------------
# 3. INSTALL RUST (API)
# ---------------------------------------------------------

curl https://sh.rustup.rs -sSf | sh -y
source $HOME/.cargo/env

# ---------------------------------------------------------
# 4. CREATE ROOT STRUCTURE
# ---------------------------------------------------------

mkdir -p /opt/glip
cd /opt/glip

mkdir -p \
  apps/frontend \
  apps/api \
  apps/indexer \
  apps/glily \
  services/pocketbase \
  services/qdrant_storage \
  data/audio \
  data/video \
  data/symbols/svg \
  data/symbols/lilypond \
  data/yaml \
  data/embeddings \
  schemas \
  scripts \
  configs/systemd \
  logs \
  docs

# ---------------------------------------------------------
# 5. INSTALL POCKETBASE
# ---------------------------------------------------------

cd /opt/glip/services/pocketbase

wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.0/pocketbase_0.22.0_linux_amd64.zip
unzip pocketbase_*.zip
chmod +x pocketbase

# ---------------------------------------------------------
# 6. INSTALL QDRANT (Docker)
# ---------------------------------------------------------

apt install -y docker.io
systemctl enable docker
systemctl start docker

docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v /opt/glip/services/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# ---------------------------------------------------------
# 7. INSTALL LILYPOND (GLILY)
# ---------------------------------------------------------

apt install -y lilypond

# ---------------------------------------------------------
# 8. FRONTEND (SvelteKit + Bun)
# ---------------------------------------------------------

cd /opt/glip/apps/frontend

bun create svelte@latest .
bun install

# add adapter-node
bun add -d @sveltejs/adapter-node

# build
bun run build

# ---------------------------------------------------------
# 9. RUST API
# ---------------------------------------------------------

cd /opt/glip/apps/api

cargo init

# structure:
# /opt/glip/apps/api/src/
#   main.rs
#   query.rs
#   ops.rs
#   qdrant.rs

# build
cargo build --release

# ---------------------------------------------------------
# 10. PYTHON INDEXER
# ---------------------------------------------------------

cd /opt/glip/apps/indexer

python3 -m venv venv
source venv/bin/activate

pip install \
  librosa \
  numpy \
  torch \
  soundfile

# scripts go in:
# /opt/glip/scripts/
#   ingest.py
#   embed.py
#   segment.py

# ---------------------------------------------------------
# 11. GLILY PARSER
# ---------------------------------------------------------

cd /opt/glip/apps/glily

# structure:
# parser.ts
# templates/
# output/

# ---------------------------------------------------------
# 12. CADDY CONFIG
# ---------------------------------------------------------

cat <<EOF > /etc/caddy/Caddyfile

:80 {
    root * /opt/glip/apps/frontend/build
    file_server

    reverse_proxy /api/* 127.0.0.1:8000
    reverse_proxy /pb/* 127.0.0.1:8090
}

EOF

systemctl restart caddy

# ---------------------------------------------------------
# 13. SYSTEMD SERVICES
# ---------------------------------------------------------

# POCKETBASE
cat <<EOF > /etc/systemd/system/glip-pocketbase.service
[Unit]
Description=GLIP PocketBase
After=network.target

[Service]
WorkingDirectory=/opt/glip/services/pocketbase
ExecStart=/opt/glip/services/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# RUST API
cat <<EOF > /etc/systemd/system/glip-api.service
[Unit]
Description=GLIP API
After=network.target

[Service]
WorkingDirectory=/opt/glip/apps/api
ExecStart=/opt/glip/apps/api/target/release/api
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reexec
systemctl daemon-reload

systemctl enable glip-pocketbase
systemctl enable glip-api

systemctl start glip-pocketbase
systemctl start glip-api

# ---------------------------------------------------------
# 14. DATA STRUCTURE (TAE)
# ---------------------------------------------------------

# Example:

/opt/glip/data/audio/tae_001/sample.ogg
/opt/glip/data/audio/tae_001/segments/
/opt/glip/data/video/tae_001.mp4
/opt/glip/data/symbols/svg/tae_001.svg
/opt/glip/data/symbols/lilypond/tae_001.ly
/opt/glip/data/yaml/tae_001.yaml

# ---------------------------------------------------------
# 15. MINIMAL PIPELINE
# ---------------------------------------------------------

# ingest
python /opt/glip/scripts/ingest.py

# embeddings → Qdrant
python /opt/glip/scripts/embed.py

# query flow:
# GLINO → API → Qdrant → timeline → frontend → WebAudio

# ---------------------------------------------------------
# 16. QUICK TEST
# ---------------------------------------------------------

# 1. add 5 .ogg files to /opt/glip/data/audio
# 2. run embed script
# 3. curl API /near
# 4. open browser → play

# ---------------------------------------------------------
# END
# ---------------------------------------------------------
