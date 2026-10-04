<script lang="ts">
	import Annotator from '$lib/Annotator.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function handleSaved(_saved: any) {
		// already on this id page
	}
</script>

<svelte:head>
	<title>{data.annotation.title || data.annotation.work || 'Editar anotación'} · glip</title>
</svelte:head>

<Annotator initialData={data.annotation} onSaved={handleSaved} />
