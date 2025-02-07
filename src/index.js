const http = require('http');
const CONFIG = require('./config');
const routes = require('./routes');
const { accounts } = require('./shared');
const fs = require('fs');
const server = http.createServer((req, res) => {
    routes(req, res);
});

// Initialize session directory
if (!fs.existsSync(CONFIG.SESSION_DIR)) {
    fs.mkdirSync(CONFIG.SESSION_DIR, { recursive: true });
}

server.listen(CONFIG.PORT, () => {
    console.log(`Server running on http://localhost:${CONFIG.PORT}`);
});