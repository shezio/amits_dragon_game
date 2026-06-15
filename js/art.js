// ══════════════════════════════════════════════════════════════
// ART GENERATOR — Pre-renders all game visuals to image buffers
// Uses multi-pass blur, scatter, and layering for painterly look.
// After generation, game loop only uses drawImage().
// ══════════════════════════════════════════════════════════════

export class ArtGenerator {
    constructor(gameCanvas) {
        this.w = gameCanvas.width || 1920;
        this.h = gameCanvas.height || 1080;
        this.backgrounds = {};
        this.trees = {};
        this.grounds = {};
        this.lightOverlay = {};
        this.particleImgs = {};
        this.kidFrames = [];
        this.wizard = null;
        this.dragon = null;
        this.gate = null;
        this.gateOpen = null;
        this.star = null;
        this.wisp = null;
    }

    async generate(onProgress) {
        const steps = 12;
        let step = 0;
        const tick = () => { step++; onProgress(step / steps); };

        this.genBackgrounds('meadow', ['#87CEEB','#B2EBF2','#C8E6C9','#A5D6A7'], '#FFF9C4'); tick();
        this.genBackgrounds('forest', ['#2E7D32','#388E3C','#4CAF50','#81C784'], '#FFFDE7'); tick();
        this.genBackgrounds('lake', ['#4FC3F7','#81D4FA','#B3E5FC','#E1F5FE'], '#E0F7FA'); tick();
        this.genBackgrounds('snow', ['#78909C','#90A4AE','#B0BEC5','#ECEFF1'], '#FAFAFA'); tick();
        this.genBackgrounds('cave', ['#1A237E','#283593','#3949AB','#5C6BC0'], '#EDE7F6'); tick();
        this.genTrees(); tick();
        this.genGrounds(); tick();
        this.genCharacters(); tick();
        this.genNPCs(); tick();
        this.genItems(); tick();
        this.genParticles(); tick();
        this.genOverlays(); tick();

        await new Promise(r => setTimeout(r, 100));
    }

    buf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

    // Soft painted fill with noise
    paintFill(cx, x, y, w, h, colors, blur = 20) {
        colors.forEach((col, i) => {
            cx.fillStyle = col;
            cx.globalAlpha = 0.4 + Math.random() * 0.3;
            const bx = x + (Math.random() - 0.5) * w * 0.3;
            const by = y + (i / colors.length) * h;
            cx.beginPath();
            cx.ellipse(bx + w / 2, by, w * 0.7, h / colors.length * 1.2, 0, 0, Math.PI * 2);
            cx.fill();
        });
        cx.globalAlpha = 1;
        cx.filter = `blur(${blur}px)`;
        cx.drawImage(cx.canvas, 0, 0);
        cx.filter = 'none';
    }

