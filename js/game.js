import { AssetLoader } from './assets.js';
import { Music } from './music.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ===== CONSTANTS =====
const GRAVITY = 0.55;
const JUMP_FORCE = -12;
const MOVE_SPEED = 5;
const TILE = 70;
const ENEMY_SPEED = 1.5;
const STAR_ANIM_SPEED = 0.15;
const STARS_PER_GATE = 5;

// ===== GAME STATE =====
let assets, music, audioCtx;
let gameState = 'loading';
let camera = { x: 0, y: 0 };
let stars = 0;
let currentZone = 0;
let dialogQueue = [];
let currentRiddle = null;
let riddleCallback = null;
let interactTarget = null;
let frameCount = 0;
let riddleKeyHandler = null;
let cutscene = null;

// ===== INPUT =====
const keys = {};
const justPressed = {};
window.addEventListener('keydown', e => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function setupMobileControls() {
    const bind = (id, code) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', e => { e.preventDefault(); keys[code] = true; justPressed[code] = true; });
        el.addEventListener('touchend', e => { e.preventDefault(); keys[code] = false; });
    };
    bind('ctrl-left', 'ArrowLeft');
    bind('ctrl-right', 'ArrowRight');
    bind('ctrl-jump', 'Space');
    const actionEl = document.getElementById('ctrl-action');
    if (actionEl) {
        actionEl.addEventListener('touchstart', e => {
            e.preventDefault();
            if (gameState === 'playing' && interactTarget) interact(interactTarget);
            else if (gameState === 'dialog') advanceDialog();
        });
    }
}

// ===== PLAYER =====
const player = {
    x: 100, y: 0, vx: 0, vy: 0,
    w: 50, h: 66,
    onGround: false, facing: 1,
    walkFrame: 0, walkTimer: 0,
    hurt: false, hurtTimer: 0,
    lives: 3,
    jumpsLeft: 2, maxJumps: 2,
    shieldTimer: 0, speedTimer: 0
};

// ===== COMPANIONS =====
const companions = [
    { x: 50, y: 0, vx: 0, vy: 0, w: 50, h: 66, walkFrame: 0, walkTimer: 0, onGround: false, prefix: 'p2' },
    { x: 0, y: 0, vx: 0, vy: 0, w: 50, h: 66, walkFrame: 0, walkTimer: 0, onGround: false, prefix: 'p3' }
];

// ===== WORLD DATA =====
let platforms = [];
let collectibles = [];
let enemies = [];
let springs = [];
let spikes = [];
let powerups = [];
let npcs = [];
let gates = [];
let decorations = [];
let clouds = [];
let worldWidth = 0;

// ===== ZONES =====
const ZONES = [
    { name: 'אחו ירוק', bg: 'bg_grasslands', color: '#87CEEB' },
    { name: 'יער הפטריות', bg: 'bg_shroom', color: '#5D8A3C' },
    { name: 'הטירה הקסומה', bg: 'bg_castle', color: '#8B7EC8' },
    { name: 'ארץ הדרקון', bg: 'bg_desert', color: '#FFB74D' }
];

// ===== RIDDLES (about Amit!) =====
const RIDDLES = [
    {
        title: 'שער ראשון - המשפט של עמית',
        text: 'סדרו את המשפט המפורסם של עמית:',
        type: 'order',
        words: ['הרבה', 'אנשים', 'אומרים', 'שהם', 'רוצים', 'להצליח', 'אבל', 'לא', 'כולם', 'מוכנים', 'לשלם', 'את', 'המחיר'],
        answer: 'הרבה אנשים אומרים שהם רוצים להצליח אבל לא כולם מוכנים לשלם את המחיר'
    },
    {
        title: 'שער שני - מי היה עמית?',
        text: 'הדרקון של עמית הוא בצבעי תכלת ולבן.\nמה הדרקון מסמל?',
        type: 'choice',
        choices: ['פחד', 'אומץ וחברות', 'עצב', 'שינה'],
        answer: 1
    },
    {
        title: 'שער שלישי - הקוסם נחי',
        text: 'הקוסם נחי נקרא כך בגלל מילה חשובה.\nמאיזו מילה מגיע השם "נחי"?',
        type: 'choice',
        choices: ['נחמה', 'נחישות', 'נחש', 'נחיתה'],
        answer: 1
    }
];

// ===== DIALOGS =====
const WIZARD_DIALOGS = [
    [
        { speaker: 'נחי הקוסם', text: 'שלום ילדים! אני נחי - קוסם הנחישות של ממד החלומות!' },
        { speaker: 'נחי הקוסם', text: 'מחפשים את הדרקון של עמית? הוא מחכה לכם בסוף הדרך!' },
        { speaker: 'נחי הקוסם', text: 'כדי לפתוח כל שער צריך לאסוף ' + STARS_PER_GATE + ' כוכבים ולפתור חידה!' },
        { speaker: 'נחי הקוסם', text: 'נחישות זה הסוד - כמו שעמית תמיד אמר. בהצלחה!' }
    ],
    [
        { speaker: 'נחי הקוסם', text: 'כל הכבוד! הגעתם ליער הפטריות!' },
        { speaker: 'נחי הקוסם', text: 'כאן הדרך מסוכנת יותר - שימו לב לדבורים!' },
        { speaker: 'נחי הקוסם', text: 'וזכרו - אפשר לקפוץ פעמיים באוויר! קפיצה כפולה!' }
    ],
    [
        { speaker: 'נחי הקוסם', text: 'הטירה הקסומה! כמעט הגעתם!' },
        { speaker: 'נחי הקוסם', text: 'עוד חידה אחת ותפגשו את הדרקון...' },
        { speaker: 'נחי הקוסם', text: 'הדרקון של עמית הוא דרקון מיוחד - דרקון של אומץ וחברות!' }
    ]
];

