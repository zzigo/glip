<script lang="ts">
	let { audioFile } = $props();
	let data = $state(null);
	let loading = $state(false);
	let activeTab = $state('hpss');

	async function loadAnalysis() {
		if (!audioFile) return;
		loading = true;
		try {
			const res = await fetch(`/api/analysis?audio=${encodeURIComponent(audioFile)}`);
			data = await res.json();
		} catch (e) {
			console.error("Analysis load failed", e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (audioFile) loadAnalysis();
	});

	function getPath(arr, h, scale = 1) {
		if (!arr) return "";
		const max = Math.max(...arr.map(Math.abs)) || 1;
		return arr.map((v, i) => `${i},${h/2 - (v/max)*(h/2)*scale}`).join(' L ');
	}
</script>

<div class="analysis-viewer">
	<div class="tabs">
		<button class:active={activeTab === 'hpss'} onclick={() => activeTab = 'hpss'}>WAVEFORM / HPSS</button>
		<button class:active={activeTab === 'spec'} onclick={() => activeTab = 'spec'}>SPECTROGRAM</button>
	</div>

	<div class="content">
		{#if loading}
			<div class="msg">ANALYZING WITH LIBROSA...</div>
		{:else if data}
			{#if activeTab === 'hpss'}
				<div class="viz hpss-viz">
					<div class="layer harmonic">
						<span class="label">HARMONIC (HPSS)</span>
						<svg viewBox="0 0 500 100" preserveAspectRatio="none">
							<path d="M {getPath(data.harmonic, 100)}" stroke="#00ffff" fill="none" stroke-width="1.5"/>
						</svg>
					</div>
					<div class="layer percussive">
						<span class="label">PERCUSSIVE (HPSS)</span>
						<svg viewBox="0 0 500 100" preserveAspectRatio="none">
							<path d="M {getPath(data.percussive, 100)}" stroke="#ff00ff" fill="none" stroke-width="1.5"/>
						</svg>
					</div>
					<div class="layer centroid">
						<span class="label">SPECTRAL CENTROID</span>
						<svg viewBox="0 0 500 100" preserveAspectRatio="none">
							<path d="M {getPath(data.centroid, 100, 0.8)}" stroke="#ffff00" fill="none" stroke-width="2"/>
						</svg>
					</div>
				</div>
			{:else if activeTab === 'spec'}
				<div class="viz spec-viz">
					<div class="spec-grid">
						{#each data.spectrogram.slice(0, 64) as row}
							<div class="spec-row">
								{#each row.filter((_, i) => i % 2 === 0) as val}
									<div class="spec-cell" style="background: rgba(0, 255, 136, {(val + 80) / 80})"></div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{:else}
			<div class="msg">SELECT A TAE TO ANALYZE</div>
		{/if}
	</div>
</div>

<style>
	.analysis-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #000;
	}

	.tabs {
		display: flex;
		background: #111;
		border-bottom: 1px solid #222;
	}

	.tabs button {
		background: transparent;
		border: none;
		color: #666;
		font-size: 9px;
		padding: 8px 15px;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.tabs button.active {
		color: #fff;
		background: #000;
		border-bottom: 2px solid var(--accent);
	}

	.content {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.viz {
		height: 100%;
		padding: 5px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.layer {
		flex: 1;
		background: #050505;
		border: 1px solid #111;
		position: relative;
	}

	.label {
		position: absolute;
		top: 2px;
		left: 5px;
		font-size: 7px;
		color: #666;
		z-index: 5;
	}

	svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.spec-grid {
		display: flex;
		flex-direction: column-reverse;
		height: 100%;
	}

	.spec-row {
		display: flex;
		flex: 1;
	}

	.spec-cell {
		flex: 1;
	}

	.msg {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		font-size: 10px;
		color: #333;
	}
</style>