    genBackgrounds(zone, colors, lightCol) {
        const layers = [];
        // Layer 0: Sky gradient
        const sky = this.buf(this.w, this.h);
        const sc = sky.getContext('2d');
        const grad = sc.createLinearGradient(0, 0, 0, this.h);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(0.4, colors[1]);
        grad.addColorStop(0.7, colors[2]);
        grad.addColorStop(1, colors[3]);
        sc.fillStyle = grad; sc.fillRect(0, 0, this.w, this.h);
        // Soft light source
        sc.globalCompositeOperation = 'overlay';
        const sunGrad = sc.createRadialGradient(this.w * 0.75, this.h * 0.15, 0, this.w * 0.75, this.h * 0.15, this.h * 0.5);
        sunGrad.addColorStop(0, lightCol);
        sunGrad.addColorStop(0.5, lightCol + '60');
        sunGrad.addColorStop(1, 'transparent');
        sc.fillStyle = sunGrad; sc.fillRect(0, 0, this.w, this.h);
        sc.globalCompositeOperation = 'source-over';
        // Soft clouds
        sc.globalAlpha = 0.25;
        for (let i = 0; i < 8; i++) {
            const cx = Math.random() * this.w, cy = 30 + Math.random() * this.h * 0.25;
            sc.filter = 'blur(30px)';
            sc.fillStyle = '#fff';
            sc.beginPath(); sc.ellipse(cx, cy, 80 + Math.random() * 100, 25 + Math.random() * 15, 0, 0, Math.PI * 2); sc.fill();
        }
        sc.filter = 'none'; sc.globalAlpha = 1;
        layers.push(sky);

        // Layer 1: Far hills
        const hills = this.buf(this.w, this.h);
        const hc = hills.getContext('2d');
        hc.filter = 'blur(8px)';
        for (let i = 0; i < 3; i++) {
            hc.globalAlpha = 0.25 + i * 0.1;
            hc.fillStyle = this.mixColor(colors[Math.min(i + 1, colors.length - 1)], '#000', 0.2 + i * 0.05);
            hc.beginPath(); hc.moveTo(0, this.h);
            for (let x = 0; x <= this.w; x += 20) {
                const noiseY = this.h * (0.45 + i * 0.08) - Math.sin(x * 0.003 + i * 2) * 50 - Math.sin(x * 0.008 + i) * 25;
                hc.lineTo(x, noiseY);
            }
            hc.lineTo(this.w, this.h); hc.closePath(); hc.fill();
        }
        hc.filter = 'none'; hc.globalAlpha = 1;
        layers.push(hills);

        // Layer 2: Mid foliage
        const mid = this.buf(this.w, this.h);
        const mc = mid.getContext('2d');
        mc.filter = 'blur(4px)';
        mc.globalAlpha = 0.4;
        mc.fillStyle = this.mixColor(colors[2], '#1B5E20', 0.3);
        mc.beginPath(); mc.moveTo(0, this.h);
        for (let x = 0; x <= this.w; x += 10) {
            const noiseY = this.h * 0.6 - Math.sin(x * 0.005) * 30 - Math.abs(Math.sin(x * 0.02)) * 20;
            mc.lineTo(x, noiseY);
        }
        mc.lineTo(this.w, this.h); mc.closePath(); mc.fill();
        mc.filter = 'none'; mc.globalAlpha = 1;
        layers.push(mid);

        this.backgrounds[zone] = layers;
    }

    genTrees() {
        const configs = {
            meadow: [['#2E7D32','#43A047','#66BB6A'], ['#1B5E20','#388E3C','#4CAF50'], ['#33691E','#558B2F','#7CB342']],
            forest: [['#1B5E20','#2E7D32','#388E3C'], ['#004D40','#00695C','#00897B'], ['#33691E','#689F38','#8BC34A']],
            lake: [['#00695C','#00897B','#26A69A'], ['#1B5E20','#2E7D32','#4CAF50'], ['#004D40','#00796B','#009688']],
            snow: [['#37474F','#455A64','#B0BEC5'], ['#263238','#37474F','#90A4AE'], ['#455A64','#546E7A','#CFD8DC']],
            cave: [['#1A237E','#283593','#3949AB'], ['#311B92','#4527A0','#5E35B1'], ['#0D47A1','#1565C0','#1976D2']],
        };
        Object.entries(configs).forEach(([zone, palette]) => {
            this.trees[zone] = palette.map(colors => this.makeTree(colors, zone === 'snow'));
        });
    }