// ===== LEVEL GENERATION =====
function generateWorld() {
    platforms = [];
    collectibles = [];
    enemies = [];
    springs = [];
    spikes = [];
    powerups = [];
    npcs = [];
    gates = [];
    decorations = [];
    clouds = [];

    const zoneWidth = 3500;
    worldWidth = zoneWidth * ZONES.length + 500;
    const groundY = canvas.height * 0.75;

    for (let i = 0; i < worldWidth / 250; i++) {
        clouds.push({
            x: Math.random() * worldWidth,
            y: 20 + Math.random() * (canvas.height * 0.25),
            type: ['cloud1', 'cloud2', 'cloud3'][Math.floor(Math.random() * 3)],
            speed: 0.2 + Math.random() * 0.3,
            scale: 0.4 + Math.random() * 0.4
        });
    }

    for (let zone = 0; zone < ZONES.length; zone++) {
        const zoneStart = zone * zoneWidth;

        // Ground — fill from groundY to bottom
        for (let x = zoneStart; x < zoneStart + zoneWidth; x += TILE) {
            const gapChance = (zone * 0.03) + 0.01;
            if (Math.random() < gapChance && x > zoneStart + 400 && x < zoneStart + zoneWidth - 500) {
                continue;
            }
            platforms.push({ x, y: groundY, w: TILE, h: TILE, type: 'ground', tile: 'grassMid' });
            for (let fill = groundY + TILE; fill < canvas.height + TILE; fill += TILE) {
                platforms.push({ x, y: fill, w: TILE, h: TILE, type: 'sub', tile: 'dirtCenter' });
            }
        }

        // Floating platforms — limited height so all reachable with double jump
        const maxPlatformHeight = 160;
        const numPlatforms = 6 + zone * 2;
        for (let i = 0; i < numPlatforms; i++) {
            const px = zoneStart + 250 + (i / numPlatforms) * (zoneWidth - 500);
            const py = groundY - 80 - Math.random() * maxPlatformHeight;
            const pWidth = 2 + Math.floor(Math.random() * 2);
            for (let t = 0; t < pWidth; t++) {
                const tile = t === 0 ? 'grassHalfLeft' : t === pWidth - 1 ? 'grassHalfRight' : 'grassHalfMid';
                platforms.push({ x: px + t * TILE, y: py, w: TILE, h: TILE / 2, type: 'float', tile });
            }
            // Coin or star on platform
            if (Math.random() > 0.2) {
                const isSpecial = Math.random() > 0.7;
                collectibles.push({
                    x: px + (pWidth * TILE) / 2 - 15, y: py - 40,
                    w: 30, h: 30,
                    type: isSpecial ? 'star' : 'coin',
                    collected: false, frame: 0
                });
            }
        }

        // Ground-level stars (easy to get)
        for (let i = 0; i < 4; i++) {
            collectibles.push({
                x: zoneStart + 200 + i * (zoneWidth / 5),
                y: groundY - 50,
                w: 30, h: 30, type: 'star', collected: false, frame: 0
            });
        }

        // Enemies
        const numEnemies = 2 + zone * 2;
        for (let i = 0; i < numEnemies; i++) {
            const ex = zoneStart + 500 + (i / numEnemies) * (zoneWidth - 700);
            const etype = Math.random() > 0.5 ? 'slime' : (Math.random() > 0.5 ? 'fly' : 'bee');
            enemies.push({
                x: ex,
                y: etype === 'fly' || etype === 'bee' ? groundY - 80 - Math.random() * 60 : groundY - 40,
                w: 50, h: 40,
                vx: etype === 'fly' || etype === 'bee' ? 0 : ENEMY_SPEED * (Math.random() > 0.5 ? 1 : -1),
                type: etype, startX: ex, range: 100 + Math.random() * 60,
                frame: 0, frameTimer: 0, alive: true,
                floatOffset: Math.random() * Math.PI * 2
            });
        }

        // Springs (zone 1+)
        if (zone > 0) {
            for (let i = 0; i < 2; i++) {
                const sx = zoneStart + 500 + Math.random() * (zoneWidth - 800);
                springs.push({ x: sx, y: groundY - 20, w: 40, h: 20, activated: false, timer: 0 });
            }
        }

        // Spikes (zone 1+)
        if (zone > 0) {
            for (let i = 0; i < zone; i++) {
                const spx = zoneStart + 700 + Math.random() * (zoneWidth - 1000);
                spikes.push({ x: spx, y: groundY - 18, w: TILE, h: 18 });
            }
        }

        // Powerups (1-2 per zone)
        for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
            const px = zoneStart + 400 + Math.random() * (zoneWidth - 600);
            const ptype = Math.random() > 0.5 ? 'shield' : 'speed';
            powerups.push({ x: px, y: groundY - 50, w: 35, h: 35, type: ptype, collected: false });
        }

        // Decorations
        for (let i = 0; i < 6; i++) {
            const dx = zoneStart + Math.random() * zoneWidth;
            const dtype = ['tree', 'rock', 'plant', 'mushRed', 'mushBrown', 'bush'][Math.floor(Math.random() * 6)];
            decorations.push({ x: dx, y: groundY, type: dtype });
        }

        // Wizard NPC before gate
        if (zone < 3) {
            npcs.push({
                x: zoneStart + zoneWidth - 400, y: groundY - 80,
                w: 60, h: 80, zone, talked: false, type: 'wizard'
            });
        }

        // Gate between zones
        if (zone < 3) {
            gates.push({
                x: zoneStart + zoneWidth - 150, y: groundY - 140,
                w: 80, h: 140, zone, open: false,
                starsNeeded: STARS_PER_GATE * (zone + 1)
            });
        }
    }

    // Dragon at end — on the ground
    npcs.push({
        x: worldWidth - 300, y: groundY - 70,
        w: 70, h: 70, zone: 3, talked: false, type: 'dragon'
    });
}

// ===== INIT =====
async function init() {
    resize();
    window.addEventListener('resize', resize);

    const loader = new AssetLoader();
    const fillBar = document.getElementById('load-fill');

    assets = await loader.load((progress) => {
        fillBar.style.width = (progress * 100) + '%';
    });

    generateWorld();
    const groundY = canvas.height * 0.75;
    player.y = groundY - player.h;
    companions[0].x = player.x - 60;
    companions[0].y = player.y;
    companions[1].x = player.x - 120;
    companions[1].y = player.y;

    gameState = 'title';
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-replay').addEventListener('click', () => location.reload());

    canvas.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyPress);
    setupMobileControls();

    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function startGame() {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        music = new Music(audioCtx);
    }
    music.play();
    setupMusicControls();
    updateHUD();

    startCutscene('intro');
}

