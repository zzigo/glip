<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let playerEl: HTMLElement | null = $state(null);

	onMount(async () => {
		await import('$glip/glip-player.js');
		if (playerEl) {
			(playerEl as any).annotation = data.annotation;
		}
	});

	$effect(() => {
		if (playerEl && data.annotation) {
			(playerEl as any).annotation = data.annotation;
		}
	});
</script>

<svelte:head>
	<title>{data.annotation.title || data.annotation.work || 'glip player'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="embed-wrapper">
	<!-- svelte-ignore element_invalid_self_closing_tag -->
	<glip-player
		bind:this={playerEl}
		src="/api/annotations/{data.annotation.id}"
		bridge=""
		meta={data.meta}
		autoplay={data.autoplay ? '' : undefined}
		loop={data.loop ? '' : undefined}
	>
		{@html `<script type="application/json">${JSON.stringify(data.annotation).replace(/</g, '\\u003c')}</` + 'script>'}
	</glip-player>

	{#if data.annotation?.source?.url}
		<a
			href={data.annotation.source.url}
			target="_blank"
			rel="noreferrer"
			class="btn-full-video"
			title="Abrir video completo en pestaña nueva"
			aria-label="Abrir video completo"
		>
			↗ Video completo
		</a>
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		background: #000;
		color: #fff;
		overflow: hidden;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	.embed-wrapper {
		position: relative;
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		box-sizing: border-box;
	}

	glip-player {
		width: 100%;
		max-height: 100vh;
		--glip-radius: 0px;
	}

	.btn-full-video {
		position: absolute;
		top: 8px;
		right: 8px;
		background: rgba(20, 23, 29, 0.75);
		backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #e4e7eb;
		text-decoration: none;
		font-size: 11px;
		font-weight: 500;
		padding: 4px 8px;
		border-radius: 4px;
		opacity: 0;
		transition: opacity 0.2s, background 0.2s;
		z-index: 20;
		pointer-events: auto;
	}

	.embed-wrapper:hover .btn-full-video {
		opacity: 0.9;
	}

	.btn-full-video:hover {
		opacity: 1 !important;
		background: rgba(37, 99, 235, 0.9);
		color: #fff;
	}
</style>