    makeTree(colors, snowy) {
        const c = this.buf(140, 200);
        const cx = c.getContext('2d');

        // Trunk
        const tGrad = cx.createLinearGradient(60, 120, 80, 200);
        tGrad.addColorStop(0, '#5D4037');
        tGrad.addColorStop(1, '#3E2723');
        cx.fillStyle = tGrad;
        cx.beginPath();
        cx.moveTo(62, 120); cx.quadraticCurveTo(58, 160, 60, 200);
        cx.lineTo(80, 200); cx.quadraticCurveTo(82, 160, 78, 120);
        cx.closePath(); cx.fill();

        // Canopy (multiple soft blobs)
        cx.filter = 'blur(6px)';
        const positions = [[70, 70, 45, 40], [50, 90, 35, 30], [90, 85, 32, 28], [70, 50, 30, 25], [60, 110, 28, 22]];
        positions.forEach(([x, y, rx, ry], i) => {
            cx.fillStyle = colors[i % colors.length];
            cx.globalAlpha = 0.7;
            cx.beginPath();
            cx.ellipse(x, y, rx + Math.random() * 8, ry + Math.random() * 6, Math.random() * 0.3, 0, Math.PI * 2);
            cx.fill();
        });
        cx.filter = 'none'; cx.globalAlpha = 1;

        // Highlights
        cx.globalCompositeOperation = 'overlay';
        cx.filter = 'blur(10px)';
        cx.fillStyle = 'rgba(255,255,200,0.2)';
        cx.beginPath(); cx.ellipse(60, 55, 25, 20, 0, 0, Math.PI * 2); cx.fill();
        cx.filter = 'none';
        cx.globalCompositeOperation = 'source-over';

        if (snowy) {
            cx.filter = 'blur(4px)';
            cx.globalAlpha = 0.6;
            cx.fillStyle = '#fff';
            cx.beginPath(); cx.ellipse(70, 50, 35, 15, -0.1, 0, Math.PI * 2); cx.fill();
            cx.beginPath(); cx.ellipse(55, 75, 20, 10, 0.2, 0, Math.PI * 2); cx.fill();
            cx.filter = 'none'; cx.globalAlpha = 1;
        }

        return c;
    }

    genGrounds() {
        const gColors = {
            meadow: ['#2E7D32','#388E3C','#1B5E20'],
            forest: ['#1B5E20','#004D40','#263238'],
            lake: ['#004D40','#00695C','#00838F'],
            snow: ['#B0BEC5','#CFD8DC','#ECEFF1'],
            cave: ['#1A237E','#0D47A1','#263238'],
        };
        Object.entries(gColors).forEach(([zone, colors]) => {
            const c = this.buf(this.w, 300);
            const cx = c.getContext('2d');
            const g = cx.createLinearGradient(0, 0, 0, 300);
            g.addColorStop(0, colors[0]); g.addColorStop(0.3, colors[1]); g.addColorStop(1, colors[2]);
            cx.fillStyle = g; cx.fillRect(0, 0, this.w, 300);
            // Grass/texture on top edge
            cx.filter = 'blur(2px)';
            cx.fillStyle = this.mixColor(colors[0], '#fff', 0.15);
            for (let x = 0; x < this.w; x += 3) {
                const h = 4 + Math.sin(x * 0.2) * 3 + Math.random() * 3;
                cx.fillRect(x, 15 - h, 2, h);
            }
            cx.filter = 'none';
            this.grounds[zone] = c;
        });
    }

    genCharacters() {
        const kidColors = [
            { body: '#FF7043', accent: '#E64A19', hair: '#5D4037' },
            { body: '#42A5F5', accent: '#1E88E5', hair: '#212121' },
            { body: '#66BB6A', accent: '#43A047', hair: '#4E342E' },
        ];
        this.kidFrames = [];
        for (let frame = 0; frame < 8; frame++) {
            const c = this.buf(130, 100);
            const cx = c.getContext('2d');
            for (let k = 0; k < 3; k++) {
                const col = kidColors[k];
                const ox = 25 + k * 35;
                const phase = frame * Math.PI / 4 + k * 0.9;
                const bobY = Math.sin(phase) * 2.5;
                const legMove = Math.sin(phase) * 5;

                // Shadow
                cx.filter = 'blur(3px)';
                cx.fillStyle = 'rgba(0,0,0,0.15)';
                cx.beginPath(); cx.ellipse(ox, 92, 12, 4, 0, 0, Math.PI * 2); cx.fill();
                cx.filter = 'none';

                // Legs
                cx.fillStyle = '#5D4037';
                cx.beginPath(); cx.roundRect(ox - 6, 68 + bobY, 5, 16 + legMove, 2); cx.fill();
                cx.beginPath(); cx.roundRect(ox + 1, 68 + bobY, 5, 16 - legMove, 2); cx.fill();

                // Body
                const bodyGrad = cx.createLinearGradient(ox - 9, 42 + bobY, ox + 9, 68 + bobY);
                bodyGrad.addColorStop(0, col.body); bodyGrad.addColorStop(1, col.accent);
                cx.fillStyle = bodyGrad;
                cx.beginPath(); cx.roundRect(ox - 9, 42 + bobY, 18, 26, 5); cx.fill();

                // Arms
                const armSwing = Math.sin(phase + 0.5) * 4;
                cx.fillStyle = col.body;
                cx.beginPath(); cx.roundRect(ox - 12, 46 + bobY + armSwing, 4, 14, 2); cx.fill();
                cx.beginPath(); cx.roundRect(ox + 8, 46 + bobY - armSwing, 4, 14, 2); cx.fill();

                // Head
                cx.fillStyle = '#FFCC80';
                cx.beginPath(); cx.arc(ox, 34 + bobY, 10, 0, Math.PI * 2); cx.fill();

                // Hair
                cx.fillStyle = col.hair;
                cx.beginPath(); cx.ellipse(ox, 28 + bobY, 11, 7, 0, Math.PI + 0.4, -0.4); cx.fill();

                // Face
                cx.fillStyle = '#3E2723';
                cx.beginPath(); cx.arc(ox - 3, 34 + bobY, 1.5, 0, Math.PI * 2); cx.fill();
                cx.beginPath(); cx.arc(ox + 3, 34 + bobY, 1.5, 0, Math.PI * 2); cx.fill();
                // Smile
                cx.strokeStyle = '#5D4037'; cx.lineWidth = 1.2; cx.lineCap = 'round';
                cx.beginPath(); cx.arc(ox, 37 + bobY, 3.5, 0.2, Math.PI - 0.2); cx.stroke();

                // Backpack
                cx.fillStyle = col.accent;
                cx.beginPath(); cx.roundRect(ox + 6, 44 + bobY, 7, 16, 3); cx.fill();
            }
            this.kidFrames.push(c);
        }
    }

