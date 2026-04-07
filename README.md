# glip (Speculative Organology Model)

Repositorio central del sistema **GLIP**, la capa operativa del modelo **SOM**.

## Última Actualización: 2026-04-07

### Sesión de Hoy
- **GLINO (Unificado)**: Fusión de síntesis (SYNO) y composición corpus-based (OPS). El corpus ahora es el instrumento.
- **GLILY (Inscripción)**: Implementación de la capa simbólica para notación y glyphs.
- **TEXT2SVG**: Generador funcional de glyphs vectoriales en `apps/glily/parser.ts` usando Node.js y RobotoMono.
- **Estructura TAE**: Integración formal de Audio + Embedding + Descriptors + Symbol + Metadata.

## Documentación
- `docs/01-glip.md`: Conceptos base.
- `docs/02-glino.md`: Lenguaje operativo de sonido.
- `docs/03-glily.md`: Capa de inscripción y notación.
- `docs/session-2026-04-07.md`: Resumen detallado de los cambios de hoy.

## Apps
- `api/`: Servicio Rust (Qdrant + OPS).
- `frontend/`: Interfaz SvelteKit (WebAudio + WebGL).
- `glily/`: Parser de glyphs y notación.
- `indexer/`: Segmentación y análisis librosa.
