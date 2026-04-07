<script lang="ts">
	import { onMount } from 'svelte';
	import { audioEngine } from './AudioEngine';

	let { audioFile, color = '#00ff88', height = 40 } = $props();
	let canvas: HTMLCanvasElement;

	async function draw() {
		if (!canvas || !audioFile) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, width, h);

		try {
			const buffer = await audioEngine.loadBuffer(`/audio/${audioFile}`);
			const { min: minPeaks, max: maxPeaks } = audioEngine.getPeaks(buffer, width);

			ctx.fillStyle = color;
			for (let i = 0; i < width; i++) {
				const top = (1 - maxPeaks[i]) * h / 2;
				const bottom = (1 - minPeaks[i]) * h / 2;
				ctx.fillRect(i, top, 1, Math.max(1, bottom - top));
			}
		} catch (e) {
			console.error("Waveform draw failed", e);
		}
	}

	$effect(() => {
		if (audioFile) draw();
	});

	onMount(() => {
		draw();
	});
</script>

<canvas 
	bind:this={canvas} 
	width="400" 
	height={height}
	style="width: 100%; height: {height}px; display: block;"
></canvas>

<style>
	canvas {
		image-rendering: pixelated;
	}
</style>