    genNPCs() {
        // Wizard
        const wiz = this.buf(80, 115);
        const wc = wiz.getContext('2d');

        // Robe
        const robeGrad = wc.createLinearGradient(25, 40, 55, 110);
        robeGrad.addColorStop(0, '#7B1FA2'); robeGrad.addColorStop(1, '#4A148C');
        wc.fillStyle = robeGrad;
        wc.beginPath(); wc.moveTo(30, 45); wc.lineTo(22, 110); wc.lineTo(58, 110); wc.lineTo(50, 45); wc.closePath(); wc.fill();

        // Stars on robe
        wc.fillStyle = '#FFD700'; wc.globalAlpha = 0.5;
        [[32,60],[45,75],[35,90],[48,88]].forEach(([x,y]) => { wc.beginPath(); wc.arc(x, y, 2, 0, Math.PI * 2); wc.fill(); });
        wc.globalAlpha = 1;

        // Head
        wc.fillStyle = '#FFCC80'; wc.beginPath(); wc.arc(40, 38, 9, 0, Math.PI * 2); wc.fill();
        // Beard
        wc.fillStyle = '#E0E0E0'; wc.beginPath(); wc.moveTo(34, 42); wc.quadraticCurveTo(40, 60, 46, 42); wc.fill();
        // Hat
        const hatGrad = wc.createLinearGradient(28, 5, 52, 32);
        hatGrad.addColorStop(0, '#6A1B9A'); hatGrad.addColorStop(1, '#9C27B0');
        wc.fillStyle = hatGrad;
        wc.beginPath(); wc.moveTo(40, 5); wc.lineTo(53, 32); wc.lineTo(27, 32); wc.closePath(); wc.fill();
        // Hat star
        wc.fillStyle = '#FFD700'; wc.beginPath(); wc.arc(40, 18, 4, 0, Math.PI * 2); wc.fill();
        // Eyes
        wc.fillStyle = '#311B92'; wc.beginPath(); wc.arc(37, 37, 2, 0, Math.PI * 2); wc.fill(); wc.beginPath(); wc.arc(43, 37, 2, 0, Math.PI * 2); wc.fill();
        // Staff
        wc.fillStyle = '#8D6E63'; wc.fillRect(14, 40, 3, 70);
        // Orb
        wc.filter = 'blur(3px)';
        wc.fillStyle = 'rgba(179,136,255,0.5)'; wc.beginPath(); wc.arc(15, 38, 10, 0, Math.PI * 2); wc.fill();
        wc.filter = 'none';
        wc.fillStyle = '#B388FF'; wc.beginPath(); wc.arc(15, 38, 6, 0, Math.PI * 2); wc.fill();
        wc.fillStyle = '#fff'; wc.beginPath(); wc.arc(13, 36, 2, 0, Math.PI * 2); wc.fill();
        // Friendly smile
        wc.strokeStyle = '#5D4037'; wc.lineWidth = 1; wc.lineCap = 'round';
        wc.beginPath(); wc.arc(40, 40, 4, 0.1, Math.PI - 0.1); wc.stroke();

        this.wizard = wiz;

        // Dragon
        const drg = this.buf(260, 190);
        const dc = drg.getContext('2d');

        // Body glow
        dc.filter = 'blur(20px)';
        dc.fillStyle = 'rgba(66,165,245,0.2)';
        dc.beginPath(); dc.ellipse(130, 120, 90, 60, 0, 0, Math.PI * 2); dc.fill();
        dc.filter = 'none';

        // Wings
        dc.globalAlpha = 0.6;
        dc.fillStyle = '#64B5F6';
        dc.beginPath(); dc.moveTo(80, 80); dc.bezierCurveTo(30, 30, 5, 50, 15, 80); dc.bezierCurveTo(10, 65, 50, 70, 80, 85); dc.closePath(); dc.fill();
        dc.beginPath(); dc.moveTo(180, 80); dc.bezierCurveTo(230, 30, 255, 50, 245, 80); dc.bezierCurveTo(250, 65, 210, 70, 180, 85); dc.closePath(); dc.fill();
        dc.globalAlpha = 1;

        // Body
        const bdGrad = dc.createRadialGradient(130, 115, 10, 130, 115, 50);
        bdGrad.addColorStop(0, '#42A5F5'); bdGrad.addColorStop(1, '#1565C0');
        dc.fillStyle = bdGrad; dc.beginPath(); dc.ellipse(130, 115, 48, 35, 0, 0, Math.PI * 2); dc.fill();
        // Belly
        dc.fillStyle = '#E3F2FD'; dc.beginPath(); dc.ellipse(130, 125, 28, 20, 0, 0, Math.PI); dc.fill();
        // Neck
        dc.fillStyle = '#1E88E5';
        dc.beginPath(); dc.moveTo(110, 85); dc.quadraticCurveTo(105, 60, 100, 45); dc.lineTo(118, 45); dc.quadraticCurveTo(120, 60, 128, 85); dc.closePath(); dc.fill();
        // Head
        dc.fillStyle = '#2196F3'; dc.beginPath(); dc.ellipse(108, 40, 20, 16, -0.1, 0, Math.PI * 2); dc.fill();
        // Snout
        dc.fillStyle = '#42A5F5'; dc.beginPath(); dc.ellipse(92, 44, 10, 7, -0.2, 0, Math.PI * 2); dc.fill();
        // Eyes (big, cute, expressive)
        dc.fillStyle = '#fff'; dc.beginPath(); dc.ellipse(102, 36, 6, 7, 0, 0, Math.PI * 2); dc.fill(); dc.beginPath(); dc.ellipse(116, 36, 6, 7, 0, 0, Math.PI * 2); dc.fill();
        dc.fillStyle = '#FFD700'; dc.beginPath(); dc.arc(102, 37, 4.5, 0, Math.PI * 2); dc.fill(); dc.beginPath(); dc.arc(116, 37, 4.5, 0, Math.PI * 2); dc.fill();
        dc.fillStyle = '#000'; dc.beginPath(); dc.arc(103, 37, 2.5, 0, Math.PI * 2); dc.fill(); dc.beginPath(); dc.arc(117, 37, 2.5, 0, Math.PI * 2); dc.fill();
        dc.fillStyle = '#fff'; dc.beginPath(); dc.arc(101, 35, 1.5, 0, Math.PI * 2); dc.fill(); dc.beginPath(); dc.arc(115, 35, 1.5, 0, Math.PI * 2); dc.fill();
        // Horns
        dc.fillStyle = '#FFD700';
        dc.beginPath(); dc.moveTo(98, 25); dc.lineTo(92, 12); dc.lineTo(101, 27); dc.fill();
        dc.beginPath(); dc.moveTo(118, 25); dc.lineTo(124, 12); dc.lineTo(115, 27); dc.fill();
        // Smile
        dc.strokeStyle = '#1565C0'; dc.lineWidth = 2; dc.lineCap = 'round';
        dc.beginPath(); dc.arc(100, 48, 7, 0.1, Math.PI - 0.3); dc.stroke();
        // Spikes
        dc.fillStyle = '#FFC107';
        for (let i = 0; i < 6; i++) { const sx = 115 + i * 8, sy = 82 + i * 4; dc.beginPath(); dc.moveTo(sx-2, sy+3); dc.lineTo(sx, sy-7); dc.lineTo(sx+2, sy+3); dc.closePath(); dc.fill(); }
        // Tail
        dc.fillStyle = '#1976D2';
        dc.beginPath(); dc.moveTo(170, 112); dc.bezierCurveTo(200, 105, 225, 115, 240, 100); dc.lineTo(235, 108); dc.bezierCurveTo(218, 120, 195, 112, 170, 118); dc.closePath(); dc.fill();
        dc.fillStyle = '#FFC107'; dc.beginPath(); dc.moveTo(240, 100); dc.lineTo(250, 92); dc.lineTo(238, 105); dc.closePath(); dc.fill();
        // Legs
        dc.fillStyle = '#0D47A1';
        dc.beginPath(); dc.roundRect(110, 145, 12, 28, 4); dc.fill();
        dc.beginPath(); dc.roundRect(138, 145, 12, 28, 4); dc.fill();

        this.dragon = drg;
    }

