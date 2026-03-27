const APP_ID = '119353';
const TOKENS = { REAL: 'A4lxJkh0sWeXD60', DEMO: 'sI05YqeXBucWOm1' };

let socket;
let selectedDigit = null;
let selectedTradeType = 'match';
let currentStake = 10;
let lastPrice = null;
let priceHistory = [];
let digitHistory = [];

// Statistics
let stats = {
    balance: 0,
    totalStake: 0,
    totalPayout: 0,
    runsCount: 0,
    contractsLost: 0,
    contractsWon: 0,
    totalProfit: 0
};

// Chart
let chart;
const chartCanvas = document.getElementById('chart-canvas');

// Initialize
function init() {
    setupEventListeners();
    createDigitPad();
    connect();
}

// Setup Event Listeners
function setupEventListeners() {
    // Trade type selector
    document.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedTradeType = e.target.getAttribute('data-type');
        });
    });

    // Stake input
    document.getElementById('stake-input').addEventListener('change', updatePayout);
    document.getElementById('stake-input').addEventListener('input', updatePayout);

    // Trade buttons
    document.getElementById('btn-match').addEventListener('click', () => executeTrade('DIGITEVEN'));
    document.getElementById('btn-differs').addEventListener('click', () => executeTrade('DIGITODD'));
}

// Create Digit Pad
function createDigitPad() {
    const digitPad = document.getElementById('digit-pad');
    for (let i = 0; i < 10; i++) {
        const btn = document.createElement('button');
        btn.className = 'digit-pad-btn';
        btn.textContent = i;
        btn.addEventListener('click', () => selectDigit(i));
        digitPad.appendChild(btn);
    }
}

// Select Digit
function selectDigit(digit) {
    document.querySelectorAll('.digit-pad-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    selectedDigit = digit;
    updatePayout();
}

// Update Payout Display
function updatePayout() {
    currentStake = parseFloat(document.getElementById('stake-input').value) || 10;
    
    let payoutMultiplier = 1;
    if (selectedTradeType === 'match') {
        payoutMultiplier = 7.929; // 792.90%
    } else {
        payoutMultiplier = 0.096; // 9.60%
    }
    
    const payout = (currentStake * payoutMultiplier).toFixed(2);
    document.getElementById('payout-value').textContent = `${payout} USD`;
}

// Connect to Deriv WebSocket
function connect() {
    if (socket) {
        socket.onclose = null;
        socket.close();
    }

    const token = TOKENS.DEMO; // Use DEMO first
    socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    socket.onopen = () => {
        console.log('Connected to Deriv');
        socket.send(JSON.stringify({ authorize: token }));
    };

    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        handleWebsocketMessage(data);
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };

    socket.onclose = () => {
        console.log('Disconnected. Reconnecting...');
        setTimeout(connect, 3000);
    };
}

// Handle WebSocket Messages
function handleWebsocketMessage(data) {
    if (data.msg_type === 'authorize') {
        if (data.authorize) {
            stats.balance = parseFloat(data.authorize.balance);
            updateBalanceDisplay();
            
            // Subscribe to ticks
            socket.send(JSON.stringify({ 
                ticks: 'R_100', 
                subscribe: 1 
            }));
            
            console.log('Authorized and subscribed to ticks');
        }
    }

    if (data.msg_type === 'tick') {
        if (data.tick) {
            lastPrice = parseFloat(data.tick.quote);
            priceHistory.push(lastPrice);
            if (priceHistory.length > 100) priceHistory.shift();
            
            updatePrice(lastPrice);
            updateDigitHistory();
            updateChart();
        }
    }

    if (data.msg_type === 'buy') {
        if (data.buy) {
            console.log('Trade placed:', data.buy.contract_id);
            subscribeToContract(data.buy.contract_id);
        }
    }

    if (data.msg_type === 'proposal_open_contract') {
        const contract = data.proposal_open_contract;
        if (contract && contract.is_sold) {
            const profit = parseFloat(contract.profit) || 0;
            handleTradeResult(profit);
        }
    }
}

// Update Price Display
function updatePrice(price) {
    document.getElementById('current-price').textContent = price.toFixed(2);
}

// Update Digit History
function updateDigitHistory() {
    const digit = Math.floor(lastPrice) % 10;
    digitHistory.unshift(digit);
    if (digitHistory.length > 20) digitHistory.pop();
    
    const container = document.getElementById('digit-history');
    container.innerHTML = digitHistory.map((d, i) => 
        `<div class="digit-item ${i === 0 ? 'active' : ''}">${d}</div>`
    ).join('');
}

// Update Chart
function updateChart() {
    if (!chartCanvas) return;
    
    const ctx = chartCanvas.getContext('2d');
    const width = chartCanvas.width;
    const height = chartCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (priceHistory.length < 2) return;
    
    const minPrice = Math.min(...priceHistory);
    const maxPrice = Math.max(...priceHistory);
    const priceRange = maxPrice - minPrice || 1;
    
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    priceHistory.forEach((price, i) => {
        const x = (i / (priceHistory.length - 1)) * width;
        const y = height - ((price - minPrice) / priceRange) * (height - 20) - 10;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    
    ctx.stroke();
}

// Execute Trade
function executeTrade(contractType) {
    if (!selectedDigit && selectedDigit !== 0) {
        alert('Please select a digit (0-9)');
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert('Not connected to Deriv API');
        return;
    }

    currentStake = parseFloat(document.getElementById('stake-input').value) || 10;

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
    stats.totalStake += currentStake;
    updateStats();
}

// Subscribe to Contract
function subscribeToContract(contractId) {
    socket.send(JSON.stringify({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
    }));
}

// Handle Trade Result
function handleTradeResult(profit) {
    if (profit > 0) {
        stats.contractsWon++;
        stats.totalProfit += profit;
        showNotification(`+${profit.toFixed(2)} USD WON`, '#4caf50');
    } else {
        stats.contractsLost++;
        stats.totalProfit += profit;
        showNotification(`${profit.toFixed(2)} USD LOST`, '#f44336');
    }

    stats.balance += profit;
    stats.totalPayout += (currentStake + Math.max(profit, 0));
    stats.runsCount++;

    updateBalanceDisplay();
    updateStats();
}

// Update Balance Display
function updateBalanceDisplay() {
    document.getElementById('balance-display').textContent = `${stats.balance.toFixed(2)} USD`;
}

// Update Statistics Display
function updateStats() {
    document.getElementById('stat-stake').textContent = `${stats.totalStake.toFixed(2)} USD`;
    document.getElementById('stat-payout').textContent = `${stats.totalPayout.toFixed(2)} USD`;
    document.getElementById('stat-runs').textContent = stats.runsCount;
    document.getElementById('stat-lost').textContent = stats.contractsLost;
    document.getElementById('stat-won').textContent = stats.contractsWon;
    
    const profitColor = stats.totalProfit >= 0 ? '#4caf50' : '#f44336';
    const profitElement = document.getElementById('stat-profit');
    profitElement.textContent = `${stats.totalProfit.toFixed(2)} USD`;
    profitElement.style.color = profitColor;
}

// Show Notification
function showNotification(message, color) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${color};
        color: white;
        padding: 15px 20px;
        border-radius: 4px;
        font-weight: 600;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
