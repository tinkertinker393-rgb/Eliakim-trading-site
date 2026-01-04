const APP_ID = '119353';
const REAL_TOKEN = 'A4lxJkh0sWeXD60';
const DEMO_TOKEN = 'sI05YqeXBucWOm1';

let socket, isTrading = false, isContractOpen = false;
let currentStake = 0.35, sessionProfit = 0, currentToken = REAL_TOKEN;
let lastDigit = null, eoStreak = 0, lastEOType = null, highStreak = 0, ouStreak = 0, lastOUType = null;
let recoveryActive = false, lossCount = 0;

function connect(token) {
    if (socket) socket.close();
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    const ping = setInterval(() => { if(socket.readyState === 1) socket.send(JSON.stringify({ping: 1})); }, 30000);

    socket.onopen = () => {
        socket.send(JSON.stringify({ authorize: token }));
        log("Turbo Logic Connected.", "#f0883e");
    };

    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'authorize') {
            document.getElementById('balance').innerText = `$${data.authorize.balance}`;
            socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
        }
        if (data.msg_type === 'tick') {
            const digit = parseInt(data.tick.quote.toString().slice(-1));
            updateCursor(digit);
            if (isTrading && !isContractOpen) processEngine(digit);
        }
        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
            isContractOpen = false;
            handleResult(data.proposal_open_contract.profit);
        }
    };
}

function processEngine(digit) {
    const isTurbo = document.getElementById('turbo_mode').checked;
    const strategy = document.getElementById('master_strategy').value;
    
    // 1. Update Patterns
    const currentEO = (digit % 2 === 0) ? 'even' : 'odd';
    if (currentEO === lastEOType) eoStreak++; else { eoStreak = 1; lastEOType = currentEO; }
    if (digit > 6) highStreak++; else highStreak = 0;
    let currentOU = digit <= 3 ? 'under' : (digit >= 6 ? 'over' : null);
    if (currentOU && currentOU === lastOUType) ouStreak++; else { ouStreak = currentOU ? 1 : 0; lastOUType = currentOU; }

    document.getElementById('streak-info').innerText = `E/O: ${eoStreak} | HIGH: ${highStreak} | O/U: ${ouStreak}`;

    // 2. Trigger Logic
    const trigger = (isTurbo || recoveryActive) ? 1 : 3;

    if ((strategy === 'STR_EO_3' || strategy === 'ULTRA_HYBRID') && eoStreak >= trigger) {
        executeTrade(currentEO === 'even' ? 'DIGITODD' : 'DIGITEVEN');
        return;
    }
    if ((strategy === 'STR_HIGH_3' || strategy === 'ULTRA_HYBRID') && highStreak >= trigger) {
        executeTrade('DIGITUNDER', 6);
        return;
    }
    if ((strategy === 'STR_OU_3' || strategy === 'ULTRA_HYBRID') && ouStreak >= trigger) {
        if (lastOUType === 'under') executeTrade('DIGITOVER', 4);
        else executeTrade('DIGITUNDER', 6);
        return;
    }
    // 3. Turbo Fallback
    if (isTurbo) {
        executeTrade(digit % 2 === 0 ? 'DIGITODD' : 'DIGITEVEN');
    }
    lastDigit = digit;
}

function executeTrade(type, barrier = null) {
    isContractOpen = true;
    const req = {
        buy: 1, price: currentStake,
        parameters: { amount: currentStake, basis: 'stake', contract_type: type, currency: 'USD', symbol: 'R_100', duration: 1, duration_unit: 't' }
    };
    if (barrier !== null) req.parameters.barrier = barrier;
    socket.send(JSON.stringify(req));
    socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
}

function handleResult(profit) {
    const base = parseFloat(document.getElementById('stake').value);
    const mart = parseFloat(document.getElementById('martingale').value);
    const maxSteps = parseInt(document.getElementById('max_steps').value);
    sessionProfit += profit;

    if (profit > 0) {
        currentStake = base;
        lossCount = 0;
        recoveryActive = false;
        log(`WIN: +$${profit.toFixed(2)}`, "#2ea043");
    } else {
        lossCount++;
        if (lossCount >= maxSteps) {
            currentStake = base;
            log("MAX LOSS REACHED. STAKE RESET.", "red");
        } else {
            currentStake *= mart;
        }
        recoveryActive = true; // Forces instant trade on next tick
        log(`LOSS #${lossCount}. Immediate recovery active...`, "#f85149");
    }
    
    if (sessionProfit <= -parseFloat(document.getElementById('stop_loss').value)) {
        isTrading = false; alert("STOP LOSS HIT."); location.reload();
    }
    socket.send(JSON.stringify({ authorize: currentToken }));
}

function updateCursor(digit) {
    const nodes = document.querySelectorAll('.digit-node');
    const cursor = document.getElementById('digit-cursor');
    if (nodes[digit]) {
        cursor.style.left = (nodes[digit].offsetLeft - 21) + "px";
    }
}

function log(m, c = "#8b949e") {
    const l = document.getElementById('log');
    l.innerHTML = `<div style="color:${c}">[${new Date().toLocaleTimeString()}] ${m}</div>` + l.innerHTML;
}

document.getElementById('btn-toggle').onclick = function() {
    isTrading = !isTrading;
    this.innerText = isTrading ? "STOP BOT" : "ACTIVATE BOT";
    this.classList.toggle('active');
    currentStake = parseFloat(document.getElementById('stake').value);
};

connect(REAL_TOKEN);
