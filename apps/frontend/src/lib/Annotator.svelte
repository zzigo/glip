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
		visibleShapes,
		shapeBBox,
		hitTest,
		translateShape,
		watchUrl
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
	// Tool state
	type Tool = 'select' | 'rect' | 'ellipse' | 'triangle' | 'hairpin' | 'line' | 'arrow' | 'serpentine' | 'free' | 'text' | 'tag';
	let currentTool = $state<Tool>('select');
	let currentColor = $state(PALETTE[0]);
	let strokeWidth = $state(4);
	let fillEnabled = $state(false);
	let currentOpacity = $state(1); // 1 or 0.5
	let serpentineWaves = $state(8); // alt changes while drawing or setting

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
				renderShapes(overlaySvg, toRender, aspect, { selectedId: selectedShapeId });
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

	function handleKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

		// Spacebar = toggle play (when not typing in an input)
		if (e.key === ' ' && !isInput) {
			e.preventDefault();
			togglePlay();
			return;
		}

		// 0 = rewind to fragment start (clipIn)
		if (e.key === '0' && !isInput) {
			e.preventDefault();
			seekTo(clipIn || 0);
			return;
		}

		// Backspace or Delete on selected shape = delete shape without confirmation
		if ((e.key === 'Backspace' || e.key === 'Delete') && !isInput && selectedShapeId) {
			e.preventDefault();
			removeShape(selectedShapeId);
			return;
		}

		// Tool shortcuts
		if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const key = e.key.toLowerCase();
			if (key === 'v') currentTool = 'select';
			else if (key === 'r') currentTool = 'rect';
			else if (key === 'o') currentTool = 'ellipse';
			else if (key === 'l') currentTool = 'line';
			else if (key === 'a') currentTool = 'arrow';
			else if (key === 'd') currentTool = 'free';
			else if (key === 't') currentTool = 'text';
		}
	}

	onMount(async () => {
		window.addEventListener('keydown', handleKeyDown);
		if (overlaySvg) prepareOverlay(overlaySvg, aspect);
		if (source?.url) {
			await loadMedia(source.url);
		}
		if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
			rafId = requestAnimationFrame(tick);
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeyDown);
		}
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

	// Normalized pointer coords [0..1, 0..1]
	function getNormCoords(e: MouseEvent | TouchEvent): [number, number] | null {
		if (!overlaySvg) return null;
		const rect = overlaySvg.getBoundingClientRect();
		const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
		const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : (e as MouseEvent).clientY;

		if (rect.width <= 0 || rect.height <= 0) return null;
		const nx = (clientX - rect.left) / rect.width;
		const ny = (clientY - rect.top) / rect.height;
		return [Math.max(0, Math.min(nx, 1)), Math.max(0, Math.min(ny, 1))];
	}

	// Dragging & Resizing state for selected shape
	type HandleMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'p0' | 'p1' | 'rotate' | 'clipIn' | 'clipOut';
	let dragState = $state<{
		mode: HandleMode;
		startPt: [number, number];
		shapeOrig: any;
		center?: [number, number];
	} | null>(null);

	function startHandleDrag(e: MouseEvent, mode: HandleMode) {
		e.stopPropagation();
		e.preventDefault();
		const pt = getNormCoords(e);
		if (!pt || !selectedShape) return;

		let center: [number, number] | undefined;
		if (mode === 'rotate') {
			const [x0, y0, x1, y1] = shapeBBox(selectedShape, aspect);
			center = [(x0 + x1) / 2, (y0 + y1) / 2];
		}

		dragState = {
			mode,
			startPt: pt,
			shapeOrig: JSON.parse(JSON.stringify(selectedShape)),
			center
		};
	}

	function handlePointerDown(e: MouseEvent) {
		const pt = getNormCoords(e);
		if (!pt) return;

		if (currentTool === 'select') {
			// Test if clicked on visible shape
			const hit = hitTest(shapes, currentTime, pt[0], pt[1], aspect, 0.02);
			if (hit) {
				selectedShapeId = hit.id;
				dragState = {
					mode: 'move',
					startPt: pt,
					shapeOrig: JSON.parse(JSON.stringify(hit))
				};
			} else {
				selectedShapeId = null;
			}
			return;
		}

		isDrawing = true;
		drawStart = pt;

		const t0 = Math.round(currentTime * 10) / 10;
		const t1 = clipOut != null ? clipOut : t0 + 4;

		if (currentTool === 'tag') {
			isDrawing = false;
			const input = prompt('Texto o etiqueta temporal:', 'Sección A');
			if (input && input.trim()) {
				const tagText = input.trim();
				const newShape = {
					id: makeId(8),
					kind: 'tag',
					text: tagText,
					x: Math.round(pt[0] * 1000) / 1000,
					y: Math.round(pt[1] * 1000) / 1000,
					w: 0.12,
					h: 0.04,
					color: currentColor,
					opacity: currentOpacity,
					width: strokeWidth,
					fill: true,
					t0,
					t1
				};
				shapes = [...shapes, newShape];
				selectedShapeId = newShape.id;

				// Append to metadata tags if not already present
				const existingTags = tagsString.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean);
				const cleanTag = tagText.toLowerCase();
				if (!existingTags.includes(cleanTag)) {
					tagsString = existingTags.length ? `${tagsString}, ${cleanTag}` : cleanTag;
				}
			}
			return;
		}

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
					opacity: currentOpacity,
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
				opacity: currentOpacity,
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
				opacity: currentOpacity,
				width: strokeWidth,
				fill: fillEnabled,
				waves: serpentineWaves,
				t0,
				t1
			};
		}
	}

	function handlePointerMove(e: MouseEvent) {
		const pt = getNormCoords(e);
		if (!pt) return;

		// 1. Moving, resizing, or rotating an existing shape
		if (dragState && selectedShape) {
			const orig = dragState.shapeOrig;

			if (dragState.mode === 'rotate' && dragState.center) {
				const cx = dragState.center[0];
				const cy = dragState.center[1];
				const origAngle = Math.atan2(dragState.startPt[1] - cy, (dragState.startPt[0] - cx) * aspect);
				const currentAngle = Math.atan2(pt[1] - cy, (pt[0] - cx) * aspect);
				let deg = (orig.rotation || 0) + ((currentAngle - origAngle) * 180) / Math.PI;

				// Shift-snap rotation to 45 degree increments
				if (e.shiftKey) {
					deg = Math.round(deg / 45) * 45;
				}
				selectedShape.rotation = Math.round(deg * 10) / 10;
				shapes = [...shapes];
				return;
			}

			const dx = pt[0] - dragState.startPt[0];
			const dy = pt[1] - dragState.startPt[1];

			if (dragState.mode === 'move') {
				let finalDx = dx;
				let finalDy = dy;
				if (e.shiftKey) {
					// Snap translation to horizontal, vertical or 45 degrees
					if (Math.abs(finalDx) > Math.abs(finalDy) * 2) finalDy = 0;
					else if (Math.abs(finalDy) > Math.abs(finalDx) * 2) finalDx = 0;
					else {
						const signY = Math.sign(finalDy) || 1;
						finalDy = (Math.abs(finalDx) * signY) / aspect;
					}
				}
				const moved = translateShape(orig, finalDx, finalDy);
				Object.assign(selectedShape, moved);
				shapes = [...shapes];
			} else if (dragState.mode === 'p0' && (selectedShape.kind === 'line' || selectedShape.kind === 'arrow')) {
				let nx = orig.pts[0][0] + dx;
				let ny = orig.pts[0][1] + dy;
				if (e.shiftKey) {
					// Snap relative to p1
					const p1 = orig.pts[1];
					const sx = nx - p1[0];
					const sy = (ny - p1[1]) * aspect;
					const ang = Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
					const dist = Math.hypot(sx, sy);
					nx = p1[0] + dist * Math.cos(ang);
					ny = p1[1] + (dist * Math.sin(ang)) / aspect;
				}
				selectedShape.pts = [
					[Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000],
					orig.pts[1]
				];
				shapes = [...shapes];
			} else if (dragState.mode === 'p1' && (selectedShape.kind === 'line' || selectedShape.kind === 'arrow')) {
				let nx = orig.pts[1][0] + dx;
				let ny = orig.pts[1][1] + dy;
				if (e.shiftKey) {
					// Snap relative to p0
					const p0 = orig.pts[0];
					const sx = nx - p0[0];
					const sy = (ny - p0[1]) * aspect;
					const ang = Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
					const dist = Math.hypot(sx, sy);
					nx = p0[0] + dist * Math.cos(ang);
					ny = p0[1] + (dist * Math.sin(ang)) / aspect;
				}
				selectedShape.pts = [
					orig.pts[0],
					[Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000]
				];
				shapes = [...shapes];
			} else {
				let ox = orig.x || 0;
				let oy = orig.y || 0;
				let ow = orig.w || 0;
				let oh = orig.h || 0;

				if (dragState.mode === 'se') {
					let newW = Math.max(0.01, ow + dx);
					let newH = Math.max(0.01, oh + dy);
					if (e.shiftKey) newH = (newW * aspect);
					selectedShape.w = Math.round(newW * 1000) / 1000;
					selectedShape.h = Math.round(newH * 1000) / 1000;
				} else if (dragState.mode === 'sw') {
					const newW = Math.max(0.01, ow - dx);
					let newH = Math.max(0.01, oh + dy);
					if (e.shiftKey) newH = (newW * aspect);
					selectedShape.x = Math.round((ox + (ow - newW)) * 1000) / 1000;
					selectedShape.w = Math.round(newW * 1000) / 1000;
					selectedShape.h = Math.round(newH * 1000) / 1000;
				} else if (dragState.mode === 'ne') {
					let newW = Math.max(0.01, ow + dx);
					let newH = Math.max(0.01, oh - dy);
					if (e.shiftKey) newH = (newW * aspect);
					selectedShape.y = Math.round((oy + (oh - newH)) * 1000) / 1000;
					selectedShape.w = Math.round(newW * 1000) / 1000;
					selectedShape.h = Math.round(newH * 1000) / 1000;
				} else if (dragState.mode === 'nw') {
					let newW = Math.max(0.01, ow - dx);
					let newH = Math.max(0.01, oh - dy);
					if (e.shiftKey) newH = (newW * aspect);
					selectedShape.x = Math.round((ox + (ow - newW)) * 1000) / 1000;
					selectedShape.y = Math.round((oy + (oh - newH)) * 1000) / 1000;
					selectedShape.w = Math.round(newW * 1000) / 1000;
					selectedShape.h = Math.round(newH * 1000) / 1000;
				}
				shapes = [...shapes];
			}
			return;
		}

		// 2. Drawing a new shape
		if (!isDrawing || !drawStart || !draftShape) return;

		// Dynamic serpentine wave control with Alt + drag or wheel
		if (draftShape.kind === 'serpentine' && e.altKey) {
			const waveFactor = Math.round(Math.max(1, Math.min(40, Math.abs(pt[0] - drawStart[0]) * 100)));
			draftShape.waves = waveFactor;
			serpentineWaves = waveFactor;
		}

		if (currentTool === 'free') {
			draftShape.pts = [...draftShape.pts, [Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000]];
		} else if (currentTool === 'line' || currentTool === 'arrow') {
			let endPt = pt;
			if (e.shiftKey) {
				// Snap line/arrow to 0, 45, 90, 135, 180 degrees
				const dx = pt[0] - drawStart[0];
				const dy = (pt[1] - drawStart[1]) * aspect;
				const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
				const dist = Math.hypot(dx, dy);
				endPt = [
					drawStart[0] + dist * Math.cos(ang),
					drawStart[1] + (dist * Math.sin(ang)) / aspect
				];
			}
			draftShape.pts = [
				[Math.round(drawStart[0] * 1000) / 1000, Math.round(drawStart[1] * 1000) / 1000],
				[Math.round(endPt[0] * 1000) / 1000, Math.round(endPt[1] * 1000) / 1000]
			];
		} else {
			let x0 = Math.min(drawStart[0], pt[0]);
			let y0 = Math.min(drawStart[1], pt[1]);
			let w = Math.abs(pt[0] - drawStart[0]);
			let h = Math.abs(pt[1] - drawStart[1]);

			if (e.shiftKey) {
				// 1:1 square/circle aspect ratio snap
				const maxSide = Math.max(w, h / aspect);
				w = maxSide;
				h = maxSide * aspect;
				if (pt[0] < drawStart[0]) x0 = drawStart[0] - w;
				if (pt[1] < drawStart[1]) y0 = drawStart[1] - h;
			}

			draftShape.x = Math.round(x0 * 1000) / 1000;
			draftShape.y = Math.round(y0 * 1000) / 1000;
			draftShape.w = Math.round(w * 1000) / 1000;
			draftShape.h = Math.round(h * 1000) / 1000;
		}
	}

	function handlePointerUp() {
		if (dragState) {
			dragState = null;
		}

		if (!isDrawing) return;
		isDrawing = false;
		if (draftShape) {
			// Validate minimum size
			let valid = true;
			if (draftShape.kind === 'rect' || draftShape.kind === 'ellipse' || draftShape.kind === 'triangle' || draftShape.kind === 'hairpin' || draftShape.kind === 'serpentine' || draftShape.kind === 'tag') {
				if (draftShape.w < 0.005 && draftShape.h < 0.005) valid = false;
			} else if (draftShape.kind === 'line' || draftShape.kind === 'arrow') {
				const dx = draftShape.pts[1][0] - draftShape.pts[0][0];
				const dy = draftShape.pts[1][1] - draftShape.pts[0][1];
				if (Math.hypot(dx, dy) < 0.005) valid = false;
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

	// Calculated BBox and gizmo coordinates for selected shape
	let selectedBBox = $derived.by(() => {
		if (!selectedShape) return null;
		const [x0, y0, x1, y1] = shapeBBox(selectedShape, aspect);
		const H = viewHeight(aspect);
		return {
			x: x0 * VIEW_W,
			y: y0 * H,
			w: (x1 - x0) * VIEW_W,
			h: (y1 - y0) * H,
			cx: ((x0 + x1) / 2) * VIEW_W,
			cy: ((y0 + y1) / 2) * H,
			x0: x0 * VIEW_W,
			y0: y0 * H,
			x1: x1 * VIEW_W,
			y1: y1 * H
		};
	});

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

	function setShapeDurationToClip(sId: string) {
		const s = shapes.find((x) => x.id === sId);
		if (!s) return;
		s.t0 = clipIn || 0;
		s.t1 = clipOut != null ? clipOut : (duration > 0 ? duration : null);
		shapes = [...shapes];
		statusMsg = 'Forma ajustada a la duración total del fragmento';
		statusKind = 'ok';
		setTimeout(() => { statusMsg = ''; statusKind = ''; }, 2000);
	}

	function duplicateAnnotation() {
		// Create a clone without ID so save() generates a fresh copy
		id = '';
		title = title ? `${title} (copia)` : 'Anotación (copia)';
		statusMsg = 'Copia creada en el editor. Haz clic en Guardar para registrar la nueva anotación.';
		statusKind = 'ok';
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
			embedCode = `<iframe src="${origin}/embed/${saved.id}" width="100%" height="360" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

			onSaved(saved);
		} catch (e: any) {
			statusMsg = e?.message || 'Error al guardar anotación';
			statusKind = 'err';
		}
	}

	function copyEmbed() {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		const targetId = id || initialData?.id;
		const code = embedCode || (targetId ? `<iframe src="${origin}/embed/${targetId}" width="100%" height="360" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` : '');
		if (!code) return;
		navigator.clipboard.writeText(code);
		copied = true;
		statusMsg = '¡Código iframe copiado al portapapeles!';
		statusKind = 'ok';
		setTimeout(() => {
			copied = false;
			statusMsg = '';
			statusKind = '';
		}, 2500);
	}
</script>

<div class="annotator-shell">
	<!-- Top Bar -->
	<header class="anno-bar">
		<div class="anno-brand">
			<a href="/" class="back-link" title="Volver al catálogo principal">← Volver</a>
			<strong>{id ? 'Editar anotación' : 'Nueva anotación'}</strong>
		</div>

		<div class="anno-actions">
			{#if statusMsg}
				<span class="status-pill status-{statusKind}">{statusMsg}</span>
			{/if}
			{#if source?.url}
				<a
					href={watchUrl(source, currentTime)}
					target="_blank"
					rel="noreferrer"
					class="btn btn-outline"
					title="Abrir video original en una pestaña nueva"
					aria-label="Abrir video original"
				>
					↗ Video original
				</a>
			{/if}
			{#if id}
				<button type="button" class="btn btn-outline" onclick={duplicateAnnotation} title="Duplicar esta anotación para reutilizar metadatos y fuente en otro fragmento">
					📑 Duplicar
				</button>
				<button type="button" class="btn btn-outline" onclick={copyEmbed} title="Copiar código iframe directamente (altura 360)">
					{copied ? '✓ Copiado' : '📋 Copiar iframe'}
				</button>
				<button type="button" class="btn btn-outline" onclick={() => {
					const origin = typeof window !== 'undefined' ? window.location.origin : '';
					if (!embedCode && id) {
						embedCode = `<iframe src="${origin}/embed/${id}" width="100%" height="360" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
					}
					showEmbedModal = true;
				}} title="Ver código embed">
					&lt;/&gt; Ver Embed
				</button>
				<a href="/embed/{id}" target="_blank" class="btn btn-outline" title="Abrir vista embed limpia">▶ Vista Embed</a>
			{/if}
			<button type="button" class="btn btn-primary" onclick={save} title="Guardar cambios">
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
					class:pointer-select={currentTool === 'select'}
					bind:this={overlaySvg}
					onmousedown={handlePointerDown}
					onmousemove={handlePointerMove}
					onmouseup={handlePointerUp}
					aria-label="Capa de anotaciones"
				>
					<!-- Gizmo handles rendered directly on top of active shapes -->
					{#if selectedShape && selectedBBox}
						{@const box = selectedBBox}
						{@const H = viewHeight(aspect)}
						{@const rot = selectedShape.rotation || 0}
						<g class="gizmo-layer" transform={rot ? `rotate(${rot} ${box.cx} ${box.cy})` : undefined}>
							<!-- Bounding box highlight with move cursor -->
							<rect
								x={box.x - 4}
								y={box.y - 4}
								width={box.w + 8}
								height={box.h + 8}
								class="gizmo-frame"
								onmousedown={(e) => startHandleDrag(e, 'move')}
							/>

							<!-- Rotation handle (top center stalk with rotation knob) -->
							<line
								x1={box.cx}
								y1={box.y - 4}
								x2={box.cx}
								y2={box.y - 24}
								class="gizmo-rot-stem"
							/>
							<circle
								cx={box.cx}
								cy={box.y - 24}
								r={7}
								class="gizmo-handle handle-rotate"
								role="button"
								tabindex={0}
								aria-label="Arrastra para rotar"
								onmousedown={(e) => startHandleDrag(e, 'rotate')}
							>
								<title>Arrastra para rotar (Mantén Shift para saltar de 45° en 45°)</title>
							</circle>

							{#if selectedShape.kind === 'rect' || selectedShape.kind === 'ellipse' || selectedShape.kind === 'triangle' || selectedShape.kind === 'hairpin' || selectedShape.kind === 'serpentine' || selectedShape.kind === 'tag'}
								<!-- 4 corner handles -->
								<rect
									x={box.x - 7}
									y={box.y - 7}
									width={14}
									height={14}
									class="gizmo-handle handle-nw"
									onmousedown={(e) => startHandleDrag(e, 'nw')}
								/>
								<rect
									x={box.x + box.w - 7}
									y={box.y - 7}
									width={14}
									height={14}
									class="gizmo-handle handle-ne"
									onmousedown={(e) => startHandleDrag(e, 'ne')}
								/>
								<rect
									x={box.x + box.w - 7}
									y={box.y + box.h - 7}
									width={14}
									height={14}
									class="gizmo-handle handle-se"
									onmousedown={(e) => startHandleDrag(e, 'se')}
								/>
								<rect
									x={box.x - 7}
									y={box.y + box.h - 7}
									width={14}
									height={14}
									class="gizmo-handle handle-sw"
									onmousedown={(e) => startHandleDrag(e, 'sw')}
								/>
							{:else if (selectedShape.kind === 'line' || selectedShape.kind === 'arrow') && selectedShape.pts}
								<!-- End-point handles for lines and arrows -->
								{@const p0 = [selectedShape.pts[0][0] * VIEW_W, selectedShape.pts[0][1] * H]}
								{@const p1 = [selectedShape.pts[1][0] * VIEW_W, selectedShape.pts[1][1] * H]}
								<circle
									cx={p0[0]}
									cy={p0[1]}
									r={8}
									class="gizmo-handle handle-point"
									onmousedown={(e) => startHandleDrag(e, 'p0')}
								/>
								<circle
									cx={p1[0]}
									cy={p1[1]}
									r={8}
									class="gizmo-handle handle-point"
									onmousedown={(e) => startHandleDrag(e, 'p1')}
								/>
							{:else}
								<!-- Center move handle for free drawing and text -->
								<circle
									cx={box.cx}
									cy={box.cy}
									r={9}
									class="gizmo-handle handle-move"
									onmousedown={(e) => startHandleDrag(e, 'move')}
								/>
							{/if}
						</g>
					{/if}
				</svg>
			</div>

			<!-- Toolbar: Icon-Only Drawing Tools, Color Palette & Opacity -->
			<div class="tools-bar">
				<div class="tool-group">
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'select'}
						title="Seleccionar y transformar (V)"
						aria-label="Seleccionar (V)"
						onclick={() => (currentTool = 'select')}>↖</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'rect'}
						title="Rectángulo (R) · Shift: cuadrado"
						aria-label="Rectángulo (R)"
						onclick={() => (currentTool = 'rect')}>▭</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'ellipse'}
						title="Círculo / Elipse (O) · Shift: circular"
						aria-label="Círculo / Elipse (O)"
						onclick={() => (currentTool = 'ellipse')}>⬭</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'triangle'}
						title="Triángulo (cerrado con base)"
						aria-label="Triángulo"
						onclick={() => (currentTool = 'triangle')}>△</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'hairpin'}
						title="Regulador / Hairpin dinámico (triángulo abierto sin base)"
						aria-label="Regulador dinámico"
						onclick={() => (currentTool = 'hairpin')}>⋖</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'line'}
						title="Línea recta (L) · Shift: 45°/90°"
						aria-label="Línea recta (L)"
						onclick={() => (currentTool = 'line')}>╱</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'arrow'}
						title="Flecha indicadora (A) · Shift: 45°/90°"
						aria-label="Flecha indicadora (A)"
						onclick={() => (currentTool = 'arrow')}>↗</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'serpentine'}
						title="Línea serpentina / ondulada (Alt al dibujar: ajusta ondas de 1 a 40)"
						aria-label="Línea serpentina"
						onclick={() => (currentTool = 'serpentine')}>〰</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'free'}
						title="Dibujo a mano alzada (D)"
						aria-label="Dibujo libre (D)"
						onclick={() => (currentTool = 'free')}>✎</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'text'}
						title="Texto (T)"
						aria-label="Texto (T)"
						onclick={() => (currentTool = 'text')}>T</button
					>
					<button
						type="button"
						class="tool-btn icon-only"
						class:active={currentTool === 'tag'}
						title="Etiqueta temporal (Tag de fragmento que se refleja en metadatos)"
						aria-label="Etiqueta temporal"
						onclick={() => (currentTool = 'tag')}>🏷</button
					>
				</div>

				<div class="palette-container">
					<div class="palette-group">
						{#each PALETTE as col}
							<button
								type="button"
								class="color-dot"
								class:active={currentColor === col}
								style="background: {col}"
								title="Color {col}"
								aria-label="Color {col}"
								onclick={() => (currentColor = col)}
							></button>
						{/each}
					</div>
					<div class="opacity-row">
						<button
							type="button"
							class="btn-opacity"
							class:active={currentOpacity === 0.5}
							title="Alternar transparencia 50% para formas nuevas o seleccionadas"
							onclick={() => {
								currentOpacity = currentOpacity === 0.5 ? 1 : 0.5;
								if (selectedShape) {
									selectedShape.opacity = currentOpacity;
									shapes = [...shapes];
								}
							}}
						>
							Transparencia 50% {currentOpacity === 0.5 ? '✓' : ''}
						</button>
					</div>
				</div>

				<div class="stroke-group">
					<label class="stroke-label" title="Grosor de trazo en píxeles">
						Grosor:
						<select bind:value={strokeWidth}>
							<option value={2}>2px</option>
							<option value={4}>4px</option>
							<option value={8}>8px</option>
							<option value={14}>14px</option>
						</select>
					</label>

					<label class="fill-checkbox" title="Rellenar figuras cerradas">
						<input type="checkbox" bind:checked={fillEnabled} />
						Relleno
					</label>
				</div>
			</div>

			<!-- Playback Scrubber & Clip Trim Controls -->
			<div class="controls-panel">
				<div class="transport-row">
					<button type="button" class="btn-play" onclick={togglePlay} title="Reproducir / Pausar (Espacio)">
						{isPlaying ? '⏸ Pausa' : '▶ Play'}
					</button>

					<button type="button" class="btn btn-xs" onclick={() => seekTo(clipIn || 0)} title="Rebobinar al inicio del fragmento (0)">|◀ 0</button>
					<button type="button" class="btn btn-xs" onclick={() => seekTo(currentTime - 2)} title="Retroceder 2 segundos">-2s</button>
					<button type="button" class="btn btn-xs" onclick={() => seekTo(currentTime + 2)} title="Avanzar 2 segundos">+2s</button>

					<span class="time-display">
						{formatTime(currentTime, true)} / {formatTime(duration)}
					</span>

					<div class="clip-actions">
						<div class="clip-time-field">
							<span class="clip-lbl">In:</span>
							<input
								type="number"
								step="0.1"
								min="0"
								class="clip-num-input"
								value={clipIn}
								title="Segundo de inicio del fragmento (editable)"
								oninput={(e) => {
									const v = Number((e.target as HTMLInputElement).value);
									if (Number.isFinite(v) && v >= 0) clipIn = v;
								}}
							/>
							<button
								type="button"
								class="btn-icon-fix"
								title="Fijar inicio del recorte en el momento actual"
								onclick={setClipIn}
							>
								📍
							</button>
						</div>

						<div class="clip-time-field">
							<span class="clip-lbl">Out:</span>
							<input
								type="number"
								step="0.1"
								min="0"
								class="clip-num-input"
								value={clipOut ?? ''}
								placeholder="∞"
								title="Segundo de fin del fragmento (editable)"
								oninput={(e) => {
									const val = (e.target as HTMLInputElement).value;
									clipOut = val === '' ? null : Number(val);
								}}
							/>
							<button
								type="button"
								class="btn-icon-fix"
								title="Fijar fin del recorte en el momento actual"
								onclick={setClipOut}
							>
								📍
							</button>
						</div>

						{#if clipIn > 0 || clipOut != null}
							<button type="button" class="btn btn-xs btn-link" title="Limpiar recorte" onclick={clearClip}>×</button>
						{/if}
					</div>
				</div>

				<!-- Interactive Scrubber Bar with cues and draggable clip handles -->
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

					<!-- Fragment In indicator (Green vertical handle, draggable via slider input) -->
					{#if duration > 0 && clipIn > 0}
						<div
							class="clip-marker marker-in"
							style="left: {(clipIn / duration) * 100}%;"
							title="Inicio de fragmento ({formatTime(clipIn)})"
						>
							<span class="marker-tip">IN</span>
						</div>
					{/if}

					<!-- Fragment Out indicator (Red vertical handle) -->
					{#if duration > 0 && clipOut != null}
						<div
							class="clip-marker marker-out"
							style="left: {(clipOut / duration) * 100}%;"
							title="Fin de fragmento ({formatTime(clipOut)})"
						>
							<span class="marker-tip">OUT</span>
						</div>
					{/if}

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
						<strong>Forma: {selectedShape.kind}</strong>
						<div class="inspector-actions">
							<button
								type="button"
								class="btn btn-xs btn-outline"
								title="Hacer que la forma dure la longitud total del fragmento"
								onclick={() => setShapeDurationToClip(selectedShape.id)}
							>
								⏱ Duración total
							</button>
							<button type="button" class="btn btn-xs btn-danger" title="Eliminar forma (Backspace)" onclick={() => removeShape(selectedShape.id)}>
								✕ Eliminar
							</button>
						</div>
					</div>

					<div class="inspector-controls">
						<div class="time-adjust">
							<span>t0:</span>
							<input
								type="number"
								step="0.1"
								min="0"
								class="inline-time-input"
								bind:value={selectedShape.t0}
								title="Segundo de aparición (editable)"
							/>
							<button
								type="button"
								class="btn-icon-fix"
								title="Fijar aparición al momento actual"
								onclick={() => updateSelectedShapeTime('t0')}
							>
								📍
							</button>
						</div>

						<div class="time-adjust">
							<span>t1:</span>
							<input
								type="number"
								step="0.1"
								min="0"
								class="inline-time-input"
								value={selectedShape.t1 ?? ''}
								placeholder="∞"
								title="Segundo de desaparición (editable)"
								oninput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									selectedShape.t1 = v === '' ? null : Number(v);
								}}
							/>
							<button
								type="button"
								class="btn-icon-fix"
								title="Fijar desaparición al momento actual"
								onclick={() => updateSelectedShapeTime('t1')}
							>
								📍
							</button>
						</div>

						{#if selectedShape.kind === 'text' || selectedShape.kind === 'tag'}
							<div class="shape-text-adjust">
								<span>Texto:</span>
								<input
									type="text"
									class="inline-text-edit"
									value={selectedShape.text || ''}
									placeholder={selectedShape.kind === 'tag' ? 'Nombre del tag...' : 'Texto...'}
									title="Editar texto"
									oninput={(e) => {
										selectedShape.text = (e.target as HTMLInputElement).value;
										shapes = [...shapes];
									}}
								/>
							</div>
						{/if}

						<div class="color-adjust">
							<div class="mini-palette">
								{#each PALETTE.slice(0, 8) as col}
									<button
										type="button"
										class="color-dot-sm"
										class:active={selectedShape.color === col}
										style="background: {col}"
										title="Color {col}"
										onclick={() => {
											selectedShape.color = col;
											shapes = [...shapes];
										}}
									></button>
								{/each}
							</div>
						</div>

						<!-- Rotation & Opacity controls -->
						<div class="shape-extra-controls">
							<label class="rot-label" title="Ángulo de rotación en grados">
								Rot:
								<input
									type="number"
									step="1"
									class="inline-rot-input"
									value={selectedShape.rotation || 0}
									oninput={(e) => {
										selectedShape.rotation = Number((e.target as HTMLInputElement).value) || 0;
										shapes = [...shapes];
									}}
								/>°
							</label>
							<button
								type="button"
								class="btn btn-xs"
								class:active={selectedShape.opacity === 0.5}
								title="Alternar transparencia 50%"
								onclick={() => {
									selectedShape.opacity = selectedShape.opacity === 0.5 ? 1 : 0.5;
									shapes = [...shapes];
								}}
							>
								Opacidad 50%
							</button>
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

				<!-- Fragment / Meta-cut period of time -->
				<div class="meta-cut-box">
					<div class="meta-cut-header">
						<strong>Fragmento / Meta-cut de la pieza</strong>
						<small>Período de tiempo seleccionado</small>
					</div>
					<div class="meta-cut-inputs">
						<div class="meta-cut-col">
							<label for="f-clip-in">Inicio (segundos):</label>
							<input
								id="f-clip-in"
								type="number"
								step="0.1"
								min="0"
								bind:value={clipIn}
								title="Inicio del fragmento analizado"
							/>
						</div>
						<div class="meta-cut-col">
							<label for="f-clip-out">Fin (segundos):</label>
							<input
								id="f-clip-out"
								type="number"
								step="0.1"
								min="0"
								placeholder="Fin del video"
								value={clipOut ?? ''}
								oninput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									clipOut = v === '' ? null : Number(v);
								}}
								title="Fin del fragmento analizado"
							/>
						</div>
					</div>
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
									<span class="shape-timing">
										<input
											type="number"
											step="0.1"
											min="0"
											class="item-time-input"
											bind:value={s.t0}
											onclick={(e) => e.stopPropagation()}
											title="Editar inicio de aparición"
										/>
										→
										<input
											type="number"
											step="0.1"
											min="0"
											class="item-time-input"
											value={s.t1 ?? ''}
											placeholder="∞"
											onclick={(e) => e.stopPropagation()}
											oninput={(e) => {
												const v = (e.target as HTMLInputElement).value;
												s.t1 = v === '' ? null : Number(v);
											}}
											title="Editar fin de aparición"
										/>
									</span>
									{#if s.kind === 'text' || s.kind === 'tag' || s.text != null}
										<input
											type="text"
											class="item-text-input"
											value={s.text || ''}
											placeholder={s.kind === 'tag' ? 'Tag...' : 'Texto...'}
											onclick={(e) => e.stopPropagation()}
											oninput={(e) => {
												s.text = (e.target as HTMLInputElement).value;
												shapes = [...shapes];
											}}
											title="Editar texto"
										/>
									{/if}
								</div>
								<button
									type="button"
									class="btn-total-dur"
									title="Ajustar a la duración total del fragmento"
									onclick={(e) => {
										e.stopPropagation();
										setShapeDurationToClip(s.id);
									}}>⏱</button
								>
								<button
									type="button"
									class="btn-del"
									title="Eliminar forma"
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

	.overlay-svg.pointer-select {
		pointer-events: auto;
		cursor: default;
	}

	.gizmo-layer {
		pointer-events: auto;
	}

	.gizmo-frame {
		fill: rgba(59, 130, 246, 0.08);
		stroke: #3b82f6;
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
		cursor: move;
	}

	.gizmo-handle {
		fill: #ffffff;
		stroke: #2563eb;
		stroke-width: 2;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
	}

	.gizmo-handle.handle-nw,
	.gizmo-handle.handle-se {
		cursor: nwse-resize;
	}

	.gizmo-handle.handle-ne,
	.gizmo-handle.handle-sw {
		cursor: nesw-resize;
	}

	.gizmo-handle.handle-point {
		cursor: crosshair;
	}

	.gizmo-handle.handle-move {
		cursor: move;
	}

	.gizmo-rot-stem {
		stroke: #3b82f6;
		stroke-width: 1.5;
		stroke-dasharray: 2 2;
	}

	.gizmo-handle.handle-rotate {
		fill: #ffd60a;
		stroke: #b45309;
		stroke-width: 2;
		cursor: grab;
	}
	.gizmo-handle.handle-rotate:active {
		cursor: grabbing;
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
		flex-wrap: wrap;
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
	.tool-btn.icon-only {
		width: 32px;
		height: 32px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 15px;
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

	.palette-container {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.palette-group {
		display: flex;
		gap: 6px;
	}

	.opacity-row {
		display: flex;
	}

	.btn-opacity {
		background: #1e222b;
		border: 1px solid #2c323f;
		color: #9ba3af;
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-opacity.active {
		background: #3b82f6;
		color: #fff;
		border-color: #60a5fa;
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
		flex-wrap: wrap;
		gap: 8px;
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
		gap: 8px;
	}

	.clip-time-field {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: #0d0f12;
		border: 1px solid #2a2f3b;
		padding: 2px 4px;
		border-radius: 4px;
	}

	.clip-lbl {
		font-size: 10px;
		font-weight: 600;
		color: #9ba3af;
	}

	.clip-num-input {
		width: 44px;
		background: transparent;
		border: none;
		color: #60a5fa;
		font-family: monospace;
		font-size: 11px;
		padding: 0;
	}
	.clip-num-input:focus {
		outline: none;
	}

	.btn-icon-fix {
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 12px;
		padding: 0 2px;
		opacity: 0.8;
		transition: transform 0.15s, opacity 0.15s;
	}
	.btn-icon-fix:hover {
		opacity: 1;
		transform: scale(1.2);
	}

	.scrubber-wrapper {
		position: relative;
		width: 100%;
		height: 28px;
		display: flex;
		align-items: center;
	}

	.scrubber-slider {
		width: 100%;
		accent-color: #3b82f6;
		cursor: pointer;
		z-index: 2;
	}

	.clip-marker {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 3px;
		pointer-events: none;
		z-index: 4;
	}
	.clip-marker.marker-in {
		background: #22c55e;
	}
	.clip-marker.marker-out {
		background: #ef4444;
	}
	.marker-tip {
		position: absolute;
		top: -14px;
		left: -8px;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 3px;
		border-radius: 2px;
		color: #fff;
	}
	.marker-in .marker-tip {
		background: #22c55e;
	}
	.marker-out .marker-tip {
		background: #ef4444;
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
		height: 12px;
		margin-top: -2px;
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

	.inspector-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.inspector-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px;
		font-size: 12px;
	}

	.time-adjust,
	.color-adjust,
	.shape-text-adjust {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.inline-text-edit {
		min-width: 130px;
		max-width: 200px;
		background: #0d0f12;
		border: 1px solid #2a2f3b;
		color: #e4e7eb;
		font-size: 11px;
		padding: 3px 6px;
		border-radius: 4px;
	}
	.inline-text-edit:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.inline-time-input {
		width: 50px;
		background: #0d0f12;
		border: 1px solid #2a2f3b;
		color: #e4e7eb;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 4px;
		border-radius: 3px;
	}

	.shape-extra-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.rot-label {
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		color: #9ba3af;
	}

	.inline-rot-input {
		width: 40px;
		background: #0d0f12;
		border: 1px solid #2a2f3b;
		color: #ffd60a;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 4px;
		border-radius: 3px;
	}

	.meta-cut-box {
		background: #0d0f12;
		border: 1px solid #2a2f3b;
		border-radius: 6px;
		padding: 8px 10px;
		margin-bottom: 12px;
	}

	.meta-cut-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 8px;
	}
	.meta-cut-header strong {
		font-size: 12px;
		color: #60a5fa;
	}
	.meta-cut-header small {
		font-size: 10px;
		color: #9ba3af;
	}

	.meta-cut-inputs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.meta-cut-col {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.meta-cut-col label {
		font-size: 10px;
		color: #9ba3af;
	}
	.meta-cut-col input {
		background: #14171d;
		border: 1px solid #2a2f3b;
		color: #fff;
		padding: 4px 6px;
		font-family: monospace;
		font-size: 12px;
		border-radius: 4px;
	}

	.item-time-input {
		width: 42px;
		background: #14171d;
		border: 1px solid #2a2f3b;
		color: #cbd5e1;
		font-family: monospace;
		font-size: 10px;
		padding: 1px 3px;
		border-radius: 3px;
	}

	.item-text-input {
		background: #14171d;
		border: 1px solid #2a2f3b;
		color: #e2e8f0;
		font-size: 11px;
		padding: 2px 5px;
		border-radius: 3px;
		width: 100%;
		max-width: 150px;
		margin-top: 3px;
	}
	.item-text-input:focus {
		outline: none;
		border-color: #3b82f6;
		background: #0d0f12;
	}

	.btn-total-dur {
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 13px;
		padding: 0 4px;
		opacity: 0.7;
		transition: opacity 0.15s, transform 0.15s;
	}
	.btn-total-dur:hover {
		opacity: 1;
		transform: scale(1.15);
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
