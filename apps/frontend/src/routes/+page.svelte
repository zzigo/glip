<script lang="ts">
	import DropZone from '$lib/DropZone.svelte';
	import Waveform from '$lib/Waveform.svelte';
	import VectorSpace from '$lib/VectorSpace.svelte';
	import AnalysisViewer from '$lib/AnalysisViewer.svelte';
	import { audioEngine } from '$lib/AudioEngine';
	import { onMount } from 'svelte';
	
	let query = $state('list');
	let results = $state([]);
	let timeline = $state([]);
	let allPoints = $state([]);
	let selectedTae = $state(null);
	let loading = $state(false);
	let showMetadata = $state(true);
	let showHelp = $state(false);
	let activeMainTab = $state('timeline');

	async function loadAllPoints() {
		try {
			const res = await fetch('/api/points');
			allPoints = await res.json();
		} catch (e) {
			console.error("Failed to load points", e);
		}
	}

	let resultsSearch = $state('');
	let filteredResults = $derived(
		results.filter(r => 
			r.audio.toLowerCase().includes(resultsSearch.toLowerCase()) || 
			r.id.toLowerCase().includes(resultsSearch.toLowerCase()) ||
			(r.name && r.name.toLowerCase().includes(resultsSearch.toLowerCase()))
		)
	);

	async function runQuery() {
		const q = query.trim().toLowerCase();
		
		// Command Interceptor
		if (q === 'glily.regen') return await regenGlyphs();
		if (q === 'glip.librosa') return await runLibrosaUpdate();
		if (q === 'glip.dump' || q === 'dump') return await dumpToObsidian();
		if (q === 'glip.sync') return await syncFromObsidian();

		loading = true;
		try {
			const response = await fetch(`/api/near?k=10&q=${encodeURIComponent(query)}`);
			const data = await response.json();
			results = data.results;
			timeline = data.timeline;
			if (results.length > 0 && !selectedTae) selectedTae = results[0];
		} catch (e) {
			console.error("Query failed", e);
		} finally {
			loading = false;
		}
	}

	async function saveMetadata() {
		if (!selectedTae) return;
		try {
			await fetch('/api/metadata', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: selectedTae.id,
					metadata: selectedTae
				})
			});
		} catch (e) {
			console.error("Save failed", e);
		}
	}

	async function dumpToObsidian() {
		try {
			const res = await fetch('/api/dump', { method: 'GET' });
			if (!res.ok) throw new Error("Dump failed");
			
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `glip_dump_${new Date().toISOString().slice(0,10)}.zip`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			
			alert(`Dumped files and started download.`);
		} catch (e) {
			console.error("Dump failed", e);
			alert("Dump failed: " + e.message);
		}
	}

	async function syncFromObsidian() {
		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			const data = await res.json();
			alert(`Synced ${data.synced} files from Obsidian folder`);
			runQuery();
		} catch (e) {
			console.error("Sync failed", e);
		}
	}

	async function regenGlyphs() {
		try {
			const res = await fetch('/api/glily/regen', { method: 'POST' });
			const data = await res.json();
			alert(`Regenerated ${data.updated} glyphs and synced to Obsidian.`);
			loadAllPoints();
		} catch (e) {
			console.error("Regen failed", e);
		}
	}

	async function runLibrosaUpdate() {
		try {
			const res = await fetch('/api/glip/librosa', { method: 'POST' });
			const data = await res.json();
			alert(`Updated librosa analysis for ${data.updated} records.`);
			loadAllPoints();
		} catch (e) {
			console.error("Librosa update failed", e);
		}
	}

	function selectTaeById(id, play = true) {
		const tae = results.find(r => r.id === id) || allPoints.find(p => p.id === id);
		if (tae) {
			selectedTae = tae;
			if (play) audioEngine.playTae(tae.audio);
		}
	}

	onMount(() => {
		loadAllPoints();
		const handleKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				runQuery();
			}
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '|') {
				e.preventDefault();
				showMetadata = !showMetadata;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
				e.preventDefault();
				showHelp = !showHelp;
			}
		};
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});

	const metadataGroups = [
		{ label: 'Identity', fields: ['name', 'type', 'instrument', 'performer'] },
		{ label: 'Acoustic Analysis', fields: ['desc_centroid', 'desc_f0', 'desc_harmonicity', 'desc_rms', 'desc_zcr', 'desc_flatness', 'desc_bandwidth'] },
		{ label: 'Notation', fields: ['glily', 'glily_expr', 'lilypond_vars'] },
		{ label: 'MOAIE Mapping', fields: ['moaie_material', 'moaie_object', 'moaie_agent', 'moaie_interaction', 'moaie_environment'] },
		{ label: 'Relational', fields: ['related_tae', 'family', 'tags'] }
	];