    genItems() {
        // Star
        const s = this.buf(36, 36);
        const sc = s.getContext('2d');
        sc.filter = 'blur(4px)';
        sc.fillStyle = 'rgba(255,215,0,0.4)';
        sc.beginPath(); sc.arc(18, 18, 16, 0, Math.PI * 2); sc.fill();
        sc.filter = 'none';
        sc.fillStyle = '#FFD700';
        sc.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
            sc.lineTo(18 + Math.cos(a) * 12, 18 + Math.sin(a) * 12);
            const a2 = a + 2 * Math.PI / 5;
            sc.lineTo(18 + Math.cos(a2) * 5, 18 + Math.sin(a2) * 5);
        }
        sc.closePath(); sc.fill();
        sc.fillStyle = '#FFF9C4'; sc.beginPath(); sc.arc(18, 18, 4, 0, Math.PI * 2); sc.fill();
        this.star = s;

        // Wisp
        const wp = this.buf(30, 30);
        const wc = wp.getContext('2d');
        wc.filter = 'blur(5px)';
        wc.fillStyle = 'rgba(255,255,200,0.5)';
        wc.beginPath(); wc.arc(15, 15, 12, 0, Math.PI * 2); wc.fill();
        wc.filter = 'blur(2px)';
        wc.fillStyle = 'rgba(255,255,255,0.8)';
        wc.beginPath(); wc.arc(15, 15, 6, 0, Math.PI * 2); wc.fill();
        wc.filter = 'none';
        wc.fillStyle = '#fff';
        wc.beginPath(); wc.arc(15, 15, 3, 0, Math.PI * 2); wc.fill();
        this.wisp = wp;

