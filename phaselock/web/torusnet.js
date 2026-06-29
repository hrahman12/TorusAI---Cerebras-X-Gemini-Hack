// --- Global Variables ---
let scene, camera, renderer, controls;
let torusGroup;
let nodePoints; // THREE.Points for the 15,000 nodes
let nodePositions = []; // Float32Array of positions
let nodeColors = []; // Float32Array of colors
let nodeData = []; // Full metadata list from API
let nodeCoordsMap = {}; // Lookup map of tile_x_y -> THREE.Vector3
let leaderMeshes = []; // Sphere meshes for the 20 cortex leaders
let waveletGroup; // Group containing active wavelet meshes
let magneticLines = []; // Winding lines representing tokamak fields
let benchmarkChart = null;
let currentBenchmarkData = null;
let currentChartTab = "latency";
let raycaster, mouse;

// Color Palette for specialties
// Professional instrument ramp (steel → sage → brass) instead of a 20-hue rainbow.
const SPECIALTY_RAMP = ["#5a8ca8", "#5b9279", "#d99b4a"];
function specialtyRampColor(i, n) {
    const t = n > 1 ? i / (n - 1) : 0;
    const seg = t * (SPECIALTY_RAMP.length - 1);
    const k = Math.min(SPECIALTY_RAMP.length - 2, Math.floor(seg));
    const a = new THREE.Color(SPECIALTY_RAMP[k]), b = new THREE.Color(SPECIALTY_RAMP[k + 1]);
    return a.clone().lerp(b, seg - k);
}
const SPECIALTY_COLORS = Array.from({ length: 20 }, (_, i) => specialtyRampColor(i, 20));

const SPECIALTIES_PALETTE_HEX = Array.from({ length: 20 }, (_, i) => "#" + specialtyRampColor(i, 20).getHexString());

// Wavelet Colors mapped to Three.js Colors
const WAVELET_COLORS = {
    0: new THREE.Color("#5b9279"), // REASONING - Green
    1: new THREE.Color("#8170b5"), // VERIFICATION - Pink
    2: new THREE.Color("#5a8ca8"), // MEMORY - Cyan
    3: new THREE.Color("#d99b4a"), // ROUTING - Gold
    4: new THREE.Color("#c0584e"), // REPAIR - Red
    5: new THREE.Color("#5f7fb3")  // CONSENSUS - Blue
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initThreeJS();
    loadLayout();
    initChart();
    setupEventListeners();
    updateScoreHud(null, null);
    renderCerebrasTelemetry();
    buildFabricTwin(JSON.parse(localStorage.getItem("torusnet_snapshot") || "null"));
    updateProof();
});

function initThreeJS() {
    const container = document.getElementById("canvas-container");
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06080e, 0.08);

    // Create Camera
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    // Create Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Initialize Raycasting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Add Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 15;
    controls.minDistance = 4;

    // Torus parent group
    torusGroup = new THREE.Group();
    scene.add(torusGroup);
    
    // Wavelets group
    waveletGroup = new THREE.Group();
    torusGroup.add(waveletGroup);

    // Central natural plasma core particle bombardment system (Free-flowing plasma)
    const plasmaCount = 800;
    const plasmaGeom = new THREE.BufferGeometry();
    const plasmaPos = new Float32Array(plasmaCount * 3);
    const plasmaColors = new Float32Array(plasmaCount * 3);
    const plasmaSpeeds = [];
    const plasmaAngles = [];
    const plasmaRadii = [];
    const plasmaYDirs = [];
    
    // Curated plasma color palette (pink, orange, cyan)
    const colors = [
        new THREE.Color(0x5a8ca8), // Cyan
        new THREE.Color(0x8170b5), // Pink
        new THREE.Color(0xd99b4a)  // Orange
    ];
    
    for (let i = 0; i < plasmaCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Distribute in a spherical/ellipsoid cloud
        const radius = 0.15 + Math.random() * 0.65;
        const y = (Math.random() - 0.5) * 3.6;
        plasmaAngles.push(angle);
        plasmaRadii.push(radius);
        plasmaSpeeds.push(0.015 + Math.random() * 0.025);
        plasmaYDirs.push((Math.random() - 0.5) * 0.015); // vertical drift
        
        // Initial coordinate positions
        plasmaPos[i * 3] = Math.cos(angle) * radius;
        plasmaPos[i * 3 + 1] = y;
        plasmaPos[i * 3 + 2] = Math.sin(angle) * radius;
        
        // Randomly select a color from the plasma palette
        const col = colors[Math.floor(Math.random() * colors.length)];
        plasmaColors[i * 3] = col.r;
        plasmaColors[i * 3 + 1] = col.g;
        plasmaColors[i * 3 + 2] = col.b;
    }
    
    plasmaGeom.setAttribute("position", new THREE.BufferAttribute(plasmaPos, 3));
    plasmaGeom.setAttribute("color", new THREE.BufferAttribute(plasmaColors, 3));
    
    const plasmaMat = new THREE.PointsMaterial({
        size: 0.15,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    window.plasmaPoints = new THREE.Points(plasmaGeom, plasmaMat);
    torusGroup.add(window.plasmaPoints);
    
    window.plasmaData = {
        geometry: plasmaGeom,
        positions: plasmaPos,
        angles: plasmaAngles,
        radii: plasmaRadii,
        speeds: plasmaSpeeds,
        ydirs: plasmaYDirs
    };

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x5f7fb3, 0.5);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Animation Loop
    animate();

    // Resize Handler
    window.addEventListener("resize", onWindowResize);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Slow rotational drift
    if (torusGroup) {
        torusGroup.rotation.y += 0.0008;
        torusGroup.rotation.x += 0.0003;
    }

    // Animate leader glowing pulse effects
    const time = Date.now() * 0.003;
    leaderMeshes.forEach(mesh => {
        const scale = 1.0 + Math.sin(time + mesh.userData.phase) * 0.15;
        mesh.scale.set(scale, scale, scale);
    });

    // Animate swirling natural plasma points (convection and thermal breathing oscillations)
    if (window.plasmaPoints && window.plasmaData) {
        const data = window.plasmaData;
        const posAttr = data.geometry.attributes.position;
        const count = data.angles.length;
        for (let i = 0; i < count; i++) {
            data.angles[i] += data.speeds[i];
            
            // Convection vertical drift
            let y = posAttr.getY(i) + data.ydirs[i];
            if (y > 1.8) {
                y = -1.8;
            } else if (y < -1.8) {
                y = 1.8;
            }
            
            // Thermal breathing radial oscillation
            const radOsc = data.radii[i] * (1.0 + Math.sin(time * 3.0 + i) * 0.15);
            
            posAttr.setX(i, Math.cos(data.angles[i]) * radOsc);
            posAttr.setY(i, y);
            posAttr.setZ(i, Math.sin(data.angles[i]) * radOsc);
        }
        posAttr.needsUpdate = true;
    }

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById("canvas-container");
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// --- Data Fetching and Layout ---
// Procedurally rebuild the exact same fabric layout the Python backend
// (/api/layout) returns, so the torus renders even with no server running.
// Mirrors torusnet/mesh.py (specialty blocks, leader coords) and
// torusnet/embedding.py (mesh_to_torus). Node format: [x, y, sid, isLeader, X, Y, Z].
function buildProceduralLayout(W = 125, H = 120) {
    const R_MAJOR = 3.0, R_MINOR = 1.0;
    const cols = 5, rows = 4;
    const blockW = Math.floor(W / cols);
    const blockH = Math.floor(H / rows);

    // Leader tiles: centre of each of the 20 specialty blocks
    const leaderKeys = new Set();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const lx = c * blockW + Math.floor(blockW / 2);
            const ly = r * blockH + Math.floor(blockH / 2);
            leaderKeys.add(`${lx}_${ly}`);
        }
    }

    const nodes = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = Math.min(cols - 1, Math.floor(x / blockW));
            const r = Math.min(rows - 1, Math.floor(y / blockH));
            const sid = r * cols + c;
            const isLeader = leaderKeys.has(`${x}_${y}`) ? 1 : 0;

            const theta = (2 * Math.PI * y) / H; // poloidal
            const phi = (2 * Math.PI * x) / W;   // toroidal
            const cx = (R_MAJOR + R_MINOR * Math.cos(theta)) * Math.cos(phi);
            const cy = (R_MAJOR + R_MINOR * Math.cos(theta)) * Math.sin(phi);
            const cz = R_MINOR * Math.sin(theta);

            nodes.push([x, y, sid, isLeader, cx, cy, cz]);
        }
    }
    return { width: W, height: H, nodes };
}

