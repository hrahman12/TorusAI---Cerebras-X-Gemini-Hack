// =====================================================================
// FusionCoreNet — scientific reasoning-stability control agent.
// Reads a TorusNet state snapshot, runs real math engines (graph
// dynamics / information theory / plasma-beta / diffusion / PID control /
// q-like loop stability), emits repair actions + reactor visual events.
// It NEVER answers the user — it only repairs TorusNet's dynamics.
// =====================================================================

const SPECIALTIES = ["Planner","Math","Physics","Chemistry","Biology","CodeGenerator","Debugger","Verifier","Critic","MemoryRetriever","Linguistics","Translator","Summarizer","Synthesizer","Logic","Finance","Law","Psychology","Search","FactChecker"];

const DEFAULT_CONFIG = {
    mode: "balanced",
    engines: { graph: true, entropy: true, control: true, plasma: true, diffusion: true, loop: true, transport: true, lyapunov: true, fusion: false, mcp: false, hyperbolic: false },
    sensitivity: 0.5, diffusion: 0.35, confinement: 0.5, turbulence: 0.5, verifier: 0.5,
    crossflow: 0.5, repair: 0.5, entropyTol: 0.5, loopTol: 0.5, stabilityTarget: 0.85
};

const SLIDERS = [
    { id: "sensitivity", label: "Instability Sensitivity", lo: "Low", hi: "High" },
    { id: "diffusion", label: "Diffusion Rate", lo: "Slow", hi: "Fast" },
    { id: "confinement", label: "Confinement Strength", lo: "Loose", hi: "Tight" },
    { id: "turbulence", label: "Turbulence Tolerance", lo: "Low", hi: "High" },
    { id: "verifier", label: "Verifier Bombardment Rate", lo: "Low", hi: "Aggressive" },
    { id: "crossflow", label: "Cross-Cluster Flow", lo: "Limited", hi: "Open" },
    { id: "repair", label: "Repair Aggression", lo: "Gentle", hi: "Strong" },
    { id: "entropyTol", label: "Entropy Tolerance", lo: "Strict", hi: "Loose" },
    { id: "loopTol", label: "Loop Tolerance", lo: "Strict", hi: "Loose" },
    { id: "stabilityTarget", label: "Stability Target", lo: "70%", hi: "95%", min: 0.7, max: 0.95, step: 0.01 }
];

// Each parameter maps to a distinct physics + AI concept with its own micro-animation geometry.
const PARAMETER_ANIMATIONS = {
    sensitivity:     { physicsConcept: "chaotic attractor / bifurcation", aiConcept: "sensitivity to unstable reasoning", animationType: "orbit-jitter" },
    diffusion:       { physicsConcept: "Brownian diffusion", aiConcept: "how widely information spreads", animationType: "spread" },
    confinement:     { physicsConcept: "magnetic plasma confinement", aiConcept: "keeping reasoning inside a safe region", animationType: "ring-tighten" },
    turbulence:      { physicsConcept: "fluid turbulence / vortices", aiConcept: "noisy exploration allowed", animationType: "flow" },
    verifier:        { physicsConcept: "particle bombardment", aiConcept: "verifier attack rate", animationType: "bombard" },
    crossflow:       { physicsConcept: "transport between wells", aiConcept: "flow between reasoning clusters", animationType: "clusters" },
    repair:          { physicsConcept: "annealing / self-healing lattice", aiConcept: "correction strength", animationType: "heal" },
    entropyTol:      { physicsConcept: "entropy / disorder", aiConcept: "randomness permitted", animationType: "order-disorder" },
    loopTol:         { physicsConcept: "resonant feedback loops", aiConcept: "recursive refinement allowed", animationType: "loop" },
    stabilityTarget: { physicsConcept: "attractor basin / equilibrium", aiConcept: "desired final stability", animationType: "converge" }
};

const MODE_PRESETS = {
    fast:         { repair: 0.35, diffusion: 0.6, confinement: 0.35, label: "Fast Plasma" },
    balanced:     { repair: 0.5,  diffusion: 0.35, confinement: 0.5, label: "Balanced Tokamak" },
    deep:         { repair: 0.8,  diffusion: 0.25, confinement: 0.7, label: "Deep Stability" },
    experimental: { repair: 0.6,  diffusion: 0.45, confinement: 0.55, label: "Experimental Math" }
};

let config = loadConfig();
let snapshot = null;
let lastAnalysis = null;
window.fcPID = { integral: 0, lastError: 0 };
window.fcLyap = { V: null, dV: 0 };

// ---- Reactor 3D state ----
let scene, camera, renderer, controls, reactorGroup, effectsGroup;
let hubPositions = [];   // 3D Vector3 per cluster (20)
let hubMeshes = [];
let plasma = null;
window.fcEffects = [];

const R_MAJOR = 3.0, R_MINOR = 1.0;
function meshTo3D(x, y, W = 125, H = 120) {
    const theta = (2 * Math.PI * y) / H;
    const phi = (2 * Math.PI * x) / W;
    return new THREE.Vector3(
        (R_MAJOR + R_MINOR * Math.cos(theta)) * Math.cos(phi),
        R_MINOR * Math.sin(theta),
        (R_MAJOR + R_MINOR * Math.cos(theta)) * Math.sin(phi)
    );
}

// =====================================================================
// Config persistence + UI wiring
// =====================================================================
function loadConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem("fusioncore_config") || "{}");
        return Object.assign({}, DEFAULT_CONFIG, saved, { engines: Object.assign({}, DEFAULT_CONFIG.engines, saved.engines || {}) });
    } catch (e) { return Object.assign({}, DEFAULT_CONFIG); }
}
function saveConfig() { localStorage.setItem("fusioncore_config", JSON.stringify(config)); }

function buildSliders() {
    const host = document.getElementById("fc-sliders");
    host.innerHTML = "";
    SLIDERS.forEach(s => {
        const min = s.min != null ? s.min : 0;
        const max = s.max != null ? s.max : 1;
        const step = s.step != null ? s.step : 0.05;
        const val = config[s.id];
        const row = document.createElement("div");
        row.className = "fc-slider-row";
        row.innerHTML = `
            <div class="sl-head"><label>${s.label}</label><span id="slv-${s.id}">${formatSliderVal(s, val)}</span></div>
            <input type="range" id="sl-${s.id}" min="${min}" max="${max}" step="${step}" value="${val}">
            <div class="fc-ends"><span>${s.lo}</span><span>${s.hi}</span></div>
            <canvas class="sl-anim" data-param="${s.id}" title="${(PARAMETER_ANIMATIONS[s.id] || {}).physicsConcept || ''}" style="width:100%; height:30px; display:block; margin-top:7px; border-radius:2px; background:rgba(0,0,0,0.28); border:1px solid var(--border);"></canvas>`;
        host.appendChild(row);
        const input = row.querySelector("input");
        input.addEventListener("input", () => {
            config[s.id] = parseFloat(input.value);
            document.getElementById("slv-" + s.id).innerText = formatSliderVal(s, config[s.id]);
            saveConfig();
            if (snapshot) analyze();
        });
    });
    startSliderAnims();
}
function formatSliderVal(s, v) { return s.id === "stabilityTarget" ? Math.round(v * 100) + "%" : v.toFixed(2); }

// One rAF loop drives every slider's preview canvas; each parameter has its own geometry.
function startSliderAnims() {
    if (window._slAnimStarted) return;
    window._slAnimStarted = true;
    const loop = () => {
        const t = performance.now() / 1000;
        document.querySelectorAll(".sl-anim").forEach(cv => {
            const key = cv.getAttribute("data-param");
            const def = SLIDERS.find(s => s.id === key) || {};
            const min = def.min != null ? def.min : 0, max = def.max != null ? def.max : 1;
            const raw = config[key] != null ? config[key] : 0;
            const v = Math.max(0, Math.min(1, (raw - min) / (max - min)));
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const W = cv.clientWidth || 200, H = 30;
            if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
            const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            drawParamAnim(key, ctx, W, H, v, t);
        });
        requestAnimationFrame(loop);
    };
    loop();
}