        // Gate (closed)
        const g = this.buf(100, 145);
        const gc = g.getContext('2d');
        // Posts
        const pGrad = gc.createLinearGradient(10, 0, 25, 0);
        pGrad.addColorStop(0, '#6D4C41'); pGrad.addColorStop(0.5, '#8D6E63'); pGrad.addColorStop(1, '#6D4C41');
        gc.fillStyle = pGrad; gc.fillRect(10, 25, 12, 120); gc.fillRect(78, 25, 12, 120);
        // Arch
        gc.strokeStyle = '#5D4037'; gc.lineWidth = 10; gc.beginPath(); gc.arc(50, 30, 30, Math.PI, 0); gc.stroke();
        // Barrier glow
        gc.filter = 'blur(8px)';
        gc.fillStyle = 'rgba(255,152,0,0.35)'; gc.fillRect(22, 30, 56, 115);
        gc.filter = 'none';
        gc.fillStyle = 'rgba(255,193,7,0.2)'; gc.fillRect(22, 30, 56, 115);
        // Top gem
        gc.filter = 'blur(2px)';
        gc.fillStyle = 'rgba(255,215,0,0.5)'; gc.beginPath(); gc.arc(50, 10, 12, 0, Math.PI * 2); gc.fill();
        gc.filter = 'none';
        gc.fillStyle = '#FFD700'; gc.beginPath(); gc.arc(50, 10, 7, 0, Math.PI * 2); gc.fill();
        gc.fillStyle = '#FFF9C4'; gc.beginPath(); gc.arc(48, 8, 2.5, 0, Math.PI * 2); gc.fill();
        this.gate = g;