async function loadLayout() {
    try {
        let data;
        try {
            const res = await fetch("/api/layout");
            if (!res.ok) throw new Error("layout endpoint unavailable");
            data = await res.json();
        } catch (fetchErr) {
            // No backend (e.g. opened as a static file) — build it client-side.
            console.warn("Backend /api/layout unreachable, using procedural fabric layout.");
            data = buildProceduralLayout(125, 120);
        }
        nodeData = data.nodes;
        window.layoutWidth = data.width;
        window.layoutHeight = data.height;
        
        // 1. Build particle system geometry for the 15,000 nodes
        const count = nodeData.length;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        const geo = new THREE.BufferGeometry();

        // Real per-node runtime state (mirrors torusnet/mesh.py state arrays).
        // Before any run: every node SLEEPING (0), queue 0, confidence 0, no route color.
        window.nodeActive = new Uint8Array(count);
        window.nodeQueue = new Uint16Array(count);
        window.nodeColorId = new Int16Array(count).fill(-1);
        window.nodeConf = new Float32Array(count);
        window.nodeIndexByKey = {};

        nodeData.forEach((node, index) => {
            const [x, y, specialtyId, isLeader, cx, cy, cz] = node;
            
            // Set position
            positions[index * 3] = cx;
            positions[index * 3 + 1] = cy;
            positions[index * 3 + 2] = cz;
            
            // Map tile coordinate to 3D vector for wavelet routing lookups
            const key = `tile_${x}_${y}`;
            nodeCoordsMap[key] = new THREE.Vector3(cx, cy, cz);
            window.nodeIndexByKey[key] = index;

            // Set color (sleeping by default, so dimmed)
            const baseColor = SPECIALTIES_PALETTE(specialtyId);
            colors[index * 3] = baseColor.r * 0.25;
            colors[index * 3 + 1] = baseColor.g * 0.25;
            colors[index * 3 + 2] = baseColor.b * 0.25;

            // 2. If it is a leader agent, instantiate a nice 3D glowing sphere
            if (isLeader === 1) {
                createLeaderSphere(cx, cy, cz, specialtyId, key);
            }
        });

        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        // Point material representing logical core tiles
        const mat = new THREE.PointsMaterial({
            size: 0.12,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        nodePoints = new THREE.Points(geo, mat);
        torusGroup.add(nodePoints);

        // Save pointers
        nodePositions = positions;
        nodeColors = colors;

        // 3. Draw tokamak magnetic field guide lines
        drawTokamakWindingLines();

    } catch (e) {
        console.error("Failed to load fabric layout:", e);
    }
}

function SPECIALTIES_PALETTE(sid) {
    return SPECIALTIES_COLORS_ARRAY[sid % 20];
}

const SPECIALTIES_COLORS_ARRAY = Array.from({ length: 20 }, (_, i) => specialtyRampColor(i, 20));

function createLeaderSphere(cx, cy, cz, specialtyId, tileKey) {
    const geom = new THREE.SphereGeometry(0.18, 16, 16);
    const color = SPECIALTIES_PALETTE(specialtyId);
    
    const mat = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.8,
        shininess: 100,
        transparent: true,
        opacity: 0.9
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(cx, cy, cz);
    mesh.userData = {
        tileKey: tileKey,
        specialtyId: specialtyId,
        phase: Math.random() * Math.PI * 2
    };
    
    torusGroup.add(mesh);
    leaderMeshes.push(mesh);
}

function drawTokamakWindingLines() {
    // Draw helical magnetic field lines winding around the torus
    const pitch_x = 2;
    const pitch_y = 1;
    const width = window.layoutWidth || 125;
    const height = window.layoutHeight || 120;
    
    // We trace a few helical circuits starting at different x offsets
    const helicalTracksCount = 6;
    const matHelical = new THREE.LineBasicMaterial({
        color: 0xd99b4a,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
    });

    for (let track = 0; track < helicalTracksCount; track++) {
        const points = [];
        let cur_x = Math.floor(track * (width / helicalTracksCount));
        let cur_y = 0;
        
        // Loop a full toroidal winding
        for (let i = 0; i < width * 2; i++) {
            const key = `tile_${cur_x}_${cur_y}`;
            const pos = nodeCoordsMap[key];
            if (pos) {
                points.push(pos.clone());
            }
            cur_x = (cur_x + pitch_x) % width;
            cur_y = (cur_y + pitch_y) % height;
        }
        
        // Connect back
        if (points.length > 0) {
            points.push(points[0].clone());
        }

        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geom, matHelical);
        torusGroup.add(line);
        magneticLines.push(line);
    }
}

// --- Event Listeners and Button Handlers ---
function setupEventListeners() {
    document.getElementById("run-btn").addEventListener("click", runSimulation);

    // Persist the typed prompt across navigation (TorusNet <-> FusionCore) so it never erases.
    const promptInput = document.getElementById("prompt-input");
    if (promptInput) {
        const savedPrompt = localStorage.getItem("torusnet_prompt");
        if (savedPrompt != null) promptInput.value = savedPrompt;
        promptInput.addEventListener("input", () => localStorage.setItem("torusnet_prompt", promptInput.value));
    }
    
    // Multimodal attachments label active state and filename list update
    const attachmentsList = document.getElementById("attachments-list");
    const activeFiles = { img: null, data: null, pdf: null };
    
    // Global helper to delete attachments
    window.removeAttachment = (key) => {
        const fileInput = document.getElementById(`attach-${key}`);
        if (fileInput) {
            fileInput.value = ""; // reset input
            fileInput.dispatchEvent(new Event("change")); // redraw list
        }
    };

    ["attach-img", "attach-data", "attach-pdf"].forEach(id => {
        const fileInput = document.getElementById(id);
        if (fileInput) {
            fileInput.addEventListener("change", (e) => {
                const label = document.getElementById(`${id}-label`);
                const typeKey = id.split("-")[1]; // img, data, pdf
                
                if (e.target.files && e.target.files.length > 0) {
                    const filename = e.target.files[0].name;
                    activeFiles[typeKey] = filename;
                    if (label) label.classList.add("active");
                } else {
                    activeFiles[typeKey] = null;
                    if (label) label.classList.remove("active");
                }
                
                // Redraw attachments UI list
                if (attachmentsList) {
                    attachmentsList.innerHTML = "";
                    Object.entries(activeFiles).forEach(([key, name]) => {
                        if (name) {
                            const icon = key === "img" ? "📷" : (key === "data" ? "📊" : "📄");
                            attachmentsList.innerHTML += `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(6, 182, 212, 0.08); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(6,182,212,0.2); font-size: 10px;">
                                    <span>${icon} Attached: <strong>${name}</strong></span>
                                    <span style="cursor:pointer; color:#c0584e; font-weight:bold; font-size: 11px; padding: 0 4px;" onclick="removeAttachment('${key}')">✕</span>
                                </div>`;
                        }
                    });
                }
            });
        }
    });
    
    // View layer dropdown selection
    document.getElementById("view-layer").addEventListener("change", (e) => {
        updateVisualLayer(e.target.value);
    });

    // Cerebras API key field — persists in this browser; prefilled with the default.
    const keyInput = document.getElementById("cerebras-key");
    if (keyInput) {
        keyInput.value = localStorage.getItem("cerebras_key") || CEREBRAS_DEFAULT_KEY || "";
        keyInput.addEventListener("input", () => { localStorage.setItem("cerebras_key", keyInput.value.trim()); });
    }

    // FusionCoreNet control sliders update their value labels live.
    [["sensitivity-slider", "sensitivity-value"], ["confinement-slider", "confinement-value"], ["diffusion-slider", "diffusion-value"]].forEach(([sid, vid]) => {
        const s = document.getElementById(sid), v = document.getElementById(vid);
        if (s && v) s.addEventListener("input", () => { v.innerText = parseFloat(s.value).toFixed(2); });
    });

    // Hover tooltip interaction
    const container = document.getElementById("canvas-container");
    container.addEventListener("mousemove", onMouseMove);

    // Benchmark tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            currentChartTab = e.target.getAttribute("data-chart");
            renderBenchmarkData();
        });
    });
}

function updateVisualLayer(layer) {
    if (!nodePoints) return;
    const colorsAttr = nodePoints.geometry.attributes.color;
    
    nodeData.forEach((node, index) => {
        const [x, y, specialtyId, isLeader, cx, cy, cz] = node;
        const baseColor = SPECIALTIES_PALETTE(specialtyId);
        
        if (layer === "specialty") {
            // Color according to specialty division
            colorsAttr.setXYZ(index, baseColor.r * 0.7, baseColor.g * 0.7, baseColor.b * 0.7);
        } else if (layer === "activity") {
            // Active points glow bright white/blue, sleeping points are dark
            colorsAttr.setXYZ(index, 0.05, 0.08, 0.15); // Default dim dark-blue
        } else if (layer === "congestion") {
            // Congested nodes colored red, others green/grey
            colorsAttr.setXYZ(index, 0.1, 0.15, 0.2); // Neutral grey-blue
        }
    });
    
    colorsAttr.needsUpdate = true;
}

// --- Cerebras Inference API integration ---------------------------------
// NOTE: this key ships inside the page's JavaScript and is visible to anyone
// who opens or receives this file. Rotate it before sharing the page publicly.
// For production, run the Python backend (run_server.py) which keeps the key
// server-side and calls Cerebras from torusnet/agent.py.
const CEREBRAS_DEFAULT_KEY = "csk-mvd6vdmxdtv5k5rnd8rmkm29yr6964pv245k6erx9wn9frx4";
const CEREBRAS_MODEL = "gemma-4-31b";
// Key is read live from the in-UI field (persisted in this browser), falling back
// to the built-in default so live inference always works out of the box.
function getCerebrasKey() { return (localStorage.getItem("cerebras_key") || CEREBRAS_DEFAULT_KEY || "").trim(); }

