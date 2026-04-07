<script lang="ts">
	let dragging = $state(false);
	let uploading = $state(false);
	let status = $state('');

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		uploading = true;
		status = `UPLOADING ${files.length} FILE(S)...`;

		const formData = new FormData();
		for (let i = 0; i < files.length; i++) {
			formData.append('files', files[i]);
		}

		try {
			const response = await fetch('/api/ingest', {
				method: 'POST',
				body: formData
			});
			if (response.ok) {
				status = 'INGESTION STARTED';
				setTimeout(() => status = '', 3000);
			} else {
				status = 'UPLOAD FAILED';
			}
		} catch (err) {
			status = 'ERROR CONNECTING TO API';
		} finally {
			uploading = false;
		}
	}
</script>

<div 
	class="dropzone" 
	class:dragging 
	ondragover={(e) => { e.preventDefault(); dragging = true; }}
	ondragleave={() => dragging = false}
	ondrop={handleDrop}
>
	{#if uploading}
		<div class="loader">PROCESS...</div>
	{:else if status}
		<div class="status">{status}</div>
	{:else}
		<div class="label">DROP AUDIO FILES (TAE INGEST)</div>
	{/if}
</div>

<style>
	.dropzone {
		width: 100%;
		height: 80px;
		border: 1px dashed #555;
		background: #050505;
		display: flex;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 10px;
		color: #888;
		margin-top: 10px;
	}

	.dropzone:hover {
		border-color: #777;
		background: #080808;
	}

	.dropzone.dragging {
		border-color: var(--accent);
		background: #0a1510;
		color: var(--accent);
		border-style: solid;
	}

	.status {
		color: var(--accent);
	}

	.loader {
		animation: blink 1s infinite;
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
</style>
