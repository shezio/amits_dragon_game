export class Music {
    constructor(ctx) {
        this.ctx = ctx;
        this.playing = false;
        this.muted = false;
        this.volume = 0.3;
        this.speed = 1.0;
        this.master = ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(ctx.destination);
    }

    play() {
        if (this.playing) return;
        this.playing = true;
        this.playMelody();
        this.playBass();
        this.playArp();
        this.playDrums();
    }

    setVolume(v) {
        this.volume = v;
        this.master.gain.value = this.muted ? 0 : v;
    }

    setMute(m) {
        this.muted = m;
        this.master.gain.value = m ? 0 : this.volume;
    }

    setSpeed(s) {
        this.speed = s;
    }

    playMelody() {
        const notes = [
            587, 659, 740, 880, 740, 659, 587, 0,
            880, 988, 1175, 988, 880, 740, 659, 0,
            740, 880, 988, 1175, 1319, 1175, 988, 880,
            740, 659, 587, 659, 740, 880, 740, 0,
            494, 587, 659, 740, 880, 740, 659, 587,
            494, 587, 740, 880, 988, 740, 587, 0
        ];
        let idx = 0;
        const next = () => {
            if (!this.playing) return;
            const t = this.ctx.currentTime;
            const freq = notes[idx % notes.length];

            if (freq > 0) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                const dur = 0.18 / this.speed;
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.setValueAtTime(0.1, t + dur * 0.7);
                gain.gain.linearRampToValueAtTime(0, t + dur);
                osc.connect(gain);
                gain.connect(this.master);
                osc.start(t);
                osc.stop(t + dur + 0.01);
            }

            idx++;
            const base = 220;
            const swing = idx % 2 === 0 ? base + 20 : base - 10;
            setTimeout(next, swing / this.speed);
        };
        setTimeout(next, 400);
    }

    playBass() {
        const bassNotes = [
            147, 147, 220, 220, 175, 175, 220, 220,
            147, 147, 196, 196, 165, 165, 196, 196
        ];
        let idx = 0;
        const next = () => {
            if (!this.playing) return;
            const t = this.ctx.currentTime;
            const freq = bassNotes[idx % bassNotes.length];

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            const dur = 0.28 / this.speed;
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(gain);
            gain.connect(this.master);
            osc.start(t);
            osc.stop(t + dur + 0.01);

            idx++;
            setTimeout(next, 420 / this.speed);
        };
        setTimeout(next, 500);
    }

    playArp() {
        const arpNotes = [587, 740, 880, 1175, 880, 740, 587, 494];
        let idx = 0;
        const next = () => {
            if (!this.playing) return;
            const t = this.ctx.currentTime;
            const freq = arpNotes[idx % arpNotes.length];

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.025, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.connect(gain);
            gain.connect(this.master);
            osc.start(t);
            osc.stop(t + 0.11);

            idx++;
            setTimeout(next, 110 / this.speed);
        };
        setTimeout(next, 700);
    }

    playDrums() {
        let beat = 0;
        const next = () => {
            if (!this.playing) return;
            const t = this.ctx.currentTime;

            if (beat % 4 === 0) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(120, t);
                osc.frequency.exponentialRampToValueAtTime(35, t + 0.07);
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
                osc.connect(gain);
                gain.connect(this.master);
                osc.start(t);
                osc.stop(t + 0.1);
            }

            if (beat % 4 === 2) {
                const bufferSize = this.ctx.sampleRate * 0.04;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.value = 4000;
                gain.gain.setValueAtTime(0.07, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.master);
                noise.start(t);
                noise.stop(t + 0.05);
            }

            if (beat % 2 === 1) {
                const bufferSize = this.ctx.sampleRate * 0.015;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.value = 9000;
                gain.gain.setValueAtTime(0.025, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.master);
                noise.start(t);
                noise.stop(t + 0.02);
            }

            beat++;
            setTimeout(next, 210 / this.speed);
        };
        setTimeout(next, 400);
    }

    stop() {
        this.playing = false;
    }
}
