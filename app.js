// --- PRIVATE CREDENTIALS ---
const APP_ID = '119353';
const REAL_TOKEN = 'A4lxJkh0sWeXD60';
const DEMO_TOKEN = 'sI05YqeXBucWOm1';

let socket, isTrading = false, isContractOpen = false;
let currentStake = 0.35, sessionProfit = 0, currentToken = REAL_TOKEN;
let lastDigit = null, eoStreak = 0, lastEOType = null, highStreak = 0, ouStreak = 0, lastOUType = null;

// --- AUTO-REFRESH TIMER (Every 60 Minutes) ---
setInterval(() => {
    if (!isContractOpen) { // Only refresh if no trade is active
        log("Performing Hourly Connection Refresh...", "#ffad00");
        connect(currentToken); 
    }
}, 3600000); 

function connect(token) {
    if (socket) socket.close();
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    
    // Connection Keeper (Ping)
    const ping = setInterval(() => { if(socket.readyState === 1) socket.send(JSON.stringify({ping: 1})); }, 30000);

    socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
    
    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'authorize') {
            document.getElementById('balance').innerText = `$${data.authorize.balance}`;
            socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
            log("System Connected & Authorized.", "#2ea043");
        }
        if (data.msg_type === 'tick') {
            const digit = parseInt(data.tick.quote.toString().slice(-1));
            updateCursor(digit);
            if (isTrading && !isContractOpen) processMasterLogic(digit);
        }
        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
            isContractOpen = false;
            handleResult(data.proposal_open_contract.profit);
        }
    };

    socket.onclose = () => { clearInterval(ping); log("Connection lost. Retrying...", "red"); };
}

function processMasterLogic(digit) {
    const strategy = document.getElementById('master_strategy').value;
    const currentEO = (digit % 2 === 0) ? 'even' : 'odd';
    
    // Update Streaks
    if (currentEO === lastEOType) eoStreak++; else { eoStreak = 1; lastEOType = currentEO; }
    if (digit > 6) highStreak++; else highStreak = 0;
    
    let currentOU = digit <= 3 ? 'under' : (digit >= 6 ? 'over' : null);
    if (currentOU && currentOU === lastOUType) ouStreak++; 
    else { ouStreak = currentOU ? 1 : 0; lastOUType = currentOU; }

    document.getElementById('streak-info').innerText = `E/O: ${eoStreak} | High: ${highStreak} | O/U: ${ouStreak}`;

    // --- STRATEGY BRANCHING ---
    if ((strategy === 'STR_EO_3' || strategy === 'ULTRA_HYBRID') && eoStreak >= 3) {
        executeTrade(currentEO === 'even' ? 'DIGITODD' : 'DIGITEVEN');
        eoStreak = 0; return;
    }
    if ((strategy === 'STR_HIGH_3' || strategy === 'ULTRA_HYBRID') && highStreak >= 3) {
        executeTrade('DIGITUNDER', 6);
        highStreak = 0; return;
    }
    if ((strategy === 'STR_OU_3' || strategy === 'ULTRA_HYBRID') && ouStreak >= 3) {
        if (lastOUType === 'under') executeTrade('DIGITOVER', 4);
        else if (lastOUType === 'over') executeTrade('DIGITUNDER', 6);
        ouStreak = 0; return;
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
    log(`Pattern Hit! Trading ${type}...`, "#ffad00");
}

function handleResult(profit) {
    const base = parseFloat(document.getElementById('stake').value);
    const mart = parseFloat(document.getElementById('martingale').value);
    sessionProfit += profit;
    
    if (profit > 0) {
        currentStake = base;
        log(`WIN: +$${profit.toFixed(2)}`, "#2ea043");
    } else {
        currentStake *= mart;
        log(`LOSS: -$${Math.abs(profit).toFixed(2)}`, "#f85149");
    }

    const tp = parseFloat(document.getElementById('take_profit').value);
    const sl = parseFloat(document.getElementById('stop_loss').value);
    if (sessionProfit >= tp || sessionProfit <= -sl) {
        isTrading = false;
        alert(`Goal Reached! Session Profit: $${sessionProfit.toFixed(2)}`);
        location.reload();
    }
    socket.send(JSON.stringify({ authorize: currentToken }));
}

function updateCursor(digit) {
    const nodes = document.querySelectorAll('.digit-node');
    const cursor = document.getElementById('digit-cursor');
    if (nodes[digit]) {
        cursor.style.left = (nodes[digit].offsetLeft - 21) + "px"; // Centering offset
    }
}

function log(m, c = "#8b949e") {
    const l = document.getElementById('log');
    l.innerHTML = `<div style="color:${c}">[${new Date().toLocaleTimeString()}] ${m}</div>` + l.innerHTML;
}

function switchAccount() {
    currentToken = (currentToken === REAL_TOKEN) ? DEMO_TOKEN : REAL_TOKEN;
    connect(currentToken);
}

document.getElementById('btn-toggle').onclick = function() {
    isTrading = !isTrading;
    this.innerText = isTrading ? "STOP BOT" : "ACTIVATE BOT";
    this.classList.toggle('active');
    currentStake = parseFloat(document.getElementById('stake').value);
};

connect(REAL_TOKEN);