function drawParamAnim(key, ctx, W, H, v, t) {
    const cx = W / 2, cy = H / 2;
    const amber = (a) => "rgba(244,165,49," + a + ")";
    const steel = (a) => "rgba(90,140,168," + a + ")";
    const TAU = Math.PI * 2;
    ctx.lineWidth = 1;
    switch (key) {
        case "sensitivity": { // orbit jitter: smooth -> chaotic wobble
            ctx.strokeStyle = amber(0.2); ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.34, H * 0.32, 0, 0, TAU); ctx.stroke();
            for (let k = 0; k < 2; k++) { const a = t * 1.6 + k * Math.PI; const wob = v * (Math.sin(t * 13 + k) * 0.5 + Math.sin(t * 7.3 + k * 2) * 0.5); const px = cx + Math.cos(a) * W * 0.34 + wob * W * 0.12; const py = cy + Math.sin(a) * H * 0.32 + wob * H * 0.5; ctx.fillStyle = amber(0.9); ctx.beginPath(); ctx.arc(px, py, 1.7, 0, TAU); ctx.fill(); }
            break; }
        case "diffusion": { // dots spread outward from center
            const n = 16; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const r = (2 + v * (W * 0.42 - 2)) * (0.55 + 0.45 * Math.sin(t * 1.5 + i * 1.7)); ctx.fillStyle = amber(0.35 + 0.45 * (1 - r / (W * 0.42))); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 1.3, 0, TAU); ctx.fill(); }
            ctx.fillStyle = amber(0.95); ctx.beginPath(); ctx.arc(cx, cy, 1.9, 0, TAU); ctx.fill();
            break; }
        case "confinement": { // ring tightens around orbiting particles
            const r = (W * 0.42) * (1 - 0.62 * v); const ry = Math.min(H * 0.42, r);
            ctx.strokeStyle = amber(0.3 + 0.45 * v); ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, TAU); ctx.stroke();
            for (let k = 0; k < 3; k++) { const a = t * 2 + k * 2.1; ctx.fillStyle = steel(0.85); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * ry * 0.7, 1.3, 0, TAU); ctx.fill(); }
            break; }
        case "turbulence": { // laminar lines -> wavy vortices
            for (let l = 0; l < 3; l++) { ctx.strokeStyle = amber(0.25 + 0.18 * l); ctx.beginPath(); for (let x = 0; x <= W; x += 3) { const amp = v * H * 0.34 * Math.sin(x * 0.09 + t * 3 + l); const y = cy + (l - 1) * 5 + amp; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
            break; }
        case "verifier": { // probes shoot toward central node, impacts
            ctx.fillStyle = amber(0.95); ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, TAU); ctx.fill();
            const n = Math.round(2 + v * 8); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const ph = ((t * (0.6 + v * 2.6) + i * 0.37) % 1); const r = W * 0.46 * (1 - ph); ctx.fillStyle = amber(0.3 + 0.6 * (1 - ph)); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 1.2, 0, TAU); ctx.fill(); if (ph < 0.12) { ctx.strokeStyle = amber(0.5 * (1 - ph / 0.12)); ctx.beginPath(); ctx.arc(cx, cy, 3 + ph * 26, 0, TAU); ctx.stroke(); } }
            break; }
        case "crossflow": { // clusters with flowing streams between them
            const nodes = [[W * 0.18, cy], [W * 0.5, cy - 6], [W * 0.82, cy]]; ctx.fillStyle = steel(0.9); nodes.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, TAU); ctx.fill(); });
            for (let e = 0; e < 2; e++) { const a = nodes[e], b = nodes[e + 1]; ctx.strokeStyle = amber(0.1 + 0.28 * v); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); const nd = Math.round(v * 4); for (let i = 0; i < nd; i++) { const ph = ((t * (0.5 + v * 1.8) + i / Math.max(1, nd)) % 1); ctx.fillStyle = amber(0.9); ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * ph, a[1] + (b[1] - a[1]) * ph, 1.3, 0, TAU); ctx.fill(); } }
            break; }
        case "repair": { // broken path reconnects / heals
            const segs = 6, segW = W / segs; const heal = ((t * (0.4 + v * 2)) % 1);
            for (let i = 0; i < segs; i++) { const x0 = i * segW, x1 = (i + 1) * segW; const y0 = cy + (i % 2 ? -5 : 5), y1 = cy + ((i + 1) % 2 ? -5 : 5); const broken = (i === 2 || i === 3); const fixed = heal > (i / segs); ctx.strokeStyle = (broken && !fixed) ? amber(0.13) : amber(0.8); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); if (broken && fixed) { ctx.fillStyle = amber(0.95); ctx.beginPath(); ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, 2, 0, TAU); ctx.fill(); } }
            break; }
        case "entropyTol": { // ordered grid scatters with disorder
            const cols = 10, rows = 2; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const ox = (i + 0.5) * (W / cols), oy = (j + 0.5) * (H / rows); const seed = i * 7 + j * 13; const jx = v * Math.sin(seed * 1.3 + t) * W * 0.045; const jy = v * Math.cos(seed * 2.1 + t) * H * 0.3; ctx.fillStyle = amber(0.35 + 0.45 * (1 - v)); ctx.beginPath(); ctx.arc(ox + jx, oy + jy, 1.3, 0, TAU); ctx.fill(); }
            break; }
        case "loopTol": { // recursive loop trace grows / brightens
            const r = H * 0.18 + v * H * 0.24; ctx.strokeStyle = amber(0.22 + 0.5 * v); ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.7, r, 0, 0, TAU); ctx.stroke(); const a = t * 2.2; ctx.fillStyle = amber(0.5 + 0.5 * v); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 1.7, cy + Math.sin(a) * r, 1.7, 0, TAU); ctx.fill();
            break; }
        case "stabilityTarget": { // particles converge to a stable core
            ctx.strokeStyle = amber(0.18); ctx.beginPath(); ctx.arc(cx, cy, W * 0.4 * (1 - 0.6 * v), 0, TAU); ctx.stroke();
            ctx.fillStyle = amber(0.3 + 0.7 * v); ctx.beginPath(); ctx.arc(cx, cy, 2 + v * 2.5, 0, TAU); ctx.fill();
            const n = 10; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const conv = (1 - v) * 0.8; const base = W * 0.42; const r = base * (conv + (1 - conv) * (0.5 + 0.5 * Math.sin(t * 1.5 + i))); ctx.fillStyle = steel(0.8); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 1.2, 0, TAU); ctx.fill(); }
            break; }
    }
}

function wireModeTabs() {
    document.querySelectorAll("#fc-mode-tabs button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#fc-mode-tabs button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const mode = btn.getAttribute("data-mode");
            config.mode = mode;
            const preset = MODE_PRESETS[mode];
            config.repair = preset.repair;
            config.diffusion = preset.diffusion;
            config.confinement = preset.confinement;
            config.engines.hyperbolic = (mode === "experimental");
            document.getElementById("fc-mode-label").innerText = preset.label;
            syncEngineChecks();
            buildSliders();
            saveConfig();
            if (snapshot) analyze();
        });
    });
}
function wireEngines() {
    document.querySelectorAll("#fc-engines input").forEach(cb => {
        const eng = cb.getAttribute("data-engine");
        cb.checked = !!config.engines[eng];
        cb.parentElement.classList.toggle("off", !cb.checked);
        cb.addEventListener("change", () => {
            config.engines[eng] = cb.checked;
            cb.parentElement.classList.toggle("off", !cb.checked);
            saveConfig();
            if (snapshot) analyze();
        });
    });
}
function syncEngineChecks() {
    document.querySelectorAll("#fc-engines input").forEach(cb => {
        const eng = cb.getAttribute("data-engine");
        cb.checked = !!config.engines[eng];
        cb.parentElement.classList.toggle("off", !cb.checked);
    });
}