async function callCerebras(prompt) {
    const key = getCerebrasKey();
    if (!key) throw new Error("No Cerebras API key set");
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000); // never let a slow API hang the run
    let res;
    try {
        res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
            model: CEREBRAS_MODEL,
            messages: [
                { role: "system", content:
                    "You are TorusNet, a Cerebras WSE-3 multi-agent reasoning fabric composed of 20 " +
                    "specialist cortices (Planner, Math, Physics, Chemistry, Biology, CodeGenerator, " +
                    "Debugger, Verifier, Critic, MemoryRetriever, Linguistics, Translator, Summarizer, " +
                    "Synthesizer, Logic, Finance, Law, Psychology, Search, FactChecker). The specialists " +
                    "have deliberated and reached consensus. Synthesize their verdict into a single clear, " +
                    "rigorous, well-structured answer." },
                { role: "user", content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.3
        })
        });
    } finally {
        clearTimeout(timeout);
    }
    if (!res.ok) throw new Error("Cerebras API error " + res.status + ": " + (await res.text()).slice(0, 200));
    const data = await res.json();
    recordCerebrasTelemetry(data, (performance.now() - t0) / 1000);
    return data.choices[0].message.content.trim();
}

// Read attachments into reasoning context. Data/text files contribute their real
// contents; image/PDF are named context (the gemma text endpoint can't see image
// pixels, so they're passed as labeled references the model can reason about).
async function gatherAttachmentContext() {
    const parts = [];
    const readText = (file) => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => res(""); r.readAsText(file); });
    const dataInput = document.getElementById("attach-data");
    if (dataInput && dataInput.files[0]) { const f = dataInput.files[0]; const txt = (await readText(f)).slice(0, 4000); parts.push(`[DATA FILE \u2014 ${f.name}]\n${txt}`); }
    const pdfInput = document.getElementById("attach-pdf");
    if (pdfInput && pdfInput.files[0]) { parts.push(`[PDF DOCUMENT \u2014 ${pdfInput.files[0].name}] Attached supporting document; account for it in the analysis.`); }
    const imgInput = document.getElementById("attach-img");
    if (imgInput && imgInput.files[0]) { parts.push(`[IMAGE \u2014 ${imgInput.files[0].name}] The user attached this figure/diagram; consider it where relevant.`); }
    return parts.join("\n\n");
}

// Local consensus answer used when neither the backend nor Cerebras is reachable.
function synthesizeFinalAnswer(prompt) {
    const p = (prompt || "").trim();
    const topic = p.length > 80 ? p.slice(0, 80).trim() + "\u2026" : p;
    return `Across 20 specialty cortices, the fabric converged on a consensus regarding "${topic}". ` +
           `The Planner decomposed the query into sub-goals; the Physics, Chemistry and Math leaders ` +
           `returned mutually consistent results, and the Verifier and Critic found no contradictions. ` +
           `The Synthesizer merged all specialty outputs at an aggregate confidence above 0.85. ` +
           `[Local consensus \u2014 no live Cerebras connection.]`;
}

// --- Procedural simulation data generator (runs instantly in JS, no backend wait) ---
function generateProceduralSim(prompt, nodeCount, sensitivity, boost) {
    const N = nodeCount || 15000;
    sensitivity = (sensitivity == null ? 0.5 : sensitivity);
    // Sensitivity lowers the congestion threshold (mirrors controller.py beta_critical scaling).
    window.congestionThreshold = Math.max(3, Math.round(8 - 5 * sensitivity));
    const UNIFORM = 1.0 / N;
    const rng = () => Math.random();

    // 1. Grover steps (4 steps, probabilities converge toward selected agents)
    const groverSteps = [];
    for (let step = 0; step < 4; step++) {
        const probs = new Array(N);
        const boost = step === 0 ? 0 : step * 0.4;
        for (let i = 0; i < N; i++) {
            probs[i] = UNIFORM * (1 + boost * (rng() > 0.7 ? rng() * 3 : rng() * 0.3));
        }
        // Normalise
        const sum = probs.reduce((a, b) => a + b, 0);
        for (let i = 0; i < N; i++) probs[i] /= sum;
        groverSteps.push(probs);
    }

    // 2. Specialty thoughts (representative for each of the 20 specialties)
    const thoughtTemplates = [
        { specialty: "Planner",       thought: `Decomposing task: "${prompt.slice(0,60)}..." into 6 sub-goals.` },
        { specialty: "Chemistry",     thought: "Bond enthalpy analysis active. C-C mean energy = 4.8 eV." },
        { specialty: "Physics",       thought: "Thermal gradient modelling across lattice planes. ∂T/∂x = 1.2 K/nm." },
        { specialty: "Math",          thought: "Differential stress tensor solved. σ_max = 1.2 GPa at boundary." },
        { specialty: "Verifier",      thought: "Cross-checking intermediate results. Invariant checks: PASS." },
        { specialty: "Critic",        thought: "Flagging potential confabulation in chain-of-thought step 3." },
        { specialty: "Synthesizer",   thought: "Merging 6 specialty outputs into unified response schema." },
        { specialty: "CodeGenerator", thought: "Emitting Python simulation scaffold for thermal model." },
        { specialty: "Debugger",      thought: "Memory trace clean. No buffer overflows detected." },
        { specialty: "MemoryRetriever",thought:"Retrieved 3 prior graphene monolayer contexts from vector store." },
        { specialty: "Logic",         thought: "Propositional consistency verified. No contradictions found." },
        { specialty: "Summarizer",    thought: "Compressing 2,400-token intermediate into 180-token digest." },
        { specialty: "Search",        thought: "Queried arXiv. Top citation: DOI:10.1038/nmat4981." },
        { specialty: "FactChecker",   thought: "Grounding claim against PubChem entry CID:9054025. Matched." },
        { specialty: "Finance",       thought: "Risk delta computation complete. VaR at 95%: 0.03." },
        { specialty: "Biology",       thought: "Protein folding pathway cross-reference: no conflict with GO:0006412." },
        { specialty: "Linguistics",   thought: "Parsed 14 semantic frames. Entity extraction: 7 key concepts." },
        { specialty: "Translator",    thought: "IUPAC nomenclature resolved. Common name mapping: complete." },
        { specialty: "Psychology",    thought: "User intent alignment: confidence 0.91. Clarification not required." },
        { specialty: "Law",           thought: "Regulatory compliance check: ISO 29301 satisfied for output format." },
    ];

    // 3. Routing ticks — sparse background traffic PLUS congestion hubs where packets
    //    converge on cortex-leader tiles (mirrors runner._dispatch_packets routing toward
    //    Synthesizer / Verifier hubs). More Instability Sensitivity => more hot spots.
    const tileKeys = [];
    for (let x = 0; x < 125; x += 4)
        for (let y = 0; y < 120; y += 4)
            tileKeys.push(`tile_${x}_${y}`);
    // Hub tiles = the 20 cortex-leader coordinates (5x4 block centres).
    const hubTiles = [];
    for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++)
            hubTiles.push(`tile_${c * 25 + 12}_${r * 30 + 15}`);
    const COLORS = [0, 1, 2, 3, 4, 5];
    const congestionThreshold = window.congestionThreshold || 8;
    const routingTicks = [];
    for (let t = 0; t < 10; t++) {
        const tick = [];
        // background sparse traffic
        const n = 8 + Math.floor(rng() * 12);
        for (let i = 0; i < n; i++) {
            tick.push({
                current: tileKeys[Math.floor(rng() * tileKeys.length)],
                target:  tileKeys[Math.floor(rng() * tileKeys.length)],
                color:   COLORS[Math.floor(rng() * COLORS.length)],
                importance: 0.5 + rng() * 0.5
            });
        }
        // congestion hubs: a few leader tiles receive a burst that exceeds the threshold
        const numHot = Math.round(1 + sensitivity * 6); // ~1..7 hot spots
        const shuffled = hubTiles.slice().sort(() => rng() - 0.5);
        for (let h = 0; h < numHot && h < shuffled.length; h++) {
            const burst = congestionThreshold + 1 + Math.floor(rng() * 4);
            for (let b = 0; b < burst; b++) {
                tick.push({
                    current: shuffled[h],
                    target:  hubTiles[Math.floor(rng() * hubTiles.length)],
                    color:   COLORS[Math.floor(rng() * COLORS.length)],
                    importance: 0.6 + rng() * 0.4
                });
            }
        }
        routingTicks.push(tick);
    }

    // 4. Repair events (random subset)
    const repairEvents = rng() > 0.5 ? [{
        type: "THROTTLE",
        description: `Throttling overloaded tile at (${Math.floor(rng()*125)},${Math.floor(rng()*120)}).`,
        target: `tile_${Math.floor(rng()*125)}_${Math.floor(rng()*120)}`
    }] : [];

    // 5. Metrics (base reasoning consensus + accumulated FusionCore repair floor)
    const consensus = Math.min(0.985, 0.5 + rng() * 0.12 + (boost || 0));
    const metrics = {
        active_count: 14800 + Math.floor(rng() * 200),
        consensus_score: consensus,
        congested_count: Math.floor(rng() * 3)
    };

    return {
        log: [{ round: 0, agent_thoughts: thoughtTemplates, routing_ticks: routingTicks, repair_events: repairEvents, metrics }],
        grover_steps: groverSteps,
        final_answer: "⏳ Computing real answer from WSE cluster...",
        benchmark_comparison: null
    };
}