function setupMusicControls() {
    const muteBtn = document.getElementById('btn-mute');
    const volSlider = document.getElementById('vol-slider');
    const slowerBtn = document.getElementById('btn-slower');
    const fasterBtn = document.getElementById('btn-faster');
    const speedLabel = document.getElementById('speed-label');

    let muted = false;
    let speed = 1.0;
    const speeds = [0.5, 0.7, 1.0, 1.3, 1.6];
    let speedIdx = 2;

    muteBtn.addEventListener('click', () => {
        muted = !muted;
        music.setMute(muted);
        muteBtn.textContent = muted ? '🔇' : '🔊';
    });

    volSlider.addEventListener('input', () => {
        music.setVolume(volSlider.value / 100);
    });

    slowerBtn.addEventListener('click', () => {
        if (speedIdx > 0) speedIdx--;
        speed = speeds[speedIdx];
        music.setSpeed(speed);
        speedLabel.textContent = speed + 'x';
    });

    fasterBtn.addEventListener('click', () => {
        if (speedIdx < speeds.length - 1) speedIdx++;
        speed = speeds[speedIdx];
        music.setSpeed(speed);
        speedLabel.textContent = speed + 'x';
    });

    // Keyboard shortcuts: M = mute, +/- = volume
    window.addEventListener('keydown', (e) => {
        if (gameState === 'riddle') return;
        if (e.code === 'KeyM') {
            muted = !muted;
            music.setMute(muted);
            muteBtn.textContent = muted ? '🔇' : '🔊';
        }
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
            volSlider.value = Math.max(0, parseInt(volSlider.value) - 10);
            music.setVolume(volSlider.value / 100);
        }
        if (e.code === 'Equal' || e.code === 'NumpadAdd') {
            volSlider.value = Math.min(100, parseInt(volSlider.value) + 10);
            music.setVolume(volSlider.value / 100);
        }
    });
}

// ===== GAME LOOP =====
function gameLoop() {
    frameCount++;
    if (gameState === 'cutscene') {
        updateCutscene();
        renderCutscene();
    } else {
        update();
        render();
    }
    Object.keys(justPressed).forEach(k => delete justPressed[k]);
    requestAnimationFrame(gameLoop);
}

// ===== UPDATE =====
function update() {
    if (gameState !== 'playing') return;

    const speed = player.speedTimer > 0 ? MOVE_SPEED * 1.6 : MOVE_SPEED;
    player.vx = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) { player.vx = -speed; player.facing = -1; }
    if (keys['ArrowRight'] || keys['KeyD']) { player.vx = speed; player.facing = 1; }

    // Double jump
    if (justPressed['Space'] || justPressed['ArrowUp'] || justPressed['KeyW']) {
        if (player.jumpsLeft > 0) {
            player.vy = JUMP_FORCE;
            player.jumpsLeft--;
            player.onGround = false;
        }
    }

    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;

    if (player.vx !== 0) {
        player.walkTimer += 0.2;
        if (player.walkTimer >= 1) { player.walkTimer = 0; player.walkFrame = (player.walkFrame + 1) % 11; }
    } else {
        player.walkFrame = 0;
        player.walkTimer = 0;
    }

    if (player.hurt) {
        player.hurtTimer--;
        if (player.hurtTimer <= 0) player.hurt = false;
    }

    // Platform collision
    player.onGround = false;
    for (const p of platforms) {
        if (p.type === 'sub') continue;
        if (rectCollide(player, p) && player.vy >= 0 && player.y + player.h - player.vy <= p.y + 5) {
            player.y = p.y - player.h;
            player.vy = 0;
            player.onGround = true;
            player.jumpsLeft = player.maxJumps;
        }
    }

    // World bounds
    if (player.x < 0) player.x = 0;
    if (player.x > worldWidth - player.w) player.x = worldWidth - player.w;

    // Fall recovery
    if (player.y > canvas.height + 100) {
        const groundY = canvas.height * 0.75;
        player.y = groundY - player.h - 100;
        player.vy = 0;
        player.x = Math.max(0, player.x - 200);
        hurtPlayer();
    }

    // Gate blocking
    for (const gate of gates) {
        if (!gate.open && player.x + player.w > gate.x && player.x < gate.x + gate.w) {
            if (player.vx > 0) player.x = gate.x - player.w;
            else if (player.vx < 0) player.x = gate.x + gate.w;
        }
    }

    // Companions
    updateCompanion(companions[0], player.x - 60, player);
    updateCompanion(companions[1], player.x - 120, companions[0]);

    // Collectibles
    for (const c of collectibles) {
        if (c.collected) continue;
        if (c.type === 'star') c.frame = (c.frame + STAR_ANIM_SPEED) % 6;
        if (rectCollide(player, c)) {
            c.collected = true;
            stars += c.type === 'star' ? 1 : 0.5;
            updateHUD();
        }
    }

    // Enemies
    for (const e of enemies) {
        if (!e.alive) continue;
        e.frameTimer += 0.1;
        if (e.frameTimer >= 1) { e.frameTimer = 0; e.frame = (e.frame + 1) % 2; }

        if (e.type === 'slime') {
            e.x += e.vx;
            if (Math.abs(e.x - e.startX) > e.range) e.vx *= -1;
        } else {
            e.y += Math.sin(frameCount * 0.03 + e.floatOffset) * 0.8;
            e.x += Math.cos(frameCount * 0.02 + e.floatOffset) * 0.5;
        }

        if (!player.hurt && rectCollide(player, e)) {
            if (player.vy > 0 && player.y + player.h < e.y + e.h / 2 + 10) {
                e.alive = false;
                player.vy = JUMP_FORCE * 0.6;
                stars += 0.5;
                updateHUD();
            } else if (player.shieldTimer > 0) {
                e.alive = false;
                stars += 0.5;
                updateHUD();
            } else {
                hurtPlayer();
            }
        }
    }

    // Springs
    for (const s of springs) {
        if (s.activated) { s.timer--; if (s.timer <= 0) s.activated = false; }
        if (rectCollide(player, s) && player.vy > 0) {
            player.vy = JUMP_FORCE * 1.8;
            player.jumpsLeft = player.maxJumps;
            s.activated = true;
            s.timer = 20;
        }
    }

    // Spikes
    if (!player.hurt && player.shieldTimer <= 0) {
        for (const sp of spikes) {
            if (rectCollide(player, sp)) {
                hurtPlayer();
                player.vy = JUMP_FORCE * 0.5;
            }
        }
    }

    // Powerups
    for (const pu of powerups) {
        if (pu.collected) continue;
        if (rectCollide(player, pu)) {
            pu.collected = true;
            if (pu.type === 'shield') player.shieldTimer = 300;
            else player.speedTimer = 300;
        }
    }
    if (player.shieldTimer > 0) player.shieldTimer--;
    if (player.speedTimer > 0) player.speedTimer--;

    // Auto-trigger dragon ending when close
    for (const npc of npcs) {
        if (npc.type === 'dragon' && Math.abs(player.x - npc.x) < 150) {
            startCutscene('ending');
            return;
        }
    }

    // NPC/gate interaction detection
    interactTarget = null;
    for (const npc of npcs) {
        if (npc.type === 'dragon') continue;
        if (Math.abs(player.x - npc.x) < 80 && Math.abs(player.y - npc.y) < 100) {
            interactTarget = npc;
        }
    }
    if (!interactTarget) {
        for (const gate of gates) {
            if (!gate.open && Math.abs(player.x - gate.x) < 80) {
                interactTarget = gate;
            }
        }
    }

    const prompt = document.getElementById('interact-prompt');
    prompt.classList.toggle('hidden', !interactTarget || gameState !== 'playing');

    // Camera — follow player, vertically centered lower
    camera.x = player.x - canvas.width / 3;
    camera.y = player.y - canvas.height * 0.5;
    if (camera.x < 0) camera.x = 0;
    if (camera.x > worldWidth - canvas.width) camera.x = worldWidth - canvas.width;
    if (camera.y > 0) camera.y = 0;
    if (camera.y < -(canvas.height * 0.3)) camera.y = -(canvas.height * 0.3);

    currentZone = Math.min(3, Math.floor(player.x / 3500));
    updateHUD();
}

