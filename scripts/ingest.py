import sqlite3
import os
import sys
import json
import uuid
import time
import librosa
import numpy as np
import requests

# REAL INGEST (Enhanced Descriptors + Flat YAML integration)

QDRANT_HOST = "http://127.0.0.1:6333"
COLLECTION_NAME = "tae"
PB_DB_PATH = "/opt/glip/services/pocketbase/pb_data/data.db"

def get_embedding(file_path):
    try:
        y, sr = librosa.load(file_path, duration=10)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
        flat = mfcc.flatten()
        if len(flat) > 512:
            vector = flat[:512]
        else:
            vector = np.pad(flat, (0, 512 - len(flat)), 'constant')
        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        return vector.tolist()
    except Exception as e:
        print(f"Embedding error: {e}")
        return [0.0] * 512

def ingest(file_path):
    print(f"--- Processing: {file_path} ---")
    
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
        return

    file_name = os.path.basename(file_path)
    tae_id = str(uuid.uuid4())[:12]
    
    # 1. Feature Extraction
    try:
        y, sr = librosa.load(file_path, sr=None)
        duration = float(librosa.get_duration(y=y, sr=sr))
        
        # Spectral Features
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        spectral_flatness = librosa.feature.spectral_flatness(y=y)
        zcr = librosa.feature.zero_crossing_rate(y)
        rms = librosa.feature.rms(y=y)
        
        # Pitch / Fundamental (YIN)
        f0 = librosa.yin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
        f0_avg = np.nanmean(f0) if not np.all(np.isnan(f0)) else 0.0

        # Harmonicity
        y_h, y_p = librosa.effects.hpss(y)
        harmonicity = np.mean(y_h**2) / (np.mean(y_p**2) + 1e-6)

        # Build flat metadata object following master spec
        metadata = {
            "id": tae_id,
            "name": file_name.split('.')[0],
            "audio_file": file_name,
            "audio_duration": duration,
            "audio_sr": sr,
            "desc_centroid": float(np.mean(spectral_centroid)),
            "desc_bandwidth": float(np.mean(spectral_bandwidth)),
            "desc_flatness": float(np.mean(spectral_flatness)),
            "desc_zcr": float(np.mean(zcr)),
            "desc_rms": float(np.mean(rms)),
            "desc_f0": float(f0_avg),
            "desc_harmonicity": float(harmonicity),
            "status": "active",
            "created_by": "glip_ingest_v1"
        }
        
        embedding = get_embedding(file_path)
        
    except Exception as e:
        import traceback
        print(f"Error extracting features from {file_name}: {e}")
        traceback.print_exc()
        return

    # 2. PocketBase (SQLite)
    conn = sqlite3.connect(PB_DB_PATH)
    cursor = conn.cursor()
    now = time.strftime('%Y-%m-%d %H:%M:%S.000Z', time.gmtime())
    
    try:
        # We store the entire flat metadata in the 'metadata' column too for easy JSON retrieval
        cursor.execute(
            "INSERT INTO tae (id, created, updated, audio, descriptors, embedding, glino, glily, symbol_svg, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (tae_id, now, now, file_name, json.dumps(metadata), json.dumps(embedding), "", "", "", json.dumps(metadata))
        )
        conn.commit()
        print(f"Registered in PocketBase: {tae_id}")
    except Exception as e:
        print(f"Error PocketBase: {e}")
    finally:
        conn.close()

    # 3. Qdrant Indexing
    payload = {
        "points": [
            {
                "id": str(uuid.uuid4()),
                "vector": embedding,
                "payload": {
                    "tae_id": tae_id,
                    "file_name": file_name,
                    "descriptors": metadata # Store flat metadata as descriptors in Qdrant too
                }
            }
        ]
    }
    
    try:
        res = requests.put(f"{QDRANT_HOST}/collections/{COLLECTION_NAME}/points?wait=true", json=payload)
        if res.status_code == 200:
            print(f"Indexed in Qdrant: {COLLECTION_NAME}")
        else:
            print(f"Error Qdrant: {res.text}")
    except Exception as e:
        print(f"Connection error Qdrant: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ingest(sys.argv[1])
    else:
        print("Usage: python3 ingest.py <file_path>")