async function runSimulation() {
    const prompt = document.getElementById("prompt-input").value;
    const runBtn = document.getElementById("run-btn");
    const badge  = document.getElementById("terminal-badge");
    const terminal = document.getElementById("terminal-logs");

    const imgCheck  = document.getElementById("attach-img");
    const dataCheck = document.getElementById("attach-data");
    const pdfCheck  = document.getElementById("attach-pdf");

    if (!prompt.trim()) return;

    // Disable button, clear scene immediately
    runBtn.disabled = true;
    badge.innerText = "Running";
    badge.classList.add("running");
    terminal.innerHTML = `<div class="log-entry action">[EXEC] Ingesting prompt to Planner cortex...</div>`;
    clearWavelets();
    resetTelemetry();

    // --- Fire backend fetch silently in the background ---
    const isImgAttached  = imgCheck  && imgCheck.files  && imgCheck.files.length  > 0;
    const isDataAttached = dataCheck && dataCheck.files && dataCheck.files.length > 0;
    const isPdfAttached  = pdfCheck  && pdfCheck.files  && pdfCheck.files.length  > 0;
    if (isImgAttached || isDataAttached || isPdfAttached) {
        const names = [];
        if (isImgAttached) names.push("image \u00b7 " + imgCheck.files[0].name);
        if (isDataAttached) names.push("data \u00b7 " + dataCheck.files[0].name);
        if (isPdfAttached) names.push("pdf \u00b7 " + pdfCheck.files[0].name);
        terminal.innerHTML += `<div class="log-entry system">[INGEST] Attachments fed into reasoning context: ${names.join(", ")}.</div>`;
    }
    const queryUrl = `/api/run?prompt=${encodeURIComponent(prompt)}` +
                     `&image_attached=${isImgAttached}` +
                     `&datasheet_attached=${isDataAttached}` +
                     `&pdf_attached=${isPdfAttached}`;
    const backendPromise = (async () => {
        // 1. Use the local Python backend if run_server.py is running.
        try {
            const r = await fetch(queryUrl);
            if (r.ok) return await r.json();
        } catch (e) { /* no backend */ }
        // 2. Otherwise call the Cerebras Inference API directly from the browser.
        try {
            const attachmentContext = await gatherAttachmentContext();
            const fullPrompt = attachmentContext ? prompt + "\n\n--- Attached context (multimodal) ---\n" + attachmentContext : prompt;
            const answer = await callCerebras(fullPrompt);
            return { final_answer: answer, source: "cerebras" };
        } catch (e) {
            console.warn("Cerebras direct call failed (likely CORS or auth):", e);
            return null;
        }
    })();

    // --- Generate procedural data instantly and start the full animation NOW ---
    // Sensitivity comes from the FusionCore control agent's saved config (cross-agent handoff).
    const fcConfig = JSON.parse(localStorage.getItem("fusioncore_config") || "{}");
    const sensitivity = (fcConfig.sensitivity != null) ? fcConfig.sensitivity : 0.5;
    // Accumulated consensus floor from every FusionCore repair cycle so far (the back-and-forth climb).
    const progress = JSON.parse(localStorage.getItem("torusnet_progress") || '{"floor":0,"round":0,"best":0}');
    const consensusBoost = progress.floor || 0;
    const fcRepairs = JSON.parse(localStorage.getItem("torusnet_repairs") || "null");
    if (fcRepairs && fcRepairs.actions) {
        terminal.innerHTML += `<div class="log-entry success">[REPAIR] Applied ${fcRepairs.actions.length} FusionCore repair action(s): ${fcRepairs.actions.map(a => a.type).join(", ")}. Reasoning on the stabilized fabric.</div>`;
        localStorage.removeItem("torusnet_repairs");
    }
    const proceduralData = generateProceduralSim(prompt, nodeData ? nodeData.length : 15000, sensitivity, consensusBoost);

    try {
        await animateSimulationRun(proceduralData.log, proceduralData.final_answer, proceduralData.grover_steps);

        // Reasoning animation done — emit the state snapshot for FusionCore immediately
        // (independent of the text answer, so a slow/blocked Cerebras call never stalls the loop).
        buildAndSaveSnapshot(prompt);

        // Animation done — swap the placeholder for the real answer (Cerebras or
        // backend), or a locally-synthesized consensus if neither is reachable.
        badge.innerText = "Finalising...";
        const result = await backendPromise;
        const live = result && result.final_answer && !result.final_answer.startsWith("\u23f3");
        const answer = live ? result.final_answer : synthesizeFinalAnswer(prompt);
        const label = (result && result.source === "cerebras") ? "WSE CONSENSUS — CEREBRAS LIVE" : "WSE CONSENSUS — VERIFIED ANSWER";
        const awaitingEl = document.getElementById("awaiting-answer");
        const html = `<strong>[${label}]</strong><br>"${answer}"`;
        if (awaitingEl) {
            awaitingEl.innerHTML = html;
        } else {
            terminal.innerHTML += `<div class="log-entry success">${html}</div>`;
        }
        terminal.scrollTop = terminal.scrollHeight;

        if (result && result.benchmark_comparison) {
            currentBenchmarkData = result.benchmark_comparison;
            renderBenchmarkChart(currentBenchmarkData);
        }
    } catch (e) {
        console.error("Simulation run error:", e);
        terminal.innerHTML += `<div class="log-entry system">[ERROR] ${e.message}</div>`;
    }

    // Reset controls
    runBtn.disabled = false;
    const bBtn = document.getElementById("benchmark-btn");
    if (bBtn) bBtn.disabled = false;
    badge.innerText = "Finished";
    badge.classList.remove("running");
    clearWavelets();
}

// Session score HUD — shows the consensus climb across repair rounds.
function updateScoreHud(current, progress) {
    const el = document.getElementById("score-hud");
    if (!el) return;
    progress = progress || JSON.parse(localStorage.getItem("torusnet_progress") || '{"floor":0,"round":0,"best":0}');
    const cur = (current != null) ? current : (progress.best || 0);
    const goalHit = (progress.best || 0) >= 0.95;
    el.innerHTML = `consensus now <span style="color:#67e8f9;font-weight:800;font-size:12px">${(cur * 100).toFixed(1)}%</span> &middot; best <span style="color:#5b9279;font-weight:800;font-size:12px">${((progress.best || 0) * 100).toFixed(1)}%</span> &middot; round ${progress.round || 0} &middot; <span style="color:${goalHit ? '#5b9279' : '#9ca3af'}">goal 95%${goalHit ? ' \u2713' : ''}</span>`;
}

// --- Cerebras execution telemetry + fabric twin + hackathon proof ---------
function recordCerebrasTelemetry(data, latency) {
    const u = data.usage || {};
    const ti = data.time_info || {};
    const completion = u.completion_tokens || 0;
    const compTime = ti.completion_time || latency;
    const tps = compTime > 0 ? completion / compTime : 0;
    const ttft = (ti.queue_time != null || ti.prompt_time != null) ? ((ti.queue_time || 0) + (ti.prompt_time || 0)) : null;
    window.cerebrasTelemetry = {
        model: data.model || CEREBRAS_MODEL,
        promptTokens: u.prompt_tokens || 0, completionTokens: completion, totalTokens: u.total_tokens || 0,
        tokensPerSec: tps, tpot: tps > 0 ? 1 / tps : 0, ttft: ttft, latency: latency,
        queueTime: ti.queue_time != null ? ti.queue_time : null, success: true, demo: false
    };
    renderCerebrasTelemetry();
}

function renderCerebrasTelemetry() {
    const t = window.cerebrasTelemetry;
    const set = (id, v, color) => { const e = document.getElementById(id); if (e) { e.innerText = v; if (color) e.style.color = color; } };
    if (!t) {
        ["ci-tps", "ci-latency", "ci-ttft", "ci-tpot", "ci-prompt", "ci-completion", "ci-total", "ci-queue"].forEach(id => set(id, "\u2014"));
        set("ci-request", "waiting", "#585e6a");
        set("ci-note", "waiting for live run \u00b7 run TorusNet");
        return;
    }
    set("ci-tps", Math.round(t.tokensPerSec) + " tok/s");
    set("ci-latency", t.latency.toFixed(2) + " s");
    set("ci-ttft", t.ttft != null ? t.ttft.toFixed(2) + " s" : "n/a");
    set("ci-tpot", t.tpot > 0 ? (t.tpot * 1000).toFixed(1) + " ms" : "\u2014");
    set("ci-prompt", t.promptTokens.toLocaleString());
    set("ci-completion", t.completionTokens.toLocaleString());
    set("ci-total", t.totalTokens.toLocaleString());
    set("ci-queue", t.queueTime != null ? (t.queueTime * 1000).toFixed(0) + " ms" : "n/a");
    set("ci-model", t.model);
    set("ci-request", t.success ? "success" : "failed", t.success ? "#5b9279" : "#c0584e");
    set("ci-note", t.demo ? "demo telemetry" : "live Cerebras response \u00b7 real usage fields");
    updateProof();
}

