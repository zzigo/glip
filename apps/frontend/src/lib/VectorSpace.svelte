<script lang="ts">
	import { audioEngine } from './AudioEngine';
	import { onMount } from 'svelte';

	let { points = [], selectedId = null, onSelect = (id) => {} } = $props();
	
	let canvas: HTMLCanvasElement;
	let width = $state(400);
	let height = $state(400);
	
	let xAxis = $state('dim0');
	let yAxis = $state('dim1');
	
	let playRadius = $state(50);
	let mouseX = $state(-1000);
	let mouseY = $state(-1000);
	let isMouseIn = $state(false);

	let availableDescriptors = $derived(() => {
		if (points.length === 0) return ['dim0', 'dim1'];
		const keys = Object.keys(points[0].descriptors || {});
		return ['dim0', 'dim1', ...keys];
	});

	let zoom = $state(0.9); 
	let offsetX = $state(0);
	let offsetY = $state(0);

	function getVal(p, axis) {
		if (axis === 'dim0') return p.vector[0];
		if (axis === 'dim1') return p.vector[1];
		return p.descriptors?.[axis] || 0;
	}

	function getBounds() {
		if (points.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
		let valsX = points.map(p => getVal(p, xAxis));
		let valsY = points.map(p => getVal(p, yAxis));
		return {
			minX: Math.min(...valsX), maxX: Math.max(...valsX),
			minY: Math.min(...valsY), maxY: Math.max(...valsY)
		};
	}

	function draw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const { minX, maxX, minY, maxY } = getBounds();
		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;

		ctx.clearRect(0, 0, width, height);
		
		const toScreenX = (nx) => (nx - 0.5) * zoom * width + width/2 + offsetX;
		const toScreenY = (ny) => (ny - 0.5) * zoom * height + height/2 + offsetY;

		// Draw Grid
		ctx.strokeStyle = '#1a1a1a';
		ctx.lineWidth = 1;
		for(let i=0; i<=10; i++) {
			const n = i / 10;
			const sx = toScreenX(n);
			const sy = toScreenY(n);
			ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
		}

		// Draw Proximity Zone
		if (isMouseIn) {
			ctx.beginPath();
			ctx.arc(mouseX, mouseY, playRadius, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
			ctx.lineWidth = 1;
			ctx.setLineDash([5, 5]);
			ctx.stroke();
			ctx.setLineDash([]);
			
			// Faded background for zone
			const grad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, playRadius);
			grad.addColorStop(0, 'rgba(0, 255, 136, 0.05)');
			grad.addColorStop(1, 'transparent');
			ctx.fillStyle = grad;
			ctx.fill();
		}

		// Draw points
		const proximitySounds = [];
		points.forEach((p, idx) => {
			const rx = getVal(p, xAxis);
			const ry = getVal(p, yAxis);
			const nx = (rx - minX) / rangeX;
			const ny = 1 - (ry - minY) / rangeY; 
			const px = toScreenX(nx);
			const py = toScreenY(ny);
			
			const isSelected = p.id === selectedId;
			const dist = Math.sqrt((px - mouseX)**2 + (py - mouseY)**2);
			
			let opacity = 0.4;
			let size = isSelected ? 6 : 3.5;

			if (isMouseIn && dist < playRadius) {
				const normDist = dist / playRadius;
				const gain = 1.0 - normDist;
				opacity = 0.4 + gain * 0.6;
				size += gain * 4;
				proximitySounds.push({ id: p.id, audio: p.audio, gain: gain * 0.8 });
			}

			const hue = (idx / points.length) * 360;
			ctx.fillStyle = isSelected ? '#fff' : `hsla(${hue}, 70%, 50%, ${opacity})`;
			
			ctx.beginPath();
			ctx.arc(px, py, size, 0, Math.PI * 2);
			ctx.fill();

			if (isSelected) {
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
		});

		if (isMouseIn && proximitySounds.length > 0) {
			audioEngine.updateProximity(proximitySounds);
		} else {
			audioEngine.stopAllProximity();
		}
	}

	function handleMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		mouseX = e.clientX - rect.left;
		mouseY = e.clientY - rect.top;
		isMouseIn = true;
		draw();
	}

	function handleMouseLeave() {
		isMouseIn = false;
		audioEngine.stopAllProximity();
		draw();
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const adx = (mx - width/2 - offsetX) / zoom;
		const ady = (my - height/2 - offsetY) / zoom;
		const nextZoom = zoom * delta;
		offsetX -= adx * (nextZoom - zoom);
		offsetY -= ady * (nextZoom - zoom);
		zoom = nextZoom;
	}

	function handleMouseDown(e: MouseEvent) {
		const startX = e.clientX;
		const startY = e.clientY;
		const origX = offsetX;
		const origY = offsetY;
		const onMove = (me: MouseEvent) => {
			offsetX = origX + (me.clientX - startX);
			offsetY = origY + (me.clientY - startY);
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function handleCanvasClick(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const { minX, maxX, minY, maxY } = getBounds();
		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;
		let closest = null;
		let minDist = 20;
		points.forEach(p => {
			const nx = (getVal(p, xAxis) - minX) / rangeX;
			const ny = 1 - (getVal(p, yAxis) - minY) / rangeY;
			const px = toScreenX(nx);
			const py = toScreenY(ny);
			const d = Math.sqrt((px - mx)**2 + (py - my)**2);
			if (d < minDist) {
				minDist = d;
				closest = p;
			}
		});
		if (closest) onSelect(closest.id, false);
	}

	$effect(() => {
		if (points || xAxis || yAxis || zoom || offsetX || offsetY || selectedId) draw();
	});

	onMount(() => {
		const resize = () => {
			width = canvas.parentElement?.clientWidth || 400;
			height = canvas.parentElement?.clientHeight || 400;
		};
		const handleBlur = () => {
			isMouseIn = false;
			audioEngine.stopAllProximity();
			draw();
		};
		window.addEventListener('resize', resize);
		window.addEventListener('blur', handleBlur);
		resize();
		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('blur', handleBlur);
		};
	});
</script>

<div class="vector-container">
	<div class="top-controls">
		<div class="axis-control y-axis">
			<label>
				Y:
				<select bind:value={yAxis}>
					{#each availableDescriptors() as desc}
						<option value={desc}>{desc}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="proximity-control">
			<label>
				RADIUS:
				<input type="number" bind:value={playRadius} step="5" min="5" max="200" />
			</label>
		</div>
	</div>
	
	<div class="axis-control x-axis">
		<label>
			X:
			<select bind:value={xAxis}>
				{#each availableDescriptors() as desc}
					<option value={desc}>{desc}</option>
				{/each}
			</select>
		</label>
	</div>

	<canvas 
		bind:this={canvas} 
		{width} 
		{height} 
		onwheel={handleWheel}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
		onclick={handleCanvasClick}
	></canvas>
	
	<div class="hint">HOVER TO LISTEN • CLICK TO SELECT</div>
</div>

<style>
	.vector-container {
		width: 100%;
		height: 100%;
		background: #050505;
		position: relative;
		overflow: hidden;
	}
	
	canvas { display: block; cursor: crosshair; }

	.top-controls {
		position: absolute;
		top: 5px;
		left: 5px;
		right: 5px;
		display: flex;
		justify-content: space-between;
		z-index: 10;
		pointer-events: none;
	}

	.axis-control, .proximity-control { 
		pointer-events: auto; 
		display: flex;
		align-items: center;
		gap: 5px;
		background: rgba(0,0,0,0.5);
		padding: 2px 8px;
		border-radius: 2px;
	}

	.x-axis { position: absolute; bottom: 5px; right: 5px; z-index: 10; }

	label { font-size: 8px; color: #555; }

	select, input {
		background: #111;
		color: #0f8;
		border: 1px solid #333;
		padding: 2px 5px;
		font-size: 10px;
		font-family: inherit;
		cursor: pointer;
		outline: none;
	}

	input[type="number"] { width: 40px; }

	select:hover, input:hover { border-color: #0f8; }

	.hint {
		position: absolute;
		bottom: 5px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 8px;
		color: #333;
		pointer-events: none;
		text-transform: uppercase;
	}
</style>
