export class AudioEngine {
    private ctx: AudioContext | null = null;
    private bufferCache: Map<string, AudioBuffer> = new Map();

    constructor() {}

    private initContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    async loadBuffer(url: string): Promise<AudioBuffer> {
        if (this.bufferCache.has(url)) {
            return this.bufferCache.get(url)!;
        }

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = this.initContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        
        this.bufferCache.set(url, audioBuffer);
        return audioBuffer;
    }

    async playTae(audioFile: string) {
        const ctx = this.initContext();
        const url = `/audio/${audioFile}`;
        
        try {
            const buffer = await this.loadBuffer(url);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start();
        } catch (e) {
            console.error("AudioEngine playback failed", e);
        }
    }
}

export const audioEngine = new AudioEngine();
