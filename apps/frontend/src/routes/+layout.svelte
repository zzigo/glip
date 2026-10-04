<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>glip · anotador</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content="#f1efe6" />
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

{@render children()}
