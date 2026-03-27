const APP_ID = '119353';
const TOKENS = { REAL: 'A4lxJkh0sWeXD60', DEMO: 'sI05YqeXBucWOm1' };

let socket;
let isTrading = false;
let activeAccount = 'REAL';
let selectedDigit = null;
let selectedTradeType = 'match';

// Statistics
let stats = {
    totalStake: 0,
    totalPayout: 0,
    runsCount: 0,
    contractsLost: 0,
    contractsWon: 0,
    totalProfit: 0,
    balance: 0
};

// Digit history
let digitHistory = [];
const MAX_HISTORY = 20;

// Trade configuration
let currentStake = 10;
let lastPrice = null;

// --- INITIALIZE ---
function init() {
    setupEventListeners();
    connect();
    generateDigitHistory();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Digit pad buttons handled by HTML
    // Trade type selector
    document.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedTradeType = e.target.getAttribute('data-type');
        });
    });

    // Stake input
    document.getElementById('stake-input').addEventListener('change', (e) => {
        currentStake = parseFloat(e.target.value) || 10;
        updatePayout();
    });

    // Trade buttons
    document.getElementById('btn-match').addEventListener('click', () => executeTrade('match'));
    document.getElementById('btn-differs').addEventListener('click', () => executeTrade('differs'));
}

// --- WEBSOCKET CONNECTION ---
function connect() {
    if (socket) {
        socket.onclose = null;
        socket.close();
    }

    const token = TOKENS[activeAccount];
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    socket.onopen = () => {
        console.log('Connected');
        socket.send(JSON.stringify({ authorize: token }));
    };

    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        handleMessage(data);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
        console.log('Disconnected');
        setTimeout(connect, 3000);
    };
}

// --- HANDLE WEBSOCKET MESSAGES ---
function handleMessage(data) {
    if (data.msg_type === 'authorize') {
        stats.balance = data.authorize.balance;
        updateBalanceDisplay();
        socket.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
    }

    if (data.msg_type === 'tick') {
        const price = data.tick.quote;
        lastPrice = price;
        updatePrice(price);

        const digit = parseInt(price.toString().slice(-1));
        addToDigitHistory(digit);
        updateDigitDisplay();
    }

    if (data.msg_type === 'proposal') {
        // Handle trade proposal
        if (data.proposal && data.proposal.longcode) {
            console.log('Proposal received:', data.proposal);
        }
    }

    if (data.msg_type === 'buy') {
        // Trade executed
        if (data.buy && data.buy.contract_id) {
            console.log('Trade executed:', data.buy.contract_id);
            stats.runsCount++;
            stats.totalStake += currentStake;
            updateStats();
            subscribeToContract(data.buy.contract_id);
        }
    }

    if (data.msg_type === 'proposal_open_contract') {
        const contract = data.proposal_open_contract;
        if (contract.is_sold) {
            const profit = contract.profit || 0;
            handleTradeResult(profit, contract);
        }
    }
}

// --- EXECUTE TRADE ---
function executeTrade(type) {
    if (!selectedDigit && selectedDigit !== 0) {
        alert('Please select a digit first');
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert('Not connected to server');
        return;
    }

    const contractType = type === 'match' ? 'DIGITEVEN' : 'DIGITODD';
    const prediction = selectedDigit % 2 === 0 ? 'even' : 'odd';

    const tradeRequest = {
        buy: 1,
        price: currentStake,
        parameters: {
            amount: currentStake,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            symbol: 'R_100',
            duration: 1,
            duration_unit: 't'
        }
    };

    socket.send(JSON.stringify(tradeRequest));
}

// --- SUBSCRIBE TO CONTRACT ---
function subscribeToContract(contractId) {
    socket.send(JSON.stringify({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
    }));
}

// --- HANDLE TRADE RESULT ---
function handleTradeResult(profit, contract) {
    if (profit > 0) {
        stats.contractsWon++;
        stats.totalPayout += (currentStake + profit);
        stats.totalProfit += profit;
    } else {
        stats.contractsLost++;
        stats.totalPayout += currentStake;
        stats.totalProfit += profit;
    }

    stats.balance += profit;
    updateBalanceDisplay();
    updateStats();

    // Flash notification
    showNotification(profit > 0 ? `+${profit.toFixed(2)} USD` : `-${Math.abs(profit).toFixed(2)} USD`, 
                     profit > 0 ? '#00cc66' : '#ff4444');
}

// --- UI UPDATES ---
function updatePrice(price) {
    document.getElementById('current-price').textContent = price.toFixed(2);
}

function updateBalanceDisplay() {
    document.getElementById('balance-display').textContent = `${stats.balance.toFixed(2)} USD`;
}

function updatePayout() {
    const payoutRatio = selectedTradeType === 'match' ? 7.929 : 0.096;
    const payout = (currentStake * payoutRatio).toFixed(2);
    document.getElementById('payout-value').textContent = `${payout} USD`;
}

function updateStats() {
    document.getElementById('stat-stake').textContent = `${stats.totalStake.toFixed(2)} USD`;
    document.getElementById('stat-payout').textContent = `${stats.totalPayout.toFixed(2)} USD`;
    document.getElementById('stat-runs').textContent = stats.runsCount;
    document.getElementById('stat-lost').textContent = stats.contractsLost;
    document.getElementById('stat-won').textContent = stats.contractsWon;

    const profitColor = stats.totalProfit >= 0 ? '#00cc66' : '#ff4444';
    const profitElement = document.getElementById('stat-profit');
    profitElement.textContent = `${stats.totalProfit.toFixed(2)} USD`;
    profitElement.style.color = profitColor;
}

function addToDigitHistory(digit) {
    digitHistory.unshift(digit);
    if (digitHistory.length > MAX_HISTORY) {
        digitHistory.pop();
    }
}

function updateDigitDisplay() {
    const container = document.getElementById('digit-history');
    container.innerHTML = digitHistory.map((digit, index) => 
        `<div class="digit-item ${index === 0 ? 'active' : ''}">${digit}</div>`
    ).join('');
}

function generateDigitHistory() {
    digitHistory = Array.from({ length: MAX_HISTORY }, () => Math.floor(Math.random() * 10));
    updateDigitDisplay();
}

function showNotification(message, color) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${color};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        font-weight: 600;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// --- SELECT DIGIT FUNCTION ---
window.selectDigit = function(digit) {
    document.querySelectorAll('.digit-pad-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    selectedDigit = digit;
    updatePayout();
};

// --- ADD ANIMATION ---
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
`;
document.head.appendChild(style);

// Initialize
init();
