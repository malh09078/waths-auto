const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const xlsx = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const http = require('http'); // Add HTTP server

const path = require('path');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer:  {
        executablePath: '/usr/bin/google-chrome-stable',
        headless: "new",  // Use new headless mode
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',  // Prevent /dev/shm issues
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',         // May help in constrained environments
            '--disable-gpu'
        ],
        dumpio: true }
});

const STATE_FILE = 'group_state.json';
const MAX_GROUP_SIZE = 230;
const DAILY_BATCH_SIZE = 1;

// CSV Writer configuration
const csvWriter = createCsvWriter({
    path: 'number_statuses.csv',
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

const server = http.createServer((req, res) => {
    if (req.url === '/number_statuses.csv') {
        // Serve the CSV file
        fs.readFile('number_statuses.csv', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error reading CSV file');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/csv' });
                res.end(data);
            }
        });
    } else if (req.url === '/group_state.json') {
        // Serve the JSON file
        fs.readFile('group_state.json', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error reading JSON file');
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
    }
});


client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('Client is ready!');
    let state = loadState();

    // if (!state) {
    //     state = {
    //         lastProcessedRow: 0,
    //         currentGroupId: null,
    //         currentGroupName: 'عمل 3',
    //         currentGroupCount: 0
    //     };
    //     saveState(state);
    // }

    // async function processDailyBatch() {
    //     try {
    //         const startFrom = state.lastProcessedRow + 1;
    //         const endTo = startFrom + DAILY_BATCH_SIZE - 1;

    //         const numbers = readNumbersFromExcel('numbers.xlsx', startFrom, endTo);
    //         if (numbers.length === 0) {
    //             console.log('All numbers processed.');
    //             return;
    //         }

    //         let currentGroup;
    //         if (state.currentGroupId) {
    //             try {
    //                 currentGroup = await client.getChatById(state.currentGroupId);
    //                 state.currentGroupCount = currentGroup.participants.length;
    //             } catch (error) {
    //                 console.error('Error fetching current group:', error);
    //                 currentGroup = null;
    //             }
    //         }

    //         if (!currentGroup || state.currentGroupCount >= MAX_GROUP_SIZE) {
    //             currentGroup = await createNewGroup(state);
    //             state.currentGroupCount = currentGroup.participants.length;
    //         }

    //         const availableSlots = MAX_GROUP_SIZE - state.currentGroupCount;
    //         const numbersToAdd = Math.min(availableSlots, numbers.length);
    //         const batchFrom = startFrom;
    //         const batchTo = batchFrom + numbersToAdd - 1;

    //         if (numbersToAdd > 0) {
    //             await checkNumberStatuses(currentGroup.id._serialized, currentGroup.name, 'numbers.xlsx', batchFrom, batchTo);
    //             const updatedGroup = await client.getChatById(currentGroup.id._serialized);
    //             state.currentGroupCount = updatedGroup.participants.length;
    //             state.lastProcessedRow = batchTo;
    //             saveState(state);
    //         }

    //         const remainingNumbers = numbers.length - numbersToAdd;
    //         if (remainingNumbers > 0) {
    //             const remainingFrom = batchTo + 1;
    //             const remainingTo = endTo;
    //             const newGroup = await createNewGroup(state);
    //             await checkNumberStatuses(newGroup.id._serialized, newGroup.name, 'numbers.xlsx', remainingFrom, remainingTo);
    //             const updatedNewGroup = await client.getChatById(newGroup.id._serialized);
    //             state.currentGroupCount = updatedNewGroup.participants.length;
    //             state.lastProcessedRow = remainingTo;
    //             saveState(state);
    //         }

    //         console.log(`Processed batch from ${startFrom} to ${endTo}`);
    //     } catch (error) {
    //         console.error('Error processing batch:', error);
    //     } finally {
    //         setTimeout(processDailyBatch,  60 * 60 * 1000);
    //     }
    // }

    // processDailyBatch();
});

client.initialize();

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
    return null;
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Error saving state:', error);
    }
}
async function createNewGroup(state) {
    try {
        // C
    const newGroupName = getNextGroupName(state.currentGroupName);
    const participants = ['967739817442@c.us', '967780341777@c.us', '967714589027@c.us'];
  
    
    const creation = await client.createGroup(newGroupName, participants);
    console.error('Group creation failed:', creation);
    const newGroup = await client.getChatById(creation.gid._serialized);

    // Promote participants using the proper group instance
    await newGroup.promoteParticipants(['967714589027@c.us']);
    
    // Set group settings
    await newGroup.setMessagesAdminsOnly(true);
    await newGroup.setInfoAdminsOnly(true);

    // Update state
    state.currentGroupId = creation.gid._serialized;
    state.currentGroupName = newGroupName;
    state.currentGroupCount = newGroup.participants.length;
    saveState(state);
    
    return newGroup;
} catch (error) {
    console.error('Group creation failed:', error);
    throw error;
}
}

function getNextGroupName(currentName) {
    const match = currentName.match(/عمل (\d+)/);
    if (match) {
        const num = parseInt(match[1], 10) + 1;
        return `عمل ${num}`;
    }
    return 'عمل 3';
}

function readNumbersFromExcel(filePath, from, to) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    if (from < 1 || to > data.length || from > to) {
        throw new Error('Invalid range specified.');
    }
    const numbers = data.slice(from - 1, to).map(row => ({
        phone: `967${row['phone number']}@c.us`,
        name: row['name']
    }));
    return numbers;
}

async function checkNumberStatuses(groupId, groupName, filePath, from, to) {
    const numbers = readNumbersFromExcel(filePath, from, to);
    const groupChat = await client.getChatById(groupId);
    if (!groupChat.isGroup) {
        throw new Error('Invalid group ID provided');
    }

    for (const numberData of numbers) {
        const resultTemplate = {
            phone: numberData.phone,
            name: numberData.name,
            status: '',
            error_code: '',
            message: '',
            is_invite_sent: false
        };

        try {
            const contactId = await client.getNumberId(numberData.phone);
            if (!contactId) {
                await csvWriter.writeRecords([{ ...resultTemplate, status: 'UNREGISTERED', error_code: '404', message: 'Not registered on WhatsApp' }]);
                continue;
            }

            const addResult = await groupChat.addParticipants([numberData.phone], { autoSendInviteV4: false });
            const participantResult = addResult[numberData.phone];
            let resultEntry;

            if (participantResult.code === 200) {
                resultEntry = { ...resultTemplate, status: 'VALID', error_code: '200', message: 'Successfully added' };
            } else if (participantResult.code === 403) {
                resultEntry = { ...resultTemplate, status: 'PRIVATE_INVITE_ONLY', error_code: '403', message: participantResult.message, is_invite_sent: participantResult.isInviteV4Sent };
                if (participantResult.isInviteV4Sent) {
                    await groupChat.sendInvite(numberData.phone);
                }
            } else {
                resultEntry = { ...resultTemplate, status: 'UNKNOWN_ERROR', error_code: participantResult.code, message: participantResult.message };
            }

            await csvWriter.writeRecords([resultEntry]);
        } catch (error) {
            await csvWriter.writeRecords([{ ...resultTemplate, status: 'UNKNOWN_ERROR', error_code: '500', message: error.message }]);
        }
    }
}
server.listen(8000, () => {
    console.log('File server running at http://localhost:8000');
    console.log('Access files at:');
    console.log('- http://localhost:8000/number_statuses.csv');
    console.log('- http://localhost:8000/group_state.json');
});