function updateCompanion(comp, targetX, leader) {
    const dx = targetX - comp.x;
    comp.vx = dx * 0.05;
    comp.x += comp.vx;
    comp.vy += GRAVITY;
    comp.y += comp.vy;

    comp.onGround = false;
    for (const p of platforms) {
        if (p.type === 'sub') continue;
        if (rectCollide(comp, p) && comp.vy >= 0 && comp.y + comp.h - comp.vy <= p.y + 5) {
            comp.y = p.y - comp.h;
            comp.vy = 0;
            comp.onGround = true;
        }
    }

    if (Math.abs(comp.vx) > 0.5) {
        comp.walkTimer += 0.15;
        if (comp.walkTimer >= 1) { comp.walkTimer = 0; comp.walkFrame = (comp.walkFrame + 1) % 11; }
    } else {
        comp.walkFrame = 0;
    }

    if (comp.y > canvas.height + 100) {
        comp.y = leader.y;
        comp.x = leader.x - 60;
        comp.vy = 0;
    }
}

function hurtPlayer() {
    if (player.hurt) return;
    player.hurt = true;
    player.hurtTimer = 60;
    player.lives--;
    updateHUD();
    if (player.lives <= 0) {
        player.lives = 3;
        player.x = currentZone * 3500 + 100;
        const groundY = canvas.height * 0.75;
        player.y = groundY - player.h;
        updateHUD();
    }
}