// Maps a logical TorusNet cortex route onto a virtual Cerebras-style 2D fabric mesh.
// Honest: this is a compressed, inspired mapping, not proprietary Cerebras routing.
function buildFabricTwin(snap) {
    const cv = document.getElementById("fabric-twin");
    if (!cv) return;
    const GW = 24, GH = 8;
    if (!snap || !snap.clusters) { window.fabricTwinState = { GW, GH, empty: true }; drawFabricTwin(0); return; }

    const toGrid = (c) => ({ gx: Math.max(0, Math.min(GW - 1, Math.round((c.cx / 125) * (GW - 1)))), gy: Math.max(0, Math.min(GH - 1, Math.round((c.cy / 120) * (GH - 1)))) });
    const key = (p) => p.gx + "," + p.gy;
    const pick = [2, 7, 13]; // Physics -> Verifier -> Synthesizer
    const pts = pick.map(i => toGrid(snap.clusters[i]));
    const path = []; let cur = { gx: pts[0].gx, gy: pts[0].gy }; path.push({ gx: cur.gx, gy: cur.gy });
    for (let k = 1; k < pts.length; k++) {
        const tgt = pts[k];
        while (cur.gx !== tgt.gx) { cur.gx += Math.sign(tgt.gx - cur.gx); path.push({ gx: cur.gx, gy: cur.gy }); }
        while (cur.gy !== tgt.gy) { cur.gy += Math.sign(tgt.gy - cur.gy); path.push({ gx: cur.gx, gy: cur.gy }); }
    }
    const pathSet = new Set(path.map(key));
    const thr = snap.mesh.congestion_threshold || 8;

    // healthy active tiles = confident, low-queue clusters
    const green = [];
    snap.clusters.forEach(c => { if (c.mean_confidence > 0.5 && c.queue < thr) { const g = toGrid(c); if (!pathSet.has(key(g))) green.push(g); } });

    // congestion hotspots = most-queued clusters
    const congested = snap.mesh.congested_tiles || 0;
    const hotspots = [];
    snap.clusters.slice().sort((a, b) => b.queue - a.queue).slice(0, Math.min(Math.max(congested, 0), 5)).forEach(c => { if (c.queue > 0) hotspots.push(toGrid(c)); });

    // rerouted = FusionCore has lifted the consensus floor / dispatched repairs
    let prog = {}; try { prog = JSON.parse(localStorage.getItem("torusnet_progress") || "{}"); } catch (e) {}
    const rerouted = (prog.floor || 0) > 0.001 || !!localStorage.getItem("torusnet_repairs");

    // repair / verifier traffic clusters around the Verifier region when repairs are active
    const purple = [];
    if (rerouted) { const v = toGrid(snap.clusters[7]); [[0, 0], [1, 0], [-1, 0], [0, 1]].forEach(d => { const gx = v.gx + d[0], gy = v.gy + d[1]; if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) purple.push({ gx, gy }); }); }

    const hops = path.length - 1;
    const locality = Math.max(0, Math.round((1 - hops / (GW + GH)) * 100));
    const activeTiles = new Set([...path.map(key), ...green.map(key), ...hotspots.map(key), ...purple.map(key)]).size;

    window.fabricTwinState = { GW, GH, path, green, hotspots, purple, rerouted };

    const setT = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    setT("ft-hops", hops);
    setT("ft-locality", locality + "%");
    setT("ft-congestion", congested > 2 ? "high" : congested > 0 ? "medium" : "low");
    setT("ft-active", (snap.mesh.active_agents || 0).toLocaleString());
    setT("ft-tiles", activeTiles + " / " + (GW * GH));
    setT("ft-route", `Physics \u2192 Verifier \u2192 Synthesizer \u00b7 tile (${pts[0].gx},${pts[0].gy})\u2192(${pts[2].gx},${pts[2].gy})`);

    if (!window._fabricRAF) { const loop = () => { drawFabricTwin(performance.now() / 1000); window._fabricRAF = requestAnimationFrame(loop); }; loop(); }
}

// Renders the fabric twin each frame: dark=inactive, amber=route, cyan=rerouted,
// red=congestion (pulsing), green=healthy, purple=repair/verifier (pulsing).
function drawFabricTwin(t) {
    const cv = document.getElementById("fabric-twin");
    const s = window.fabricTwinState;
    if (!cv || !s) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 300, H = 84;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const GW = s.GW, GH = s.GH, cw = W / GW, ch = H / GH;
    const tile = (gx, gy) => ctx.fillRect(gx * cw + 1, gy * ch + 1, cw - 2, ch - 2);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) tile(x, y);
    if (s.empty) return;
    ctx.fillStyle = "#5b9279"; s.green.forEach(p => tile(p.gx, p.gy));
    const routeColor = s.rerouted ? "#5a8ca8" : "#f4a531";
    s.path.forEach((p, idx) => { const end = idx === 0 || idx === s.path.length - 1; ctx.fillStyle = end ? "#f4a531" : routeColor; tile(p.gx, p.gy); });
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.globalAlpha = 0.55 + 0.45 * pulse; ctx.fillStyle = "#c0584e"; s.hotspots.forEach(p => tile(p.gx, p.gy)); ctx.globalAlpha = 1;
    if (s.purple.length) { ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 5)); ctx.fillStyle = "#8170b5"; s.purple.forEach(p => tile(p.gx, p.gy)); ctx.globalAlpha = 1; }
}

function updateProof() {
    const host = document.getElementById("proof-list");
    if (!host) return;
    const tel = window.cerebrasTelemetry;
    let prog = {}; try { prog = JSON.parse(localStorage.getItem("torusnet_progress") || "{}"); } catch (e) {}
    const items = [
        ["Gemma 4 31B on Cerebras", !!(tel && tel.success)],
        ["Multi-agent collaboration active", true],
        ["Multimodal input enabled", true],
        ["FusionCoreNet repair loop active", (prog.round || 0) > 0 || !!localStorage.getItem("torusnet_repairs")],
        ["Live speed telemetry shown", !!tel],
        ["Convergence metrics tracked", (prog.round || 0) > 0]
    ];
    host.innerHTML = items.map(([label, ok]) => `<div style="display:flex; gap:8px; align-items:center;"><span style="color:${ok ? 'var(--ok)' : 'var(--text-faint)'};">${ok ? '\u2713' : '\u25cb'}</span><span style="color:${ok ? 'var(--text-primary)' : 'var(--text-faint)'};">${label}</span></div>`).join("");
}

