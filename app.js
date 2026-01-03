// --- REPLACE THESE WITH YOUR DATA ---
const APP_ID = '36300'; // Change to your registered ID from api.deriv.com
const REAL_TOKEN = 'YOUR_REAL_TOKEN';
const DEMO_TOKEN = 'YOUR_DEMO_TOKEN';

let socket, activeStrategy, isTrading = false, isContractOpen = false;
let marketData = { R_100: [] }, absenceTable = { R_100: Array(10).fill(0) };

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function connect(token) {
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'authorize') {
            document.getElementById('balance').innerText = `$${data.authorize.balance}`;
            document.getElementById('connection-status').innerText = "CONNECTED";
            document.getElementById('connection-status').className = "status-online";
            showPage('page-dashboard');
            socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
        }
        if (data.msg_type === 'tick') handleTick(data.tick);
        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.is_sold) {
            isContractOpen = false;
            const win = data.proposal_open_contract.status === 'won';
            log(win ? `WIN: +$${data.proposal_open_contract.profit}` : `LOSS: -$${Math.abs(data.proposal_open_contract.profit)}`);
        }
    };
}

function handleTick(tick) {
    const digit = parseInt(tick.quote.toString().slice(-1));
    marketData.R_100.push(digit);
    if (marketData.R_100.length > 20) marketData.R_100.shift();
    
    // Logic Execution
    if (isTrading && !isContractOpen) {
        const history = marketData.R_100;
        
        if (activeStrategy === 'STR_EVENOOD') {
            const last3 = history.slice(-3);
            const odds = last3.filter(d => d % 2 !== 0).length;
            const evens = last3.filter(d => d % 2 === 0).length;
            if (odds === 3) trade('DIGITEVEN');
            else if (evens === 3) trade('DIGITODD');
        }

        if (activeStrategy === 'STR_MATCHES') {
            for(let i=0; i<10; i++) absenceTable.R_100[i]++;
            absenceTable.R_100[digit] = 0;
            const target = absenceTable.R_100.findIndex(c => c > 20);
            if (target === digit) trade('DIGITMATCH', target);
        }

        if (activeStrategy === 'STR_OVERUNDER') {
            const under4 = history.filter(d => d < 4).length;
            if (under4 >= 14) trade('DIGITUNDER', 4);
        }
    }
}

function trade(type, barrier = null) {
    isContractOpen = true;
    const stake = parseFloat(document.getElementById('stake').value);
    const req = { buy: 1, price: stake, parameters: { amount: stake, basis: 'stake', contract_type: type, currency: 'USD', duration: 1, duration_unit: 't', symbol: 'R_100' } };
    if (barrier !== null) req.parameters.barrier = barrier;
    socket.send(JSON.stringify(req));
    socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
}

function initBot(s) { activeStrategy = s; showPage('page-terminal'); }
function log(m) { document.getElementById('log').innerHTML = `<div>${m}</div>` + document.getElementById('log').innerHTML; }

document.getElementById('btn-toggle').onclick = function() {
    isTrading = !isTrading;
    this.innerText = isTrading ? "STOP BOT" : "START BOT";
    this.className = isTrading ? "btn-start active" : "btn-start";
};

connect(REAL_TOKEN);
