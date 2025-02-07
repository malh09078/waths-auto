const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const WhatsAppAccountManager = require('./AccountManager');
const { accounts } = require('./shared');

const htmlTemplate = fs.readFileSync(path.join(__dirname, 'views', 'index.html'), 'utf8');

module.exports = function (req, res) {
    if (req.url === '/' && req.method === 'GET') {
        handleRoot(req, res);
    } else if (req.method === 'POST' && req.url === '/add-account') {
        handleAddAccount(req, res);
    } else if (req.method === 'POST' && req.url.startsWith('/start/')) {
        handleStartAccount(req, res);
    } else if (req.url.startsWith('/qrcode/')) {
        handleQrCode(req, res);
    }
    else if (req.url === '/shared_state.json') {
        handleSharedState(req, res);
    } else if (req.url === '/shared_statuses.csv') {
        handleSharedStatuses(req, res);
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
};

function handleRoot(req, res) {
    let accountsHTML = '';
    accounts.forEach((manager, id) => {
        accountsHTML += `
            <div class="account-card">
                <h3>${id}</h3>
                <p class="status ${manager.status}">${manager.status.replace('_', ' ')}</p>
                ${manager.status === 'awaiting_qr' ? 
                    `<img src="/qrcode/${id}" class="qr-image" alt="QR Code">` : 
                    '<p>QR Code unavailable</p>'}
                <button onclick="startAccount('${id}')">Start Processing</button>
            </div>
        `;
    });

    const html = htmlTemplate.replace('{{ACCOUNTS}}', accountsHTML);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
}

function handleAddAccount(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const { accountId } = JSON.parse(body);
            if (!accountId) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Account ID required' }));
            }

            if (accounts.has(accountId)) {
                res.writeHead(409);
                return res.end(JSON.stringify({ error: 'Account already exists' }));
            }

            accounts.set(accountId, new WhatsAppAccountManager(accountId));
            res.writeHead(201);
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Invalid request' }));
        }
    });
}

function handleStartAccount(req, res) {
    const accountId = req.url.split('/')[2];
    const manager = accounts.get(accountId);
    
    if (!manager) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Account not found' }));
    }

    manager.processBatch();
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
}

function handleQrCode(req, res) {
    const accountId = req.url.split('/')[2];
    const manager = accounts.get(accountId);
    
    if (!manager) {
        res.writeHead(404);
        return res.end('Account not found');
    }

    fs.readFile(manager.qrFile, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('QR code not available');
        } else {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(data);
        }
    });
}

// Add these new handler functions
function handleSharedState(req, res) {
    fs.readFile(CONFIG.STATE_FILE, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('State file not found');
        } else {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': 'attachment; filename="shared_state.json"'
            });
            res.end(data);
        }
    });
}

function handleSharedStatuses(req, res) {
    fs.readFile(CONFIG.CSV_FILE, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Status file not found');
        } else {
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="shared_statuses.csv"'
            });
            res.end(data);
        }
    });
}