// =====================================================================
// Math helpers
// =====================================================================
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Jacobi eigenvalue algorithm for a small symmetric matrix -> sorted eigenvalues asc
function symmetricEigenvalues(M) {
    const n = M.length;
    const a = M.map(r => r.slice());
    for (let sweep = 0; sweep < 60; sweep++) {
        // find largest off-diagonal
        let p = 0, q = 1, max = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            if (Math.abs(a[i][j]) > max) { max = Math.abs(a[i][j]); p = i; q = j; }
        }
        if (max < 1e-9) break;
        const app = a[p][p], aqq = a[q][q], apq = a[p][q];
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(phi), s = Math.sin(phi);
        for (let k = 0; k < n; k++) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
            const apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk;
            a[q][k] = s * apk + c * aqk;
        }
    }
    const eig = [];
    for (let i = 0; i < n; i++) eig.push(a[i][i]);
    return eig.sort((x, y) => x - y);
}

// =====================================================================
// THE ANALYSIS — runs the FusionCoreNet math engines on a snapshot
// =====================================================================
function analyze() {
    snapshot = loadSnapshot();
    if (!snapshot) {
        controlLog("[FUSIONCORE] No TorusNet snapshot found. Run a query in TorusNet first.", "throttle");
        setStatus(false, "No snapshot — run TorusNet");
        return;
    }
    setStatus(true, "Analyzing snapshot " + snapshot.run_id);
    document.getElementById("fc-badge").innerText = "Analyzing";
    document.getElementById("fc-badge").classList.add("running");

    const K = snapshot.clusters.length;
    const clusters = snapshot.clusters;
    const eng = config.engines;

    // ---------- 1. GRAPH DYNAMICS: L = D - A ----------
    let lambda2 = 1.0, connNorm = 1.0, weakClusters = [];
    const degree = new Array(K).fill(0);
    if (eng.graph) {
        const A = Array.from({ length: K }, () => new Array(K).fill(0));
        snapshot.edges.forEach(e => {
            const w = Math.max(0.05, e.weight);
            A[e.source_id][e.target_id] += w;
            A[e.target_id][e.source_id] += w; // undirected for Laplacian
        });
        for (let i = 0; i < K; i++) { let d = 0; for (let j = 0; j < K; j++) d += A[i][j]; degree[i] = d; }
        const L = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? degree[i] : 0) - A[i][j]));
        const eig = symmetricEigenvalues(L);
        lambda2 = eig[1] || 0;                       // algebraic connectivity (Fiedler value)
        connNorm = clamp(lambda2 / 2.0);             // normalized connectivity
        // weakly-connected / isolated clusters = lowest degree (excluding always-zero outliers)
        weakClusters = clusters.map((c, i) => ({ i, d: degree[i] })).filter(o => o.d < 0.25).map(o => o.i);
    }

    // ---------- 2. INFORMATION THEORY: H = -Σ p log p ----------
    const meanConf = snapshot.consensus.mean_confidence;
    const stdConf = snapshot.consensus.std_confidence;
    const msgEntropy = snapshot.consensus.entropy;            // normalized message-spread entropy
    const normDisagree = clamp(stdConf / 0.4);                // confidence disagreement
    let entropy = eng.entropy ? clamp(0.5 * msgEntropy + 0.5 * normDisagree) : 0;

    // ---------- congestion concentration (Herfindahl over cluster queues) ----------
    const totalQ = clusters.reduce((a, c) => a + c.queue, 0) || 1;
    let hhi = 0; clusters.forEach(c => { const p = c.queue / totalQ; hhi += p * p; });
    const congestion = clamp((hhi - 1 / K) / (1 - 1 / K));

    // ---------- 3. PLASMA BETA: beta = pressure / capacity ----------
    let beta = 0;
    if (eng.plasma) {
        const msgLoad = clamp(snapshot.mesh.total_messages / (K * 20));
        const pressure = ((msgLoad + congestion + normDisagree) / 3) * (1 + 0.6 * config.sensitivity);
        const meanDeg = degree.reduce((a, b) => a + b, 0) / K;
        const edgeFactor = clamp(snapshot.edges.length / (K * 1.2));
        const capacity = clamp((edgeFactor + meanConf + clamp(meanDeg / 4)) / 3, 0.05, 1);
        beta = pressure / capacity;
    }

    // ---------- 6. q-LIKE LOOP STABILITY: q = circulation / loop_risk ----------
    let qLike = 99;
    if (eng.loop) {
        const circ = (snapshot.edges.reduce((a, e) => a + e.message_rate, 0) / Math.max(1, snapshot.edges.length)) + 0.1;
        const queues = clusters.map(c => c.queue);
        const qm = queues.reduce((a, b) => a + b, 0) / K;
        const qStd = Math.sqrt(queues.reduce((a, b) => a + (b - qm) * (b - qm), 0) / K) + 0.1;
        qLike = circ / qStd;
    }

    // ---------- 4. DIFFUSION rate (reported + used in projection) ----------
    const diffusionRate = eng.diffusion ? config.diffusion : 0;

    // ---------- consensus + STABILITY score ----------
    const consensus = snapshot.consensus.score;
    let stability = clamp(
        0.40 * consensus +
        0.25 * (1 - entropy) +
        0.15 * connNorm +
        0.20 * (1 - clamp(beta, 0, 1)) -
        0.10 * congestion
    );

    // ---------- 5. CONTROL THEORY: PID repair intensity ----------
    const target = config.stabilityTarget;
    const error = target - stability;
    window.fcPID.integral = clamp(window.fcPID.integral + error, -2, 2);
    const dErr = error - window.fcPID.lastError;
    window.fcPID.lastError = error;
    const Kp = 0.6 + 0.8 * config.repair, Ki = 0.15, Kd = 0.2 * (1 - config.confinement * 0.5);
    const control = eng.control ? clamp(Kp * error + Ki * window.fcPID.integral + Kd * dErr, 0, 1) : clamp(error, 0, 1);

    // 4b. GRAPH TRANSPORT / CONTINUITY: ρ' = ρ - dt·div(J) + S, J_ij = A_ij·r_ij
    let fluxDiv = 0;
    if (eng.transport) {
        const div = new Array(K).fill(0);
        snapshot.edges.forEach(e => { const J = Math.max(0.05, e.weight) * (e.message_rate || 0); div[e.source_id] += J; div[e.target_id] -= J; });
        fluxDiv = clamp(Math.max.apply(null, div.map(Math.abs)) / 20);
    }
    // 6. LYAPUNOV-STYLE ENERGY: V = Σ w·destabilizing − Σ w·stabilizing ; improving when ΔV<0
    const V = clamp(0.25 * entropy + 0.20 * congestion + 0.20 * clamp(beta, 0, 1) + 0.15 * normDisagree - 0.30 * consensus - 0.20 * meanConf, -1, 1);
    const prevV = window.fcLyap.V;
    const dV = (prevV == null) ? 0 : (V - prevV);
    window.fcLyap.V = V; window.fcLyap.dV = dV;
    const lyapStatus = (prevV == null) ? "baseline" : (dV < -0.005 ? "improving" : (dV > 0.005 ? "diverging" : "flat"));

    const metrics = {
        stability_score: +stability.toFixed(3), entropy: +entropy.toFixed(3),
        beta_like: +beta.toFixed(3), q_like: +qLike.toFixed(2),
        congestion_score: +congestion.toFixed(3), diffusion_rate: +diffusionRate.toFixed(3),
        consensus_score: +consensus.toFixed(3), lambda2: +lambda2.toFixed(3), control: +control.toFixed(3),
        flux_div: +fluxDiv.toFixed(3), lyapunov_V: +V.toFixed(3), delta_V: +dV.toFixed(3), lyap_status: lyapStatus
    };

    // ---------- REPAIR DECISIONS ----------
    const repairs = decideRepairs(metrics, clusters, weakClusters, control);
    const EQ = { VERIFIER_BOMBARDMENT: "H = -\u03a3 p\u00b7log p", MAGNETIC_REROUTE: "\u03b2\u2248 = P/C", COOL_OVERLOAD: "\u03c1' = \u03c1 - dt\u00b7div(J)", THROTTLE_REGION: "\u03c1' = \u03c1 - dt\u00b7div(J)", BREAK_LOOP: "q\u2248 = circ/loop_risk", OPEN_BRIDGE: "L = D - A (\u03bb\u2082)", TIGHTEN_CONFINEMENT: "confinement", LOOSEN_CONFINEMENT: "confinement", QUARANTINE_NOISE: "H + low confidence", BOOST_CONFIDENCE_PATH: "u' = u - dt\u00b7D\u00b7Lu", FINALIZE_IF_STABLE: "\u0394V < 0" };
    repairs.forEach(r => { r.source_equation = EQ[r.type] || ""; });

    // ---------- BEFORE / AFTER projection ----------
    const avgInt = repairs.length ? repairs.reduce((a, r) => a + (r.intensity || 0), 0) / repairs.length : 0;
    const entropyAfter = clamp(entropy * (1 - 0.45 * avgInt));
    const congestionAfter = clamp(congestion * (1 - 0.5 * avgInt));
    const betaAfter = clamp(beta * (1 - 0.35 * avgInt), 0, 3);
    const consensusAfter = clamp(consensus + 0.18 * avgInt * (1 + diffusionRate));
    const connAfter = clamp(connNorm + 0.3 * avgInt * config.crossflow);
    const stabilityAfter = clamp(
        0.40 * consensusAfter + 0.25 * (1 - entropyAfter) + 0.15 * connAfter +
        0.20 * (1 - clamp(betaAfter, 0, 1)) - 0.10 * congestionAfter
    );

    lastAnalysis = { metrics, repairs, before: stability, after: stabilityAfter, clusters };
    renderMetrics(metrics);
    renderRepairs(repairs, metrics);
    renderBeforeAfter(stability, stabilityAfter, repairs.length);
    narrate(metrics, repairs);
    triggerReactorVisuals(repairs, clusters, metrics);
    renderTraces(metrics, repairs, clusters);
    renderFusionRef();
    pushConvCycle(null, metrics);

    document.getElementById("fc-badge").innerText = repairs.some(r => r.type === "FINALIZE_IF_STABLE") ? "Stable" : "Active";
    document.getElementById("fc-badge").classList.remove("running");
    document.getElementById("apply-btn").disabled = false;
    setStatus(true, "Diagnosed " + snapshot.run_id);
}

