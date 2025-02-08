const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const xlsx = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const client = new Client({
    authStrategy: new LocalAuth()
});
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});


client.on('ready', async () => {
    console.log('Client is ready!');
   
});

client.initialize();



function readNumbersFromExcel(filePath, from, to) {
    // Load the Excel file
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






client.on('message', async (message) => {

    if (message.body.startsWith('!addtogroup')) {
        const args = message.body.split(' ');

        if (args.length < 4) {
            message.reply('Usage: !addtogroup <group_name> <from> <to>');
            return;
        }


        const groupName = args.slice(1, args.length - 2).join(' ');
        const from = parseInt(args[args.length - 2], 10);
        const to = parseInt(args[args.length - 1], 10);

        try {

            const groupId = await getGroupIdByName(groupName);
            if (!groupId) {
                console.log(`Group with name "${groupName}" not found.`);
                message.reply(`Group with name "${groupName}" not found.`);
                return;
            }


            const participants = readNumbersFromExcel('numbers.xlsx', from, to);
            console.log('Participants:', participants);
            await checkNumberStatuses(
                groupId,
                groupName,
                'numbers.xlsx',
                from,
                to
            );
   
            // Notify the user
            message.reply(`Participants from row ${from} to ${to} added to group "${groupName}" successfully!`);
        } catch (error) {
            console.error('Error:', error);
            message.reply(`Failed to add participants: ${error.message}`);
        }
    }
});


async function getGroupIdByName(groupName) {

    const chats = await client.getChats();

    const groups = chats.filter(chat => chat.isGroup);
    console.log('Available groups and their IDs:');
    groups.forEach(group => {
        console.log(`Name: ${group.name}, ID: ${group.gid}`);
    });

    // Get all chats (groups included)
    // const chats = await client.getChats();

    const groupNamesAndIds = chats
        .map(group => ({ name: group.name.trim(), id: group.id._serialized })); // Get name and id for each group

    const normalizedGroupName = groupName.trim().toLowerCase();
    console.log('Available groups and their IDs:');
    groupNamesAndIds.forEach(group => {
        console.log(`Name: ${group.name}, ID: ${group.id}`);
    });
    // Find the group by normalized name
    const group = chats.find(chat => chat.isGroup && chat.name.trim().toLowerCase() === normalizedGroupName);

    // Return group ID if found, else null
    return group ? group.id._serialized : null;
}







client.on('message', async (message) => {
    if (message.body.startsWith('!creategroup')) {
        const args = message.body.split(' ');
        if (args.length < 2) {
            message.reply('Usage: !creategroup <group_name>');
            return;
        }

        const groupName = args.slice(1).join(' ');
        const participants = ['967739817442@c.us', '967780341777@c.us', '967714589027@c.us'];

        try {
            // Create the group
            const group = await client.createGroup(groupName, participants);
            message.reply(`Group "${groupName}" created with ID: ${group.gid._serialized}`);

            // Promote the user to admin
            await group.promoteParticipants(['967739817442@c.us']);
            message.reply('User 967739817442@c.us has been promoted to admin.');

            // Restrict sending messages to admins only
            await group.setMessagesAdminsOnly(true);
            message.reply('Group settings updated: Only admins can send messages.');

            // Restrict editing group information to admins only
            await group.setInfoAdminsOnly(true);
            message.reply('Group settings updated: Only admins can edit group information.');

        } catch (error) {
            console.error('Error creating group or updating settings:', error);
            message.reply('Failed to create group or update settings.');
        }
    }
});






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




async function checkNumberStatuses(groupId,groupName, filePath, fromRow, toRow) {
    try {
        const numbers = readNumbersFromExcel(filePath, fromRow, toRow);
        const groupChat = await client.getChatById(groupId);
        
        if (!groupChat.isGroup) {
            throw new Error('Invalid group ID provided');
        }

        const statusCounts = {
            valid: 0,
            private_invite_only: 0,
            unregistered: 0,
            unknown_error: 0
        };

        const totalNumbers = numbers.length;
        let currentIndex = 0;
        
        console.log(`\n🚀 Starting verification of ${totalNumbers} numbers...\n`);
        console.log('══════════════════════════════════════════════════');

        for (const numberData of numbers) {
            currentIndex++;
            const progress = `${currentIndex}/${totalNumbers}`.padEnd(8);
            const numberLog = numberData.phone.padEnd(20);
            
            const resultTemplate = {
                phone: numberData.phone,
                name: numberData.name,
                status: '',
                error_code: '',
                message: '',
                is_invite_sent: false
            };

            try {

                 // NEW: Check if contact exists
            process.stdout.write('🔍 Checking contact status... ');
     

         
                // Check number registration
                process.stdout.write(`📡 ${progress} Checking ${numberLog}... `);
                const contactId = await client.getNumberId(numberData.phone);
                
                if (!contactId) {
                    console.log('❌ UNREGISTERED');
                    await csvWriter.writeRecords([{
                        ...resultTemplate,
                        status: 'UNREGISTERED',
                        error_code: '404',
                        message: 'Not registered on WhatsApp'
                    }]);
                    statusCounts.unregistered++;
                    continue;
                }

                // Attempt group addition
                process.stdout.write('🔍 Testing group addition... ');
                const addResult = await groupChat.addParticipants(
                    [numberData.phone], 
                    { autoSendInviteV4: false }
                );

                const participantResult = addResult[numberData.phone];
                let resultEntry;

                if (participantResult.code === 200) {
                    console.log('✅ VALID');
                    resultEntry = {
                        ...resultTemplate,
                        status: 'VALID',
                        error_code: '200',
                        message: 'Successfully added'
                    };
                    statusCounts.valid++;
                } else if (participantResult.code === 403) {
                    console.log('📨 INVITE REQUIRED');
                    resultEntry = {
                        ...resultTemplate,
                        status: 'PRIVATE_INVITE_ONLY',
                        error_code: '403',
                        message: participantResult.message,
                        is_invite_sent: participantResult.isInviteV4Sent
                    };
                    statusCounts.private_invite_only++;
                    
                    if (participantResult.isInviteV4Sent) {
                        await groupChat.sendInvite(numberData.phone);
                    }
                } else {
                    console.log('⚠️ UNKNOWN ERROR');
                    resultEntry = {
                        ...resultTemplate,
                        status: 'UNKNOWN_ERROR',
                        error_code: participantResult.code,
                        message: participantResult.message
                    };
                    statusCounts.unknown_error++;
                }

                await csvWriter.writeRecords([resultEntry]);

            } catch (error) {
                console.log('🔥 PROCESSING ERROR');
                await csvWriter.writeRecords([{
                    ...resultTemplate,
                    status: 'UNKNOWN_ERROR',
                    error_code: '500',
                    message: error.message
                }]);
                statusCounts.unknown_error++;
            }

            // Progress updates
            if (currentIndex % 10 === 0 || currentIndex === totalNumbers) {
                console.log('\n📊 Current Stats:');
                console.table({
                    'Valid': statusCounts.valid,
                    'Require Invite': statusCounts.private_invite_only,
                    'Unregistered': statusCounts.unregistered,
                    'Errors': statusCounts.unknown_error
                });
                console.log('──────────────────────────────────────────────────');
            }

            // Rate limiting
            if (currentIndex < totalNumbers) {
                process.stdout.write('⏳ Next check in: ');
                for (let i = 2; i > 0; i--) {
                    process.stdout.write(`${i}... `);
                    await new Promise(resolve => setTimeout(resolve, 9000));
                }
                console.log('\n');
            }
        }

        console.log('\n🎉 Verification Complete!');
        console.log('══════════════════════════════════════════════════');
        console.log('📋 Final Results:');
        console.table({
            'Total Numbers': totalNumbers,
            'Successfully Added': statusCounts.valid,
            'Invites Sent': statusCounts.private_invite_only,
            'Unregistered': statusCounts.unregistered,
            'Errors': statusCounts.unknown_error
        });

        return {
            total: totalNumbers,
            ...statusCounts,
            csv_path: 'number_statuses.csv'
        };

    } catch (error) {
        console.error('\n🔥 Critical Error:', error);
        return {
            error: error.message
        };
    }
}

async function addParticipantsInBatches(groupId, participants, batchSize = 5, delay = 60000) {
    try {
        const groupChat = await client.getChatById(groupId);
        if (!groupChat.isGroup) {
            throw new Error('The provided ID is not a group chat.');
        }

        // Convert to WhatsApp IDs and validate format
        const participantIds = participants.map(p => {
            const formatted = p.phone.replace(/[^\d]/g, ''); // Remove non-numeric chars
            return formatted.endsWith('@c.us') ? formatted : `${formatted}@c.us`;
        });

        let successCount = 0;
        let inviteSentCount = 0;
        let failedNumbers = [];

        for (let i = 0; i < participantIds.length; i += batchSize) {
            const batch = participantIds.slice(i, i + batchSize);
            
            try {
                const results = await groupChat.addParticipants(batch, {   autoSendInviteV4:false,
                    comment:''});
                
                // Parse results
                batch.forEach((phone, index) => {
                    const result = results[phone];
                    
                    if (result.code === 200) {
                        successCount++;
                        console.log(`✅ Added ${phone}`);
                    } else if (result.isInviteV4Sent) {
                        inviteSentCount++;
                        console.log(`📨 Invite sent to ${phone}`);
                    } else {
                        failedNumbers.push({
                            phone,
                            code: result.code,
                            message: result.message
                        });
                        console.log(`❌ Failed ${phone}: ${result.message}`);
                    }
                });

                // Progress summary
                console.log(`
                    Batch ${Math.ceil(i/batchSize) + 1} Complete:
                    - Successfully added: ${successCount}
                    - Invites sent: ${inviteSentCount}
                    - Total failures: ${failedNumbers.length}
                `);

                // Delay between batches
                if (i + batchSize < participantIds.length) {
                    console.log(`⏳ Waiting ${delay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (batchError) {
                console.error('Batch error:', batchError);
                failedNumbers.push(...batch.map(phone => ({
                    phone,
                    code: 'BATCH_ERROR',
                    message: batchError.message
                })));
            }
        }

        // Final report
        console.log(`
            🎉 Final Results:
            Total participants: ${participantIds.length}
            Successfully added: ${successCount}
            Invites sent: ${inviteSentCount}
            Failed attempts: ${failedNumbers.length}
            
            ⚠️ Failed numbers:
            ${failedNumbers.map(f => `${f.phone} (${f.code}: ${f.message})`).join('\n')}
        `);

        return {
            successCount,
            inviteSentCount,
            failedNumbers
        };

    } catch (error) {
        console.error('Critical error:', error);
        return {
            error: error.message
        };
    }
}