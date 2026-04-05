<script lang="ts">
	import DropZone from '$lib/DropZone.svelte';
	import { audioEngine } from '$lib/AudioEngine';
	
	let query = $state('near("metal_scratch")');
	let results = $state([]);
	let timeline = $state([]);
	let loading = $state(false);

	async function runQuery() {
		loading = true;
		try {
			// In development/production we use /api/* proxy through Caddy
			const response = await fetch('/api/near?k=10');
			const data = await response.json();
			results = data.results;
			timeline = data.timeline;
		} catch (e) {
			console.error("Query failed", e);
		} finally {
			loading = false;
		}
	}
</script>

<div class="blender-layout">
	<!-- Left Panel: Query Editor -->
	<div class="panel query-panel">
		<div class="panel-header">QUERY EDITOR (GLINO)</div>
		<div class="panel-content">
			<textarea bind:value={query} spellcheck="false"></textarea>
			<button onclick={runQuery} disabled={loading}>
				{loading ? 'RUNNING...' : 'RUN (CMD+ENTER)'}
			</button>
			<div style="height: 10px;"></div>
			<DropZone />
		</div>
	</div>

	<!-- Right Panel: Viewers Stack -->
	<div class="viewers-stack">
		<!-- Top: Results List -->
		<div class="panel results-panel">
			<div class="panel-header">RESULTS (TAE)</div>
			<div class="panel-content">
				{#if results.length === 0}
					<div class="empty">NO RESULTS</div>
				{:else}
					<div class="results-list">
						{#each results as tae}
							<button class="tae-item" onclick={() => audioEngine.playTae(tae.audio)}>
								<span class="id">{tae.id.slice(0, 8)}...</span>
								<span class="score">{(tae.score * 100).toFixed(1)}%</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom: Timeline / Timeline Navigator -->
		<div class="panel timeline-panel">
			<div class="panel-header">TIMELINE / OPERATIVE SPACE</div>
			<div class="panel-content">
				<div class="timeline-viz">
					{#each timeline as event}
						<div class="event" style="left: {event.start * 100}px; width: {event.duration * 100}px"></div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.blender-layout {
		display: grid;
		grid-template-columns: 350px 1fr;
		width: 100%;
		height: 100%;
		gap: 2px;
		background: var(--border);
	}

	.panel {
		background: var(--bg);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		height: 24px;
		background: var(--surface);
		font-size: 10px;
		padding: 0 10px;
		display: flex;
		align-items: center;
		color: var(--text-dim);
		border-bottom: 1px solid var(--border);
	}

	.panel-content {
		flex: 1;
		padding: 10px;
		overflow-y: auto;
		position: relative;
	}

	.viewers-stack {
		display: grid;
		grid-template-rows: 1fr 200px;
		gap: 2px;
	}

	textarea {
		width: 100%;
		height: calc(100% - 40px);
		background: transparent;
		color: var(--accent);
		border: none;
		resize: none;
		font-family: inherit;
		outline: none;
	}

	button {
		width: 100%;
		height: 30px;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		font-family: inherit;
		cursor: pointer;
		font-size: 11px;
	}

	button:hover {
		background: #222;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tae-item {
		width: 100%;
		padding: 6px 10px;
		background: var(--surface);
		font-size: 11px;
		display: flex;
		justify-content: space-between;
		border-left: 2px solid var(--accent);
		border-top: none;
		border-right: none;
		border-bottom: none;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font-family: inherit;
	}

	.tae-item:hover {
		background: #151515;
		border-left-color: #fff;
	}

	.empty {
		color: var(--text-dim);
		font-size: 12px;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
	}

	.timeline-viz {
		height: 100%;
		background: #0f0f0f;
		position: relative;
		border: 1px dashed #222;
	}

	.event {
		position: absolute;
		top: 20px;
		height: 40px;
		background: var(--accent);
		opacity: 0.4;
		border: 1px solid var(--accent);
	}
</style>