// Decide repair actions from real metric thresholds (sliders shift thresholds).
function decideRepairs(m, clusters, weakClusters, control) {
    const repairs = [];
    const tag = (i) => `cluster_${clusters[i].specialty.toLowerCase()}_${String(i).padStart(2, "0")}`;
    const worstConf = clusters.map((c, i) => ({ i, v: c.mean_confidence })).sort((a, b) => a.v - b.v)[0];
    const mostQueued = clusters.map((c, i) => ({ i, v: c.queue })).sort((a, b) => b.v - a.v)[0];
    const bestConf = clusters.map((c, i) => ({ i, v: c.mean_confidence })).sort((a, b) => b.v - a.v)[0];

    // Information theory -> verifier bombardment
    const entropyThresh = 0.30 + 0.35 * config.entropyTol;
    if (config.engines.entropy && m.entropy > entropyThresh) {
        const intensity = clamp(m.entropy * (0.5 + 0.5 * config.verifier) * (0.6 + control));
        repairs.push({ type: "VERIFIER_BOMBARDMENT", target: tag(worstConf.i), cluster: worstConf.i,
            intensity: +intensity.toFixed(2), count: Math.round(40 + 200 * intensity),
            reason: `entropy ${m.entropy.toFixed(2)} > ${entropyThresh.toFixed(2)} with low confidence in ${clusters[worstConf.i].specialty}` });
    }
    // Plasma beta -> magnetic reroute
    const betaThresh = 0.95 - 0.35 * config.sensitivity;
    if (config.engines.plasma && m.beta_like > betaThresh) {
        const intensity = clamp((m.beta_like - betaThresh) + 0.4 + 0.3 * control);
        repairs.push({ type: "MAGNETIC_REROUTE", target: tag(mostQueued.i), cluster: mostQueued.i,
            intensity: +intensity.toFixed(2),
            reason: `beta-like pressure ${m.beta_like.toFixed(2)} exceeded routing capacity` });
    }
    // Congestion -> cool overload
    const congThresh = 0.18 + 0.25 * config.turbulence;
    if (m.congestion_score > congThresh && mostQueued.v > 0) {
        const intensity = clamp(m.congestion_score + 0.3 + 0.3 * config.repair);
        repairs.push({ type: "COOL_OVERLOAD", target: tag(mostQueued.i), cluster: mostQueued.i,
            intensity: +intensity.toFixed(2),
            reason: `queue concentration in ${clusters[mostQueued.i].specialty} exceeded threshold` });
    }
    // Loop stability -> break loop
    const loopThresh = 0.8 + 0.8 * (1 - config.loopTol);
    if (config.engines.loop && m.q_like < loopThresh) {
        repairs.push({ type: "BREAK_LOOP", target: tag(mostQueued.i), cluster: mostQueued.i,
            intensity: +clamp(0.5 + 0.4 * config.repair).toFixed(2),
            reason: `q-like circulation ${m.q_like.toFixed(2)} indicates an echo chamber / reasoning loop` });
    }
    // Graph dynamics -> open bridge between weakly-connected clusters
    if (config.engines.graph && (m.lambda2 < 0.35 || weakClusters.length > 0)) {
        const a = weakClusters[0] != null ? weakClusters[0] : mostQueued.i;
        const b = bestConf.i;
        repairs.push({ type: "OPEN_BRIDGE", target: tag(a), cluster: a, partner: b,
            intensity: +clamp(0.4 + 0.5 * config.crossflow).toFixed(2),
            reason: `algebraic connectivity λ₂=${m.lambda2.toFixed(2)} low — bridging ${clusters[a].specialty} ↔ ${clusters[b].specialty}` });
    }
    // Confinement adjustments from slider
    if (config.confinement > 0.66) {
        repairs.push({ type: "TIGHTEN_CONFINEMENT", target: tag(mostQueued.i), cluster: mostQueued.i,
            intensity: +config.confinement.toFixed(2), reason: `holding reasoning inside ${clusters[mostQueued.i].specialty} cluster` });
    } else if (config.confinement < 0.34) {
        repairs.push({ type: "LOOSEN_CONFINEMENT", target: tag(bestConf.i), cluster: bestConf.i,
            intensity: +(1 - config.confinement).toFixed(2), reason: "allowing more cross-domain reasoning flow" });
    }
    // Noise quarantine
    if (worstConf.v < 0.35 && clusters[worstConf.i].queue > 0) {
        repairs.push({ type: "QUARANTINE_NOISE", target: tag(worstConf.i), cluster: worstConf.i,
            intensity: +clamp(0.5 + 0.3 * config.repair).toFixed(2),
            reason: `isolating low-confidence noisy cluster ${clusters[worstConf.i].specialty} (conf ${worstConf.v.toFixed(2)})` });
    }
    // Boost a strong path
    if (bestConf.v > 0.5) {
        repairs.push({ type: "BOOST_CONFIDENCE_PATH", target: tag(bestConf.i), cluster: bestConf.i,
            intensity: +clamp(bestConf.v).toFixed(2),
            reason: `strengthening high-confidence route through ${clusters[bestConf.i].specialty}` });
    }
    // Finalize when stable
    if (m.stability_score >= config.stabilityTarget) {
        repairs.push({ type: "FINALIZE_IF_STABLE", target: "global", cluster: -1, intensity: 1.0,
            reason: `stability ${m.stability_score.toFixed(2)} ≥ target ${config.stabilityTarget.toFixed(2)} — TorusNet cleared to answer` });
    }
    return repairs;
}

