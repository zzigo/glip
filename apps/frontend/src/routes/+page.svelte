<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { formatTime } from '$glip/glip-core.js';

	let { data }: { data: PageData } = $props();

	// Local list state
	let items = $state(data.summaries || []);
	let search = $state('');
	let activeTab = $state<'all' | 'work' | 'composer' | 'tag'>('all');
	let selectedTag = $state<string | null>(null);

	// Player modal state
	let playingId = $state<string | null>(null);
	let playingAnnotation = $state<any | null>(null);
	let playerModalEl: HTMLElement | null = $state(null);

	// Toast state
	let toastMsg = $state('');
	let toastTimer = 0;

	function showToast(msg: string) {
		toastMsg = msg;
		clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => (toastMsg = ''), 3000);
	}

	onMount(async () => {
		await import('$glip/glip-player.js');
	});

	// Filtered list
	let filteredItems = $derived(() => {
		let list = items;
		const q = search.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(item) =>
					item.title?.toLowerCase().includes(q) ||
					item.work?.toLowerCase().includes(q) ||
					item.composer?.toLowerCase().includes(q) ||
					item.tags?.some((t: string) => t.toLowerCase().includes(q))
			);
		}
		if (selectedTag) {
			list = list.filter((item) =>
				item.tags?.some((t: string) => t.toLowerCase() === selectedTag?.toLowerCase())
			);
		}
		return list;
	});

	// Available tags
	let allTags = $derived(() => {
		const set = new Set<string>();
		for (const item of items) {
			for (const t of item.tags || []) set.add(t);
		}
		return Array.from(set).sort();
	});

	// Grouping
	let groupedItems = $derived(() => {
		const list = filteredItems();
		if (activeTab === 'work') {
			const map = new Map<string, typeof list>();
			for (const item of list) {
				const key = item.work?.trim() || 'Sin obra especificada';
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(item);
			}
			return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		}
		if (activeTab === 'composer') {
			const map = new Map<string, typeof list>();
			for (const item of list) {
				const key = item.composer?.trim() || 'Sin compositor especificado';
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(item);
			}
			return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		}
		if (activeTab === 'tag') {
			const map = new Map<string, typeof list>();
			for (const item of list) {
				const tags = item.tags && item.tags.length > 0 ? item.tags : ['sin tags'];
				for (const t of tags) {
					if (!map.has(t)) map.set(t, []);
					map.get(t)!.push(item);
				}
			}
			return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		}
		return [];
	});

	async function playItem(id: string) {
		playingId = id;
		try {
			const res = await fetch(`/api/annotations/${id}`);
			if (res.ok) {
				playingAnnotation = await res.json();
				if (playerModalEl) {
					(playerModalEl as any).annotation = playingAnnotation;
				}
			}
		} catch (e) {
			showToast('Error al cargar la anotación');
		}
	}

	function closePlayer() {
		playingId = null;
		playingAnnotation = null;
	}

	function copyEmbed(id: string) {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		const code = `<iframe src="${origin}/embed/${id}" width="100%" height="480" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
		navigator.clipboard.writeText(code);
		showToast('✓ Código iframe copiado para Obsidian / web');
	}

	async function deleteItem(id: string) {
		if (!confirm('¿Eliminar esta anotación?')) return;
		try {
			const res = await fetch(`/api/annotations/${id}`, { method: 'DELETE' });
			if (res.ok) {
				items = items.filter((x) => x.id !== id);
				showToast('Anotación eliminada');
			}
		} catch {
			showToast('Error al eliminar');
		}
	}
</script>

<svelte:head>
	<title>glip · anotador multimedial</title>
</svelte:head>

<div class="mobwork-page">
	<!-- Header -->
	<header class="top-nav">
		<div class="brand">
			<h1>glip</h1>
			<span class="brand-sub">anotador multimedial</span>
		</div>

		<div class="nav-actions">
			<a href="/annotate" class="btn btn-primary">+ Anotar video</a>
			<a href="/dev" class="btn btn-subtle" title="Herramientas previas de análisis de audio">/dev</a>
		</div>
	</header>

	<!-- Search & Scope filters -->
	<section class="filter-section">
		<div class="search-box">
			<svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
					clip-rule="evenodd"
				/>
			</svg>
			<input
				type="search"
				placeholder="Buscar por obra, compositor, tags o título..."
				bind:value={search}
			/>
			{#if search}
				<button type="button" class="clear-btn" onclick={() => (search = '')}>×</button>
			{/if}
		</div>

		<!-- View modes -->
		<div class="scope-tabs">
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'all'}
				onclick={() => {
					activeTab = 'all';
					selectedTag = null;
				}}
			>
				Todas ({filteredItems().length})
			</button>
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'work'}
				onclick={() => {
					activeTab = 'work';
					selectedTag = null;
				}}
			>
				Por Obra
			</button>
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'composer'}
				onclick={() => {
					activeTab = 'composer';
					selectedTag = null;
				}}
			>
				Por Compositor
			</button>
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'tag'}
				onclick={() => {
					activeTab = 'tag';
				}}
			>
				Por Tags
			</button>
		</div>

		<!-- Tags Chips if present -->
		{#if allTags().length > 0}
			<div class="tags-scroller">
				{#each allTags() as tag}
					<button
						type="button"
						class="tag-chip"
						class:active={selectedTag === tag}
						onclick={() => (selectedTag = selectedTag === tag ? null : tag)}
					>
						#{tag}
					</button>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Main List -->
	<main class="content-body">
		{#if filteredItems().length === 0}
			<div class="empty-state">
				<div class="empty-icon">🎬</div>
				<h2>No hay anotaciones aún</h2>
				<p>Crea tu primera anotación sincronizada con video de YouTube o Vimeo para usar en clases o análisis.</p>
				<a href="/annotate" class="btn btn-primary">+ Anotar video</a>
			</div>
		{:else if activeTab === 'all'}
			<!-- Flat Mobwork Table/List -->
			<div class="mobwork-list">
				{#each filteredItems() as item (item.id)}
					<article class="mobwork-row">
						<!-- Thumbnail -->
						<div class="row-thumb" onclick={() => playItem(item.id)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && playItem(item.id)}>
							{#if item.thumbnail}
								<img src={item.thumbnail} alt={item.title} loading="lazy" />
							{:else}
								<div class="no-thumb">▶</div>
							{/if}
							<div class="play-overlay">▶</div>
							{#if item.clip && (item.clip.in > 0 || item.clip.out != null)}
								<span class="clip-pill">
									{formatTime(item.clip.in)} → {item.clip.out != null ? formatTime(item.clip.out) : 'fin'}
								</span>
							{/if}
						</div>

						<!-- Details -->
						<div class="row-info">
							<div class="row-header">
								<h2 class="row-title" onclick={() => playItem(item.id)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && playItem(item.id)}>
									{item.title || item.work || 'Anotación sin título'}
								</h2>
								{#if item.year}
									<span class="row-year">({item.year})</span>
								{/if}
							</div>

							<div class="row-meta">
								{#if item.composer}
									<span class="meta-item"><strong>{item.composer}</strong></span>
								{/if}
								{#if item.work && item.title !== item.work}
									<span class="meta-item">{item.work}</span>
								{/if}
								{#if item.shapeCount != null}
									<span class="meta-badge">{item.shapeCount} marcas</span>
								{/if}
								<span class="provider-pill">{item.provider || 'video'}</span>
							</div>

							{#if item.tags && item.tags.length > 0}
								<div class="row-tags">
									{#each item.tags as t}
										<span class="tag-pill" onclick={() => (selectedTag = t)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (selectedTag = t)}>#{t}</span>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Actions -->
						<div class="row-actions">
							<button type="button" class="btn btn-sm btn-play" onclick={() => playItem(item.id)}>
								▶ Ver
							</button>
							<button type="button" class="btn btn-sm btn-subtle" title="Copiar iframe para embeber" onclick={() => copyEmbed(item.id)}>
								📋 Embeber
							</button>
							{#if item.url}
								<a href={item.url} target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-subtle" title="Abrir video original en YouTube / web">
									↗ Video
								</a>
							{/if}
							<a href="/annotate/{item.id}" class="btn btn-sm btn-subtle" title="Editar anotación">
								✎ Editar
							</a>
							<button type="button" class="btn btn-sm btn-danger-link" title="Eliminar anotación" onclick={() => deleteItem(item.id)}>
								🗑
							</button>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<!-- Grouped Sections -->
			<div class="grouped-container">
				{#each groupedItems() as [groupName, groupList]}
					<section class="group-section">
						<div class="group-header">
							<h3>{groupName}</h3>
							<span class="group-count">{groupList.length}</span>
						</div>

						<div class="mobwork-list">
							{#each groupList as item (item.id)}
								<article class="mobwork-row">
									<div class="row-thumb" onclick={() => playItem(item.id)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && playItem(item.id)}>
										{#if item.thumbnail}
											<img src={item.thumbnail} alt={item.title} loading="lazy" />
										{:else}
											<div class="no-thumb">▶</div>
										{/if}
										<div class="play-overlay">▶</div>
									</div>

									<div class="row-info">
										<div class="row-header">
											<h4 class="row-title" onclick={() => playItem(item.id)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && playItem(item.id)}>
												{item.title || item.work || 'Anotación'}
											</h4>
											{#if item.year}<span class="row-year">({item.year})</span>{/if}
										</div>

										<div class="row-meta">
											{#if item.composer}<span class="meta-item">{item.composer}</span>{/if}
											{#if item.shapeCount != null}
												<span class="meta-badge">{item.shapeCount} marcas</span>
											{/if}
										</div>
									</div>

									<div class="row-actions">
										<button type="button" class="btn btn-sm btn-play" onclick={() => playItem(item.id)}>▶ Ver</button>
										<button type="button" class="btn btn-sm btn-subtle" title="Copiar iframe" onclick={() => copyEmbed(item.id)}>📋 Embeber</button>
										{#if item.url}
											<a href={item.url} target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-subtle" title="Abrir video original">↗ Video</a>
										{/if}
										<a href="/annotate/{item.id}" class="btn btn-sm btn-subtle" title="Editar">✎</a>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	</main>

	<!-- Player Modal -->
	{#if playingId}
		<div class="modal-backdrop" onclick={closePlayer} role="dialog" aria-modal="true">
			<div class="player-modal" onclick={(e) => e.stopPropagation()}>
				<div class="player-modal-head">
					<div class="modal-title">
						<strong>{playingAnnotation?.title || playingAnnotation?.work || 'Reproductor'}</strong>
						{#if playingAnnotation?.composer}
							<small>· {playingAnnotation.composer}</small>
						{/if}
					</div>
					<div class="modal-controls">
						<button type="button" class="btn btn-xs btn-subtle" onclick={() => copyEmbed(playingId!)}>📋 Copiar iframe</button>
						{#if playingAnnotation?.source?.url}
							<a href={playingAnnotation.source.url} target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-subtle" title="Abrir video en YouTube">↗ Video original</a>
						{/if}
						<a href="/annotate/{playingId}" class="btn btn-xs btn-subtle">✎ Editar</a>
						<button type="button" class="btn-close" onclick={closePlayer}>×</button>
					</div>
				</div>

				<div class="player-embed-mount">
					<!-- svelte-ignore element_invalid_self_closing_tag -->
					<glip-player
						bind:this={playerModalEl}
						src="/api/annotations/{playingId}"
						autoplay=""
						bridge=""
						meta="bottom"
					>
						{#if playingAnnotation}
							{@html `<script type="application/json">${JSON.stringify(playingAnnotation).replace(/</g, '\\u003c')}</` + 'script>'}
						{/if}
					</glip-player>
				</div>

				{#if playingAnnotation?.notes}
					<div class="player-notes">
						<strong>Notas pedagógicas:</strong>
						<p>{playingAnnotation.notes}</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Toast alert -->
	{#if toastMsg}
		<div class="toast-popup">{toastMsg}</div>
	{/if}
</div>

<style>
	.mobwork-page {
		min-height: 100vh;
		background: #f1efe6;
		color: #1c1b18;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		padding-bottom: 60px;
	}

	@media (prefers-color-scheme: dark) {
		.mobwork-page {
			background: #12151b;
			color: #e5e7eb;
		}
	}

	.top-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		background: rgba(255, 255, 255, 0.7);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	@media (prefers-color-scheme: dark) {
		.top-nav {
			background: rgba(18, 21, 27, 0.85);
			border-bottom-color: rgba(255, 255, 255, 0.08);
		}
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.brand h1 {
		margin: 0;
		font-size: 22px;
		letter-spacing: -0.5px;
		font-weight: 800;
	}

	.brand-sub {
		font-size: 13px;
		opacity: 0.6;
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.filter-section {
		max-width: 960px;
		margin: 20px auto 0;
		padding: 0 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 14px;
		width: 18px;
		height: 18px;
		opacity: 0.4;
		pointer-events: none;
	}

	.search-box input {
		width: 100%;
		padding: 12px 38px 12px 42px;
		border-radius: 10px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: #fff;
		font-size: 14px;
		color: inherit;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	@media (prefers-color-scheme: dark) {
		.search-box input {
			background: #1a1e27;
			border-color: rgba(255, 255, 255, 0.1);
		}
	}

	.search-box input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
	}

	.clear-btn {
		position: absolute;
		right: 12px;
		background: transparent;
		border: none;
		font-size: 18px;
		cursor: pointer;
		opacity: 0.5;
	}

	.scope-tabs {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.tab-btn {
		background: transparent;
		border: 1px solid transparent;
		padding: 6px 14px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 500;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
		white-space: nowrap;
		transition: all 0.15s;
	}

	.tab-btn:hover {
		opacity: 1;
		background: rgba(0, 0, 0, 0.05);
	}

	.tab-btn.active {
		opacity: 1;
		background: #2563eb;
		color: #fff;
	}

	.tags-scroller {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 4px 0;
	}

	.tag-chip {
		background: rgba(0, 0, 0, 0.05);
		border: 1px solid rgba(0, 0, 0, 0.06);
		padding: 3px 10px;
		border-radius: 14px;
		font-size: 12px;
		color: inherit;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}

	@media (prefers-color-scheme: dark) {
		.tag-chip {
			background: rgba(255, 255, 255, 0.08);
			border-color: rgba(255, 255, 255, 0.08);
		}
	}

	.tag-chip.active {
		background: #10b981;
		color: #fff;
		border-color: #10b981;
	}

	.content-body {
		max-width: 960px;
		margin: 16px auto 0;
		padding: 0 16px;
	}

	.mobwork-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.mobwork-row {
		display: grid;
		grid-template-columns: 140px 1fr auto;
		gap: 16px;
		align-items: center;
		padding: 12px;
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
		transition: transform 0.1s, box-shadow 0.1s;
	}

	@media (prefers-color-scheme: dark) {
		.mobwork-row {
			background: #1a1e27;
			border-color: rgba(255, 255, 255, 0.06);
		}
	}

	.mobwork-row:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
	}

	@media (max-width: 680px) {
		.mobwork-row {
			grid-template-columns: 110px 1fr;
			grid-template-areas:
				'thumb info'
				'actions actions';
			gap: 10px;
		}

		.row-thumb {
			grid-area: thumb;
		}
		.row-info {
			grid-area: info;
		}
		.row-actions {
			grid-area: actions;
			justify-content: flex-end;
			border-top: 1px solid rgba(0, 0, 0, 0.05);
			padding-top: 8px;
		}
	}

	.row-thumb {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: #000;
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
	}

	.row-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.no-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #999;
		font-size: 20px;
	}

	.play-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 20px;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.row-thumb:hover .play-overlay {
		opacity: 1;
	}

	.clip-pill {
		position: absolute;
		bottom: 4px;
		left: 4px;
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		font-size: 10px;
		font-family: monospace;
		padding: 2px 6px;
		border-radius: 3px;
	}

	.row-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		overflow: hidden;
	}

	.row-header {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.row-title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
	}

	.row-title:hover {
		color: #2563eb;
	}

	.row-year {
		font-size: 12px;
		opacity: 0.6;
	}

	.row-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 12px;
		opacity: 0.85;
	}

	.meta-badge {
		background: rgba(37, 99, 235, 0.12);
		color: #2563eb;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
	}

	.provider-pill {
		background: rgba(0, 0, 0, 0.05);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.7;
	}

	.row-tags {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		margin-top: 2px;
	}

	.tag-pill {
		font-size: 11px;
		opacity: 0.65;
		cursor: pointer;
	}

	.tag-pill:hover {
		opacity: 1;
		text-decoration: underline;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	/* Grouped Layout */
	.grouped-container {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.group-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.group-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		border-bottom: 2px solid rgba(0, 0, 0, 0.06);
		padding-bottom: 6px;
	}

	.group-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}

	.group-count {
		font-size: 12px;
		opacity: 0.5;
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 60px 20px;
		background: #fff;
		border-radius: 12px;
		border: 1px dashed rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	@media (prefers-color-scheme: dark) {
		.empty-state {
			background: #1a1e27;
			border-color: rgba(255, 255, 255, 0.1);
		}
	}

	.empty-icon {
		font-size: 40px;
	}

	.empty-state h2 {
		margin: 0;
		font-size: 18px;
	}

	.empty-state p {
		margin: 0;
		font-size: 13px;
		opacity: 0.7;
		max-width: 400px;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 600;
		padding: 8px 16px;
		border-radius: 8px;
		border: none;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}
	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-sm {
		padding: 5px 10px;
		font-size: 12px;
		border-radius: 6px;
	}
	.btn-xs {
		padding: 3px 8px;
		font-size: 11px;
		border-radius: 4px;
	}

	.btn-play {
		background: #10b981;
		color: #fff;
	}
	.btn-play:hover {
		background: #059669;
	}

	.btn-subtle {
		background: rgba(0, 0, 0, 0.05);
		color: inherit;
	}
	.btn-subtle:hover {
		background: rgba(0, 0, 0, 0.1);
	}

	@media (prefers-color-scheme: dark) {
		.btn-subtle {
			background: rgba(255, 255, 255, 0.08);
		}
		.btn-subtle:hover {
			background: rgba(255, 255, 255, 0.14);
		}
	}

	.btn-danger-link {
		background: transparent;
		color: #ef4444;
		opacity: 0.7;
	}
	.btn-danger-link:hover {
		opacity: 1;
		background: rgba(239, 68, 68, 0.1);
	}

	/* Player Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 16px;
	}

	.player-modal {
		background: #14171d;
		color: #fff;
		border-radius: 12px;
		width: 100%;
		max-width: 900px;
		overflow: hidden;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
		display: flex;
		flex-direction: column;
	}

	.player-modal-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 18px;
		background: #1e222b;
		border-bottom: 1px solid #2a2f3b;
	}

	.modal-title {
		font-size: 15px;
	}
	.modal-title small {
		opacity: 0.7;
	}

	.modal-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.btn-close {
		background: transparent;
		border: none;
		color: #fff;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		opacity: 0.7;
		padding: 0 6px;
	}
	.btn-close:hover {
		opacity: 1;
	}

	.player-embed-mount {
		width: 100%;
		background: #000;
	}

	glip-player {
		width: 100%;
		max-height: 70vh;
	}

	.player-notes {
		padding: 14px 18px;
		background: #181c24;
		border-top: 1px solid #2a2f3b;
		font-size: 13px;
		line-height: 1.5;
	}

	.player-notes p {
		margin: 4px 0 0;
		opacity: 0.85;
	}

	/* Toast */
	.toast-popup {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: #1f2937;
		color: #fff;
		padding: 10px 18px;
		border-radius: 20px;
		font-size: 13px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		z-index: 200;
		animation: toastFade 0.2s ease-out;
	}

	@keyframes toastFade {
		from {
			opacity: 0;
			transform: translate(-50%, 10px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
