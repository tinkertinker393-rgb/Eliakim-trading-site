const APP_ID = '119353';
const TOKENS = { REAL: 'A4lxJkh0sWeXD60', DEMO: 'sI05YqeXBucWOm1' };
let socket, isTrading = false, isContractOpen = false, activeAccount = 'REAL';
let currentStake = 0.35, sessionProfit = 0, lossCount = 0;
let eoStreak = 0, lastEOType = null, highStreak = 0, ouStreak = 0, lastOUType = null, recovery = false;

// --- MATRIX BACKGROUND ---
const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const letters = "0101010101DIGITQUANTPRO".split("");
const fontSize = 10;
const columns = canvas.width / fontSize;
const drops = Array(Math.floor(columns)).fill(1);

function drawMatrix() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ff41";
    ctx.font = fontSize + "px monospace";
    drops.forEach((y, i) => {
        const text = letters[Math.floor(Math.random() * letters.length)];
        ctx.fillText(text, i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
    });
}
setInterval(drawMatrix, 33);

// --- CORE LOGIC ---
function connect() {
    if (socket) { socket.onclose = null; socket.close(); }
    const token = TOKENS[activeAccount];
    document.getElementById('acc-id').innerText = activeAccount;
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'authorize') {
            document.getElementById('balance').innerText = data.authorize.balance;
            socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
            log(`// ${activeAccount}_LINK_ESTABLISHED`);
        }
        if (data.msg_type === 'tick') {
            const digit = parseInt(data.tick.quote.toString().slice(-1));
            updateUI(digit);
            if (isTrading && !isContractOpen) evaluate(digit);
        }
        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
            isContractOpen = false;
            handleResult(data.proposal_open_contract.profit);
        }
    };
}

function evaluate(digit) {
    const turbo = document.getElementById('turbo_mode').checked;
    const strat = document.getElementById('strategy').value;
    const curEO = (digit % 2 === 0) ? 'even' : 'odd';

    // Streaks
    if (curEO === lastEOType) eoStreak++; else { eoStreak = 1; lastEOType = curEO; }
    highStreak = (digit > 6) ? highStreak + 1 : 0;
    let curOU = (digit <= 3) ? 'under' : (digit >= 6 ? 'over' : null);
    if (curOU && curOU === lastOUType) ouStreak++; else { ouStreak = curOU ? 1 : 0; lastOUType = curOU; }

    const t = (turbo || recovery) ? 1 : 3;

    if ((strat === 'EO' || strat === 'HYBRID') && eoStreak >= t) {
        trade(curEO === 'even' ? 'DIGITODD' : 'DIGITEVEN');
    } else if (strat === 'HYBRID' && highStreak >= t) {
        trade('DIGITUNDER', 6);
    } else if (strat === 'HYBRID' && ouStreak >= t) {
        lastOUType === 'under' ? trade('DIGITOVER', 4) : trade('DIGITUNDER', 6);
    } else if (turbo) {
        trade(digit % 2 === 0 ? 'DIGITODD' : 'DIGITEVEN');
    }
}

function trade(type, barrier = null) {
    isContractOpen = true;
    const req = { buy: 1, price: currentStake, parameters: { amount: currentStake, basis: 'stake', contract_type: type, currency: 'USD', symbol: 'R_100', duration: 1, duration_unit: 't' } };
    if (barrier !== null) req.parameters.barrier = barrier;
    socket.send(JSON.stringify(req));
    socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
}

function handleResult(profit) {
    const base = parseFloat(document.getElementById('stake').value);
    const mart = parseFloat(document.getElementById('martingale').value);
    const max = parseInt(document.getElementById('max_steps').value);
    sessionProfit += profit;

    if (profit > 0) {
        currentStake = base; lossCount = 0; recovery = false;
        log(`// PROFIT_CAPTURED: +${profit.toFixed(2)}`, "var(--neon-green)");
    } else {
        lossCount++;
        if (lossCount >= max) { currentStake = base; lossCount = 0; } else { currentStake *= mart; }
        recovery = true;
        log(`// RECOVERY_SEQUENCE_INIT: LVL_${lossCount}`, "var(--neon-red)");
    }
    socket.send(JSON.stringify({ authorize: TOKENS[activeAccount] }));
}

function toggleAccount() {
    if (isTrading) return;
    activeAccount = (activeAccount === 'REAL') ? 'DEMO' : 'REAL';
    eoStreak = 0; highStreak = 0; ouStreak = 0;
    connect();
}

function toggleTrading() {
    isTrading = !isTrading;
    const btn = document.getElementById('btn-toggle');
    btn.innerText = isTrading ? "STOP_SEQUENCE" : "START_SEQUENCE";
    btn.className = isTrading ? "btn-stop" : "btn-start";
    currentStake = parseFloat(document.getElementById('stake').value);
}

function updateUI(digit) {
    const nodes = document.querySelectorAll('.digit-node');
    nodes.forEach(n => n.classList.remove('active-num'));
    nodes[digit].classList.add('active-num');
    document.getElementById('digit-cursor').style.left = nodes[digit].offsetLeft - nodes[0].offsetLeft + "px";
    document.getElementById('eo-val').innerText = eoStreak;
    document.getElementById('high-val').innerText = highStreak;
    document.getElementById('ou-val').innerText = ouStreak;
}

function log(m, color = "#444") {
    const l = document.getElementById('log');
    l.innerHTML = `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${m}</div>` + l.innerHTML;
}

connect();