function rectCollide(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ===== INTERACTION =====
function handleKeyPress(e) {
    if (e.code === 'KeyE' && gameState === 'playing' && interactTarget) {
        interact(interactTarget);
    }
    if (gameState === 'dialog' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) {
        advanceDialog();
    }
    if (gameState === 'cutscene' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) {
        advanceCutscene();
    }
}

function handleClick() {
    if (gameState === 'dialog') advanceDialog();
    if (gameState === 'cutscene') advanceCutscene();
}

function interact(target) {
    if (target.type === 'wizard') {
        if (!target.talked) {
            target.talked = true;
            showDialog(WIZARD_DIALOGS[target.zone]);
        } else {
            showDialog([{ speaker: 'נחי הקוסם', text: 'קדימה! אספו כוכבים ופתרו את החידה!' }]);
        }
    } else if (target.type === 'dragon') {
        showEnding();
    } else if (target.w === 80) {
        // Gate
        const needed = target.starsNeeded;
        if (Math.floor(stars) >= needed) {
            showRiddle(target.zone);
        } else {
            showDialog([{ speaker: 'נחי הקוסם', text: `צריך ${needed} כוכבים כדי לפתוח את השער! יש לכם ${Math.floor(stars)}.` }]);
        }
    }
}

function showDialog(dialogs) {
    gameState = 'dialog';
    dialogQueue = [...dialogs];
    document.getElementById('dialog').classList.remove('hidden');
    displayNextDialog();
}

function displayNextDialog() {
    if (dialogQueue.length === 0) {
        document.getElementById('dialog').classList.add('hidden');
        gameState = 'playing';
        return;
    }
    const d = dialogQueue[0];
    document.getElementById('dialog-speaker').textContent = d.speaker;
    document.getElementById('dialog-text').textContent = d.text;
}

function advanceDialog() {
    dialogQueue.shift();
    displayNextDialog();
}

function showRiddle(zoneIdx) {
    gameState = 'riddle';
    currentRiddle = RIDDLES[zoneIdx];
    document.getElementById('riddle').classList.remove('hidden');
    document.getElementById('riddle-title').textContent = currentRiddle.title;
    document.getElementById('riddle-text').textContent = currentRiddle.text;

    const area = document.getElementById('riddle-area');
    area.innerHTML = '';
    document.getElementById('riddle-hint').classList.add('hidden');

    riddleCallback = () => {
        gates[zoneIdx].open = true;
        startCutscene('gate' + zoneIdx);
    };

    if (currentRiddle.type === 'choice') {
        currentRiddle.choices.forEach((choice, i) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = `${i + 1}. ${choice}`;
            btn.dataset.idx = i;
            btn.addEventListener('click', () => checkRiddleAnswer(i, btn));
            area.appendChild(btn);
        });

        // Keyboard support for choice riddles
        const hint = document.createElement('p');
        hint.style.cssText = 'color:#9E9E9E; font-size:0.8rem; margin-top:10px;';
        hint.textContent = 'לחצו 1-4 לבחירה';
        area.appendChild(hint);

        if (riddleKeyHandler) window.removeEventListener('keydown', riddleKeyHandler);
        riddleKeyHandler = (e) => {
            if (gameState !== 'riddle') return;
            const num = parseInt(e.key);
            if (num >= 1 && num <= currentRiddle.choices.length) {
                const btns = area.querySelectorAll('.choice-btn');
                checkRiddleAnswer(num - 1, btns[num - 1]);
            }
        };
        window.addEventListener('keydown', riddleKeyHandler);

    } else if (currentRiddle.type === 'order') {
        // Word ordering puzzle — keyboard-driven
        const words = [...currentRiddle.words];
        const shuffled = words.sort(() => Math.random() - 0.5);
        const selected = [];
        let orderBtns = [];

        const sentenceEl = document.createElement('div');
        sentenceEl.className = 'riddle-sentence';
        sentenceEl.textContent = '...';
        area.appendChild(sentenceEl);

        const wordsDiv = document.createElement('div');
        wordsDiv.className = 'riddle-words';
        area.appendChild(wordsDiv);

        function renderOrderButtons() {
            wordsDiv.innerHTML = '';
            shuffled.forEach((word, i) => {
                const btn = document.createElement('button');
                btn.className = 'word-btn' + (selected.includes(i) ? ' used' : '');
                btn.textContent = `${i + 1}. ${word}`;
                btn.addEventListener('click', () => selectWord(i));
                wordsDiv.appendChild(btn);
            });
            sentenceEl.textContent = selected.length > 0
                ? selected.map(i => shuffled[i]).join(' ')
                : '...';
            orderBtns = wordsDiv.querySelectorAll('.word-btn');
        }

        function selectWord(idx) {
            if (selected.includes(idx)) return;
            selected.push(idx);
            renderOrderButtons();
            if (selected.length === shuffled.length) {
                const result = selected.map(i => shuffled[i]).join(' ');
                if (result === currentRiddle.answer) {
                    document.getElementById('riddle').classList.add('hidden');
                    gameState = 'playing';
                    stars += 2;
                    updateHUD();
                    if (riddleCallback) riddleCallback();
                    if (riddleKeyHandler) { window.removeEventListener('keydown', riddleKeyHandler); riddleKeyHandler = null; }
                } else {
                    selected.length = 0;
                    document.getElementById('riddle-hint').textContent = 'לא בסדר הנכון... נסו שוב!';
                    document.getElementById('riddle-hint').classList.remove('hidden');
                    renderOrderButtons();
                }
            }
        }

        renderOrderButtons();

        // Keyboard support for word order
        if (riddleKeyHandler) window.removeEventListener('keydown', riddleKeyHandler);
        riddleKeyHandler = (e) => {
            if (gameState !== 'riddle') return;
            const num = parseInt(e.key);
            if (num >= 1 && num <= shuffled.length) {
                selectWord(num - 1);
            }
            if (e.code === 'Backspace') {
                selected.pop();
                renderOrderButtons();
            }
        };
        window.addEventListener('keydown', riddleKeyHandler);
    }
}

function checkRiddleAnswer(idx, btn) {
    if (idx === currentRiddle.answer) {
        document.getElementById('riddle').classList.add('hidden');
        gameState = 'playing';
        stars += 2;
        updateHUD();
        if (riddleCallback) riddleCallback();
        if (riddleKeyHandler) { window.removeEventListener('keydown', riddleKeyHandler); riddleKeyHandler = null; }
    } else {
        btn.classList.add('wrong');
        document.getElementById('riddle-hint').textContent = 'לא נכון... נסו שוב!';
        document.getElementById('riddle-hint').classList.remove('hidden');
        setTimeout(() => btn.classList.remove('wrong'), 500);
    }
}

function showEnding() {
    gameState = 'ending';
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('ending').classList.remove('hidden');
    document.getElementById('ending-stars').textContent = `אספתם ${Math.floor(stars)} כוכבים!`;
    if (music) music.stop();
}

function updateHUD() {
    document.getElementById('hud-chapter').textContent = ZONES[currentZone]?.name || '';
    document.getElementById('hud-lives').textContent = '❤️'.repeat(Math.max(0, player.lives));
    document.getElementById('hud-stars').textContent = `⭐ ${Math.floor(stars)}`;
    const gate = gates[currentZone];
    if (gate && !gate.open) {
        const needed = gate.starsNeeded;
        document.getElementById('hud-objective').textContent = `אספו ${needed} כוכבים לפתיחת השער (${Math.floor(stars)}/${needed})`;
    } else if (currentZone < 3) {
        document.getElementById('hud-objective').textContent = 'מצאו את נחי הקוסם!';
    } else {
        document.getElementById('hud-objective').textContent = 'הגיעו אל הדרקון!';
    }
}

// ===== RENDER =====
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === 'loading' || gameState === 'title') return;

    // Sky fills full canvas
    const zone = ZONES[currentZone];
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, zone.color);
    grad.addColorStop(0.7, '#E8F5E9');
    grad.addColorStop(1, '#A5D6A7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawClouds();
    drawDecorations();
    drawPlatforms();
    drawCollectibles();
    drawSprings();
    drawSpikes();
    drawPowerups();
    drawEnemies();
    drawGates();
    drawNPCs();
    drawCharacter(companions[1], companions[1].prefix);
    drawCharacter(companions[0], companions[0].prefix);
    drawPlayer();

    ctx.restore();
}

