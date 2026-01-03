const APP_ID = 'YOUR_APP_ID'; 
const API_TOKEN = 'YOUR_API_TOKEN';

let socket;
let isTrading = false;
let tickHistory = [];
let currentStake = 0.35;
let isContractOpen = false;

function connect() {
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    socket.onopen = () => {
        document.getElementById('connection-status').className = 'status-online';
        document.getElementById('connection-status').innerText = 'Connected';
        socket.send(JSON.stringify({ authorize: API_TOKEN }));
    };

    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);

        if (data.msg_type === 'authorize') {
            document.getElementById('balance').innerText = data.authorize.balance;
            socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
        }

        if (data.msg_type === 'tick') {
            const price = data.tick.quote;
            const lastDigit = parseInt(price.toString().slice(-1));
            updateUI(price, lastDigit);
            
            if (isTrading && !isContractOpen) {
                checkPerfectConditions(lastDigit);
            }
        }

        if (data.msg_type === 'buy') {
            isContractOpen = true;
            log(`Purchase: ${data.buy.contract_id} at $${currentStake}`);
        }

        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            if (contract.is_sold) {
                isContractOpen = false;
                handleResult(contract.status, contract.profit);
            }
        }
    };
}

function updateUI(price, lastDigit) {
    document.getElementById('tick-price').innerText = price;
    document.getElementById('last-digit').innerText = lastDigit;
    tickHistory.push(lastDigit);
    if (tickHistory.length > 50) tickHistory.shift();
}

function checkPerfectConditions(digit) {
    const strategy = document.getElementById('strategy').value;
    const history = tickHistory.slice(-10);

    // 1. STREAK REVERSAL: Wait for 5 Evens, Buy Odd
    if (strategy === 'STR_EVENOOD') {
        const evens = history.slice(-5).filter(d => d % 2 === 0).length;
        const odds = history.slice(-5).filter(d => d % 2 !== 0).length;
        if (evens === 5) placeTrade('DIGITODD');
        else if (odds === 5) placeTrade('DIGITEVEN');
    }

    // 2. REPETITION: If digit repeats twice, buy Differ
    if (strategy === 'STR_REPETITION') {
        if (history.length >= 2 && history[history.length-1] === history[history.length-2]) {
            placeTrade('DIGITDIFF', history[history.length-1]);
        }
    }

    // 3. PERCENTAGE: If digits 0-3 appear > 70% of time, buy Over 3
    if (strategy === 'STR_OVERUNDER') {
        const lows = history.filter(d => d <= 3).length;
        if (lows >= 7) placeTrade('DIGITOVER', 3);
    }
}

function placeTrade(type, barrier = null) {
    const stake = parseFloat(document.getElementById('stake').value);
    const request = {
        "buy": 1,
        "price": currentStake,
        "parameters": {
            "amount": currentStake,
            "basis": "stake",
            "contract_type": type,
            "currency": "USD",
            "duration": 1,
            "duration_unit": "t",
            "symbol": "R_100"
        }
    };
    if (barrier !== null) request.parameters.barrier = barrier;
    socket.send(JSON.stringify(request));
    // Subscribe to result
    socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
}

function handleResult(status, profit) {
    const initialStake = parseFloat(document.getElementById('stake').value);
    const multiplier = parseFloat(document.getElementById('martingale').value);

    if (status === 'won') {
        log(`WIN: +$${profit}`);
        currentStake = initialStake;
    } else {
        log(`LOSS: -$${Math.abs(profit)}`);
        currentStake *= multiplier;
    }
    // Update balance
    socket.send(JSON.stringify({ authorize: API_TOKEN }));
}

function log(msg) {
    const logDiv = document.getElementById('log');
    logDiv.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>` + logDiv.innerHTML;
}

document.getElementById('btn-toggle').onclick = function() {
    isTrading = !isTrading;
    this.innerText = isTrading ? "STOP AUTOMATION" : "START AUTOMATION";
    this.className = isTrading ? "active" : "";
    currentStake = parseFloat(document.getElementById('stake').value);
    log(isTrading ? "Bot Started: Searching for entry..." : "Bot Stopped.");
};

connect();