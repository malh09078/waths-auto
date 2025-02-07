const { Client, LocalAuth } = require('whatsapp-web.js');
const xlsx = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const http = require('http');
const qrcode = require('qrcode');
const path = require('path');

// Configuration
const CONFIG = {
    PORT: 8081,
    MAX_GROUP_SIZE: 230,
    DAILY_BATCH_SIZE: 5,
    EXCEL_FILE: 'numbers.xlsx',
    BASE_GROUP_NAME: 'عمل',
    STATE_FILE: 'shared_state.json',
    CSV_FILE: 'shared_statuses.csv',
    SESSION_DIR: 'sessions'
};

const accounts = new Map();

class WhatsAppAccountManager {
    constructor(accountId) {
        this.accountId = accountId;
        this.status = 'initializing';
        this.qrFile = path.join(CONFIG.SESSION_DIR, `qrcode_${accountId}.png`);
        this.sessionPath = path.join(CONFIG.SESSION_DIR, `session_${accountId}`);

        // Create session directory
        if (!fs.existsSync(this.sessionPath)) {
            fs.mkdirSync(this.sessionPath, { recursive: true });
        }

        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: accountId }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    `--user-data-dir=${this.sessionPath}`,
                    '--disable-setuid-sandbox'
                ],
            }
        });

        this.csvWriter = createCsvWriter({
            path: CONFIG.CSV_FILE,
            header: [
                { id: 'phone', title: 'PHONE' },
                { id: 'name', title: 'NAME' },
                { id: 'status', title: 'STATUS' },
                { id: 'error_code', title: 'ERROR_CODE' },
                { id: 'message', title: 'MESSAGE' },
                { id: 'is_invite_sent', title: 'INVITE_SENT' }
            ],
            append: true
        });

        this.setupHandlers();
        this.initializeClient();
    }

    setupHandlers() {
        this.client.on('qr', async (qr) => {
            this.status = 'awaiting_qr';
            await qrcode.toFile(this.qrFile, qr, { scale: 2 });
            console.log(`[${this.accountId}] QR code generated`);
        });

        this.client.on('ready', () => {
            this.status = 'ready';
            console.log(`[${this.accountId}] Client ready`);
            this.processBatch();
        });

        this.client.on('disconnected', () => {
            this.status = 'disconnected';
            console.log(`[${this.accountId}] Client disconnected`);
        });
    }

    initializeClient() {
        this.client.initialize().catch(err => {
            console.error(`[${this.accountId}] Initialization error:`, err);
            this.status = 'error';
        });
    }

    loadSharedState() {
        try {
            return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE));
        } catch {
            return {
                lastProcessed: 0,
                currentGroup: null,
                groupCounter: 1,
                activeGroups: []
            };
        }
    }

    saveSharedState(state) {
        fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
    }

    readNumbers(lastProcessed) {
        try {
            const workbook = xlsx.readFile(CONFIG.EXCEL_FILE);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = xlsx.utils.sheet_to_json(sheet);
            
            return rows
                .slice(lastProcessed, lastProcessed + CONFIG.DAILY_BATCH_SIZE)
                .map(row => ({
                    phone: `967${row['phone number']}@c.us`,
                    name: row['name']
                }));
        } catch (error) {
            console.error('Error reading numbers:', error);
            return [];
        }
    }

    async processBatch() {
        if (this.status !== 'ready') return;

        try {
            const state = this.loadSharedState();
            const numbers = this.readNumbers(state.lastProcessed);
            
            if (numbers.length === 0) {
                console.log(`[${this.accountId}] No numbers to process`);
                return;
            }

            let groupId = state.currentGroup;
            if (!groupId || !await this.verifyGroup(groupId)) {
                groupId = await this.createGroup(state);
            }

            await this.processNumbers(groupId, numbers, state);
            this.saveSharedState(state);

            console.log(`[${this.accountId}] Processed ${numbers.length} numbers`);
        } catch (error) {
            console.error(`[${this.accountId}] Batch processing error:`, error);
        }
    }

    async verifyGroup(groupId) {
        try {
            const group = await this.client.getChatById(groupId);
            return group.participants.length < CONFIG.MAX_GROUP_SIZE;
        } catch {
            return false;
        }
    }

    async createGroup(state) {
        try {
            const groupName = `${CONFIG.BASE_GROUP_NAME} ${state.groupCounter++}`;
            const creation = await this.client.createGroup(groupName, [
                '967739817442@c.us',
                '967780341777@c.us'
            ]);

            const group = await this.client.getChatById(creation.gid._serialized);
            await group.promoteParticipants(['967739817442@c.us']);
            await group.setMessagesAdminsOnly(true);
            await group.setInfoAdminsOnly(true);

            state.currentGroup = creation.gid._serialized;
            state.activeGroups.push(creation.gid._serialized);
            return creation.gid._serialized;
        } catch (error) {
            console.error('Group creation failed:', error);
            throw error;
        }
    }

    async processNumbers(groupId, numbers, state) {
        try {
            const group = await this.client.getChatById(groupId);
            
            for (const { phone, name } of numbers) {
                const record = {
                    phone,
                    name,
                    status: 'PENDING',
                    error_code: '',
                    message: '',
                    is_invite_sent: false
                };

                try {
                    const contactId = await this.client.getNumberId(phone);
                    if (!contactId) {
                        record.status = 'INVALID';
                        record.message = 'Number not registered';
                        await this.csvWriter.writeRecords([record]);
                        continue;
                    }

                    const result = await group.addParticipants([phone], { autoSendInviteV4: false });
                    const participantResult = result[phone];

                    record.status = participantResult.code === 200 ? 'ADDED' : 'FAILED';
                    record.error_code = participantResult.code;
                    record.message = participantResult.message;
                    record.is_invite_sent = participantResult.isInviteV4Sent;

                    if (participantResult.code === 403 && !participantResult.isInviteV4Sent) {
                        await group.sendInvite(phone);
                        record.is_invite_sent = true;
                    }

                    await this.csvWriter.writeRecords([record]);
                    state.lastProcessed++;
                } catch (error) {
                    record.status = 'ERROR';
                    record.message = error.message;
                    await this.csvWriter.writeRecords([record]);
                }
            }
        } catch (error) {
            console.error('Number processing error:', error);
        }
    }
}

