<script lang="ts">
	import Annotator from '$lib/Annotator.svelte';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	function handleSaved(saved: any) {
		if (saved?.id) {
			goto(`/annotate/${saved.id}`, { replaceState: true });
		}
	}
</script>

<svelte:head>
	<title>glip · anotar video</title>
</svelte:head>

<Annotator initialData={data.annotation} onSaved={handleSaved} />
