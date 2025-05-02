const express = require('express');
const app = express();
const port = 3000;
const { Connection, Request } = require('tedious');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

// Enable CORS
app.use(cors());
app.use(bodyParser.json());

// Azure SQL Connection Configuration
const config = {
    server: 'doneserver.database.windows.net', // Dein Azure SQL Servername
    authentication: {
        type: 'default',
        options: {
            userName: 'HOR220164', // Dein Azure SQL Benutzernamen
            password: 'Schu1e!noetig?', // Dein Azure SQL Passwort
        }
    },
    options: {
        database: 'doneDB_20250408', // Dein Azure SQL Datenbankname
        encrypt: true, // Aktiviert die Verschlüsselung
        trustServerCertificate: false, // Du kannst es auf true setzen, wenn du selbst das Zertifikat validieren möchtest
    }
};

// Verbindung zu Azure SQL herstellen
let connection = new Connection(config);

connection.on('connect', err => {
    if (err) {
        console.error('Verbindung fehlgeschlagen', err);
    } else {
        console.log('Erfolgreich mit Azure SQL verbunden');
    }
});

// Hilfsfunktion zum Ausführen von Abfragen
function executeQuery(query, params, callback) {
    const request = new Request(query, (err, rowCount, rows) => {
        if (err) {
            return callback(err);
        }
        callback(null, rows);
    });

    params.forEach(param => {
        request.addParameter(param.name, param.type, param.value);
    });

    connection.execSql(request);
}

// Routen
app.get('/hello', (req, res) => {
    res.json({ message: 'Hello World!' });
});

app.get('/project', (req, res) => {
    const query = 'SELECT * FROM p_project'; // Beispielabfrage
    executeQuery(query, [], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(result);
    });
});

app.get('/todo', (req, res) => {
    const query = 'SELECT * FROM t_todo'; // Beispielabfrage
    executeQuery(query, [], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(result);
    });
});

app.get('/project/:nr', (req, res) => {
    const query = 'SELECT p_titel, p_t_todos, p_color FROM p_project WHERE p_id = @id';
    const params = [
        { name: 'id', type: 'Int', value: req.params.nr }
    ];
    executeQuery(query, params, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(result[0]);
    });
});

app.get('/project/:nr/todo', (req, res) => {
    const query = 'SELECT * FROM t_todo WHERE p_project_p_id = @id';
    const params = [
        { name: 'id', type: 'Int', value: req.params.nr }
    ];
    executeQuery(query, params, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(result);
    });
});

app.get('/project/:pnr/todo/:tnr', (req, res) => {
    const query = 'SELECT * FROM t_todo WHERE p_project_p_id = @pnr AND t_id = @tnr';
    const params = [
        { name: 'pnr', type: 'Int', value: req.params.pnr },
        { name: 'tnr', type: 'Int', value: req.params.tnr }
    ];
    executeQuery(query, params, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(result[0]);
    });
});

app.post('/project', (req, res) => {
    const { titel, color } = req.body;
    const query = 'INSERT INTO p_project (p_titel, p_t_todos, p_color) VALUES (@titel, 0, @color)';
    const params = [
        { name: 'titel', type: 'NVarChar', value: titel },
        { name: 'color', type: 'NVarChar', value: color }
    ];
    executeQuery(query, params, (err, result) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        res.json({ message: 'Projekt erstellt', titel, color });
    });
});

app.post('/todo', (req, res) => {
    const { titel, description, reminder, ending, priority, projectId } = req.body;
    const beginning = new Date().toISOString();
    const query = `
        INSERT INTO t_todo (t_titel, t_description, t_reminder, t_beginning, t_ending, t_pr_priority, t_done, p_project_p_id)
        VALUES (@titel, @description, @reminder, @beginning, @ending, @priority, 0, @projectId)`;
    const params = [
        { name: 'titel', type: 'NVarChar', value: titel },
        { name: 'description', type: 'NVarChar', value: description },
        { name: 'reminder', type: 'DateTime', value: reminder },
        { name: 'beginning', type: 'DateTime', value: beginning },
        { name: 'ending', type: 'DateTime', value: ending },
        { name: 'priority', type: 'Int', value: priority },
        { name: 'projectId', type: 'Int', value: projectId }
    ];
    executeQuery(query, params, (err, result) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        res.json({ message: 'Todo erstellt', titel, description, reminder, beginning, ending, priority, projectId });
    });
});

// Ähnlich für andere Routen (PUT, DELETE, etc.)

app.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`);
});
