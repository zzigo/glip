<script lang="ts">
	let { results = [] } = $props();
	let canvas: HTMLCanvasElement;

	$effect(() => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		// Draw basic grid
		ctx.strokeStyle = '#222';
		ctx.beginPath();
		for(let i=0; i<canvas.width; i+=40) {
			ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height);
			ctx.moveTo(0, i); ctx.lineTo(canvas.width, i);
		}
		ctx.stroke();

		// Draw TAE points
		results.forEach((tae, i) => {
			const x = (Math.random() * 0.8 + 0.1) * canvas.width;
			const y = (Math.random() * 0.8 + 0.1) * canvas.height;
			
			ctx.fillStyle = '#00ff88';
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, Math.PI * 2);
			ctx.fill();
			
			ctx.fillStyle = '#888';
			ctx.font = '9px monospace';
			ctx.fillText(tae.id.slice(0, 4), x + 8, y + 4);
		});
	});
</script>

<div class="vector-space">
	<canvas bind:this={canvas} width="400" height="400"></canvas>
</div>

<style>
	.vector-space {
		width: 100%;
		height: 100%;
		background: #050505;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	canvas {
		max-width: 100%;
		max-height: 100%;
	}
</style>
