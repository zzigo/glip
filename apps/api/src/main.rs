// /opt/glip/apps/api/src/main.rs

use axum::{
    extract::{Multipart, Query},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::process::Command;
use std::path::PathBuf;

use reqwest::Client;
use tower_http::cors::CorsLayer;

// --------------------------------------------------
// TYPES
// --------------------------------------------------

#[derive(Debug, Deserialize)]
struct NearParams {
    q: Option<String>,      // GLINO string (future)
    vector: Option<String>, // comma-separated floats
    k: Option<usize>,
}

#[derive(Debug, Serialize)]
struct TAE {
    id: String,
    score: f32,
    audio: String,
}

#[derive(Debug, Serialize)]
struct TimelineEvent {
    tae_id: String,
    start: f32,
    duration: f32,
    gain: f32,
}

#[derive(Debug, Serialize)]
struct NearResponse {
    results: Vec<TAE>,
    timeline: Vec<TimelineEvent>,
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

#[tokio::main]
async fn main() {
    let cors = CorsLayer::permissive();

    let app = Router::new()
        .route("/api/near", get(near_handler))
        .route("/api/ingest", post(ingest_handler))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8000));
    println!("GLIP API running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// --------------------------------------------------
// HANDLERS
// --------------------------------------------------

async fn ingest_handler(mut multipart: Multipart) -> Json<serde_json::Value> {
    let mut files_processed = 0;

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();
        let file_name = field.file_name().unwrap_or("unknown.wav").to_string();
        
        if name == "files" {
            let data = field.bytes().await.unwrap();
            let path = PathBuf::from("/opt/glip/data/audio").join(&file_name);
            
            // Save file
            tokio::fs::write(&path, data).await.unwrap();
            println!("Saved file: {:?}", path);

            // Trigger ingest script
            let output = Command::new("/opt/glip/apps/indexer/venv/bin/python3")
                .arg("/opt/glip/scripts/ingest.py")
                .arg(&path)
                .output();

            match output {
                Ok(o) => {
                    println!("Ingest script output: {:?}", String::from_utf8_lossy(&o.stdout));
                    files_processed += 1;
                }
                Err(e) => {
                    eprintln!("Failed to execute ingest script: {:?}", e);
                }
            }
        }
    }

    Json(serde_json::json!({ "status": "ok", "processed": files_processed }))
}

async fn near_handler(Query(params): Query<NearParams>) -> Json<NearResponse> {
    let k = params.k.unwrap_or(10);

    // --------------------------------------------
    // VECTOR INPUT (fallback random)
    // --------------------------------------------

    let vector: Vec<f32> = if let Some(v) = params.vector {
        v.split(',')
            .filter_map(|x| x.parse::<f32>().ok())
            .collect()
    } else {
        // fallback dummy vector
        vec![0.1; 512]
    };

    // --------------------------------------------
    // QUERY QDRANT
    // --------------------------------------------

    let client = Client::new();

    let res = client
        .post("http://127.0.0.1:6333/collections/tae/points/search")
        .json(&serde_json::json!({
            "vector": vector,
            "limit": k,
            "with_payload": true
        }))
        .send()
        .await;

    let mut results: Vec<TAE> = Vec::new();

    if let Ok(resp) = res {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(points) = json["result"].as_array() {
                for p in points {
                    let id = p["id"].to_string();
                    let score = p["score"].as_f64().unwrap_or(0.0) as f32;
                    let audio = p["payload"]["file_name"].as_str().unwrap_or("unknown.wav").to_string();

                    results.push(TAE { id, score, audio });
                }
            }
        }
    }

    // --------------------------------------------
    // TIMELINE GENERATION (VERY BASIC)
    // --------------------------------------------

    let mut timeline: Vec<TimelineEvent> = Vec::new();

    let mut time = 0.0;

    for r in &results {
        timeline.push(TimelineEvent {
            tae_id: r.id.clone(),
            start: time,
            duration: 0.3,
            gain: 0.8,
        });

        time += 0.25; // overlap
    }

    // --------------------------------------------
    // RESPONSE
    // --------------------------------------------

    Json(NearResponse { results, timeline })
}
