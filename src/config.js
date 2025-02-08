const path = require('path');

module.exports = {
    PORT: 8081,
    MAX_GROUP_SIZE: 230,
    DAILY_BATCH_SIZE: 1,
    EXCEL_FILE: 'src/numbers.xlsx',
    BASE_GROUP_NAME: 'عمل',
    STATE_FILE: 'src/shared_state.json',
    CSV_FILE: 'src/shared_statuses.csv',
    SESSION_DIR: path.join(__dirname, 'sessions'),
    STATE_REFRESH_INTERVAL: 5000
};