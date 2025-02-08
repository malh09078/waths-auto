const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const WhatsAppAccountManager = require('./AccountManager');
const { accounts } = require('./shared');

const htmlTemplate = fs.readFileSync(path.join(__dirname, 'views', 'index.html'), 'utf8');

module.exports = function (req, res) {
    if (req.url === '/app' && req.method === 'GET') {
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
    }else if (req.url === '/dashboard-data') {
        handleDashboardData(req, res);
    }else if (req.url === '/accounts-status') {
        handleAccountsStatus(req, res);
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
};

function handleAccountsStatus(req, res) {
    const accountsData = Array.from(accounts).map(([id, manager]) => ({
        id,
        status: manager.status
    }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accounts: accountsData }));
}
// function handleRoot(req, res) {
//     let accountsHTML = '';
//     accounts.forEach((manager, id) => {
//         accountsHTML += generateAccountCard(id, manager);
//     });

//     const html = htmlTemplate.replace('{{ACCOUNTS}}', accountsHTML);
//     res.writeHead(200, { 'Content-Type': 'text/html' });
//     res.end(html);
// }

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



function handleRoot(req, res) {
    let state = {};
    try {
        state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE));
    } catch (error) {
        state = {
            currentGroup: null,
            groupCounter: 1,
            activeGroups: [],
            lastProcessed: 0
        };
    }

    const replacements = {
        CURRENT_GROUP_NAME: state.currentGroup ? 
            `${CONFIG.BASE_GROUP_NAME} ${state.groupCounter - 1}` : 'No active group',
        CURRENT_GROUP_MEMBERS: state.currentGroup ? 
            (state.activeGroups.find(g => g.id === state.currentGroup)?.members || 0) : 0,
        MAX_GROUP_SIZE: CONFIG.MAX_GROUP_SIZE,
        CURRENT_GROUP_ID: state.currentGroup ? 
            state.currentGroup.substring(0, 8) + '...' : 'N/A',
        TOTAL_PROCESSED: state.lastProcessed,
        ACTIVE_GROUPS_COUNT: state.activeGroups,
        NEXT_GROUP_NAME: `${CONFIG.BASE_GROUP_NAME} ${state.groupCounter}`
    };

    let accountsHTML = '';
    accounts.forEach((manager, id) => {
        accountsHTML += generateAccountCard(id, manager);
    });

    let html = htmlTemplate
        .replace('{{ACCOUNTS}}', accountsHTML)
        .replace('{{CURRENT_GROUP_NAME}}', replacements.CURRENT_GROUP_NAME)
        .replace('{{CURRENT_GROUP_MEMBERS}}', replacements.CURRENT_GROUP_MEMBERS)
        .replace('{{MAX_GROUP_SIZE}}', replacements.MAX_GROUP_SIZE)
        .replace('{{CURRENT_GROUP_ID}}', replacements.CURRENT_GROUP_ID)
        .replace('{{TOTAL_PROCESSED}}', replacements.TOTAL_PROCESSED)
        .replace('{{ACTIVE_GROUPS_COUNT}}', replacements.ACTIVE_GROUPS_COUNT)
        .replace('{{NEXT_GROUP_NAME}}', replacements.NEXT_GROUP_NAME);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
}

function handleDashboardData(req, res) {
    try {
        const state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE));
        const data = {
            currentGroupName: state.currentGroupName ? 
                `${CONFIG.BASE_GROUP_NAME} ${state.groupCounter - 1}` : 'No active group',
            currentGroupMembers: state.currentGroup ? 
                (state.activeGroups.find(g => g.id === state.currentGroup)?.members || 0) : 0,
            maxGroupSize: CONFIG.MAX_GROUP_SIZE,
            currentGroupId: state.currentGroup ? 
                state.currentGroup.substring(0, 8) + '...' : 'N/A',
            totalProcessed: state.lastProcessed,
            activeGroupsCount: state.activeGroups.length,
            nextGroupName: `${CONFIG.BASE_GROUP_NAME} ${state.groupCounter}`
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Could not load dashboard data' }));
    }
}

function generateAccountCard(accountId, manager) {
    let content = '';
    const baseContent = `
        <h3 class='text-xl font-semibold text-gray-900 mb-2'>${accountId}</h3>
        <p class='text-sm font-medium py-1 px-3 rounded-full text-white ${manager.status === 'ready' ? 'bg-green-500' : 'bg-yellow-500'}'>
            ${manager.status.replace('_', ' ')}
        </p>
    `;

    if (manager.status === 'initializing') {
        content = `
            ${baseContent}
            <div class='flex items-center gap-2 text-gray-600 mt-2'>
                <i class='fas fa-spinner fa-spin'></i>
                <span>Initializing...</span>
            </div>
        `;
    } else if (manager.status === 'awaiting_qr') {
        content = `
            ${baseContent}
            <div class='flex flex-col items-center mt-4'>
                <img src='/qrcode/${accountId}' class='w-64 h-64 rounded-lg shadow-md border' alt='QR Code'>
                <p class='mt-2 text-gray-600'>Scan this QR code with your phone</p>
            </div>
        `;
    } else if (manager.status === 'ready') {
        content = `
            ${baseContent}
            <button onclick="startAccount('${accountId}')" class='w-full mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 flex items-center justify-center'>
                <i class='fas fa-play mr-2'></i> Start Processing
            </button>
        `;
    } else {
        content = baseContent;
    }

    return `
        <div class='bg-white p-6 rounded-lg shadow-lg border flex flex-col items-center'>
            ${content}
        </div>
    `;
}