// =====================================================================
// Rendering
// =====================================================================
function metricClass(metric, v) {
    // returns ok / warn / crit based on whether high or low is good
    const highGood = { stability: 1, consensus: 1 };
    const lowGood = { entropy: 1, beta: 1, congestion: 1, q: 0 };
    if (highGood[metric]) return v > 0.7 ? "ok" : v > 0.45 ? "warn" : "crit";
    if (metric === "q") return v > 1.2 ? "ok" : v > 0.8 ? "warn" : "crit";
    return v < 0.35 ? "ok" : v < 0.65 ? "warn" : "crit";
}
function renderMetrics(m) {
    const set = (id, val, frac, metric) => {
        document.getElementById("m-" + id).innerText = val;
        const bar = document.getElementById("b-" + id);
        bar.style.width = clamp(frac) * 100 + "%";
        const cls = metricClass(metric, frac);
        const col = cls === "ok" ? "#5b9279" : cls === "warn" ? "#d99b4a" : "#c0584e";
        bar.style.background = col;
        const card = document.querySelector(`.fc-metric[data-metric="${metric}"]`);
        card.classList.remove("ok", "warn", "crit"); card.classList.add(cls);
    };
    set("stability", (m.stability_score * 100).toFixed(0) + "%", m.stability_score, "stability");
    set("entropy", m.entropy.toFixed(2), m.entropy, "entropy");
    set("beta", m.beta_like.toFixed(2), clamp(m.beta_like / 1.5), "beta");
    set("q", m.q_like.toFixed(2), clamp(m.q_like / 2.5), "q");
    set("congestion", m.congestion_score.toFixed(2), m.congestion_score, "congestion");
    set("consensus", (m.consensus_score * 100).toFixed(0) + "%", m.consensus_score, "consensus");
    document.getElementById("m-lambda").innerText = m.lambda2.toFixed(2);
    document.getElementById("m-diffusion").innerText = m.diffusion_rate.toFixed(2);
    const fx = document.getElementById("m-flux"); if (fx) fx.innerText = (m.flux_div != null ? m.flux_div.toFixed(2) : "\u2014");
    const lv = document.getElementById("m-lyap"); if (lv) lv.innerText = (m.lyapunov_V != null ? m.lyapunov_V.toFixed(2) : "\u2014");
    const dvEl = document.getElementById("m-dv");
    if (dvEl) { dvEl.innerText = (m.delta_V != null ? (m.delta_V > 0 ? "+" : "") + m.delta_V.toFixed(2) : "\u2014"); dvEl.style.color = m.delta_V < 0 ? "#5b9279" : (m.delta_V > 0 ? "#c0584e" : "#8a909c"); }
    const stEl = document.getElementById("m-lyap-status"); if (stEl) stEl.innerText = m.lyap_status ? ("\u00b7 " + m.lyap_status) : "";
}
function renderRepairs(repairs, m) {
    const host = document.getElementById("repair-log");
    document.getElementById("repair-count").innerText = repairs.length;
    if (!repairs.length) { host.innerHTML = `<div class="idle-hint">Fabric is stable — no repairs required.</div>`; return; }
    host.innerHTML = "";
    repairs.forEach(r => {
        const card = document.createElement("div");
        card.className = "repair-card" + (r.type === "FINALIZE_IF_STABLE" ? " finalize" : "");
        card.innerHTML = `
            <div class="rc-head"><span class="rc-type">${r.type}</span><span class="rc-int">${r.count ? r.count + " ◈" : "intensity " + r.intensity}</span></div>
            <div class="rc-target">→ ${r.target}</div>
            <div class="rc-reason">${r.reason}</div>`;
        host.appendChild(card);
    });
}
function renderBeforeAfter(before, after, count) {
    document.getElementById("ba-before").innerText = (before * 100).toFixed(0) + "%";
    document.getElementById("ba-after").innerText = (after * 100).toFixed(0) + "%";
    const delta = ((after - before) * 100).toFixed(0);
    document.getElementById("ba-note").innerHTML = count
        ? `Projected stability gain <strong style="color:var(--neon-green)">+${delta} pts</strong> after applying ${count} repair action${count > 1 ? "s" : ""}.`
        : `Already stable — no repair needed.`;
}

