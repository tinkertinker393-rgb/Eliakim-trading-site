const APP_ID = '119353';
const REAL_TOKEN = 'A4lxJkh0sWeXD60';
const DEMO_TOKEN = 'sI05YqeXBucWOm1';

let socket, isTrading = false, isContractOpen = false, currentStake = 0.35;
let tickHistory = [], currentToken = REAL_TOKEN, sessionProfit = 0;
let strategyScores = { ACCU: 0, EVO: 0, MAT: 0, OVU: 0 };

function connect(token) {
    if (socket) socket.close();
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'authorize') {
            document.getElementById('balance').innerText = `$${data.authorize.balance}`;
            socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
        }
        if (data.msg_type === 'tick') {
            const digit = parseInt(data.tick.quote.toString().slice(-1));
            updateCursor(digit);
            tickHistory.push(digit);
            if (tickHistory.length > 20) tickHistory.shift();
            runTrendScanner(); // background analysis
            if (isTrading && !isContractOpen) executeBestLogic(digit);
        }
        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
            isContractOpen = false;
            handleResult(data.proposal_open_contract.profit);
        }
    };
}

function runTrendScanner() {
    if (tickHistory.length < 10) return;
    const history = tickHistory.slice(-10);
    
    // Score ACCU (Stability)
    const displacement = history.reduce((acc, cur, i, arr) => i === 0 ? 0 : acc + Math.abs(cur - arr[i-1]), 0);
    strategyScores.ACCU = Math.max(0, 100 - (displacement * 3));

    // Score E/O (Streaks)
    const last3 = history.slice(-3);
    const streak = last3.every(v => v % 2 === last3[0] % 2);
    strategyScores.EVO = streak ? 90 : 20;

    // Score O/U (Dominance)
    const under4 = history.filter(d => d < 4).length;
    strategyScores.OVU = (under4 / history.length) * 100;

    // Update UI
    Object.keys(strategyScores).forEach(key => {
        const el = document.getElementById(`score-${key}`);
        el.innerText = `${Math.round(strategyScores[key])}%`;
        el.style.color = strategyScores[key] > 60 ? "#2ea043" : "#f85149";
    });
}

function executeBestLogic(digit) {
    let mode = document.getElementById('strategy').value;
    
    // AI AUTO-SWITCHER
    if (mode === 'AUTO') {
        const best = Object.keys(strategyScores).reduce((a, b) => strategyScores[a] > strategyScores[b] ? a : b);
        mode = `STR_${best === 'EVO' ? 'EVENOOD' : best === 'OVU' ? 'OVERUNDER' : best}`;
    }

    if (mode === 'STR_ACCU' && strategyScores.ACCU > 70) placeTrade('ACCU');
    if (mode === 'STR_EVENOOD' && strategyScores.EVO > 80) placeTrade(digit % 2 === 0 ? 'DIGITODD' : 'DIGITEVEN');
    if (mode === 'STR_OVERUNDER' && strategyScores.OVU > 70) placeTrade('DIGITUNDER', 4);
}

function placeTrade(type, barrier = null) {
    isContractOpen = true;
    const req = {
        buy: 1, price: currentStake,
        parameters: { amount: currentStake, basis: 'stake', contract_type: type, currency: 'USD', symbol: 'R_100' }
    };
    if (type === 'ACCU') {
        req.parameters.growth_rate = 0.03;
        req.parameters.limit_order = { "take_profit": currentStake * 0.1 };
    } else {
        req.parameters.duration = 1; req.parameters.duration_unit = 't';
    }
    if (barrier !== null) req.parameters.barrier = barrier;
    socket.send(JSON.stringify(req));
    socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
}

function handleResult(profit) {
    const tp = parseFloat(document.getElementById('take_profit').value);
    const sl = parseFloat(document.getElementById('stop_loss').value);
    const safe = document.getElementById('safe_mode').checked;
    
    sessionProfit += profit;
    log(`Result: ${profit > 0 ? 'WIN' : 'LOSS'} | Session: $${sessionProfit.toFixed(2)}`, profit > 0 ? "#2ea043" : "#f85149");

    if (profit > 0) {
        currentStake = parseFloat(document.getElementById('stake').value);
    } else {
        currentStake *= (safe && sessionProfit < 0) ? 1.1 : parseFloat(document.getElementById('martingale').value);
    }

    if (sessionProfit >= tp || sessionProfit <= -sl) {
        isTrading = false;
        alert("Goal Reached or Limit Hit. Bot Stopped.");
        location.reload();
    }
    socket.send(JSON.stringify({ authorize: currentToken }));
}

function updateCursor(digit) {
    const nodes = document.querySelectorAll('.digit-node');
    const cursor = document.getElementById('digit-cursor');
    if (nodes[digit]) cursor.style.left = (nodes[digit].offsetLeft - 2) + "px";
}

function switchAccount() {
    currentToken = (currentToken === REAL_TOKEN) ? DEMO_TOKEN : REAL_TOKEN;
    connect(currentToken);
}

function log(m, c) {
    const l = document.getElementById('log');
    l.innerHTML = `<div style="color:${c}">[${new Date().toLocaleTimeString()}] ${m}</div>` + l.innerHTML;
}

document.getElementById('btn-toggle').onclick = function() {
    isTrading = !isTrading;
    this.innerText = isTrading ? "STOP" : "START AUTOMATION";
    this.classList.toggle('active');
};

connect(REAL_TOKEN);