function drawBackground() {
    const bgKey = ZONES[currentZone].bg;
    const bg = assets[bgKey];
    if (bg) {
        const parallax = camera.x * 0.1;
        const scale = canvas.height / bg.height;
        const w = bg.width * scale;
        const startX = -(parallax % w);
        for (let x = startX; x < canvas.width + w; x += w) {
            ctx.drawImage(bg, x, 0, w, canvas.height);
        }
    }

    const mid = assets['sunny_mid'];
    if (mid) {
        const parallax = camera.x * 0.3;
        const scale = (canvas.height * 0.7) / mid.height;
        const w = mid.width * scale;
        const h = mid.height * scale;
        const startX = -(parallax % w);
        ctx.globalAlpha = 0.5;
        for (let x = startX; x < canvas.width + w; x += w) {
            ctx.drawImage(mid, x, canvas.height - h, w, h);
        }
        ctx.globalAlpha = 1;
    }
}

function drawClouds() {
    for (const c of clouds) {
        const img = assets[c.type];
        if (!img) continue;
        const cx = c.x - camera.x * 0.4;
        const drawX = ((cx % (worldWidth * 0.5)) + worldWidth * 0.5) % (worldWidth * 0.5);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, drawX, c.y, img.width * c.scale, img.height * c.scale);
        ctx.globalAlpha = 1;
    }
}

function drawDecorations() {
    for (const d of decorations) {
        const img = assets[d.type];
        if (!img) continue;
        const scale = d.type === 'tree' ? 1.2 : d.type === 'bush' ? 0.7 : 0.5;
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(img, d.x, d.y - h, w, h);
        ctx.globalAlpha = 1;
    }
}

function drawPlatforms() {
    for (const p of platforms) {
        if (p.x + p.w < camera.x - 100 || p.x > camera.x + canvas.width + 100) continue;
        const img = assets[p.tile];
        if (img) ctx.drawImage(img, p.x, p.y, p.w, p.h);
    }
}

function drawCollectibles() {
    for (const c of collectibles) {
        if (c.collected) continue;
        if (c.type === 'star') {
            const frameIdx = Math.floor(c.frame) + 1;
            const img = assets['star' + frameIdx];
            if (img) {
                const bob = Math.sin(frameCount * 0.05 + c.x) * 5;
                ctx.drawImage(img, c.x, c.y + bob, c.w, c.h);
            }
        } else {
            const img = assets['coinGold'];
            if (img) {
                const bob = Math.sin(frameCount * 0.08 + c.x) * 3;
                ctx.drawImage(img, c.x, c.y + bob, c.w, c.h);
            }
        }
    }
}

function drawSprings() {
    for (const s of springs) {
        const img = assets[s.activated ? 'springUp' : 'springDown'];
        if (img) ctx.drawImage(img, s.x, s.y - (s.activated ? 10 : 0), s.w, s.h + (s.activated ? 10 : 0));
    }
}

function drawSpikes() {
    for (const sp of spikes) {
        const img = assets['spikes'];
        if (img) ctx.drawImage(img, sp.x, sp.y, sp.w, sp.h);
    }
}

