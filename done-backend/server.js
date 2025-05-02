const express = require('express');
const odbc = require('odbc');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let db;
(async () => {
    try {
        db = await odbc.connect(process.env.CONN_STRING);
        console.log('✅ Connected to Azure SQL via ODBC');
    } catch (err) {
        console.error('❌ Connection error:', err.message);
    }
})();

app.use((req, res, next) => {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    next();
});

app.get('/', (req, res) => {
    res.send('✅ Backend läuft!');
});

app.get('/project', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM p_project');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/todo', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM t_todo');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server läuft auf Port ${port}`);
});

process.on('SIGINT', async () => {
    if (db) {
        await db.close();
        console.log('🔒 Verbindung zur DB geschlossen');
    }
    process.exit(0);
});
