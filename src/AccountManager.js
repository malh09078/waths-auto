const { Client, LocalAuth } = require('whatsapp-web.js');
const xlsx = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const CONFIG = require('./config');

class WhatsAppAccountManager {
    constructor(accountId) {
        this.accountId = accountId;
        this.status = 'initializing';
        this.qrFile = path.join(CONFIG.SESSION_DIR, `qrcode_${accountId}.png`);
        this.sessionPath = path.join(CONFIG.SESSION_DIR, `session_${accountId}`);

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
module.exports = WhatsAppAccountManager;