import sqlite3
import json
import uuid
import time

db_path = "/opt/glip/services/pocketbase/pb_data/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if 'tae' already exists
cursor.execute("SELECT id FROM _collections WHERE name='tae'")
if cursor.fetchone():
    print("Collection 'tae' already exists.")
    conn.close()
    exit(0)

# Generate a unique ID for the collection
coll_id = "tae_collection"

# Define the schema
schema = [
    {"id": "f1", "name": "audio", "type": "file", "options": {"maxSelect": 1, "maxSize": 52428800, "mimeTypes": ["audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav"]}},
    {"id": "f2", "name": "descriptors", "type": "json", "options": {}},
    {"id": "f3", "name": "embedding", "type": "json", "options": {}},
    {"id": "f4", "name": "glino", "type": "text", "options": {}},
    {"id": "f5", "name": "glily", "type": "text", "options": {}},
    {"id": "f6", "name": "symbol_svg", "type": "file", "options": {"maxSelect": 1, "maxSize": 5242880, "mimeTypes": ["image/svg+xml"]}},
    {"id": "f7", "name": "metadata", "type": "json", "options": {}}
]

collection_data = {
    "id": coll_id,
    "name": "tae",
    "type": "base",
    "system": False,
    "schema": schema,
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
}

# Insert into _collections
created = time.strftime('%Y-%m-%d %H:%M:%S.000Z', time.gmtime())
cursor.execute(
    "INSERT INTO _collections (id, name, type, system, schema, listRule, viewRule, createRule, updateRule, deleteRule, options, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    (coll_id, "tae", "base", 0, json.dumps(schema), "", "", "", "", "", "{}", created, created)
)

# Also need to create the actual table for records
cursor.execute(f"CREATE TABLE tae (id TEXT PRIMARY KEY, created TEXT, updated TEXT, audio TEXT, descriptors TEXT, embedding TEXT, glino TEXT, glily TEXT, symbol_svg TEXT, metadata TEXT)")

conn.commit()
conn.close()
print("Collection 'tae' created successfully.")