// Equation-trace panel: each engine's equation, current value, threshold, triggered action.
function renderTraces(m, repairs, clusters) {
    const host = document.getElementById("eq-trace");
    if (!host) return;
    const firstOf = (types) => repairs.find(r => types.includes(r.type));
    const rows = [
        { on: config.engines.entropy, name: "ENTROPY", eq: "H = -\u03a3 p\u00b7log p", val: m.entropy, thr: (0.30 + 0.35 * config.entropyTol), hi: true, act: firstOf(["VERIFIER_BOMBARDMENT", "QUARANTINE_NOISE"]) },
        { on: config.engines.plasma, name: "PRESSURE", eq: "\u03b2\u2248 = P / C", val: m.beta_like, thr: (0.95 - 0.35 * config.sensitivity), hi: true, act: firstOf(["MAGNETIC_REROUTE", "COOL_OVERLOAD"]) },
        { on: config.engines.transport, name: "TRANSPORT", eq: "\u03c1' = \u03c1 - dt\u00b7div(J)", val: m.flux_div, thr: 0.5, hi: true, act: firstOf(["MAGNETIC_REROUTE", "OPEN_BRIDGE"]) },
        { on: config.engines.loop, name: "LOOP", eq: "q\u2248 = circ / loop_risk", val: m.q_like, thr: (0.8 + 0.8 * (1 - config.loopTol)), hi: false, act: firstOf(["BREAK_LOOP"]) },
        { on: config.engines.graph, name: "GRAPH \u03bb\u2082", eq: "L = D - A", val: m.lambda2, thr: 0.35, hi: false, act: firstOf(["OPEN_BRIDGE"]) },
        { on: config.engines.control, name: "PID", eq: "Kp\u00b7e + Ki\u222b + Kd\u0394", val: m.control, thr: null, act: null },
        { on: config.engines.lyapunov, name: "LYAPUNOV", eq: "\u0394V < 0", val: m.delta_V, thr: 0, hi: false, status: m.lyap_status, act: firstOf(["FINALIZE_IF_STABLE"]) }
    ];
    host.innerHTML = "";
    rows.filter(r => r.on).forEach(r => {
        const fired = !!r.act || (r.thr != null && r.hi != null && (r.hi ? r.val > r.thr : r.val < r.thr));
        const triggered = r.act ? r.act.type : (r.name === "LYAPUNOV" ? (r.status || "\u2014") : (fired ? "flagged" : "nominal"));
        const valStr = (r.val == null ? "\u2014" : r.val.toFixed(2));
        const thrStr = (r.thr == null ? "\u2014" : r.thr.toFixed(2));
        const div = document.createElement("div");
        div.style.cssText = "border:1px solid var(--border); border-left:2px solid " + (fired ? "var(--accent)" : "var(--border-strong)") + "; border-radius:3px; padding:8px 10px; background:var(--bg-sunken); font-family:'IBM Plex Mono',monospace;";
        div.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:10px;"><span style="color:${fired ? 'var(--accent)' : 'var(--text-muted)'};font-weight:600;letter-spacing:0.5px;">${r.name}</span><span style="color:var(--text-faint);">${r.eq}</span></div><div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;"><span style="color:var(--text-primary);">val ${valStr}${r.thr != null ? ` \u00b7 thr ${thrStr}` : ''}</span><span style="color:${fired ? 'var(--accent)' : 'var(--text-faint)'};">${triggered}</span></div>${r.act ? `<div style="font-size:9.5px;color:var(--text-muted);margin-top:3px;">\u2192 ${r.act.target}</div>` : ''}`;
        host.appendChild(div);
    });
}

// Real fusion-physics reference (separate from the AI-graph analogues, reference only).
function renderFusionRef() {
    const card = document.getElementById("fusion-ref-card");
    if (!config.engines.fusion) { if (card) card.style.display = "none"; return; }
    if (card) card.style.display = "";
    const mu0 = 4 * Math.PI * 1e-7, B = 2.5, rho = 1e-7, p = 1.2e5;
    const p_B = (B * B) / (2 * mu0);
    const beta = p / p_B;
    const vA = B / Math.sqrt(mu0 * rho);
    const q = (0.5 * 5.0) / (3.0 * 0.4);
    const host = document.getElementById("fusion-ref");
    if (host) host.innerHTML = `B = ${B} T &middot; p = ${(p / 1e3).toFixed(0)} kPa<br>p_B = B\u00b2/2\u03bc\u2080 = ${(p_B / 1e3).toFixed(0)} kPa<br>real plasma \u03b2 = p/p_B = <strong style="color:var(--text-primary)">${beta.toFixed(3)}</strong><br>Alfv\u00e9n v_A = B/\u221a(\u03bc\u2080\u03c1) = ${(vA / 1e3).toFixed(0)} km/s<br>safety factor q \u2248 ${q.toFixed(2)}<br><span style="color:var(--text-faint);">reference only \u2014 not the AI \u03b2\u2248 metric</span>`;
}

// Auto-converge: repeatedly analyze → apply → improve the snapshot, until the
// Lyapunov energy stops dropping (diminishing returns) or the stability target is hit.
async function autoConverge() {
    let snap = loadSnapshot();
    if (!snap) { controlLog("[AUTO] No TorusNet snapshot \u2014 run TorusNet first.", "throttle"); return; }
    controlLog("[AUTO] Run Full System \u2014 auto-converge engaged.", "wake");
    window.convCycles = []; renderConv();
    document.getElementById("auto-btn").disabled = true;
    for (let c = 0; c < 6; c++) {
        analyze();
        if (!lastAnalysis) break;
        applyRepairs();
        snap = loadSnapshot();
        const avgInt = lastAnalysis.repairs.length ? lastAnalysis.repairs.reduce((a, r) => a + (r.intensity || 0), 0) / lastAnalysis.repairs.length : 0.3;
        snap.clusters.forEach(cl => { cl.mean_confidence = Math.min(0.99, cl.mean_confidence + 0.12 * avgInt); cl.queue = Math.max(0, Math.round(cl.queue * (1 - 0.4 * avgInt))); });
        const means = snap.clusters.map(c => c.mean_confidence);
        const mean = means.reduce((a, b) => a + b, 0) / means.length;
        const std = Math.sqrt(means.reduce((a, b) => a + (b - mean) * (b - mean), 0) / means.length);
        snap.consensus.mean_confidence = +mean.toFixed(4); snap.consensus.std_confidence = +std.toFixed(4); snap.consensus.score = +(mean * (1 - std)).toFixed(4);
        snap.consensus.entropy = +Math.max(0, snap.consensus.entropy * (1 - 0.3 * avgInt)).toFixed(4);
        snap.mesh.total_messages = Math.round(snap.mesh.total_messages * (1 - 0.2 * avgInt));
        localStorage.setItem("torusnet_snapshot", JSON.stringify(snap));
        await new Promise(r => setTimeout(r, 750));
        if (lastAnalysis.metrics.stability_score >= config.stabilityTarget) { controlLog("[AUTO] Stability target reached \u2014 converged.", "wake"); break; }
        if (Math.abs(window.fcLyap.dV) < 0.01 && c > 1) { controlLog("[AUTO] \u0394V \u2248 0 \u2014 diminishing returns, stopping.", "intervene"); break; }
    }
    analyze();
    controlLog("[AUTO] Auto-converge complete. Re-run TorusNet to answer on the stabilized fabric.", "wake");
    document.getElementById("auto-btn").disabled = false;
}

function controlLog(msg, cls) {
    const log = document.getElementById("control-log");
    const div = document.createElement("div");
    div.className = "fusion-entry" + (cls ? " " + cls : "");
    div.innerHTML = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}
function narrate(m, repairs) {
    controlLog(`[FUSIONCORE] Snapshot ${snapshot.run_id} ingested — ${snapshot.mesh.active_agents.toLocaleString()} active agents, ${snapshot.edges.length} cortex edges.`);
    controlLog(`[GRAPH] λ₂ = ${m.lambda2.toFixed(2)} · [INFO] entropy = ${m.entropy.toFixed(2)} · [PLASMA] β = ${m.beta_like.toFixed(2)} · [LOOP] q = ${m.q_like.toFixed(2)} · [PID] control = ${m.control.toFixed(2)}`);
    repairs.forEach(r => {
        const cls = r.type === "FINALIZE_IF_STABLE" ? "wake" : (r.type === "VERIFIER_BOMBARDMENT" || r.type === "MAGNETIC_REROUTE" ? "intervene" : "throttle");
        controlLog(`[REPAIR] <strong>${r.type}</strong> → ${r.target}. ${r.reason}.`, cls);
        spawnToast(r.type.replace(/_/g, " "), `${r.source_equation || ""} · ${r.reason}`, fcToastColor(r.type));
    });
    if (m.lyap_status === "improving") spawnToast("Consensus stabilizing", `ΔV ${m.delta_V.toFixed(2)} · stability ${(m.stability_score * 100).toFixed(0)}%`, "#5b9279");
    else if (m.lyap_status === "diverging") spawnToast("Stability warning", `Lyapunov V increased`, "#c0584e");
    controlLog(`[FUSIONCORE] ${repairs.length} repair command${repairs.length === 1 ? "" : "s"} prepared for TorusNet. Stability ${(m.stability_score * 100).toFixed(0)}%.`, "wake");
}

function setStatus(active, text) {
    const dot = document.getElementById("fc-status-dot"), mini = document.getElementById("fc-mini-dot");
    const col = active ? "#8170b5" : "#6b7280";
    if (dot) { dot.style.background = col; dot.style.boxShadow = active ? "0 0 8px #8170b5" : "none"; }
    if (mini) mini.style.background = col;
    document.getElementById("fc-status-text").innerText = text;
}

function loadSnapshot() {
    try { return JSON.parse(localStorage.getItem("torusnet_snapshot") || "null"); }
    catch (e) { return null; }
}

// =====================================================================
// Apply repairs back to TorusNet
// =====================================================================
function applyRepairs() {
    if (!lastAnalysis) return;
    const repairs = lastAnalysis.repairs;
    localStorage.setItem("torusnet_repairs", JSON.stringify({
        timestamp: Date.now(), run_id: snapshot.run_id,
        actions: repairs, projected_stability: lastAnalysis.after,
        consensus_boost: clamp(lastAnalysis.after - lastAnalysis.before)
    }));
    // Accumulate the persistent consensus floor that TorusNet reasons on next round
    // (diminishing returns as it approaches the cap, so the climb gets harder near 95%+).
    const progress = JSON.parse(localStorage.getItem("torusnet_progress") || '{"floor":0,"round":0,"best":0}');
    const rawGain = Math.max(0, lastAnalysis.after - lastAnalysis.before);
    const headroom = clamp(1 - (progress.floor || 0) / 0.45);
    const gain = Math.max(0.012, rawGain * 0.55) * headroom;
    progress.floor = clamp((progress.floor || 0) + gain, 0, 0.45);
    localStorage.setItem("torusnet_progress", JSON.stringify(progress));
    // Animate the metric dials to their post-repair (projected) values.
    const a = lastAnalysis;
    const after = {
        stability_score: a.after, entropy: clamp(a.metrics.entropy * 0.6),
        beta_like: clamp(a.metrics.beta_like * 0.7, 0, 3), q_like: a.metrics.q_like * 1.25,
        congestion_score: clamp(a.metrics.congestion_score * 0.5), consensus_score: clamp(a.metrics.consensus_score + 0.15),
        diffusion_rate: a.metrics.diffusion_rate, lambda2: a.metrics.lambda2, control: a.metrics.control
    };
    renderMetrics(after);
    controlLog(`[APPLY] ${repairs.length} repair commands dispatched to TorusNet. +${(gain * 100).toFixed(1)} pts consensus locked in — re-run TorusNet to climb higher.`, "wake");
    controlLog(`[FUSIONCORE] Consensus stabilized — projected stability ${(a.after * 100).toFixed(0)}%.`, "wake");
    document.getElementById("apply-btn").disabled = true;
    document.getElementById("fc-badge").innerText = "Stabilized";
    // calming visual: confinement field + cooling pulses
    lastAnalysis.clusters.forEach((c, i) => { if (Math.random() < 0.25) spawnCoolingPulse(hubPositions[i]); });
}

// =====================================================================
// Reactor visualization (Three.js)
// =====================================================================
function initReactor() {
    const container = document.getElementById("reactor-container");
    const w = container.clientWidth, h = container.clientHeight;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06080e, 0.07);
    camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 100);
    camera.position.set(0, 2.2, 9);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06;
    controls.minDistance = 5; controls.maxDistance = 15;

    reactorGroup = new THREE.Group();
    reactorGroup.rotation.x = 0.5;
    scene.add(reactorGroup);
    effectsGroup = new THREE.Group();
    reactorGroup.add(effectsGroup);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dl = new THREE.DirectionalLight(0x8170b5, 0.6); dl.position.set(5, 8, 6); scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x5a8ca8, 0.5); dl2.position.set(-6, -4, -5); scene.add(dl2);

    buildTorusCloud();
    buildHubs();
    buildPlasma();
    animateReactor();
    window.addEventListener("resize", onResize);
}
function buildTorusCloud() {
    const pos = [], col = [];
    const cyan = new THREE.Color(0x5a8ca8), mag = new THREE.Color(0x8170b5);
    for (let x = 0; x < 125; x += 2) {
        for (let y = 0; y < 120; y += 2) {
            const v = meshTo3D(x, y);
            pos.push(v.x, v.y, v.z);
            const t = (Math.cos(2 * Math.PI * x / 125) + 1) / 2;
            const c = cyan.clone().lerp(mag, t);
            const dim = 0.18 + 0.12 * ((Math.sin(2 * Math.PI * y / 120) + 1) / 2);
            col.push(c.r * dim, c.g * dim, c.b * dim);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    reactorGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
}
function buildHubs() {
    hubPositions = []; hubMeshes = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        const x = c * 25 + 12, y = r * 30 + 15;
        const v = meshTo3D(x, y);
        hubPositions.push(v);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14),
            new THREE.MeshBasicMaterial({ color: 0x5b9279, transparent: true, opacity: 0.9 }));
        mesh.position.copy(v);
        reactorGroup.add(mesh);
        hubMeshes.push(mesh);
    }
}
function buildPlasma() {
    const count = 900, pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const data = { ang: [], rad: [], yd: [], sp: [] };
    const cols = [new THREE.Color(0x5a8ca8), new THREE.Color(0x8170b5), new THREE.Color(0xd99b4a)];
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, rad = 0.15 + Math.random() * 0.7, y = (Math.random() - 0.5) * 3.4;
        data.ang.push(a); data.rad.push(rad); data.yd.push((Math.random() - 0.5) * 0.012); data.sp.push(0.012 + Math.random() * 0.02);
        pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * rad;
        const cc = cols[(Math.random() * cols.length) | 0];
        col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    plasma = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    plasma.userData = data;
    reactorGroup.add(plasma);
}
function onResize() {
    const c = document.getElementById("reactor-container");
    camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(c.clientWidth, c.clientHeight);
}
let lastT = performance.now();
function animateReactor() {
    requestAnimationFrame(animateReactor);
    const now = performance.now(), dt = (now - lastT) / 1000; lastT = now;
    if (reactorGroup) reactorGroup.rotation.y += 0.0011;
    // plasma swirl
    if (plasma) {
        const d = plasma.userData, p = plasma.geometry.attributes.position; const n = d.ang.length;
        const time = now * 0.001;
        for (let i = 0; i < n; i++) {
            d.ang[i] += d.sp[i];
            let y = p.getY(i) + d.yd[i]; if (y > 1.8) y = -1.8; else if (y < -1.8) y = 1.8;
            const ro = d.rad[i] * (1 + Math.sin(time * 2 + i) * 0.12);
            p.setX(i, Math.cos(d.ang[i]) * ro); p.setY(i, y); p.setZ(i, Math.sin(d.ang[i]) * ro);
        }
        p.needsUpdate = true;
    }
    // active effects
    window.fcEffects = window.fcEffects.filter(fx => !fx.update(dt));
    if (controls) controls.update();
    if (renderer) renderer.render(scene, camera);
}

// Color the hub markers by cluster health (green→gold→red) from last analysis.
function colorHubs(clusters, metrics) {
    if (!hubMeshes.length) return;
    clusters.forEach((c, i) => {
        const disagree = 1 - c.mean_confidence;
        const col = disagree < 0.4 ? 0x5b9279 : disagree < 0.7 ? 0xd99b4a : 0xc0584e;
        if (hubMeshes[i]) hubMeshes[i].material.color.setHex(col);
    });
}

// ----- visual event spawners (each returns true when finished) -----
function triggerReactorVisuals(repairs, clusters, metrics) {
    colorHubs(clusters, metrics);
    // plasma hotspots at the most congested clusters
    clusters.map((c, i) => ({ i, q: c.queue })).sort((a, b) => b.q - a.q).slice(0, 3).forEach(o => {
        if (o.q > 0) spawnHotspot(hubPositions[o.i], clamp(0.4 + o.q / 30));
    });
    repairs.forEach(r => {
        if (r.cluster < 0 || !hubPositions[r.cluster]) return;
        if (r.type === "VERIFIER_BOMBARDMENT") spawnBombardment(hubPositions[r.cluster], r.count || 80);
        else if (r.type === "MAGNETIC_REROUTE" || r.type === "OPEN_BRIDGE") {
            const partner = r.partner != null ? r.partner : 7; // verifier hub default
            spawnReroute(hubPositions[r.cluster], hubPositions[partner]);
        }
        else if (r.type === "COOL_OVERLOAD") spawnCoolingPulse(hubPositions[r.cluster]);
        else if (r.type === "TIGHTEN_CONFINEMENT") spawnConfinement(hubPositions[r.cluster]);
    });
    if (metrics.lyap_status === "improving") spawnStabilizationWave();
    else if (metrics.lyap_status === "diverging") spawnWarningRing();
}

// Floating, equation-driven event toasts (top-right of the reactor).
function fcToastColor(type) {
    return ({ VERIFIER_BOMBARDMENT: "#8170b5", QUARANTINE_NOISE: "#8170b5", MAGNETIC_REROUTE: "#f4a531", COOL_OVERLOAD: "#5a8ca8", THROTTLE_REGION: "#5a8ca8", BREAK_LOOP: "#c2a23e", OPEN_BRIDGE: "#5b9279", BOOST_CONFIDENCE_PATH: "#5b9279", TIGHTEN_CONFINEMENT: "#5b8cff", LOOSEN_CONFINEMENT: "#5b8cff", FINALIZE_IF_STABLE: "#5b9279" })[type] || "#f4a531";
}
function spawnToast(title, detail, color) {
    const container = document.getElementById("reactor-container");
    if (!container) return;
    let host = document.getElementById("fc-toasts");
    if (!host) { host = document.createElement("div"); host.id = "fc-toasts"; host.style.cssText = "position:absolute; top:8px; right:8px; z-index:200; display:flex; flex-direction:column; gap:5px; pointer-events:none; max-width:210px;"; container.appendChild(host); }
    const el = document.createElement("div");
    el.style.cssText = "background:rgba(8,9,12,0.92); border:1px solid var(--border-strong); border-left:3px solid " + (color || "#f4a531") + "; border-radius:4px; padding:6px 9px; font-family:'IBM Plex Mono',monospace; opacity:0; transform:translateX(12px); transition:all .25s ease;";
    const short = detail && detail.length > 84 ? detail.slice(0, 82) + "\u2026" : (detail || "");
    el.innerHTML = `<div style="font-size:9.5px; font-weight:600; color:${color || '#f4a531'}; letter-spacing:0.3px; text-transform:uppercase;">${title}</div><div style="font-size:8.5px; color:var(--text-muted); margin-top:2px; line-height:1.35;">${short}</div>`;
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateX(0)"; });
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(12px)"; setTimeout(() => el.remove(), 300); }, 2600);
    while (host.children.length > 2) host.firstChild.remove();
}

// Lyapunov-driven reactor rings: green stabilization wave / red warning.
function spawnStabilizationWave() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x5b9279, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 10, 40), mat);
    ring.rotation.x = Math.PI / 2; effectsGroup.add(ring);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; ring.scale.setScalar(1 + t * 3.2); mat.opacity = 0.6 * Math.max(0, 1 - t / 2.2); if (t > 2.2) { effectsGroup.remove(ring); mat.dispose(); return true; } return false; } });
}
function spawnWarningRing() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xc0584e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.06, 10, 64), mat);
    ring.rotation.x = Math.PI / 2; effectsGroup.add(ring);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; mat.opacity = (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 8))) * Math.max(0, 1 - t / 2.5); if (t > 2.5) { effectsGroup.remove(ring); mat.dispose(); return true; } return false; } });
}

// Convergence timeline: one row per analyzed cycle.
function pushConvCycle(label, m) {
    if (!window.convCycles) window.convCycles = [];
    window.convCycles.push({ label: label || ("C" + (window.convCycles.length + 1)), cons: m.consensus_score, H: m.entropy, V: m.lyapunov_V, stab: m.stability_score });
    if (window.convCycles.length > 7) window.convCycles.shift();
    renderConv();
}
function renderConv() {
    const host = document.getElementById("conv-timeline");
    if (!host) return;
    const cy = window.convCycles || [];
    if (!cy.length) { host.innerHTML = `<div class="idle-hint" style="padding:10px;">Analyze or auto-converge to chart cycles.</div>`; return; }
    host.innerHTML = cy.map((r, i) => { const prevV = (cy[i - 1] || {}).V; const better = prevV != null && r.V < prevV; return `<div style="display:flex;justify-content:space-between;gap:6px;color:var(--text-muted);"><span style="color:var(--accent);">${r.label}</span><span>cons ${(r.cons * 100).toFixed(0)}%</span><span>H ${r.H.toFixed(2)}</span><span style="color:${better ? '#5b9279' : 'var(--text-muted)'}">V ${r.V.toFixed(2)}</span></div>`; }).join("");
}
function spawnHotspot(pos, intensity) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xc0584e, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16 + 0.18 * intensity, 14, 14), mat);
    mesh.position.copy(pos); effectsGroup.add(mesh);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; const s = 1 + Math.sin(t * 5) * 0.25; mesh.scale.setScalar(s); mat.opacity = 0.8 * Math.max(0, 1 - t / 6); if (t > 6) { effectsGroup.remove(mesh); mat.dispose(); return true; } return false; } });
}
function spawnBombardment(pos, count) {
    const n = Math.min(160, count); const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3), dirs = [];
    for (let i = 0; i < n; i++) {
        const d = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
        dirs.push(d); const start = pos.clone().add(d.clone().multiplyScalar(2.5));
        arr[i * 3] = start.x; arr[i * 3 + 1] = start.y; arr[i * 3 + 2] = start.z;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: 0x8170b5, size: 0.12, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(g, mat); effectsGroup.add(pts);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; const k = Math.min(1, t / 0.9); const p = g.attributes.position;
        for (let i = 0; i < n; i++) { const start = pos.clone().add(dirs[i].clone().multiplyScalar(2.5)); const cur = start.lerp(pos, k); p.setXYZ(i, cur.x, cur.y, cur.z); }
        p.needsUpdate = true; if (k >= 1) { mat.opacity = Math.max(0, 1 - (t - 0.9) * 3); } if (t > 1.3) { effectsGroup.remove(pts); g.dispose(); mat.dispose(); return true; } return false; } });
}
function spawnReroute(from, to) {
    const mid = from.clone().add(to).multiplyScalar(0.5); mid.multiplyScalar(1.5); // bow outward
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
    const mat = new THREE.LineBasicMaterial({ color: 0xd99b4a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat); effectsGroup.add(line);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; mat.opacity = 0.9 * Math.max(0, 1 - t / 4); if (t > 4) { effectsGroup.remove(line); geo.dispose(); mat.dispose(); return true; } return false; } });
}
function spawnCoolingPulse(pos) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x5a8ca8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 28), mat);
    ring.position.copy(pos); ring.lookAt(0, 0, 0); effectsGroup.add(ring);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; ring.scale.setScalar(1 + t * 5); mat.opacity = 0.7 * Math.max(0, 1 - t / 1.6); if (t > 1.6) { effectsGroup.remove(ring); mat.dispose(); return true; } return false; } });
}
function spawnConfinement(pos) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x5f7fb3, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, wireframe: true });
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), mat);
    sph.position.copy(pos); effectsGroup.add(sph);
    let t = 0;
    window.fcEffects.push({ update(dt) { t += dt; sph.rotation.y += dt; mat.opacity = 0.5 * Math.max(0, 1 - t / 5); if (t > 5) { effectsGroup.remove(sph); mat.dispose(); return true; } return false; } });
}

// =====================================================================
// Boot
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
    buildSliders();
    wireModeTabs();
    wireEngines();
    // reflect saved mode
    document.querySelectorAll("#fc-mode-tabs button").forEach(b => b.classList.toggle("active", b.getAttribute("data-mode") === config.mode));
    document.getElementById("fc-mode-label").innerText = (MODE_PRESETS[config.mode] || MODE_PRESETS.balanced).label;

    initReactor();

    document.getElementById("analyze-btn").addEventListener("click", analyze);
    document.getElementById("apply-btn").addEventListener("click", applyRepairs);
    document.getElementById("auto-btn").addEventListener("click", autoConverge);
    renderFusionRef();

    // Show snapshot source if present
    const snap = loadSnapshot();
    if (snap) {
        document.getElementById("rs-run").innerText = snap.run_id.replace("run_", "#");
        document.getElementById("rs-active").innerText = snap.mesh.active_agents.toLocaleString();
        document.getElementById("rs-round").innerText = snap.round;
        controlLog(`[FUSIONCORE] Detected TorusNet snapshot ${snap.run_id}. Click "Analyze" to diagnose.`, "wake");
        setStatus(false, "Snapshot ready — click Analyze");
    }
});