function drawPowerups() {
    for (const pu of powerups) {
        if (pu.collected) continue;
        const bob = Math.sin(frameCount * 0.06 + pu.x) * 4;
        const glow = 0.6 + Math.sin(frameCount * 0.08) * 0.3;
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        if (pu.type === 'shield') {
            ctx.fillText('🛡️', pu.x + pu.w / 2, pu.y + pu.h / 2 + bob + 10);
        } else {
            ctx.fillText('⚡', pu.x + pu.w / 2, pu.y + pu.h / 2 + bob + 10);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

function drawEnemies() {
    for (const e of enemies) {
        if (!e.alive) continue;
        let img;
        if (e.type === 'slime') img = assets[e.frame === 0 ? 'slimeWalk1' : 'slimeWalk2'];
        else if (e.type === 'fly') img = assets[e.frame === 0 ? 'flyFly1' : 'flyFly2'];
        else { const bf = (Math.floor(frameCount * 0.1) % 4) + 1; img = assets['bee' + bf]; }

        if (img) {
            ctx.save();
            if (e.vx < 0) {
                ctx.translate(e.x + e.w, e.y);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, e.w, e.h);
            } else {
                ctx.drawImage(img, e.x, e.y, e.w, e.h);
            }
            ctx.restore();
        }
    }
}

function drawGates() {
    for (const g of gates) {
        if (g.open) {
            const img = assets['flagGreen'];
            if (img) ctx.drawImage(img, g.x + 10, g.y, 60, 80);
        } else {
            ctx.fillStyle = 'rgba(80, 40, 20, 0.9)';
            ctx.fillRect(g.x, g.y, g.w, g.h);
            ctx.fillStyle = 'rgba(140, 80, 30, 0.9)';
            ctx.fillRect(g.x + 6, g.y + 6, g.w - 12, g.h - 12);
            ctx.strokeStyle = '#5D4037';
            ctx.lineWidth = 4;
            ctx.strokeRect(g.x, g.y, g.w, g.h);
            // Lock and star count
            ctx.font = 'bold 28px serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FDD835';
            ctx.fillText('🔒', g.x + g.w / 2, g.y + g.h / 2);
            ctx.font = 'bold 14px Heebo';
            ctx.fillText(`⭐ ${g.starsNeeded}`, g.x + g.w / 2, g.y + g.h / 2 + 30);
        }
    }
}

function drawNPCs() {
    for (const npc of npcs) {
        if (npc.type === 'wizard') {
            const img = assets['p1_stand'];
            if (img) {
                ctx.save();
                ctx.filter = 'hue-rotate(270deg) saturate(1.5)';
                ctx.drawImage(img, npc.x, npc.y, npc.w, npc.h);
                ctx.filter = 'none';
                ctx.font = '28px serif';
                ctx.textAlign = 'center';
                ctx.fillText('🧙', npc.x + npc.w / 2, npc.y - 5);
                ctx.font = 'bold 14px Heebo';
                ctx.fillStyle = '#9C27B0';
                ctx.fillText('נחי', npc.x + npc.w / 2, npc.y - 25);
                ctx.restore();
            }
        } else if (npc.type === 'dragon') {
            const bob = Math.sin(frameCount * 0.03) * 4;
            ctx.save();
            ctx.font = '60px serif';
            ctx.textAlign = 'center';
            ctx.fillText('🐉', npc.x + npc.w / 2, npc.y + npc.h - 5 + bob);
            ctx.font = 'bold 14px Heebo';
            ctx.fillStyle = '#E65100';
            ctx.fillText('הדרקון של עמית', npc.x + npc.w / 2, npc.y - 8 + bob);
            ctx.restore();
        }
    }
}

function drawPlayer() {
    if (player.hurt && Math.floor(frameCount / 4) % 2 === 0) return;

    let img;
    if (!player.onGround) {
        img = assets['p1_jump'];
    } else if (player.vx !== 0) {
        const walkNum = String(player.walkFrame + 1).padStart(2, '0');
        img = assets['p1_walk' + walkNum];
    } else {
        img = assets['p1_stand'];
    }

    if (img) {
        ctx.save();
        if (player.facing === -1) {
            ctx.translate(player.x + player.w, player.y);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, player.w, player.h);
        } else {
            ctx.drawImage(img, player.x, player.y, player.w, player.h);
        }
        ctx.restore();
    }

    if (player.shieldTimer > 0) {
        ctx.save();
        const pulse = 0.4 + Math.sin(frameCount * 0.12) * 0.2;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#42A5F5';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#42A5F5';
        ctx.shadowBlur = 12;
        const cx = player.x + player.w / 2;
        const cy = player.y + player.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, player.w * 0.7, player.h * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    if (player.speedTimer > 0) {
        ctx.save();
        for (let i = 1; i <= 3; i++) {
            const trailX = player.x - player.facing * i * 8;
            ctx.globalAlpha = 0.3 - i * 0.08;
            ctx.fillStyle = '#FFEE58';
            ctx.fillRect(trailX, player.y + player.h * 0.3, 4, player.h * 0.4);
        }
        ctx.restore();
    }
}

function drawCharacter(comp, prefix) {
    let img;
    if (!comp.onGround) {
        img = assets[prefix + '_jump'];
    } else if (Math.abs(comp.vx) > 0.5) {
        const walkNum = String(comp.walkFrame + 1).padStart(2, '0');
        img = assets[prefix + '_walk' + walkNum];
    } else {
        img = assets[prefix + '_stand'];
    }

    if (img) {
        ctx.save();
        const facing = comp.vx < -0.1 ? -1 : 1;
        if (facing === -1) {
            ctx.translate(comp.x + comp.w, comp.y);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, comp.w * 0.85, comp.h * 0.85);
        } else {
            ctx.drawImage(img, comp.x, comp.y, comp.w * 0.85, comp.h * 0.85);
        }
        ctx.restore();
    }
}

// ===== CUTSCENES =====
const CUTSCENE_DATA = {
    intro: {
        bg: 'bg_grasslands',
        scenes: [
            { text: 'שלושה חברים טובים יצאו למסע...', chars: ['p1', 'p2', 'p3'], action: 'walk' },
            { text: 'הם שמעו שהדרקון של עמית מחכה להם בקצה העולם.', chars: ['p1'], action: 'stand', emoji: '🐉' },
            { text: '"בואו נלך!" אמרו. "נחי הקוסם יעזור לנו בדרך!"', chars: ['p1', 'p2', 'p3'], action: 'walk', emoji: '🧙' },
        ]
    },
    gate0: {
        bg: 'bg_shroom',
        scenes: [
            { text: 'השער נפתח! הילדים נכנסו ליער הפטריות הקסום.', chars: ['p1', 'p2', 'p3'], action: 'walk' },
            { text: 'העצים כאן ענקיים וצבעוניים... אבל גם הדבורים!', chars: [], action: 'none', emoji: '🐝' },
            { text: '"לא נפחד!" אמרו החברים. "ביחד אנחנו חזקים!"', chars: ['p1', 'p2', 'p3'], action: 'stand' },
        ]
    },
    gate1: {
        bg: 'bg_castle',
        scenes: [
            { text: 'מעבר ליער נגלתה הטירה הקסומה!', chars: [], action: 'none', emoji: '🏰' },
            { text: 'נחי הקוסם חייך: "כמעט הגעתם! עוד קצת נחישות!"', chars: ['p1'], action: 'stand', emoji: '🧙' },
            { text: 'הילדים ידעו שהדרקון כבר מרגיש שהם קרובים...', chars: ['p1', 'p2', 'p3'], action: 'walk' },
        ]
    },
    gate2: {
        bg: 'bg_desert',
        scenes: [
            { text: 'השער האחרון נפתח! ארץ הדרקון!', chars: ['p1', 'p2', 'p3'], action: 'walk', emoji: '✨' },
            { text: 'האדמה כאן זהובה והשמיים בוערים בכתום.', chars: [], action: 'none', emoji: '🌅' },
            { text: '"הדרקון של עמית!" צעקו הילדים בהתרגשות. "אנחנו באים!"', chars: ['p1', 'p2', 'p3'], action: 'walk', emoji: '🐉' },
        ]
    },
    ending: {
        bg: 'bg_desert',
        scenes: [
            { text: 'הילדים הגיעו אל הדרקון של עמית!', chars: ['p1', 'p2', 'p3'], action: 'stand', emoji: '🐉' },
            { text: '"שלום חברים!" אמר הדרקון. "חיכיתי לכם."', chars: [], action: 'none', emoji: '🐉' },
            { text: '"אני הדרקון של עמית. הוא נתן אותי לחיילים שלו כסמל לאומץ ולחברות."', chars: [], action: 'none', emoji: '🐉' },
            { text: '"עמית היה אדם מיוחד. מלא נחישות, אומץ ואהבה לכולם."', chars: [], action: 'none', emoji: '💙' },
            { text: '"הוא תמיד אמר: מי שמאמין ומתאמץ - מצליח."', chars: [], action: 'none', emoji: '⭐' },
            { text: '"ועכשיו, אתם גם גיבורים. עברתם את כל המסע!"', chars: ['p1', 'p2', 'p3'], action: 'stand', emoji: '🐉' },
            { text: 'לזכרו של סמ"ר עמית בונצל הי"ד, מפקד צוות בחטיבת הצנחנים.', chars: [], action: 'none', showAmit: true },
            { text: '"הרבה אנשים אומרים שהם רוצים להצליח, אבל לא כולם מוכנים לשלם את המחיר שצריך כדי להצליח"', chars: [], action: 'none', showAmit: true },
        ]
    }
};

function startCutscene(key) {
    const data = CUTSCENE_DATA[key];
    if (!data) {
        gameState = 'playing';
        document.getElementById('hud').classList.remove('hidden');
        return;
    }
    gameState = 'cutscene';
    document.getElementById('hud').classList.add('hidden');
    cutscene = {
        key: key,
        bg: data.bg,
        scenes: data.scenes,
        sceneIdx: 0,
        timer: 0,
        charX: -80,
        textProgress: 0,
        letterboxAnim: 0,
        waitingForInput: false
    };
}

function updateCutscene() {
    if (!cutscene) return;

    // Animate letterbox bars opening
    if (cutscene.letterboxAnim < 1) {
        cutscene.letterboxAnim += 0.02;
    }

    const scene = cutscene.scenes[cutscene.sceneIdx];
    if (!scene) {
        gameState = 'playing';
        cutscene = null;
        return;
    }

    // Typewriter text
    if (cutscene.textProgress < scene.text.length) {
        cutscene.textProgress += 0.5;
    } else {
        cutscene.waitingForInput = true;
    }

    // Character walk animation
    if (scene.action === 'walk') {
        cutscene.charX += 1.5;
        if (cutscene.charX > canvas.width + 100) cutscene.charX = -80;
    }

    cutscene.timer++;
}

function advanceCutscene() {
    if (!cutscene) return;
    // If text is still typing, skip to full text
    if (!cutscene.waitingForInput) {
        const scene = cutscene.scenes[cutscene.sceneIdx];
        if (scene) cutscene.textProgress = scene.text.length;
        return;
    }
    cutscene.sceneIdx++;
    cutscene.textProgress = 0;
    cutscene.charX = -80;
    cutscene.waitingForInput = false;
    cutscene.timer = 0;

    if (cutscene.sceneIdx >= cutscene.scenes.length) {
        const wasEnding = cutscene.key === 'ending';
        cutscene = null;
        if (wasEnding) {
            showEnding();
        } else {
            gameState = 'playing';
            document.getElementById('hud').classList.remove('hidden');
        }
    }
}

function renderCutscene() {
    if (!cutscene) return;
    const scene = cutscene.scenes[cutscene.sceneIdx];
    if (!scene) return;

    // Background
    const bg = assets[cutscene.bg];
    if (bg) {
        const scale = canvas.height / bg.height;
        const w = bg.width * scale;
        for (let x = 0; x < canvas.width + w; x += w) {
            ctx.drawImage(bg, x, 0, w, canvas.height);
        }
    } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Letterbox bars (cinematic widescreen)
    const barH = canvas.height * 0.13 * Math.min(1, cutscene.letterboxAnim);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, barH);
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);

    // Characters walking/standing
    const groundLine = canvas.height - barH - 100;
    if (scene.chars.length > 0) {
        scene.chars.forEach((prefix, i) => {
            const walkFrame = scene.action === 'walk' ? (Math.floor(frameCount * 0.15) % 11) + 1 : 0;
            let img;
            if (scene.action === 'walk') {
                const num = String(walkFrame).padStart(2, '0');
                img = assets[prefix + '_walk' + num];
            } else {
                img = assets[prefix + '_stand'];
            }
            if (img) {
                const charDrawX = scene.action === 'walk'
                    ? cutscene.charX + i * 70
                    : canvas.width * 0.3 + i * 80;
                ctx.drawImage(img, charDrawX, groundLine, 60, 80);
            }
        });
    }

    // Amit's photo
    if (scene.showAmit) {
        const amitImg = assets['amit'];
        if (amitImg) {
            const imgH = canvas.height * 0.45;
            const imgW = imgH * (amitImg.width / amitImg.height);
            const imgX = (canvas.width - imgW) / 2;
            const imgY = barH + 20;
            // Soft rounded frame
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(imgX - 4, imgY - 4, imgW + 8, imgH + 8, 12);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgW, imgH, 8);
            ctx.clip();
            ctx.drawImage(amitImg, imgX, imgY, imgW, imgH);
            ctx.restore();
        }
    } else if (scene.emoji) {
        const emojiX = canvas.width * 0.7;
        const bob = Math.sin(frameCount * 0.04) * 8;
        ctx.font = '64px serif';
        ctx.textAlign = 'center';
        ctx.fillText(scene.emoji, emojiX, groundLine + 40 + bob);
    }

    // Text box at bottom with word wrap
    const visibleText = scene.text.substring(0, Math.floor(cutscene.textProgress));
    const fontSize = canvas.width < 500 ? 15 : 20;
    ctx.font = `bold ${fontSize}px Heebo`;
    ctx.textAlign = 'center';

    const maxTextW = canvas.width * 0.76;
    const words = visibleText.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxTextW && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize + 6;
    const boxH = Math.max(50, lines.length * lineHeight + 24);
    const textBoxY = canvas.height - barH - boxH - 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width * 0.1, textBoxY, canvas.width * 0.8, boxH);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width * 0.1, textBoxY, canvas.width * 0.8, boxH);

    ctx.fillStyle = '#fff';
    const textStartY = textBoxY + lineHeight + 4;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], canvas.width / 2, textStartY + i * lineHeight);
    }

    // "Continue" prompt
    if (cutscene.waitingForInput) {
        ctx.font = '14px Heebo';
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + Math.sin(frameCount * 0.1) * 0.5) + ')';
        ctx.fillText('לחצו להמשך ▶', canvas.width / 2, textBoxY + boxH - 6);
    }

    // Scene counter
    ctx.font = '12px Heebo';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(`${cutscene.sceneIdx + 1}/${cutscene.scenes.length}`, 20, barH - 5);
}

// ===== START =====
init();
