import sqlite3
import os
import sys
import json
import uuid
import time
import librosa
import numpy as np
import requests

# REAL INGEST (Step 2: Qdrant Integration)

QDRANT_HOST = "http://127.0.0.1:6333"
COLLECTION_NAME = "tae"
PB_DB_PATH = "/opt/glip/services/pocketbase/pb_data/data.db"

def get_embedding(file_path):
    """
    Placeholder for a real CLAP/Audio embedding.
    For now, extracts MFCCs and mean-pools them to 512 dimensions.
    """
    y, sr = librosa.load(file_path, duration=10) # process first 10s
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
    # Just a way to get 512 numbers from MFCCs (40 bands * time)
    # We pad or truncate a flattened version for a stable vector size
    flat = mfcc.flatten()
    if len(flat) > 512:
        vector = flat[:512]
    else:
        vector = np.pad(flat, (0, 512 - len(flat)), 'constant')
    
    # Normalize
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
        
    return vector.tolist()

def ingest(file_path):
    print(f"--- Processing: {file_path} ---")
    
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
        return

    file_name = os.path.basename(file_path)
    tae_id = str(uuid.uuid4())[:12]
    
    # 1. Feature Extraction
    try:
        y, sr = librosa.load(file_path)
        duration = float(librosa.get_duration(y=y, sr=sr))
        embedding = get_embedding(file_path)
        descriptors = {
            "duration": duration,
            "sr": sr,
            "rms": float(np.sqrt(np.mean(y**2)))
        }
    except Exception as e:
        print(f"Error extracting features: {e}")
        return

    # 2. PocketBase (SQLite)
    conn = sqlite3.connect(PB_DB_PATH)
    cursor = conn.cursor()
    now = time.strftime('%Y-%m-%d %H:%M:%S.000Z', time.gmtime())
    
    try:
        cursor.execute(
            "INSERT INTO tae (id, created, updated, audio, descriptors, embedding, glino, glily, symbol_svg, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (tae_id, now, now, file_name, json.dumps(descriptors), json.dumps(embedding), "", "", "", "{}")
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
                "id": str(uuid.uuid4()), # Qdrant needs a UUID or int
                "vector": embedding,
                "payload": {
                    "tae_id": tae_id,
                    "file_name": file_name
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
