# TAE YAML MASTER SPECIFICATION (v1.0)

## Design Principle
- **Flat structure**: No nesting, compatible with Obsidian and easy PocketBase ingestion.
- **Prefix-based semantics**: Use prefixes to group fields logically.
- **Human-readable**: Optimized for manual editing in Markdown/Obsidian.

---

## 1. Structure Example

```yaml
id: tae_001

# --- identity ---
name: metal_scrape_short
type: excitation
instrument: metal_object
performer: unknown
date: 2026-04-06

# --- audio ---
audio_file: data/audio/tae_001/sample.ogg
audio_duration: 0.32
audio_sr: 48000
audio_channels: 1

# --- segmentation ---
segment_start: 0.0
segment_end: 0.32
segment_count: 1

# --- descriptors (audio) ---
desc_centroid: 4200
desc_flux: 0.78
desc_noisiness: 0.92
desc_harmonicity: 0.15
desc_loudness: -18.0

# --- descriptors (semantic / adjectival) ---
desc_semantic: noisy, metallic, unstable, dry

# --- embeddings ---
embed_audio_model: clap
embed_audio_dim: 512
embed_audio_ref: data/embeddings/tae_001_audio.vec

embed_semantic_model: text-embedding
embed_semantic_dim: 384
embed_semantic_ref: data/embeddings/tae_001_sem.vec

# --- gesture (optional) ---
gesture_type: friction
gesture_energy: medium
gesture_speed: fast
gesture_direction: linear
gesture_source: video

# --- video ---
video_file: data/video/tae_001.mp4
video_start: 0.0
video_end: 0.32
video_fps: 30

# --- symbol / notation ---
glily_expr: cl.m{ e' c'' fis''' 0 0 0 x 0 0 1 }
lilypond_vars: (define my-fingering "x o o") 
lilypond_file: data/symbols/lilypond/tae_001.ly
svg_file: data/symbols/svg/tae_001.svg

# --- morphology ---
morph_type: impulsive
morph_onset: sharp
morph_decay: short
morph_evolution: none

# --- MOAIE mapping ---
moaie_material: metal
moaie_object: plate
moaie_agent: bow
moaie_interaction: scrape
moaie_environment: dry

# --- relational ---
related_tae: tae_002, tae_010, tae_021
variant_of: none
family: metal_scrapes

# --- usage / provenance ---
source: field_recording
license: CC-BY
tags: scrape, metal, short, noise

# --- system ---
created_by: glip_ingest_v0
checksum: abc123xyz
status: active
```

---

## 2. Prefix Definitions

| Prefix | Layer | Description |
| :--- | :--- | :--- |
| **audio_** | Signal | Raw audio properties |
| **desc_** | Descriptors | Technical and semantic descriptors |
| **embed_** | Embeddings | Latent space references |
| **gesture_** | Gesture | Performance/Action data |
| **video_** | Video | Visual reference |
| **glily_** | Notation | GLILY/LilyPond variables and expressions |
| **moaie_** | Ontology | MOAIE mapping (material, agent, etc) |
| **morph_** | Morphology | Shape and evolution of sound |
| **rel_** | Relational | Connections between TAEs |

---

## 3. Obsidian Integration Strategy
- Each TAE is a file: `tae_001.md`.
- Metadata is stored in the Frontmatter (YAML).
- Body of the file contains logs, notes, and visual links to SVG/Waveforms.
