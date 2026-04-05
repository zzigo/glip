Aquí tienes instrucciones operativas claras para un agente (tipo Claude / GPT / script) que debe tomar main.rs y Cargo.toml y colocarlos correctamente en el sistema GLIP. Está pensado para bootstrap inicial reproducible.

⸻

:::writing{variant=“standard” id=“56291”}

AGENT_SETUP.md — Rust API Initialization (GLIP)

1. Preconditions
	•	Root directory exists: /opt/glip
	•	Rust is installed
	•	Working directory: /opt/glip/apps/api

⸻

2. Create API Project Structure

If project does not exist:

cd /opt/glip/apps

cargo new api

If already exists:

cd /opt/glip/apps/api


⸻

3. Ensure Directory Structure

Agent must verify:

/opt/glip/apps/api/
├── Cargo.toml
└── src/
    └── main.rs

If /src does not exist:

mkdir -p src


⸻

4. Write Cargo.toml

Overwrite file:

cat <<'EOF' > /opt/glip/apps/api/Cargo.toml
[package]
name = "api"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.11", features = ["json"] }
EOF


⸻

5. Write main.rs

cat <<'EOF' > /opt/glip/apps/api/src/main.rs
// (PASTE FULL main.rs CONTENT HERE)
EOF

Agent must insert the previously provided Rust code exactly.

⸻

6. Validate Project

Run:

cd /opt/glip/apps/api

cargo check

If errors:
	•	ensure Rust toolchain installed
	•	ensure Cargo.toml is valid
	•	ensure src/main.rs exists

⸻

7. Build Release Binary

cargo build --release

Expected output:

/opt/glip/apps/api/target/release/api


⸻

8. Test Execution

./target/release/api

Expected:

GLIP API running on http://127.0.0.1:8000


⸻

9. Test Endpoint

In another shell:

curl "http://127.0.0.1:8000/api/near?k=5"

Expected JSON response.

⸻

10. Register Systemd (optional but recommended)

Agent may create:

/etc/systemd/system/glip-api.service

Then:

systemctl daemon-reload
systemctl enable glip-api
systemctl start glip-api


⸻

11. Idempotency Rules

Agent must:
	•	overwrite Cargo.toml safely
	•	overwrite main.rs safely
	•	not delete other directories
	•	not modify unrelated services

⸻

12. Failure Recovery

If build fails:

cargo clean
cargo build

If still failing:
	•	print compiler errors
	•	stop execution

⸻

13. Completion Condition

System is valid when:
	•	binary exists
	•	API responds to /api/near
	•	no runtime panic

⸻

:::

⸻

Notas clave (operativas)
	•	Esto está pensado para que el agente no improvise rutas
	•	Usa paths absolutos (/opt/glip) → evita errores
	•	Usa cat <<EOF → evita errores de edición parcial
	•	Es idempotente → se puede correr varias veces

⸻

Si quieres, siguiente paso:
	•	ops.rs + parser GLINO mínimo integrado al handler
	•	o test end-to-end: frontend → /near → WebAudio playback