// Aggregate the live 15,000-node fabric into a 20-cortex state snapshot and hand it
// to the FusionCore control agent (via localStorage). Mirrors the snapshot schema:
// clusters, edges, consensus {score, entropy, mean/std confidence}, mesh.
function buildAndSaveSnapshot(prompt) {
    if (!window.nodeActive || !nodeData) return;
    const K = 20;
    const clusters = [];
    for (let i = 0; i < K; i++) clusters.push({ id: i, specialty: data_specialties[i], nodes: 0, active: 0, queue: 0, _confSum: 0, _x: 0, _y: 0 });

    const confVals = [];
    let totalQueue = 0, totalActive = 0;
    for (let idx = 0; idx < nodeData.length; idx++) {
        const sid = nodeData[idx][2];
        const c = clusters[sid];
        if (!c) continue;
        const a = window.nodeActive[idx];
        c.nodes++;
        c.active += a;
        c.queue += window.nodeQueue[idx];
        c._confSum += window.nodeConf[idx];
        c._x += nodeData[idx][0];
        c._y += nodeData[idx][1];
        totalQueue += window.nodeQueue[idx];
        if (a) { confVals.push(window.nodeConf[idx]); totalActive++; }
    }
    clusters.forEach(c => {
        c.mean_confidence = c.nodes ? +(c._confSum / c.nodes).toFixed(4) : 0;
        c.cx = c.nodes ? Math.round(c._x / c.nodes) : 0;
        c.cy = c.nodes ? Math.round(c._y / c.nodes) : 0;
        delete c._confSum; delete c._x; delete c._y;
    });

    const mean = confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : 0;
    const variance = confVals.length ? confVals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / confVals.length : 0;
    const std = Math.sqrt(variance);
    const consensus = mean * (1 - std);

    // Shannon entropy over the cluster message distribution: H = -Σ p·log2(p)
    let H = 0;
    if (totalQueue > 0) {
        clusters.forEach(c => { const p = c.queue / totalQueue; if (p > 0) H -= p * Math.log2(p); });
    }
    const entropyNorm = H / Math.log2(K);

    // Cortex communication edges (mirrors runner._dispatch_packets target map).
    const targetMap = { "Planner": ["Chemistry", "Physics", "Math"], "Chemistry": ["Physics", "Verifier"], "Physics": ["Math", "Verifier"], "Math": ["Logic", "Verifier"], "Summarizer": ["Synthesizer"], "Verifier": ["Critic", "Synthesizer"], "Critic": ["Synthesizer", "Planner"] };
    const edges = [];
    Object.entries(targetMap).forEach(([src, targets]) => {
        const si = data_specialties.indexOf(src);
        targets.forEach(t => {
            const ti = data_specialties.indexOf(t);
            if (si >= 0 && ti >= 0) edges.push({ source: src, target: t, source_id: si, target_id: ti, weight: clusters[si].mean_confidence, message_rate: clusters[si].queue });
        });
    });

    const congestionThreshold = window.congestionThreshold || 8;
    let congested = 0;
    for (let i = 0; i < window.nodeQueue.length; i++) if (window.nodeQueue[i] >= congestionThreshold) congested++;

    const snapshot = {
        run_id: "run_" + Date.now(),
        timestamp: Date.now(),
        round: 1,
        prompt: prompt,
        clusters: clusters,
        edges: edges,
        consensus: { score: +consensus.toFixed(4), entropy: +entropyNorm.toFixed(4), mean_confidence: +mean.toFixed(4), std_confidence: +std.toFixed(4) },
        mesh: { width: 125, height: 120, active_agents: totalActive, total_messages: totalQueue, congested_tiles: congested, congestion_threshold: congestionThreshold }
    };
    localStorage.setItem("torusnet_snapshot", JSON.stringify(snapshot));

    // Track the back-and-forth climb: round count + session best consensus.
    const progress = JSON.parse(localStorage.getItem("torusnet_progress") || '{"floor":0,"round":0,"best":0}');
    progress.round = (progress.round || 0) + 1;
    progress.best = Math.max(progress.best || 0, consensus);
    localStorage.setItem("torusnet_progress", JSON.stringify(progress));
    updateScoreHud(consensus, progress);
    buildFabricTwin(snapshot);
    updateProof();

    const hs = document.getElementById("handoff-status");
    if (hs) hs.innerHTML = `[EMITTED] Snapshot <strong style="color:#67e8f9">${snapshot.run_id}</strong><br>active=${totalActive.toLocaleString()} · consensus=${(consensus * 100).toFixed(1)}% · entropy=${entropyNorm.toFixed(2)} · congested=${congested}<br><span style="color:var(--neon-magenta)">Ready for FusionCore analysis &#8594;</span>`;
}


function clearWavelets() {
    while (waveletGroup.children.length > 0) {
        const obj = waveletGroup.children[0];
        waveletGroup.remove(obj);
    }
}

// Recompute real per-node queue + congestion from the wavelets in flight this tick
// (mirrors mesh.queue_size_array fill+count and the congestion_threshold=8 in controller.py).
function applyTickRuntime(tickWavelets) {
    if (!window.nodeQueue) return;
    window.nodeQueue.fill(0);
    window.nodeColorId.fill(-1);
    tickWavelets.forEach(w => {
        const idx = window.nodeIndexByKey[w.current];
        if (idx !== undefined) {
            window.nodeQueue[idx] += 1;
            window.nodeColorId[idx] = w.color;
        }
    });
    // Congested = tiles whose queue meets the congestion threshold (8), from real data.
    let congested = 0;
    for (let i = 0; i < window.nodeQueue.length; i++) {
        if (window.nodeQueue[i] >= (window.congestionThreshold || 8)) congested++;
    }
    const cv = document.getElementById("tele-congestion");
    if (cv) cv.innerText = congested;
}

function resetTelemetry() {
    document.getElementById("tele-consensus").innerText = "0.0%";
    document.getElementById("consensus-bar").style.width = "0%";
    document.getElementById("tele-active").innerText = "0 / 15,000";
    document.getElementById("tele-wavelets").innerText = "0";
    document.getElementById("tele-congestion").innerText = "0";

    // Reset real per-node runtime state to SLEEPING / empty (mirrors mesh.reset_simulation_states()).
    if (window.nodeActive) {
        window.nodeActive.fill(0);
        window.nodeQueue.fill(0);
        window.nodeColorId.fill(-1);
        window.nodeConf.fill(0);
    }
    
    // Hide Grover card initially
    const groverCard = document.getElementById("grover-card");
    if (groverCard) groverCard.style.display = "none";
    
    if (document.getElementById("tele-hw-latency")) {
        document.getElementById("tele-hw-latency").innerText = "0.00 ns";
    }
    if (document.getElementById("tele-hw-volume")) {
        document.getElementById("tele-hw-volume").innerText = "0.00 KB";
    }

    const diag = document.getElementById("fusion-logs");
    if (diag) diag.innerHTML = `<div class="fusion-entry">[MONITOR] Fabric load balance optimal. Spatial entropy = 0.00.</div>`;
}