// HTTP Server
const server = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
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

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Bot Manager</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .account-card { 
                        border: 1px solid #ddd; 
                        padding: 15px; 
                        margin: 10px; 
                        border-radius: 5px;
                        max-width: 300px;
                        display: inline-block;
                        vertical-align: top;
                    }
                    .qr-image { 
                        max-width: 200px; 
                        height: auto; 
                        display: block;
                        margin: 10px 0;
                    }
                    button { 
                        padding: 8px 16px; 
                        background: #007bff; 
                        color: white; 
                        border: none; 
                        border-radius: 4px; 
                        cursor: pointer; 
                    }
                    button:hover { background: #0056b3; }
                    form { margin: 20px 0; }
                    input { 
                        padding: 8px; 
                        margin-right: 10px; 
                        border: 1px solid #ddd; 
                        border-radius: 4px; 
                    }
                    .status {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 0.9em;
                        display: inline-block;
                    }
                    .status.ready { background: #d4edda; color: #155724; }
                    .status.awaiting_qr { background: #fff3cd; color: #856404; }
                </style>
            </head>
            <body>
                <h1>WhatsApp Bot Manager</h1>
                
                <form onsubmit="event.preventDefault(); addAccount()">
                    <input type="text" id="newAccountId" placeholder="Enter account ID">
                    <button type="submit">Add New Account</button>
                </form>
                
                <div id="accounts">${accountsHTML}</div>
                
                <script>
                    function addAccount() {
                        const accountId = document.getElementById('newAccountId').value;
                        if (!accountId) return;

                        fetch('/add-account', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accountId })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                location.reload();
                            } else {
                                alert(data.error || 'Error adding account');
                            }
                        });
                    }

                    function startAccount(accountId) {
                        fetch('/start/' + accountId, { method: 'POST' })
                            .then(response => response.json())
                            .then(data => {
                                if (!data.success) {
                                    alert('Error: ' + (data.error || 'Unknown error'));
                                }
                            });
                    }

                    // Auto-refresh QR codes every 3 seconds
                    // setInterval(() => {
                    //     document.querySelectorAll('.qr-image').forEach(img => {
                    //         img.src = img.src.split('?')[0] + '?t=' + Date.now();
                    //     });
                    // }, 3000);
                </script>
            </body>
            </html>
        `;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }
    else if (req.method === 'POST' && req.url === '/add-account') {
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
    else if (req.method === 'POST' && req.url.startsWith('/start/')) {
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
    else if (req.url.startsWith('/qrcode/')) {
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
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Initialize session directory
if (!fs.existsSync(CONFIG.SESSION_DIR)) {
    fs.mkdirSync(CONFIG.SESSION_DIR, { recursive: true });
}

// Start server
server.listen(CONFIG.PORT, () => {
    console.log(`Server running on http://localhost:${CONFIG.PORT}`);
});