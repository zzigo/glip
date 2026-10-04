<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		parseMediaUrl,
		formatTime,
		PALETTE,
		VIEW_W,
		viewHeight,
		normalizeAnnotation,
		makeId,
		visibleShapes
	} from '$glip/glip-core.js';
	import { prepareOverlay, renderShapes } from '$glip/glip-overlay.js';
	import { createPlayer } from '$glip/glip-players.js';
	import type { MediaPlayer } from '$glip/glip-players.js';

	let { initialData = null, onSaved = (a: any) => {} } = $props<{
		initialData?: any;
		onSaved?: (a: any) => void;
	}>();

	// State
	let id = $state(initialData?.id || '');
	let mediaInput = $state(initialData?.source?.url || '');
	let title = $state(initialData?.title || '');
	let work = $state(initialData?.work || '');
	let composer = $state(initialData?.composer || '');
	let year = $state(initialData?.year ?? '');
	let performer = $state(initialData?.performer || '');
	let tagsString = $state((initialData?.tags || []).join(', '));
	let notes = $state(initialData?.notes || '');

	let source = $state<any>(
		initialData?.source || {
			provider: 'youtube',
			id: '',
			url: '',
			aspect: 16 / 9,
			duration: 0
		}
	);

	let clipIn = $state<number>(initialData?.clip?.in ?? 0);
	let clipOut = $state<number | null>(initialData?.clip?.out ?? null);

	let shapes = $state<any[]>(initialData?.shapes ? JSON.parse(JSON.stringify(initialData.shapes)) : []);
	let selectedShapeId = $state<string | null>(null);

	// Tool state
	type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'free' | 'text';
	let currentTool = $state<Tool>('select');
	let currentColor = $state(PALETTE[0]);
	let strokeWidth = $state(4);
	let fillEnabled = $state(false);

	// Player & timing state
	let playerContainer: HTMLElement | null = $state(null);
	let overlaySvg: SVGSVGElement | null = $state(null);
	let player: MediaPlayer | null = $state(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let isScrubbing = $state(false);
	let aspect = $derived(source.aspect || 16 / 9);

	// Drawing interaction state
	let isDrawing = $state(false);
	let drawStart = $state<[number, number] | null>(null);
	let draftShape = $state<any | null>(null);

	// Status & Save state
	let statusMsg = $state('');
	let statusKind = $state<'ok' | 'err' | 'saving' | ''>('');
	let showEmbedModal = $state(false);
	let embedCode = $state('');
	let copied = $state(false);

	// YouTube live search state
	let searchResults = $state<any[]>([]);
	let isSearching = $state(false);
	let showSearchDropdown = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	function handleMediaInputChange(val: string) {
		mediaInput = val;
		const trimmed = val.trim();

		// If it looks like a direct URL, don't search
		if (/^(https?:\/\/|www\.|youtu\.be|vimeo\.com)/i.test(trimmed)) {
			showSearchDropdown = false;
			searchResults = [];
			return;
		}

		if (trimmed.length < 2) {
			showSearchDropdown = false;
			searchResults = [];
			return;
		}

		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			isSearching = true;
			try {
				const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
				if (res.ok) {
					const data = await res.json();
					searchResults = data.items || [];
					showSearchDropdown = searchResults.length > 0;
				}
			} catch (e) {
				console.warn('YouTube search failed', e);
			} finally {
				isSearching = false;
			}
		}, 300);
	}

	function selectSearchResult(item: any) {
		mediaInput = `https://www.youtube.com/watch?v=${item.mediaId}`;
		if (!title || title.startsWith('Anotación YouTube')) {
			title = item.title;
		}
		showSearchDropdown = false;
		searchResults = [];
		loadMedia(mediaInput);
	}

	let rafId = 0;

	// Loop to update clock and SVG overlay
	function tick() {
		if (player) {
			if (!isScrubbing) {
				currentTime = player.time();
				const d = player.duration();
				if (d > 0 && d !== duration) duration = d;
				isPlaying = !player.paused();
			}

			// Respect clip loop if past clipOut
			if (clipOut != null && clipOut > clipIn && currentTime >= clipOut && isPlaying) {
				player.seek(clipIn);
				currentTime = clipIn;
			}

			// Render shapes onto SVG
			if (overlaySvg) {
				const active = visibleShapes(shapes, currentTime);
				// If draft exists, also include draft
				const toRender = draftShape ? [...active, draftShape] : active;
				renderShapes(overlaySvg, toRender, currentTime, aspect);
			}
		}
		if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
			rafId = requestAnimationFrame(tick);
		}
	}

	async function loadMedia(urlToLoad?: string) {
		const targetUrl = urlToLoad || mediaInput;
		if (!targetUrl.trim()) return;

		const parsed = parseMediaUrl(targetUrl);
		if (!parsed) {
			statusMsg = 'URL no soportada (usa YouTube, Vimeo o video .mp4/.webm)';
			statusKind = 'err';
			return;
		}

		if (player) {
			player.destroy();
			player = null;
		}

		source = {
			provider: parsed.provider,
			id: parsed.id,
			hash: (parsed as any).hash,
			url: parsed.url,
			aspect: source.aspect || 16 / 9,
			duration: source.duration || 0
		};

		if (!title && parsed.provider === 'youtube') {
			title = `Anotación YouTube ${parsed.id}`;
		}

		if (playerContainer) {
			try {
				playerContainer.innerHTML = '';
				statusMsg = 'Cargando reproductor...';
				statusKind = 'saving';
				player = await createPlayer(playerContainer, source, {
					start: clipIn || 0,
					onstate: (p) => {
						isPlaying = p;
					}
				});
				duration = player.duration() || 0;
				statusMsg = 'Video cargado';
				statusKind = 'ok';
				setTimeout(() => {
					statusMsg = '';
					statusKind = '';
				}, 2500);
			} catch (e: any) {
				statusMsg = 'Error al cargar video: ' + (e?.message || e);
				statusKind = 'err';
			}
		}
	}

	onMount(async () => {
		if (overlaySvg) prepareOverlay(overlaySvg, aspect);
		if (source?.url) {
			await loadMedia(source.url);
		}
		if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
			rafId = requestAnimationFrame(tick);
		}
	});

	onDestroy(() => {
		if (typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(rafId);
		}
		if (player) {
			player.destroy();
			player = null;
		}
	});

	$effect(() => {
		if (overlaySvg && aspect) {
			prepareOverlay(overlaySvg, aspect);
		}
	});

	function togglePlay() {
		if (!player) return;
		player.toggle();
		isPlaying = !player.paused();
	}

	function seekTo(t: number) {
		if (!player) return;
		const target = Math.max(0, Math.min(t, duration || 99999));
		player.seek(target);
		currentTime = target;
	}

	function setClipIn() {
		clipIn = Math.round(currentTime * 10) / 10;
		if (clipOut != null && clipOut <= clipIn) {
			clipOut = clipIn + 5;
		}
	}

	function setClipOut() {
		const out = Math.round(currentTime * 10) / 10;
		if (out > clipIn) {
			clipOut = out;
		}
	}

	function clearClip() {
		clipIn = 0;
		clipOut = null;
	}

	// Normalized pointer coords [0..1, 0..1/aspect]
	function getNormCoords(e: MouseEvent | TouchEvent): [number, number] | null {
		if (!overlaySvg) return null;
		const rect = overlaySvg.getBoundingClientRect();
		const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
		const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;

		const nx = (clientX - rect.left) / rect.width;
		const ny = (clientY - rect.top) / rect.height;
		return [Math.max(0, Math.min(nx, 1)), Math.max(0, Math.min(ny, 1))];
	}

	function handlePointerDown(e: MouseEvent) {
		if (currentTool === 'select') return;
		const pt = getNormCoords(e);
		if (!pt) return;

		isDrawing = true;
		drawStart = pt;

		const t0 = Math.round(currentTime * 10) / 10;
		const t1 = clipOut != null ? clipOut : t0 + 4;

		if (currentTool === 'text') {
			isDrawing = false;
			const input = prompt('Texto de la anotación:');
			if (input && input.trim()) {
				const newShape = {
					id: makeId(8),
					kind: 'text',
					text: input.trim(),
					x: Math.round(pt[0] * 1000) / 1000,
					y: Math.round(pt[1] * 1000) / 1000,
					size: 32,
					color: currentColor,
					width: strokeWidth,
					fill: fillEnabled,
					t0,
					t1
				};
				shapes = [...shapes, newShape];
				selectedShapeId = newShape.id;
			}
			return;
		}

		if (currentTool === 'free') {
			draftShape = {
				id: makeId(8),
				kind: 'free',
				pts: [[Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000]],
				color: currentColor,
				width: strokeWidth,
				t0,
				t1
			};
		} else {
			draftShape = {
				id: makeId(8),
				kind: currentTool,
				x: Math.round(pt[0] * 1000) / 1000,
				y: Math.round(pt[1] * 1000) / 1000,
				w: 0,
				h: 0,
				pts: [pt, pt],
				color: currentColor,
				width: strokeWidth,
				fill: fillEnabled,
				t0,
				t1
			};
		}
	}

	function handlePointerMove(e: MouseEvent) {
		if (!isDrawing || !drawStart || !draftShape) return;
		const pt = getNormCoords(e);
		if (!pt) return;

		if (currentTool === 'free') {
			draftShape.pts = [...draftShape.pts, [Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000]];
		} else if (currentTool === 'line' || currentTool === 'arrow') {
			draftShape.pts = [
				[Math.round(drawStart[0] * 1000) / 1000, Math.round(drawStart[1] * 1000) / 1000],
				[Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000]
			];
		} else if (currentTool === 'rect' || currentTool === 'ellipse') {
			const x0 = Math.min(drawStart[0], pt[0]);
			const y0 = Math.min(drawStart[1], pt[1]);
			const w = Math.abs(pt[0] - drawStart[0]);
			const h = Math.abs(pt[1] - drawStart[1]);
			draftShape.x = Math.round(x0 * 1000) / 1000;
			draftShape.y = Math.round(y0 * 1000) / 1000;
			draftShape.w = Math.round(w * 1000) / 1000;
			draftShape.h = Math.round(h * 1000) / 1000;
		}
	}

	function handlePointerUp() {
		if (!isDrawing) return;
		isDrawing = false;
		if (draftShape) {
			// Validate minimum size
			let valid = true;
			if (draftShape.kind === 'rect' || draftShape.kind === 'ellipse') {
				if (draftShape.w < 0.01 && draftShape.h < 0.01) valid = false;
			} else if (draftShape.kind === 'line' || draftShape.kind === 'arrow') {
				const dx = draftShape.pts[1][0] - draftShape.pts[0][0];
				const dy = draftShape.pts[1][1] - draftShape.pts[0][1];
				if (Math.hypot(dx, dy) < 0.01) valid = false;
			} else if (draftShape.kind === 'free') {
				if (draftShape.pts.length < 2) valid = false;
			}

			if (valid) {
				shapes = [...shapes, draftShape];
				selectedShapeId = draftShape.id;
			}
			draftShape = null;
		}
	}

	function selectShape(sId: string) {
		selectedShapeId = sId;
		const s = shapes.find((x) => x.id === sId);
		if (s) {
			seekTo(s.t0);
		}
	}

	function removeShape(sId: string) {
		shapes = shapes.filter((x) => x.id !== sId);
		if (selectedShapeId === sId) selectedShapeId = null;
	}

	let selectedShape = $derived(shapes.find((s) => s.id === selectedShapeId) || null);

	function updateSelectedShapeTime(field: 't0' | 't1') {
		if (!selectedShape) return;
		const t = Math.round(currentTime * 10) / 10;
		if (field === 't0') {
			selectedShape.t0 = t;
			if (selectedShape.t1 != null && selectedShape.t1 <= t) {
				selectedShape.t1 = t + 2;
			}
		} else {
			if (t > selectedShape.t0) {
				selectedShape.t1 = t;
			}
		}
		shapes = [...shapes];
	}

	async function save() {
		statusMsg = 'Guardando...';
		statusKind = 'saving';

		try {
			const tags = tagsString
				.split(',')
				.map((t: string) => t.trim().toLowerCase())
				.filter(Boolean);

			const payload = {
				id: id || undefined,
				title: title || work || 'Anotación sin título',
				work,
				composer,
				year: year ? Number(year) : null,
				tags,
				performer,
				notes,
				source: {
					...source,
					aspect: source.aspect || 16 / 9,
					duration: duration || source.duration || 0
				},
				clip: {
					in: clipIn,
					out: clipOut
				},
				shapes
			};

			const url = id ? `/api/annotations/${id}` : '/api/annotations';
			const method = id ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Error al guardar');
			}

			const saved = await res.json();
			id = saved.id;
			statusMsg = '¡Anotación guardada con éxito!';
			statusKind = 'ok';

			const origin = typeof window !== 'undefined' ? window.location.origin : '';
			embedCode = `<iframe src="${origin}/embed/${saved.id}" width="100%" height="480" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

			onSaved(saved);
		} catch (e: any) {
			statusMsg = e?.message || 'Error al guardar anotación';
			statusKind = 'err';
		}
	}

	function copyEmbed() {
		if (!embedCode) return;
		navigator.clipboard.writeText(embedCode);
		copied = true;
		setTimeout(() => (copied = false), 2500);
	}
</script>

<div class="annotator-shell">
	<!-- Top Bar -->
	<header class="anno-bar">
		<div class="anno-brand">
			<a href="/" class="back-link">← Volver</a>
			<strong>{id ? 'Editar anotación' : 'Nueva anotación'}</strong>
		</div>

		<div class="anno-actions">
			{#if statusMsg}
				<span class="status-pill status-{statusKind}">{statusMsg}</span>
			{/if}
			{#if id}
				<button type="button" class="btn btn-outline" onclick={() => (showEmbedModal = true)}>
					📋 Embeber
				</button>
				<a href="/embed/{id}" target="_blank" class="btn btn-outline">▶ Vista Embed</a>
			{/if}
			<button type="button" class="btn btn-primary" onclick={save}>
				💾 Guardar
			</button>
		</div>
	</header>

	<div class="anno-layout">
		<!-- Left: Video & Canvas Stage -->
		<section class="stage-section">
			<!-- Video loader input with live YouTube search -->
			<div class="media-input-bar">
				<div class="input-wrapper">
					<input
						type="text"
						placeholder="Pega link de YouTube o escribe para buscar video..."
						value={mediaInput}
						oninput={(e) => handleMediaInputChange((e.target as HTMLInputElement).value)}
						onkeydown={(e) => e.key === 'Enter' && loadMedia()}
						onfocus={() => { if (searchResults.length > 0) showSearchDropdown = true; }}
					/>
					{#if isSearching}
						<span class="search-spinner">⏳</span>
					{/if}

					<!-- Search preview dropdown -->
					{#if showSearchDropdown && searchResults.length > 0}
						<div class="search-dropdown">
							{#each searchResults as r}
								<button
									type="button"
									class="search-result-item"
									onclick={() => selectSearchResult(r)}
								>
									{#if r.thumbnailUrl}
										<img src={r.thumbnailUrl} alt="" class="result-thumb" />
									{/if}
									<div class="result-info">
										<strong class="result-title">{r.title}</strong>
										<span class="result-meta">
											{r.channelTitle} {#if r.publishedAt}· {r.publishedAt}{/if}
										</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<button type="button" class="btn btn-sm" onclick={() => loadMedia()}>Cargar video</button>
			</div>

			<!-- Video viewport + Drawing layer -->
			<div class="video-container" style="--aspect: {aspect};">
				<div class="player-mount" bind:this={playerContainer}>
					{#if !source?.url}
						<div class="empty-player">
							<span>Pega un enlace de YouTube o Vimeo para comenzar</span>
						</div>
					{/if}
				</div>

				<!-- SVG Overlay for annotations and drawing -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<svg
					class="overlay-svg"
					class:interactive={currentTool !== 'select'}
					bind:this={overlaySvg}
					onmousedown={handlePointerDown}
					onmousemove={handlePointerMove}
					onmouseup={handlePointerUp}
					aria-label="Capa de anotaciones"
				></svg>
			</div>

			<!-- Toolbar: Drawing Tools & Colors -->
			<div class="tools-bar">
				<div class="tool-group">
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'select'}
						title="Seleccionar y reproducir (Puntero)"
						onclick={() => (currentTool = 'select')}>↖ Ver</button
					>
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'rect'}
						title="Rectángulo"
						onclick={() => (currentTool = 'rect')}>▭ Rect</button
					>
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'ellipse'}
						title="Elipse / Círculo"
						onclick={() => (currentTool = 'ellipse')}>⬭ Círculo</button
					>
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'line'}
						title="Línea recta"
						onclick={() => (currentTool = 'line')}>╱ Línea</button
					>
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'arrow'}
						title="Flecha indicadora"
						onclick={() => (currentTool = 'arrow')}>↗ Flecha</button
					>
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'free'}
						title="Dibujo a mano alzada"
						onclick={() => (currentTool = 'free')}>✎ Libre</button
					>
					<button
						type="button"
						class="tool-btn"
						class:active={currentTool === 'text'}
						title="Añadir texto"
						onclick={() => (currentTool = 'text')}>T Texto</button
					>
				</div>

				<div class="palette-group">
					{#each PALETTE as col}
						<button
							type="button"
							class="color-dot"
							class:active={currentColor === col}
							style="background: {col}"
							aria-label="Color {col}"
							onclick={() => (currentColor = col)}
						></button>
					{/each}
				</div>

				<div class="stroke-group">
					<label class="stroke-label">
						Grosor:
						<select bind:value={strokeWidth}>
							<option value={2}>Fino (2px)</option>
							<option value={4}>Medio (4px)</option>
							<option value={8}>Grueso (8px)</option>
							<option value={14}>Marcador (14px)</option>
						</select>
					</label>

					<label class="fill-checkbox">
						<input type="checkbox" bind:checked={fillEnabled} />
						Relleno
					</label>
				</div>
			</div>

			<!-- Playback Scrubber & Clip Trim Controls -->
			<div class="controls-panel">
				<div class="transport-row">
					<button type="button" class="btn-play" onclick={togglePlay}>
						{isPlaying ? '⏸ Pausa' : '▶ Play'}
					</button>

					<button type="button" class="btn btn-xs" onclick={() => seekTo(currentTime - 2)}>-2s</button>
					<button type="button" class="btn btn-xs" onclick={() => seekTo(currentTime + 2)}>+2s</button>

					<span class="time-display">
						{formatTime(currentTime, true)} / {formatTime(duration)}
					</span>

					<div class="clip-actions">
						<button
							type="button"
							class="btn btn-xs"
							class:active={clipIn > 0}
							title="Establecer inicio del recorte en el momento actual"
							onclick={setClipIn}
						>
							[ Inicio ({formatTime(clipIn)})
						</button>
						<button
							type="button"
							class="btn btn-xs"
							class:active={clipOut != null}
							title="Establecer fin del recorte en el momento actual"
							onclick={setClipOut}
						>
							Fin ] ({clipOut != null ? formatTime(clipOut) : '∞'})
						</button>
						{#if clipIn > 0 || clipOut != null}
							<button type="button" class="btn btn-xs btn-link" onclick={clearClip}>×</button>
						{/if}
					</div>
				</div>

				<!-- Interactive Scrubber Bar with cues -->
				<div class="scrubber-wrapper">
					<!-- Range track -->
					<input
						type="range"
						class="scrubber-slider"
						min="0"
						max={duration || 100}
						step="0.05"
						value={currentTime}
						onmousedown={() => (isScrubbing = true)}
						onmouseup={() => (isScrubbing = false)}
						oninput={(e) => seekTo(Number((e.target as HTMLInputElement).value))}
					/>

					<!-- Cues indicators -->
					<div class="cues-layer">
						{#each shapes as s}
							{@const pct = duration > 0 ? (s.t0 / duration) * 100 : 0}
							<button
								type="button"
								class="cue-tick"
								class:selected={selectedShapeId === s.id}
								style="left: {pct}%; background: {s.color};"
								title="{s.kind} a {formatTime(s.t0)}"
								onclick={() => selectShape(s.id)}
							></button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Selected Shape Inspector -->
			{#if selectedShape}
				<div class="shape-inspector">
					<div class="inspector-header">
						<strong>Forma seleccionada: {selectedShape.kind}</strong>
						<button type="button" class="btn btn-xs btn-danger" onclick={() => removeShape(selectedShape.id)}>
							Eliminar forma
						</button>
					</div>

					<div class="inspector-controls">
						<div class="time-adjust">
							<span>Aparición (t0): <strong>{formatTime(selectedShape.t0, true)}</strong></span>
							<button type="button" class="btn btn-xs" onclick={() => updateSelectedShapeTime('t0')}>
								Fijar a actual ({formatTime(currentTime)})
							</button>
						</div>

						<div class="time-adjust">
							<span
								>Desaparición (t1): <strong
									>{selectedShape.t1 != null ? formatTime(selectedShape.t1, true) : 'Siempre'}</strong
								></span
							>
							<button type="button" class="btn btn-xs" onclick={() => updateSelectedShapeTime('t1')}>
								Fijar a actual ({formatTime(currentTime)})
							</button>
						</div>

						<div class="color-adjust">
							<span>Color:</span>
							<div class="mini-palette">
								{#each PALETTE.slice(0, 7) as col}
									<button
										type="button"
										class="color-dot-sm"
										class:active={selectedShape.color === col}
										style="background: {col}"
										onclick={() => {
											selectedShape.color = col;
											shapes = [...shapes];
										}}
									></button>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</section>

		<!-- Right: Metadata & Shapes Ledger -->
		<aside class="meta-section">
			<div class="meta-card">
				<h3>Metadatos de la Obra</h3>

				<div class="form-field">
					<label for="f-title">Título de la anotación</label>
					<input id="f-title" type="text" bind:value={title} placeholder="Ej: Análisis formal - Compás 1-16" />
				</div>

				<div class="form-grid">
					<div class="form-field">
						<label for="f-work">Obra</label>
						<input id="f-work" type="text" bind:value={work} placeholder="Ej: Sinfonía Nº 3 en Mi bemol" />
					</div>

					<div class="form-field">
						<label for="f-composer">Compositor / Autor</label>
						<input id="f-composer" type="text" bind:value={composer} placeholder="Ej: L. v. Beethoven" />
					</div>
				</div>

				<div class="form-grid">
					<div class="form-field">
						<label for="f-year">Año</label>
						<input id="f-year" type="number" bind:value={year} placeholder="Ej: 1804" />
					</div>

					<div class="form-field">
						<label for="f-performer">Intérprete / Ensamble</label>
						<input id="f-performer" type="text" bind:value={performer} placeholder="Ej: Orquesta de la Radio" />
					</div>
				</div>

				<div class="form-field">
					<label for="f-tags">Etiquetas (tags separadas por coma)</label>
					<input id="f-tags" type="text" bind:value={tagsString} placeholder="partitura, armonia, cuerdas, tempo" />
				</div>

				<div class="form-field">
					<label for="f-notes">Notas pedagógicas / Análisis</label>
					<textarea
						id="f-notes"
						rows="4"
						bind:value={notes}
						placeholder="Apuntes sobre la sobreimpresión, detalles a destacar en clase..."
					></textarea>
				</div>
			</div>

			<!-- Shapes Ledger -->
			<div class="shapes-card">
				<div class="shapes-header">
					<h4>Formas anotadas ({shapes.length})</h4>
				</div>

				{#if shapes.length === 0}
					<p class="empty-shapes">No hay marcas aún. Elige una herramienta y dibuja sobre el video.</p>
				{:else}
					<div class="shapes-list">
						{#each shapes as s}
							<div
								class="shape-item"
								class:selected={selectedShapeId === s.id}
								onclick={() => selectShape(s.id)}
								role="button"
								tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && selectShape(s.id)}
							>
								<span class="shape-badge" style="background: {s.color};"></span>
								<div class="shape-desc">
									<span class="shape-kind">{s.kind}</span>
									<span class="shape-timing">{formatTime(s.t0)} → {s.t1 != null ? formatTime(s.t1) : 'fin'}</span>
									{#if s.text}
										<small class="shape-txt">"{s.text}"</small>
									{/if}
								</div>
								<button
									type="button"
									class="btn-del"
									onclick={(e) => {
										e.stopPropagation();
										removeShape(s.id);
									}}>×</button
								>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</aside>
	</div>

	<!-- Modal: Embed Code -->
	{#if showEmbedModal}
		<div class="modal-backdrop" onclick={() => (showEmbedModal = false)}>
			<div class="modal-box" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<h3>Código para embeber anotación</h3>
					<button type="button" class="btn-close" onclick={() => (showEmbedModal = false)}>×</button>
				</div>
				<p class="modal-desc">
					Pega este iframe en tus notas de <strong>Obsidian</strong>, en blogs o en cualquier plataforma compatible con HTML:
				</p>
				<textarea class="embed-textarea" readonly rows="4" value={embedCode}></textarea>
				<div class="modal-actions">
					<button type="button" class="btn btn-primary" onclick={copyEmbed}>
						{copied ? '✓ ¡Copiado!' : 'Copiar IFrame'}
					</button>
					<button type="button" class="btn btn-outline" onclick={() => (showEmbedModal = false)}>Cerrar</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.annotator-shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #0d0f12;
		color: #e4e7eb;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		overflow: hidden;
	}

	.anno-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 18px;
		background: #14171d;
		border-bottom: 1px solid #232730;
		flex-shrink: 0;
	}

	.anno-brand {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.back-link {
		color: #9ba3af;
		text-decoration: none;
		font-size: 13px;
		transition: color 0.2s;
	}
	.back-link:hover {
		color: #fff;
	}

	.anno-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.status-pill {
		font-size: 11px;
		padding: 3px 8px;
		border-radius: 4px;
	}
	.status-ok {
		background: #004d26;
		color: #4ade80;
	}
	.status-err {
		background: #4a1515;
		color: #f87171;
	}
	.status-saving {
		background: #382c05;
		color: #facc15;
	}

	.anno-layout {
		display: grid;
		grid-template-columns: 1fr 380px;
		flex: 1;
		overflow: hidden;
	}

	@media (max-width: 960px) {
		.anno-layout {
			grid-template-columns: 1fr;
			overflow-y: auto;
		}
	}

	.stage-section {
		display: flex;
		flex-direction: column;
		padding: 16px;
		gap: 12px;
		overflow-y: auto;
		background: #0a0c0e;
	}

	.media-input-bar {
		display: flex;
		gap: 8px;
	}

	.input-wrapper {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}

	.input-wrapper input {
		width: 100%;
		background: #14171d;
		border: 1px solid #2a2f3b;
		color: #fff;
		padding: 8px 36px 8px 12px;
		border-radius: 6px;
		font-size: 13px;
	}
	.input-wrapper input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.search-spinner {
		position: absolute;
		right: 12px;
		font-size: 12px;
		pointer-events: none;
	}

	.search-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		background: #14171d;
		border: 1px solid #2a2f3b;
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
		max-height: 340px;
		overflow-y: auto;
		z-index: 50;
		display: flex;
		flex-direction: column;
	}

	.search-result-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: transparent;
		border: none;
		border-bottom: 1px solid #1e222b;
		color: #e4e7eb;
		text-align: left;
		cursor: pointer;
		width: 100%;
		transition: background 0.15s;
	}
	.search-result-item:last-child {
		border-bottom: none;
	}
	.search-result-item:hover {
		background: #1f2533;
	}

	.result-thumb {
		width: 64px;
		height: 40px;
		object-fit: cover;
		border-radius: 4px;
		background: #000;
		flex-shrink: 0;
	}

	.result-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow: hidden;
	}

	.result-title {
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-meta {
		font-size: 11px;
		color: #9ba3af;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.video-container {
		position: relative;
		width: 100%;
		aspect-ratio: var(--aspect, 16/9);
		background: #000;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
	}

	.player-mount {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.empty-player {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #555e6d;
		font-size: 14px;
	}

	.overlay-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.overlay-svg.interactive {
		pointer-events: auto;
		cursor: crosshair;
	}

	.tools-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: #14171d;
		padding: 8px 14px;
		border-radius: 6px;
		border: 1px solid #232730;
	}

	.tool-group {
		display: flex;
		gap: 4px;
	}

	.tool-btn {
		background: #1e222b;
		border: 1px solid #2c323f;
		color: #cfd5de;
		padding: 5px 10px;
		font-size: 12px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.tool-btn:hover {
		background: #282e3b;
		color: #fff;
	}
	.tool-btn.active {
		background: #2563eb;
		border-color: #3b82f6;
		color: #fff;
	}

	.palette-group {
		display: flex;
		gap: 6px;
	}

	.color-dot {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: transform 0.15s;
	}
	.color-dot:hover {
		transform: scale(1.15);
	}
	.color-dot.active {
		border-color: #fff;
		transform: scale(1.2);
	}

	.stroke-group {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
		color: #9ba3af;
	}

	.stroke-group select {
		background: #1e222b;
		border: 1px solid #2c323f;
		color: #fff;
		padding: 3px 6px;
		border-radius: 4px;
		font-size: 11px;
	}

	.controls-panel {
		background: #14171d;
		padding: 10px 14px;
		border-radius: 6px;
		border: 1px solid #232730;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.transport-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.btn-play {
		background: #2563eb;
		border: none;
		color: #fff;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: 4px;
		cursor: pointer;
	}

	.time-display {
		font-family: monospace;
		font-size: 12px;
		color: #cbd5e1;
		margin-left: 4px;
	}

	.clip-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.clip-actions .btn.active {
		background: #374151;
		color: #60a5fa;
		border-color: #60a5fa;
	}

	.scrubber-wrapper {
		position: relative;
		width: 100%;
		height: 22px;
		display: flex;
		align-items: center;
	}

	.scrubber-slider {
		width: 100%;
		accent-color: #3b82f6;
		cursor: pointer;
		z-index: 2;
	}

	.cues-layer {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 8px;
		margin-top: -4px;
		pointer-events: none;
		z-index: 3;
	}

	.cue-tick {
		position: absolute;
		width: 4px;
		height: 10px;
		margin-top: -1px;
		border-radius: 2px;
		border: 1px solid #000;
		pointer-events: auto;
		cursor: pointer;
		padding: 0;
	}
	.cue-tick.selected {
		transform: scale(1.4);
		border-color: #fff;
	}

	.shape-inspector {
		background: #14171d;
		border: 1px solid #3b82f6;
		border-radius: 6px;
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.inspector-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 13px;
	}

	.inspector-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px;
		font-size: 12px;
	}

	.time-adjust,
	.color-adjust {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.mini-palette {
		display: flex;
		gap: 4px;
	}

	.color-dot-sm {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid transparent;
		cursor: pointer;
	}
	.color-dot-sm.active {
		border-color: #fff;
	}

	.meta-section {
		background: #11141a;
		border-left: 1px solid #232730;
		padding: 16px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.meta-card,
	.shapes-card {
		background: #14171d;
		border: 1px solid #232730;
		border-radius: 6px;
		padding: 14px;
	}

	.meta-card h3,
	.shapes-card h4 {
		margin: 0 0 12px;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #9ba3af;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 10px;
	}

	.form-field label {
		font-size: 11px;
		color: #9ba3af;
	}

	.form-field input,
	.form-field textarea {
		background: #0d0f12;
		border: 1px solid #2a2f3b;
		color: #fff;
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 12px;
		font-family: inherit;
	}
	.form-field input:focus,
	.form-field textarea:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.shapes-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 280px;
		overflow-y: auto;
	}

	.shape-item {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #0d0f12;
		border: 1px solid #232730;
		padding: 6px 10px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
	}
	.shape-item:hover {
		border-color: #3b82f6;
	}
	.shape-item.selected {
		border-color: #3b82f6;
		background: #1a2233;
	}

	.shape-badge {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.shape-desc {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.shape-kind {
		font-weight: 600;
		text-transform: capitalize;
	}

	.shape-timing {
		font-size: 10px;
		color: #9ba3af;
		font-family: monospace;
	}

	.shape-txt {
		font-style: italic;
		color: #cbd5e1;
	}

	.btn-del {
		background: transparent;
		border: none;
		color: #ef4444;
		font-size: 16px;
		cursor: pointer;
		padding: 0 4px;
	}

	.empty-shapes {
		color: #64748b;
		font-size: 12px;
		font-style: italic;
	}

	/* Buttons & Modals */
	.btn {
		font-size: 12px;
		padding: 6px 12px;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
		border: none;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.btn-sm {
		padding: 4px 10px;
		font-size: 11px;
	}
	.btn-xs {
		padding: 3px 8px;
		font-size: 11px;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}
	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-outline {
		background: transparent;
		border: 1px solid #374151;
		color: #d1d5db;
	}
	.btn-outline:hover {
		border-color: #6b7280;
		color: #fff;
	}

	.btn-danger {
		background: #dc2626;
		color: #fff;
	}

	.btn-link {
		background: transparent;
		color: #9ca3af;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal-box {
		background: #14171d;
		border: 1px solid #2a2f3b;
		border-radius: 8px;
		padding: 20px;
		width: 90%;
		max-width: 540px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}
	.modal-header h3 {
		margin: 0;
		font-size: 16px;
	}

	.btn-close {
		background: transparent;
		border: none;
		color: #9ca3af;
		font-size: 20px;
		cursor: pointer;
	}

	.modal-desc {
		font-size: 13px;
		color: #9ca3af;
		margin-bottom: 12px;
		line-height: 1.4;
	}

	.embed-textarea {
		width: 100%;
		background: #0a0c0e;
		border: 1px solid #2a2f3b;
		color: #4ade80;
		font-family: monospace;
		font-size: 12px;
		padding: 10px;
		border-radius: 4px;
		box-sizing: border-box;
		resize: none;
		margin-bottom: 16px;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
</style>