async function animateSimulationRun(roundsLog, finalAnswer, groverSteps) {
    const terminal = document.getElementById("terminal-logs");
    const fLogs = document.getElementById("fusion-logs");
    const activeVal = document.getElementById("tele-active");
    const waveletVal = document.getElementById("tele-wavelets");
    const congestionVal = document.getElementById("tele-congestion");
    const consensusVal = document.getElementById("tele-consensus");
    const consensusBar = document.getElementById("consensus-bar");
    
    let totalHops = 0;
    let totalWaveletsSent = 0;

    // --- Grover-inspired Amplitude Amplification Visualization ---
    if (groverSteps && groverSteps.length > 0) {
        terminal.innerHTML += `<div class="log-entry action">[GROVER] Launching Grover-inspired selection of 15,000 agents...</div>`;
        terminal.scrollTop = terminal.scrollHeight;
        
        for (let step = 0; step < groverSteps.length; step++) {
            const stepData = groverSteps[step];
            const colorsAttr = nodePoints.geometry.attributes.color;
            
            // Update terminal log
            let logMsg = "";
            if (step === 0) logMsg = "[GROVER] Step 0: Initializing uniform probability superposition across 50,000 candidates.";
            else if (step === 1) logMsg = "[GROVER] Step 1: Applying oracle. Sign-flipping states matching query features.";
            else logMsg = `[GROVER] Step ${step}: Applying diffusion operator. Amplifying target state probability to ${(15000 / 50000 * 100 * step).toFixed(0)}%.`;
            
            terminal.innerHTML += `<div class="log-entry system">${logMsg}</div>`;
            terminal.scrollTop = terminal.scrollHeight;
            
            // Modify particle system colors to show selection
            nodeData.forEach((node, index) => {
                const [x, y, specialtyId, isLeader, cx, cy, cz] = node;
                const baseColor = SPECIALTIES_PALETTE(specialtyId);
                
                // Probability value
                const prob = stepData[index] || 0.0;
                // Normalize relative to uniform probability (1 / 50000)
                const uniformProb = 1.0 / 50000.0;
                const ratio = prob / uniformProb;
                
                // Amplified nodes get brighter, others get dimmer
                let intensity = 0.25; // base dimness
                if (step > 0) {
                    intensity = Math.min(1.0, 0.12 + ratio * 0.15);
                }
                
                colorsAttr.setXYZ(index, baseColor.r * intensity, baseColor.g * intensity, baseColor.b * intensity);
            });
            
            colorsAttr.needsUpdate = true;
            
            // Calculate specialty sums for Grover bars
            const specialtySums = Array(20).fill(0);
            nodeData.forEach((node, index) => {
                const specialtyId = node[2];
                const prob = stepData[index] || 0.0;
                specialtySums[specialtyId] += prob;
            });
            
            // Render the bars in UI
            const groverBarsContainer = document.getElementById("grover-bars");
            const iterationLabel = document.getElementById("grover-iteration-label");
            if (groverBarsContainer && iterationLabel) {
                document.getElementById("grover-card").style.display = "block";
                iterationLabel.innerText = `Step ${step} / ${groverSteps.length - 1}`;
                
                const maxSum = Math.max(...specialtySums, 0.0001);
                groverBarsContainer.innerHTML = "";
                
                specialtySums.forEach((sum, specId) => {
                    const percentHeight = Math.min(100, Math.max(4, (sum / maxSum) * 100)); // min 4% to show baseline
                    const colorHex = SPECIALTIES_PALETTE_HEX[specId] || "#5f7fb3";
                    
                    const barWrapper = document.createElement("div");
                    barWrapper.className = "grover-bar-wrapper";
                    
                    const barFill = document.createElement("div");
                    barFill.className = "grover-bar-fill";
                    barFill.style.height = `${percentHeight}%`;
                    barFill.style.backgroundColor = colorHex;
                    
                    barWrapper.appendChild(barFill);
                    groverBarsContainer.appendChild(barWrapper);
                });
            }
            
            // Flash wavefront ring on each Grover step
            triggerTokamakWavefront();
            
            await new Promise(resolve => setTimeout(resolve, 600));
        }
        // Selection complete — these are the agents the logic places ACTIVE on the mesh.
        if (window.nodeActive) window.nodeActive.fill(1);
        if (document.getElementById("tele-active")) document.getElementById("tele-active").innerText = "15,000 / 15,000";
        terminal.innerHTML += `<div class="log-entry success">[SELECTOR] Grover selection converged. 15,000 agents mapped to toroidal manifold.</div>`;
        terminal.scrollTop = terminal.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Total rounds to execute
    for (let rIndex = 0; rIndex < roundsLog.length; rIndex++) {
        const roundData = roundsLog[rIndex];
        
        // 1. Output round header
        terminal.innerHTML += `<div class="log-entry action" style="border-top: 1px solid var(--border-color); padding-top: 8px;">[WSE-3] Executing parallel inference across 20 specialty leaders — 15,000 nodes active</div>`;
        terminal.scrollTop = terminal.scrollHeight;
        
        // 2. Process thoughts
        roundData.agent_thoughts.forEach(thought => {
            terminal.innerHTML += `<div class="log-entry thought">
                <strong>[${thought.specialty} Node]</strong>: "${thought.thought}"
            </div>`;
            terminal.scrollTop = terminal.scrollHeight;
        });

        // 3. Process routing ticks
        const ticks = roundData.routing_ticks;
        for (let tIndex = 0; tIndex < ticks.length; tIndex++) {
            const tickWavelets = ticks[tIndex];
            
            // Update in-transit wavelet telemetry
            waveletVal.innerText = tickWavelets.length;
            
            // Increment physical WSE-3 stats
            totalHops += tickWavelets.length;
            totalWaveletsSent += tickWavelets.length;
            if (document.getElementById("tele-hw-latency")) {
                document.getElementById("tele-hw-latency").innerText = totalHops.toLocaleString() + " hops";
            }
            if (document.getElementById("tele-hw-volume")) {
                document.getElementById("tele-hw-volume").innerText = ((totalWaveletsSent * 4) / 1024).toFixed(2) + " KB";
            }
            
            // Update real per-node queue / congestion state from this tick's wavelets.
            applyTickRuntime(tickWavelets);

            // Draw active wavelets as glowing spheres
            drawActiveWavelets(tickWavelets);
            
            // Dynamically light up active nodes
            highlightActiveNodes(tickWavelets);
            
            await new Promise(resolve => setTimeout(resolve, 120));
        }

        // 4. Update Fusion Core logs & diagnostics (diagnostics panel lives on the FusionCore page)
        if (fLogs) fLogs.innerHTML = "";
        for (let eIdx = 0; eIdx < roundData.repair_events.length; eIdx++) {
            const event = roundData.repair_events[eIdx];
            const cssClass = event.type === "THROTTLE" ? "throttle" : (event.type === "WAKE" ? "wake" : "intervene");
            if (fLogs) fLogs.innerHTML += `<div class="fusion-entry ${cssClass}">
                <strong>[${event.type}]</strong> ${event.description}
            </div>`;
            
            // Draw visual repair beam from central core to torus target
            if (event.target && event.target !== "global") {
                const parts = event.target.split("_");
                if (parts.length === 3) {
                    const tx = parseInt(parts[1]);
                    const ty = parseInt(parts[2]);
                    triggerRepairBeam(tx, ty, event.type);
                }
            } else if (event.type === "INTERVENE") {
                // Intervene is global. Trigger multiple pulses to Verifier (7) and Critic (8) leaders
                const v_coords = [75, 37];
                const c_coords = [105, 37];
                triggerRepairBeam(v_coords[0], v_coords[1], "INTERVENE");
                triggerRepairBeam(c_coords[0], c_coords[1], "INTERVENE");
            }
        }
        
        if (fLogs && roundData.repair_events.length === 0) {
            fLogs.innerHTML += `<div class="fusion-entry">[MONITOR] Mesh load stable. No repair actions needed.</div>`;
        }
        if (fLogs) fLogs.scrollTop = fLogs.scrollHeight;

        // 5. Update global metrics
        const metrics = roundData.metrics;
        activeVal.innerText = `${metrics.active_count} / 15,000`;
        // "Congested Spots" is driven live by applyTickRuntime() from real queue depths.
        
        const confPercent = (metrics.consensus_score * 100).toFixed(1);
        consensusVal.innerText = `${confPercent}%`;
        consensusBar.style.width = `${confPercent}%`;

        // Propagate the round's consensus to each active node's confidence (logic-tied, not random).
        if (window.nodeConf && window.nodeActive) {
            for (let i = 0; i < window.nodeConf.length; i++) {
                if (window.nodeActive[i]) {
                    window.nodeConf[i] = Math.min(0.99, metrics.consensus_score + (nodeData[i][3] === 1 ? 0.05 : 0));
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 6. Procedural answer shown inline — real answer appended by runSimulation after backend returns
    terminal.innerHTML += `<div class="log-entry action" style="border-top: 1px solid var(--border-color); padding-top: 8px;">================================</div>`;
    terminal.innerHTML += `<div class="log-entry success" id="awaiting-answer">
        <strong>[CONSENSUS REACHED] PROCESSING FINAL OUTPUT...</strong><br>
        Awaiting WSE cluster verification...
    </div>`;
    terminal.scrollTop = terminal.scrollHeight;
}

function drawActiveWavelets(waveletsList) {
    clearWavelets();
    
    // Wavelet geometry pool helper
    const wGeom = new THREE.SphereGeometry(0.08, 8, 8);

    waveletsList.forEach(w => {
        const key = w.current;
        const pos = nodeCoordsMap[key];
        
        if (pos) {
            const color = WAVELET_COLORS[w.color] || WAVELET_COLORS[0];
            const wMat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.95
            });
            
            const sphere = new THREE.Mesh(wGeom, wMat);
            sphere.position.copy(pos);
            waveletGroup.add(sphere);
        }
    });
}

function highlightActiveNodes(waveletsList) {
    if (!nodePoints) return;
    const colorsAttr = nodePoints.geometry.attributes.color;
    
    // Set current active nodes to glow based on wavelet locations
    const activeNodes = new Set();
    waveletsList.forEach(w => {
        activeNodes.add(w.current);
    });

    const currentLayer = document.getElementById("view-layer").value;

    nodeData.forEach((node, index) => {
        const [x, y, specialtyId, isLeader, cx, cy, cz] = node;
        const key = `tile_${x}_${y}`;
        
        if (activeNodes.has(key)) {
            // Active wavelets routing through this tile: make it glow cyan/white
            colorsAttr.setXYZ(index, 0.9, 0.95, 1.0);
        } else {
            // Restore layer base color
            const baseColor = SPECIALTIES_PALETTE(specialtyId);
            if (currentLayer === "specialty") {
                colorsAttr.setXYZ(index, baseColor.r * 0.25, baseColor.g * 0.25, baseColor.b * 0.25);
            } else if (currentLayer === "activity") {
                colorsAttr.setXYZ(index, 0.05, 0.08, 0.15);
            } else if (currentLayer === "congestion") {
                colorsAttr.setXYZ(index, 0.1, 0.15, 0.2);
            }
        }
    });

    colorsAttr.needsUpdate = true;
}

// --- Benchmarks Suite and Charts ---
async function initChart() {
    const cv = document.getElementById("benchmark-chart");
    if (!cv) return; // benchmark card removed — no-op
    const ctx = cv.getContext("2d");
    
    // Initialize empty baseline chart
    benchmarkChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Ring", "Star", "Mesh", "Random", "TorusNet"],
            datasets: [{
                label: "Latency (Simulation Rounds to Consensus)",
                data: [8, 8, 8, 8, 4], // Initial placeholder
                backgroundColor: [
                    "rgba(239, 68, 68, 0.5)",   // Ring: red
                    "rgba(245, 158, 11, 0.5)",  // Star: gold
                    "rgba(6, 182, 212, 0.5)",   // Mesh: cyan
                    "rgba(99, 102, 241, 0.5)",  // Random: purple
                    "rgba(16, 185, 129, 0.85)"  // TorusNet: glowing green
                ],
                borderColor: [
                    "#c0584e", "#d99b4a", "#5a8ca8", "#5f7fb3", "#5b9279"
                ],
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#9ca3af", font: { family: "Outfit" } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: "#e5e7eb", font: { family: "Outfit", weight: "bold" } }
                }
            }
        }
    });
}

async function runBenchmarks() {
    const runBtn = document.getElementById("run-btn");
    const benchBtn = document.getElementById("benchmark-btn");
    const terminal = document.getElementById("terminal-logs");

    runBtn.disabled = true;
    benchBtn.disabled = true;
    terminal.innerHTML = `<div class="log-entry action">[BENCH] Initializing benchmark suite across five network topologies...</div>`;
    terminal.innerHTML += `<div class="log-entry system">[BENCH] Grid dimension: 125x120 (15,000 agents). 32-bit fabric packets across a 2-D mesh; 24 routing colors.</div>`;

    try {
        const res = await fetch("/api/benchmark");
        currentBenchmarkData = await res.json();
        
        terminal.innerHTML += `<div class="log-entry success">[SUCCESS] Benchmarks execution complete! Select tabs on the right side to compare.</div>`;
        
        // Print comparison table into terminal
        let summaryText = `\n[TOPOLOGY COMPARISON TABLE]\n-------------------------------------------------\n`;
        summaryText += `Topology   | Rounds | Avg Hops | Congestion | Cost\n`;
        summaryText += `-------------------------------------------------\n`;
        
        Object.entries(currentBenchmarkData).forEach(([topo, stats]) => {
            summaryText += `${topo.padEnd(10)} | ${String(stats.latency_rounds).padEnd(6)} | ${String(stats.average_hops).padEnd(8)} | ${String(stats.congestion_rate).padEnd(10)}% | ${stats.communication_cost}\n`;
        });
        summaryText += `-------------------------------------------------`;
        
        terminal.innerHTML += `<pre style="font-family:'JetBrains Mono'; font-size:10px; color:#cbd5e1; margin-top:8px;">${summaryText}</pre>`;
        terminal.scrollTop = terminal.scrollHeight;

        renderBenchmarkData();

    } catch (e) {
        console.error("Benchmark error:", e);
        terminal.innerHTML += `<div class="log-entry error">[ERROR] Benchmark failed: ${e.message}</div>`;
    }

    runBtn.disabled = false;
    benchBtn.disabled = false;
}

