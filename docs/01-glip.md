⸻
1. Extensiones de interfaz (más allá de lo que ya propusiste)
Tu base es correcta: interfaz modular tipo Blender + codemirror + viewers.
Voy a proponer mejoras que impactan directamente en el modelo GLIP/SOM, no solo UX.
⸻
1.1 Panel “trajectory / space navigator” (crítico)
Nuevo div:
[ VECTOR SPACE VIEW ]
Contenido:
	•	scatterplot 2D (proyección PCA/UMAP)
	•	puntos = TAEs
	•	highlight = resultados de query
	•	línea = trayectoria temporal
Funciones:
	•	click → reproducir TAE
	•	drag → generar trayectoria
	•	scrub → recorrer audio
⸻
Por qué es importante
Esto convierte:
embedding → audible geometry
Es el puente entre:
	•	Qdrant
	•	WebAudio
	•	forma musical
⸻
1.2 Timeline híbrido (audio + símbolo + gesto)
Un panel tipo DAW mínimo:
[TIMELINE]
Capas:
	•	audio segments
	•	eventos simbólicos (glyphs)
	•	markers (OPS)
	•	opcional: gesto (si lo usas)
Funciones:
	•	drag reorder
	•	zoom
	•	slice
	•	loop region
⸻
Diferencia con DAW
No editas audio directamente:
timeline = resultado de query + OPS
⸻
1.3 “Inspector de TAE” contextual
Cuando seleccionas algo:
[TAE INSPECTOR]
Contenido:
	•	audio preview
	•	metadata
	•	embedding summary (distancias)
	•	relaciones:
	•	vecinos cercanos
	•	variantes
	•	mismo excitador / resonador
⸻
1.4 Modo “query-as-program”
Tu codemirror puede tener dos modos:
Modo A — búsqueda
noisy metal scrape short
Modo B — programático
near("metal_scratch")
→ filter(duration < 0.5)
→ sequence(k=20, continuity=0.8)
→ render(loop=true)
⸻
Esto introduce:
OPS como lenguaje
⸻
1.5 HUD inferior (muy importante)
Ya lo mencionaste → lo refino:
[HUD]
	•	estado audio (playing / paused)
	•	latencia
	•	rec indicator
	•	espacio activo (audio / semantic / gesture)
	•	CPU / buffer
→ invisible hasta hover
⸻
1.6 “Mode switch” (clave conceptual)
Botón global:
MODE:
[ browse ] [ compose ] [ perform ]
browse
	•	exploración
	•	sin timeline
compose
	•	timeline activa
	•	edición
perform
	•	fullscreen
	•	UI mínima
	•	input en vivo
⸻
1.7 Snapshots / states
Guardar estado completo:
snapshot:
  query
  layout
  timeline
  params
→ reproducible
→ exportable
⸻
1.8 Layout engine (como Blender)
Ya lo mencionaste → lo formalizo:
	•	grid flexible
	•	drag to split
	•	guardar layouts:
layout:
  - analysis
  - performance
  - minimal
⸻
1.9 Drop / record refinado
Además de:
	•	drag & drop
	•	rec (cmd+r)
agregar:
	•	paste audio (clipboard)
	•	mic input streaming
	•	“record → auto-segment → auto-index”
⸻
1.10 “Explainability panel” (muy potente)
Panel opcional:
[WHY THIS SOUND?]
Muestra:
	•	distancia embedding
	•	descriptors cercanos
	•	reglas OPS aplicadas
Esto es muy valioso para investigación.
⸻
2. PLAN.md (síntesis completa para agente)
Voy a escribirlo directamente en formato operativo.
⸻
GLIP / SOM SYSTEM PLAN
3. Overview
GLIP is the operative layer of SOM (Speculative Organology Model).
It enables:
	•	indexing of multimodal musical units (TAE)
	•	retrieval via vector spaces
	•	real-time compositional transformation
	•	audio + symbolic output
System type:
Operative Multimodal Musical Database
⸻
4. Core Concepts
TAE:
	•	audio (OGG/WAV)
	•	descriptors
	•	embeddings (audio, semantic)
	•	symbol (SVG/LilyPond)
	•	optional gesture/video
	•	metadata (YAML)
OPS:
	•	compositional operators
	•	query transforms into sound
SOOG:
	•	graph relations between TAEs
⸻
5. Architecture
Backend (VPS)
OS:
	•	UBUNTU 24
Services:
	•	PocketBase (metadata + auth)
	•	Qdrant (vector search)
	•	Rust service (retrieval + OPS)
	•	Python service (analysis/indexing)
	•	caddy (reverse proxy)
