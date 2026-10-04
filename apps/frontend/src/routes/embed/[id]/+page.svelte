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
</style>