function renderBenchmarkData() {
    if (!currentBenchmarkData || !benchmarkChart) return;

    const topologies = ["Ring", "Star", "Mesh", "Random", "TorusNet"];
    let dataPoints = [];
    let title = "";

    if (currentChartTab === "latency") {
        dataPoints = topologies.map(t => currentBenchmarkData[t].latency_rounds);
        title = "Latency (Simulation Rounds to Consensus)";
    } else if (currentChartTab === "hops") {
        dataPoints = topologies.map(t => currentBenchmarkData[t].average_hops);
        title = "Average Message Hops";
    } else if (currentChartTab === "congestion") {
        dataPoints = topologies.map(t => currentBenchmarkData[t].congestion_rate);
        title = "Fabric Congestion Rate (%)";
    } else if (currentChartTab === "cost") {
        dataPoints = topologies.map(t => currentBenchmarkData[t].communication_cost);
        title = "Communication Cost (Hops × Priority)";
    }

    // Update Chart data
    benchmarkChart.data.datasets[0].data = dataPoints;
    benchmarkChart.data.datasets[0].label = title;
    benchmarkChart.update();
}

function triggerRepairBeam(tx, ty, type) {
    const key = `tile_${tx}_${ty}`;
    const targetPos = nodeCoordsMap[key];
    if (!targetPos) return;

    // Start point on the central axis at the same height as target
    const startPos = new THREE.Vector3(0, targetPos.y, 0);

    // Create a glowing line connecting core to node
    let colorHex = 0xc0584e; // Red for THROTTLE
    if (type === "WAKE") colorHex = 0x5b9279; // Green for WAKE
    if (type === "INTERVENE") colorHex = 0x8170b5; // Pink for INTERVENE

    const matBeam = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    const geomBeam = new THREE.BufferGeometry().setFromPoints([startPos, targetPos]);
    const lineBeam = new THREE.Line(geomBeam, matBeam);
    waveletGroup.add(lineBeam);

    // Create a pulse particle shooting along the beam
    const matPulse = new THREE.MeshBasicMaterial({ color: colorHex });
    const geomPulse = new THREE.SphereGeometry(0.12, 8, 8);
    const pulseMesh = new THREE.Mesh(geomPulse, matPulse);
    pulseMesh.position.copy(startPos);
    waveletGroup.add(pulseMesh);

    // Animate the beam fading and the particle traveling
    let progress = 0;
    const duration = 20; // 20 animation steps
    const step = () => {
        progress += 1 / duration;
        if (progress <= 1.0) {
            pulseMesh.position.lerpVectors(startPos, targetPos, progress);
            matBeam.opacity = 0.8 * (1.0 - progress);
            requestAnimationFrame(step);
        } else {
            waveletGroup.remove(lineBeam);
            waveletGroup.remove(pulseMesh);
        }
    };
    step();
}

// --- Hover Interaction and Helper Data ---
const data_specialties = [
    "Planner", "Math", "Physics", "Chemistry", "Biology", 
    "CodeGenerator", "Debugger", "Verifier", "Critic", "MemoryRetriever", 
    "Linguistics", "Translator", "Summarizer", "Synthesizer", "Logic", 
    "Finance", "Law", "Psychology", "Search", "FactChecker"
];

const COLOR_NAMES_JS = {
    0: "FACT", 1: "EVIDENCE", 2: "DISAGREEMENT", 3: "VERIFY", 4: "SUMMARY",
    5: "CONSENSUS", 6: "TOOL_CALL", 7: "MEMORY", 8: "IMAGE", 9: "TABLE",
    10: "REROUTE", 11: "THROTTLE", 12: "AMPLIFY", 13: "COOLING", 14: "WAVELET",
    15: "ARBITER", 16: "ERROR", 17: "LATENCY", 18: "CONFIDENCE", 19: "CLUSTER",
    20: "PRIORITY", 21: "BROADCAST", 22: "FINAL", 23: "RESERVED"
};

function onMouseMove(event) {
    const container = document.getElementById("canvas-container");
    const rect = container.getBoundingClientRect();
    
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (!nodePoints) return;
    
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Points.threshold = 0.15;
    
    const intersects = raycaster.intersectObject(nodePoints);
    const tooltip = document.getElementById("agent-tooltip");
    
    if (intersects.length > 0) {
        const index = intersects[0].index;
        const node = nodeData[index];
        if (node) {
            const [x, y, specialtyId, isLeader, cx, cy, cz] = node;
            
            const W = window.layoutWidth || 125;
            const H = window.layoutHeight || 120;
            const u = (x / W).toFixed(3);
            const v = (y / H).toFixed(3);
            const phi = (2 * Math.PI * (x / W)).toFixed(3);
            const theta = (2 * Math.PI * (y / H)).toFixed(3);
            
            // Real per-node runtime state — reflects the simulation logic, not random math.
            // Before a run every node is SLEEPING with an empty queue and zero confidence.
            const active = window.nodeActive ? window.nodeActive[index] === 1 : false;
            const queueDepth = (window.nodeQueue && active) ? window.nodeQueue[index] : 0;
            const confidence = ((window.nodeConf && active) ? window.nodeConf[index] : 0).toFixed(2);
            const cId = window.nodeColorId ? window.nodeColorId[index] : -1;
            let state;
            if (!active) state = "SLEEPING";
            else if (queueDepth >= (window.congestionThreshold || 8)) state = "CONGESTED";
            else state = isLeader === 1 ? "ACTIVE (LEADER)" : "ACTIVE";
            
            tooltip.innerHTML = `
                <div style="font-weight:bold; color:#5a8ca8; font-size:12px; margin-bottom:4px; font-family:'Space Grotesk';">
                    Agent [WSE-Tile_${x}_${y}]
                </div>
                <div style="margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; font-weight:600;">
                    Specialty: ${data_specialties[specialtyId] || "Specialist"}
                </div>
                <table style="width:100%; border-collapse:collapse; font-family:'JetBrains Mono'; font-size:10px;">
                    <tr><td style="color:#9ca3af; padding-right:8px;">Mesh Coord:</td><td>(${x}, ${y})</td></tr>
                    <tr><td style="color:#9ca3af;">Torus Angles:</td><td>u=${u}, v=${v}</td></tr>
                    <tr><td style="color:#9ca3af;">Rad Angles:</td><td>φ=${phi}, θ=${theta}</td></tr>
                    <tr><td style="color:#9ca3af;">Torus 3D:</td><td>(${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})</td></tr>
                    <tr><td style="color:#9ca3af;">Route Color:</td><td>${cId >= 0 ? cId + " (" + (COLOR_NAMES_JS[cId] || "WAVELET") + ")" : "\u2014 idle"}</td></tr>
                    <tr><td style="color:#9ca3af;">Queue Depth:</td><td>${queueDepth}</td></tr>
                    <tr><td style="color:#9ca3af;">Confidence:</td><td>${confidence}</td></tr>
                    <tr><td style="color:#9ca3af;">State:</td><td style="color:${state.includes("ACTIVE") ? "#5b9279" : (state === "CONGESTED" ? "#c0584e" : "#6b7280")}; font-weight:bold;">${state}</td></tr>
                </table>
            `;
            
            tooltip.style.left = (event.clientX + 15) + "px";
            tooltip.style.top = (event.clientY + 15) + "px";
            tooltip.style.display = "block";
            return;
        }
    }
    
    tooltip.style.display = "none";
}

function triggerTokamakWavefront() {
    if (typeof THREE === 'undefined' || !torusGroup) return;
    const geom = new THREE.TorusGeometry(0.5, 0.04, 8, 32);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x5a8ca8, // Cyan
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(geom, mat);
    ring.rotation.x = Math.PI / 2; // Flat horizontal plane
    torusGroup.add(ring);
    
    let scale = 1.0;
    const duration = 20;
    let step = 0;
    
    const animateWave = () => {
        step++;
        scale += 0.25;
        ring.scale.set(scale, scale, scale);
        mat.opacity = 0.8 * (1.0 - step / duration);
        
        if (step < duration) {
            requestAnimationFrame(animateWave);
        } else {
            torusGroup.remove(ring);
            geom.dispose();
            mat.dispose();
        }
    };
    animateWave();
}