        // Gate (open)
        const go = this.buf(100, 145);
        const goc = go.getContext('2d');
        goc.fillStyle = pGrad; goc.fillRect(10, 25, 12, 120); goc.fillRect(78, 25, 12, 120);
        goc.strokeStyle = '#5D4037'; goc.lineWidth = 10; goc.beginPath(); goc.arc(50, 30, 30, Math.PI, 0); goc.stroke();
        // Green open glow
        goc.filter = 'blur(6px)';
        goc.fillStyle = 'rgba(76,175,80,0.15)'; goc.fillRect(22, 30, 56, 115);
        goc.filter = 'none';
        goc.fillStyle = '#66BB6A'; goc.beginPath(); goc.arc(50, 10, 7, 0, Math.PI * 2); goc.fill();
        this.gateOpen = go;
    }

    genParticles() {
        const types = {
            petal: { colors: ['#F8BBD0','#F48FB1','#EC407A','#FFE0B2'] },
            sparkle: { colors: ['#B3E5FC','#81D4FA','#4FC3F7','#fff'] },
            snow: { colors: ['#ECEFF1','#fff','#E0E0E0','#F5F5F5'] },
            magic: { colors: ['#CE93D8','#BA68C8','#AB47BC','#E1BEE7'] },
        };
        this.particleImgs = {};
        Object.entries(types).forEach(([type, cfg]) => {
            const c = this.buf(12, 12);
            const cx = c.getContext('2d');
            cx.filter = 'blur(1px)';
            const col = cfg.colors[0];
            const g = cx.createRadialGradient(6, 6, 0, 6, 6, 6);
            g.addColorStop(0, col); g.addColorStop(0.6, col + 'aa'); g.addColorStop(1, 'transparent');
            cx.fillStyle = g; cx.fillRect(0, 0, 12, 12);
            cx.filter = 'none';
            this.particleImgs[type] = c;
        });
    }

    genOverlays() {
        const zones = { meadow: 'rgba(255,255,200,0.06)', forest: 'rgba(200,255,200,0.05)', lake: 'rgba(200,230,255,0.06)', snow: 'rgba(220,220,240,0.04)', cave: 'rgba(100,80,200,0.06)' };
        Object.entries(zones).forEach(([zone, col]) => {
            const c = this.buf(this.w, this.h);
            const cx = c.getContext('2d');
            // Soft light from top
            const g = cx.createRadialGradient(this.w * 0.7, 0, 0, this.w * 0.7, 0, this.h * 0.8);
            g.addColorStop(0, col); g.addColorStop(1, 'transparent');
            cx.fillStyle = g; cx.fillRect(0, 0, this.w, this.h);
            // Vignette
            const v = cx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.4, this.w / 2, this.h / 2, this.h);
            v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(0,0,0,0.2)');
            cx.fillStyle = v; cx.fillRect(0, 0, this.w, this.h);
            this.lightOverlay[zone] = c;
        });
    }

    mixColor(hex1, hex2, t) {
        const c1 = this.hexToRgb(hex1), c2 = this.hexToRgb(hex2);
        const r = Math.round(c1[0] * (1 - t) + c2[0] * t);
        const g = Math.round(c1[1] * (1 - t) + c2[1] * t);
        const b = Math.round(c1[2] * (1 - t) + c2[2] * t);
        return `rgb(${r},${g},${b})`;
    }

    hexToRgb(hex) {
        const c = hex.replace('#', '');
        return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)];
    }
}
