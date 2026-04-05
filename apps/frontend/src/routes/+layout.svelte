<script>
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>GLIP | Operative Multimodal Musical Database</title>
</svelte:head>

<div class="app-container">
	<header>
		<div class="logo">GLIP</div>
		<div class="status">
			<span class="indicator active"></span>
			LIVE
		</div>
	</header>
	
	<main>
		{@render children()}
	</main>

	<footer>
		<div class="hud">
			<span>MODE: BROWSE</span>
			<span>LATENCY: 12ms</span>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
		color: #e0e0e0;
		font-family: 'JetBrains Mono', monospace;
		overflow: hidden;
	}

	.app-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	header {
		height: 40px;
		background: #151515;
		border-bottom: 1px solid #333;
		display: flex;
		align-items: center;
		padding: 0 20px;
		justify-content: space-between;
	}

	.logo {
		font-weight: bold;
		letter-spacing: 2px;
	}

	.status {
		font-size: 10px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #555;
	}

	.indicator.active {
		background: #00ff88;
		box-shadow: 0 0 8px #00ff88;
	}

	main {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	footer {
		height: 30px;
		background: #151515;
		border-top: 1px solid #333;
		display: flex;
		align-items: center;
		padding: 0 20px;
		font-size: 10px;
	}

	.hud {
		display: flex;
		gap: 20px;
		color: #888;
	}
</style>
