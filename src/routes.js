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
    }  else if (req.method === 'POST' && req.url === '/add-number-to-group') {
        // Handle adding number to group
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accountId, phone, groupName } = JSON.parse(body);
                const manager = accounts.get(accountId);
                
                if (!manager) {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ success: false, message: 'Account not found' }));
                }

                const result = await manager.addNumberToGroup(phone, groupName);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        });
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


function checkSessionFolders() {
    const sessionDir = CONFIG.SESSION_DIR;

    // Check if the session directory exists
    if (!fs.existsSync(sessionDir)) {
        console.log('Session directory does not exist.');
        return;
    }

    // Read all files/folders in the session directory
    const sessionFolders = fs.readdirSync(sessionDir);

    sessionFolders.forEach(folder => {
        // Only process folders that start with "session_"
        if (folder.startsWith('session_') && !folder.endsWith('.png')) {
            // Extract account ID from folder name (e.g., "session_123456")
            const accountId = folder.replace('session_', '');

            // Check if the account ID is not in the accounts map
            if (!accounts.has(accountId)) {
                console.log(`Found session folder for account ${accountId}, but no manager exists. Creating new manager...`);

                // Create a new WhatsAppAccountManager for this account
                accounts.set(accountId, new WhatsAppAccountManager(accountId));
            }
        }
    });
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

    manager.status = 'running';
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
    checkSessionFolders();
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



    let accountsHTML = '';
    accounts.forEach((manager, id) => {
        accountsHTML += generateAccountCard(id, manager);
    });

    let html = htmlTemplate
        .replace('{{ACCOUNTS}}', accountsHTML);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
}

function generateAccountCard(accountId, manager) {
    let content = '';
    const baseContent = 
        `<h3 class='text-xl font-semibold text-gray-900 mb-2'>${accountId}</h3>
        <p class='text-sm font-medium py-1 px-3 rounded-full text-white ${manager.status === 'ready' ? 'bg-green-500' : manager.status === 'running' ? 'bg-blue-500' : 'bg-yellow-500'}'>
            ${manager.status.replace('_', ' ')}
        </p>`;

    if (manager.status === 'initializing') {
        content = 
            `${baseContent}
            <div class='flex items-center gap-2 text-gray-600 mt-2'>
                <i class='fas fa-spinner fa-spin'></i>
                <span>Initializing...</span>
            </div>`;
    } else if (manager.status === 'awaiting_qr') {
        content = 
            `${baseContent}
            <div class='flex flex-col items-center mt-4'>
                <img src='/qrcode/${accountId}' class='w-64 h-64 rounded-lg shadow-md border' alt='QR Code'>
                <p class='mt-2 text-gray-600'>Scan this QR code with your phone</p>
            </div>`;
    } else if (manager.status === 'ready') {
        content = 
            `${baseContent}
            <button onclick="startAccount('${accountId}')" class='w-full mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 flex items-center justify-center'>
                <i class='fas fa-play mr-2'></i> Start Processing
            </button>`;
    } else if (manager.status === 'running') {
        content = 
            `${baseContent}
            <div class='flex items-center gap-2 text-gray-600 mt-2'>
                <i class='fas fa-spinner fa-spin'></i>
                <span>Processing...</span>
            </div>`;
    } else {
        content = baseContent;
    }

    const processDetails = manager.status === 'running' ? `
        <div class="mt-4 w-full">
            <h4 class="text-lg font-semibold mb-2">Process Details</h4>
            <button onclick="toggleDetails('${accountId}')" class="text-blue-600 hover:text-blue-800 text-sm">
                ${manager.processDetailsOpen ? 'Hide Details' : 'Show Details'}
            </button>
            <div id="details-${accountId}" class="details-section ${manager.processDetailsOpen ? '' : 'hidden'}">
                <table class="w-full border-collapse border border-gray-300">
                    <thead>
                        <tr class="bg-gray-200">
                            <th class="border border-gray-300 px-4 py-2">Phone</th>
                            <th class="border border-gray-300 px-4 py-2">Name</th>
                            <th class="border border-gray-300 px-4 py-2">Status</th>
                            <th class="border border-gray-300 px-4 py-2">Error Code</th>
                            <th class="border border-gray-300 px-4 py-2">Message</th>
                            <th class="border border-gray-300 px-4 py-2">Invite Sent</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${manager.processDetails.map(detail => `
                            <tr>
                                <td class="border border-gray-300 px-4 py-2">${detail.phone}</td>
                                <td class="border border-gray-300 px-4 py-2">${detail.name}</td>
                                <td class="border border-gray-300 px-4 py-2">${detail.status}</td>
                            <td class="border border-gray-300 px-4 py-2">${detail.error_code || 'N/A'}</td>
                            <td class="border border-gray-300 px-4 py-2">${detail.message || 'N/A'}</td>
                            <td class="border border-gray-300 px-4 py-2">${detail.is_invite_sent || 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    ` : '';

    return `
        <div class='bg-white p-6 rounded-lg shadow-lg border flex flex-col items-center' data-status="${manager.status}" data-account-id="${accountId}">
            ${content}
            ${processDetails}
        </div>`;
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