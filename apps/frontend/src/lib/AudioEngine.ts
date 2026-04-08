export class AudioEngine {
    private ctx: AudioContext | null = null;
    private bufferCache: Map<string, AudioBuffer> = new Map();
    private proximitySources: Map<string, { source: AudioBufferSourceNode, gainNode: GainNode }> = new Map();
    private currentTaeSource: AudioBufferSourceNode | null = null;
    // Guard: prevents updateProximity() from starting new sources after stopAllProximity()
    private proximityEnabled: boolean = false;

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

    async playTae(audioFile: string, time: number = 0, duration: number | null = null, reverse: boolean = false) {
        this.stopTae();
        const ctx = this.initContext();
        const url = `/audio/${audioFile}`;
        
        try {
            const buffer = await this.loadBuffer(url);
            const source = ctx.createBufferSource();
            source.buffer = buffer;

            // Simple reverse support
            if (reverse) {
                const reversedBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
                for (let i = 0; i < buffer.numberOfChannels; i++) {
                    const chanData = buffer.getChannelData(i);
                    const revChanData = reversedBuffer.getChannelData(i);
                    for (let j = 0; j < buffer.length; j++) {
                        revChanData[j] = chanData[buffer.length - 1 - j];
                    }
                }
                source.buffer = reversedBuffer;
            }

            source.connect(ctx.destination);
            source.start(ctx.currentTime + time);
            if (duration) {
                source.stop(ctx.currentTime + time + duration);
            }
            this.currentTaeSource = source;
        } catch (e) {
            console.error("AudioEngine playback failed", e);
        }
    }

    stopTae() {
        if (this.currentTaeSource) {
            try {
                this.currentTaeSource.stop();
            } catch (e) {}
            this.currentTaeSource = null;
        }
    }

    async playTimeline(timeline: any[]) {
        const ctx = this.initContext();
        const startTime = ctx.currentTime;

        for (const event of timeline) {
            try {
                const url = `/audio/${event.audio}`;
                const buffer = await this.loadBuffer(url);
                const source = ctx.createBufferSource();
                const gainNode = ctx.createGain();

                source.buffer = buffer;
                
                if (event.reverse) {
                    const reversedBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
                    for (let i = 0; i < buffer.numberOfChannels; i++) {
                        const chanData = buffer.getChannelData(i);
                        const revChanData = reversedBuffer.getChannelData(i);
                        for (let j = 0; j < buffer.length; j++) {
                            revChanData[j] = chanData[buffer.length - 1 - j];
                        }
                    }
                    source.buffer = reversedBuffer;
                }

                gainNode.gain.value = event.gain || 0.8;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);

                source.start(startTime + event.start);
                if (event.duration) {
                    source.stop(startTime + event.start + event.duration);
                }
            } catch (e) {
                console.error("Timeline playback item failed", e);
            }
        }
    }

    // Call this from any click/keydown handler to unblock the AudioContext
    resume() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    enableProximity() {
        this.proximityEnabled = true;
    }

    async updateProximity(sounds: { id: string, audio: string, gain: number }[]) {
        // Guard: if stopAllProximity() was called, don't start new sources
        if (!this.proximityEnabled) return;

        const ctx = this.initContext();
        const activeIds = new Set(sounds.map(s => s.id));

        // 1. Fade out and stop sounds no longer in zone
        for (const [id, data] of this.proximitySources.entries()) {
            if (!activeIds.has(id)) {
                try {
                    data.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
                    data.source.stop(ctx.currentTime + 0.1);
                } catch(e) {}
                this.proximitySources.delete(id);
            }
        }

        // 2. Start/Update sounds (only if still enabled after awaiting load)
        for (const s of sounds) {
            let data = this.proximitySources.get(s.id);
            if (!data) {
                try {
                    const url = `/audio/${s.audio}`;
                    const buffer = await this.loadBuffer(url);

                    // Re-check after async load — user may have left the canvas
                    if (!this.proximityEnabled) return;

                    const source = ctx.createBufferSource();
                    const gainNode = ctx.createGain();

                    source.buffer = buffer;
                    source.loop = true;
                    gainNode.gain.value = 0;

                    source.connect(gainNode);
                    gainNode.connect(ctx.destination);

                    source.start();
                    data = { source, gainNode };
                    this.proximitySources.set(s.id, data);
                } catch(e) { continue; }
            }

            // Guard: stopAllProximity() may have fired while we were awaiting loadBuffer
            if (!this.proximityEnabled) return;

            // Smoothly update gain
            data.gainNode.gain.setTargetAtTime(s.gain, ctx.currentTime, 0.05);
        }
    }

    async stopAllProximity() {
        // Disable first — blocks any in-flight updateProximity() calls
        this.proximityEnabled = false;

        const ctx = this.ctx;
        if (!ctx) {
            this.proximitySources.clear();
            return;
        }

        // Kill all scheduled gain changes and set to 0 immediately
        for (const [, data] of this.proximitySources.entries()) {
            try {
                data.gainNode.gain.cancelScheduledValues(ctx.currentTime);
                data.gainNode.gain.setValueAtTime(0, ctx.currentTime);
            } catch(e) {}
        }

        const toStop = new Map(this.proximitySources);
        this.proximitySources.clear();

        setTimeout(() => {
            for (const [, data] of toStop.entries()) {
                try { data.source.stop(); } catch(e) {}
            }
        }, 120);
    }

    getPeaks(buffer: AudioBuffer, width: number): { min: Float32Array, max: Float32Array } {
        const step = Math.floor(buffer.length / width);
        const data = buffer.getChannelData(0);
        const minPeaks = new Float32Array(width);
        const maxPeaks = new Float32Array(width);
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[i * step + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            minPeaks[i] = min;
            maxPeaks[i] = max;
        }
        return { min: minPeaks, max: maxPeaks };
    }
}

export const audioEngine = new AudioEngine();