</script>

<div class="app-shell">
	{#if showHelp}
		<div class="modal-backdrop" onclick={() => showHelp = false}>
			<div class="modal help-modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span>GLIP SYSTEM HELP <small style="color: #444; margin-left: 8px;">#797bb47</small></span>
					<button onclick={() => showHelp = false}>&times;</button>
				</div>
				<div class="modal-body">
					<div class="help-section">
						<h3>GLIP COMMANDS</h3>
						<div class="cmd-list">
							<div class="cmd-item">
								<code>list</code>
								<span>List all available TAEs in the collection.</span>
							</div>
							<div class="cmd-item">
								<code>glip.dump</code>
								<span>Download a ZIP containing Markdown notes of all TAEs for Obsidian.</span>
							</div>
							<div class="cmd-item">
								<code>glip.sync</code>
								<span>Sync metadata from Obsidian files back to the database.</span>
							</div>
						</div>
					</div>

					<div class="help-section">
						<h3>GLILY COMMANDS</h3>
						<div class="cmd-list">
							<div class="cmd-item">
								<code>glily.regen</code>
								<span>Regenerate SVG glyphs (Kiki/Bouba heuristic) and sync to notes.</span>
							</div>
						</div>
					</div>

					<div class="help-section">
						<h3>AUDIO ANALYSIS</h3>
						<div class="cmd-list">
							<div class="cmd-item">
								<code>glip.librosa</code>
								<span>Run deep acoustic analysis (Centroid, RMS, F0, ZCR, Flatness).</span>
							</div>
						</div>
					</div>

					<div class="help-section">
						<h3>SHORTCUTS</h3>
						<div class="shortcut-grid">
							<span>Run Query</span> <code>CTRL + ENTER</code>
							<span>Help Modal</span> <code>CTRL + H</code>
							<span>Toggle Inspector</span> <code>CTRL + SHIFT + |</code>
						</div>
					</div>
				</div>
				<div class="modal-footer">
					Type commands directly into the Query Editor and press Enter.
				</div>
			</div>
		</div>
	{/if}

	<div class="blender-layout" style="grid-template-columns: 300px 250px 1fr {showMetadata ? '350px' : '0px'}">
		<!-- Panel 1: Query -->
		<div class="panel query-panel">
			<div class="panel-header">
				QUERY EDITOR
			</div>
			<div class="panel-content">
				<textarea bind:value={query} spellcheck="false" placeholder="Enter GLINO query or GLIP command..."></textarea>
				<button onclick={runQuery} disabled={loading} class="run-btn">
					{loading ? 'RUNNING...' : 'RUN (CMD+ENTER)'}
				</button>
				<DropZone />
			</div>
		</div>

		<!-- Panel 2: Results -->
		<div class="panel results-panel">
			<div class="panel-header" style="padding: 0;">
				<input 
					type="text" 
					class="header-search" 
					placeholder="SEARCH ETA..." 
					bind:value={resultsSearch} 
					style="width: 100%; border: none; background: transparent; height: 100%;"
				/>
			</div>
			<div class="panel-content">
				{#if filteredResults.length === 0}
					<div class="empty">NO RESULTS</div>
				{:else}
					<div class="results-list">
						{#each filteredResults as tae}
							<button 
								class="tae-item" 
								class:selected={selectedTae?.id === tae.id}
								onmouseenter={() => selectTaeById(tae.id)}
								onmouseleave={() => audioEngine.stopTae()}
								onclick={() => selectTaeById(tae.id)}
							>
								<div class="tae-info">
									<span class="name">{tae.audio}</span>
									<span class="id">{tae.id.slice(0,8)}</span>
								</div>
								<div class="mini-wave">
									<Waveform audioFile={tae.audio} height={20} color="#555" />
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Panel 3: Viewers -->
		<div class="viewers-stack">
			<div class="panel vector-panel">
				<div class="panel-header">VECTOR SPACE NAVIGATOR</div>
				<div class="panel-content" style="padding: 0;">
					<VectorSpace 
						points={allPoints} 
						selectedId={selectedTae?.id} 
						onSelect={selectTaeById} 
					/>
				</div>
			</div>

			<div class="panel glyph-panel">
				<div class="panel-header">GLYPH VIEWER</div>
				<div class="panel-content glyph-container">
					{#if selectedTae}
						{@html selectedTae.symbol}
					{:else}
						<div class="empty">SELECT A TAE</div>
					{/if}
				</div>
			</div>

			<div class="panel main-panel">
				<div class="panel-header">
					<div class="main-tabs">
						<button class:active={activeMainTab === 'timeline'} onclick={() => activeMainTab = 'timeline'}>TIMELINE</button>
						<button class:active={activeMainTab === 'analysis'} onclick={() => activeMainTab = 'analysis'}>ANALYSIS</button>
					</div>
					<div class="header-actions">
						{#if activeMainTab === 'timeline'}
							<button class="header-btn" onclick={() => audioEngine.playTimeline(timeline)}>PLAY</button>
						{/if}
					</div>
				</div>
				<div class="panel-content" style="padding: 0;">
					{#if activeMainTab === 'timeline'}
						<div class="timeline-viz">
							{#each timeline as event}
								<div class="event" style="left: {event.start * 100}px; width: {event.duration * 100}px"></div>
							{/each}
						</div>
					{:else}
						<AnalysisViewer audioFile={selectedTae?.audio} />
					{/if}
				</div>
			</div>
		</div>

		<!-- Panel 4: Metadata -->
		<div class="panel metadata-panel" style="display: {showMetadata ? 'flex' : 'none'}">
			<div class="panel-header">TAE INSPECTOR</div>
			<div class="panel-content">
				{#if selectedTae}
					<div class="inspector">
						<div class="wave-preview">
							<Waveform audioFile={selectedTae.audio} height={60} color="var(--accent)" />
						</div>
						
						<details open class="analysis-details">
							<summary>EMERGING ANALYSIS</summary>
							<div class="desc-grid">
								{#if selectedTae.descriptors}
									{#each Object.entries(selectedTae.descriptors) as [k, v]}
										<div class="desc-item">
											<span class="desc-key">{k}</span>
											<span class="desc-val">{typeof v === 'number' ? v.toFixed(3) : v}</span>
										</div>
									{/each}
								{/if}
							</div>
						</details>

						{#each metadataGroups as group}
							<details open>
								<summary>{group.label}</summary>
								<div class="input-group">
									{#each group.fields as field}
										<div class="field">
											<label>
												<span>{field.replace('_', ' ')}</span>
												<input bind:value={selectedTae[field]} oninput={saveMetadata} />
											</label>
										</div>
									{/each}
								</div>
							</details>
						{/each}

						<details open>
							<summary>EMERGING ANALYSIS</summary>
							<div class="analysis-section">
								{#if selectedTae.descriptors}
									<div class="desc-grid">
										<div class="desc-item">
											<span>Centroid:</span>
											<span>{selectedTae.descriptors.desc_centroid?.toFixed(2) || 'N/A'}</span>
										</div>
										<div class="desc-item">
											<span>RMS:</span>
											<span>{selectedTae.descriptors.desc_rms?.toFixed(4) || 'N/A'}</span>
										</div>
										<div class="desc-item">
											<span>F0 (pitch):</span>
											<span>{selectedTae.descriptors.desc_f0?.toFixed(2) || 'N/A'} Hz</span>
										</div>
										<div class="desc-item">
											<span>ZCR:</span>
											<span>{selectedTae.descriptors.desc_zcr?.toFixed(4) || 'N/A'}</span>
										</div>
										<div class="desc-item">
											<span>Flatness:</span>
											<span>{selectedTae.descriptors.desc_flatness?.toFixed(4) || 'N/A'}</span>
										</div>
									</div>
								{:else}
									<div class="empty">NO DESCRIPTORS</div>
								{/if}
							</div>
						</details>
					</div>
				{:else}
					<div class="empty">NO SELECTION</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		height: 100vh;
		width: 100vw;
		background: #000;
		overflow: hidden;
		position: relative;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal {
		background: #0a0a0a;
		border: 1px solid #222;
		width: 600px;
		max-width: 90vw;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 50px rgba(0,0,0,0.5);
	}

	.modal-header {
		padding: 10px 15px;
		background: #111;
		border-bottom: 1px solid #222;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		font-weight: bold;
		letter-spacing: 1px;
	}

	.modal-header button {
		background: transparent;
		border: none;
		color: #666;
		font-size: 20px;
		cursor: pointer;
	}

	.modal-body {
		padding: 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 25px;
	}

	.help-section h3 {
		font-size: 10px;
		color: #555;
		margin-bottom: 12px;
		border-bottom: 1px solid #1a1a1a;
		padding-bottom: 4px;
		text-transform: uppercase;
		letter-spacing: 1.5px;
	}

	.cmd-list { display: flex; flex-direction: column; gap: 10px; }

	.cmd-item { display: flex; flex-direction: column; gap: 4px; }
	.cmd-item code { color: var(--accent); font-size: 11px; font-weight: bold; }
	.cmd-item span { font-size: 10px; color: #888; line-height: 1.4; }

	.shortcut-grid {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		font-size: 10px;
		color: #888;
	}

	.shortcut-grid code {
		color: #fff;
		background: #222;
		padding: 2px 6px;
		border-radius: 3px;
		font-family: monospace;
	}

	.modal-footer {
		padding: 15px;
		background: #050505;
		border-top: 1px solid #111;
		font-size: 9px;
		color: #444;
		text-align: center;
		font-style: italic;
	}

	.blender-layout {
		flex: 1;
		display: grid;
		width: 100%;
		height: 100%;
		gap: 2px;
		background: var(--border);
		transition: grid-template-columns 0.2s ease;
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
		justify-content: space-between;
		color: var(--text-dim);
		border-bottom: 1px solid var(--border);
		text-transform: uppercase;
	}

	.header-actions { display: flex; gap: 5px; }

	.header-search {
		background: #111;
		border: 1px solid #333;
		color: var(--accent);
		font-size: 8px;
		padding: 2px 6px;
		width: 100px;
		outline: none;
	}

	.header-search:focus { border-color: var(--accent); }

	.panel-content {
		flex: 1;
		padding: 10px;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		position: relative;
	}

	textarea {
		width: 100%;
		flex: 1;
		background: transparent;
		color: var(--accent);
		border: none;
		resize: none;
		font-family: inherit;
		outline: none;
	}

	.run-btn { width: 100%; margin: 10px 0; }

	.viewers-stack {
		display: grid;
		grid-template-rows: 1fr 150px 200px;
		gap: 2px;
	}

	.tae-item {
		width: 100%;
		padding: 8px;
		background: var(--surface);
		border: none;
		border-left: 2px solid transparent;
		margin-bottom: 4px;
		cursor: pointer;
		text-align: left;
		color: var(--text);
		font-family: inherit;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tae-item.selected {
		background: #222;
		border-left-color: var(--accent);
	}

	.tae-info {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
	}

	.mini-wave { height: 20px; background: #111; }

	.glyph-container {
		display: flex;
		justify-content: center;
		align-items: center;
		background: #050505;
	}

	.glyph-container :global(svg) { width: 100px; height: 100px; }

	.timeline-viz {
		height: 100%;
		background: #050505;
		position: relative;
		border: 1px dashed #222;
	}

	.event {
		position: absolute;
		top: 20px;
		height: 40px;
		background: var(--accent);
		opacity: 0.3;
		border: 1px solid var(--accent);
	}

	.inspector {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.wave-preview {
		height: 60px;
		background: #000;
		border: 1px solid #222;
		margin-bottom: 10px;
	}

	details {
		margin-bottom: 5px;
		background: #111;
		border: 1px solid #222;
	}

	details.analysis-details {
		background: #161e1a;
		border-color: #2a3a2a;
	}

	summary {
		padding: 5px 10px;
		font-size: 9px;
		background: #1a1a1a;
		cursor: pointer;
		color: #888;
		text-transform: uppercase;
	}

	details.analysis-details summary {
		background: #1a2a1a;
		color: #9a9;
	}

	.input-group { padding: 10px; display: flex; flex-direction: column; gap: 8px; }

	.field { display: flex; flex-direction: column; gap: 2px; }

	label { font-size: 8px; color: #555; text-transform: uppercase; }

	input {
		background: #050505;
		border: 1px solid #222;
		color: #eee;
		padding: 4px 8px;
		font-family: inherit;
		font-size: 10px;
		outline: none;
	}

	input:focus { border-color: var(--accent); }

	.desc-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5px;
		padding: 10px;
		font-size: 9px;
	}

	.desc-item { display: flex; justify-content: space-between; color: #666; }
	.desc-val { color: var(--accent); }

	.empty {
		color: #444;
		font-size: 10px;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
	}

	.header-btn {
		background: #333;
		border: none;
		color: #fff;
		font-size: 8px;
		padding: 2px 6px;
		cursor: pointer;
	}

	.main-tabs { display: flex; gap: 10px; }
	.main-tabs button {
		background: transparent;
		border: none;
		color: #666;
		font-size: 10px;
		cursor: pointer;
	}
	.main-tabs button.active { color: #fff; }
</style>