Optional:
	•	Ollama (text embedding / semantic expansion)
Storage:
	•	filesystem (/data/glip)
⸻
Frontend
Framework:
	•	SvelteKit (adapter-node)
Rendering:
	•	WebGL (no Three.js)
	•	Canvas + OffscreenCanvas
Audio:
	•	Web Audio API
	•	AudioWorklet
Communication:
	•	WebSocket (control)
	•	HTTP (media streaming)
⸻
6. Interface
Layout
Modular grid (Blender-like):
	•	resizable panels
	•	saved layouts
Panels:
	1.	Query Editor (CodeMirror)
	2.	Glyph Viewer (SVG)
	3.	Waveform Viewer
	4.	Video Viewer
	5.	YAML Metadata Editor
	6.	Log Console
	7.	Vector Space Navigator (NEW)
	8.	Timeline (NEW)
	9.	TAE Inspector (NEW)
⸻
Modes
	•	browse
	•	compose
	•	perform
⸻
Input
	•	drag & drop file
	•	record (cmd+r)
	•	paste audio
	•	mic input
⸻
HUD
	•	audio state
	•	rec indicator
	•	latency
	•	active space
⸻
7. Retrieval Layer
Qdrant:
	•	multiple vectors:
	•	audio
	•	semantic
	•	optional gesture
Rust service:
	•	combines scores
	•	applies OPS
	•	returns ordered TAEs
⸻
8. Audio Engine
Client-side (Web Audio):
	•	concatenative synthesis
	•	granular
	•	crossfade
	•	scheduling
No server-side synthesis.
⸻
9. Indexing Pipeline
Python:
	•	segmentation
	•	descriptor extraction (librosa)
	•	embedding extraction (CLAP/OpenL3)
	•	storage in Qdrant + PocketBase
⸻
10. Minimal MVP
Step 1:
	•	20 TAEs
	•	audio + descriptors
Step 2:
	•	Qdrant integration
	•	/near endpoint
Step 3:
	•	WebAudio playback
Step 4:
	•	basic UI (query + waveform)
Step 5:
	•	timeline
⸻
11. Roadmap
Phase 1:
	•	ingestion + playback
Phase 2:
	•	vector navigation + UI panels
Phase 3:
	•	OPS language
Phase 4:
	•	timeline composition
Phase 5:
	•	symbolic integration (glyphs)
Phase 6:
	•	SOM integration (SOOG graph)
⸻
12. Design Principles
	•	minimal UI (wireframe aesthetic)
	•	no heavy libraries
	•	real-time first
	•	separation of concerns
	•	database ≠ instrument → GLIP makes it operative
⸻
13. Key Insight
GLIP transforms:
query → composition
not:
query → result
⸻
14. Cierre
La interfaz que planteas es correcta, pero lo que la vuelve potente es:
	•	vector space panel
	•	timeline como resultado de query
	•	query como lenguaje
	•	modo performativo real
Eso la convierte en:
interfaz de base de datos → interfaz instrumental


# PLAN.md (EXTENDED)
## 1. System Overview
SOM system:
- MOAIE → ontology
- SOOG → graph
- GLINO → audio operation
- GLILY → symbolic inscription
---
## 2. GLINO
Language for:
- retrieval
- transformation
- composition
Output:
audio
---
## 3. GLILY
Language for:
- notation
- score generation
- symbolic mapping
Output:
LilyPond → PDF/SVG
---
## 4. Data Model
TAE:
- audio
- embedding
- descriptors
- glino reference
- glily reference
- symbol (svg/lily)
- metadata
---
## 5. Dual Pipeline
### Audio
GLINO → Qdrant → timeline → WebAudio
### Symbolic
GLILY → parser → LilyPond → render
---
## 6. Interface Integration
Panels:
- Query (GLINO)
- Score Editor (GLILY)
- Glyph
- Waveform
- Timeline
- Vector space
---
## 7. GLILY Syntax (v0.1)
### Score
score{fl cl pno tutti{c,8 dis e}}
### Instrument module
cl.m { e'c''fis''' 0 0 0 x 0 0 1 }
---
## 8. MVP Additions
- GLILY parser (basic)
- LilyPond export
- SVG preview
---
## 9. Roadmap Extension
Phase 6:
- GLILY integration
Phase 7:
- GLINO ↔ GLILY mapping
Phase 8:
- dynamic score rendering
---
## 10. Key Principle
Sound and notation are co-generated.
---
