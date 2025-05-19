const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Connection, Request, TYPES } = require('tedious');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const config = {
  server: "doneserver.database.windows.net",
  authentication: {
    type: "default",
    options: {
      userName: "HOR220164",
      password: "Schu1e!noetig?"
    }
  },
  options: {
    database: "doneDB_20250408",
    encrypt: true
  }
};

function executeQuery(sql, params = [], callback) {
  const connection = new Connection(config);
  const results = [];

  connection.on('connect', err => {
    if (err) return callback(err);

    const request = new Request(sql, (err) => {
      if (err) return callback(err);
    });

    params.forEach(param => {
      request.addParameter(param.name, param.type, param.value);
    });

    request.on('row', columns => {
      const row = {};
      columns.forEach(col => {
        row[col.metadata.colName] = col.value;
      });
      results.push(row);
    });

    request.on('requestCompleted', () => {
      connection.close();
      callback(null, results);
    });

    connection.execSql(request);
  });

  connection.connect();
}

// Basic endpoints
app.get('/', (req, res) => {
  res.send('✅ Tedious-Backend läuft!');
});

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello World!' });
});

// Project endpoints
app.get('/project', (req, res) => {
  executeQuery('SELECT * FROM p_project', [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/project/:nr', (req, res) => {
  const sql = 'SELECT p_titel, p_t_todos, p_color FROM p_project WHERE p_id = @param0';
  const params = [{
    name: 'param0',
    type: TYPES.Int,
    value: parseInt(req.params.nr)
  }];
  
  executeQuery(sql, params, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data[0] || {});
  });
});

app.get('/project/:nr/todo', (req, res) => {
  const sql = 'SELECT t_id, t_titel, t_description, t_done, t_reminder, t_beginning, t_ending, t_pr_priority FROM t_todo WHERE p_project_p_id = @param0';
  const params = [{
    name: 'param0',
    type: TYPES.Int,
    value: parseInt(req.params.nr)
  }];
  
  executeQuery(sql, params, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// Todo endpoints
app.get('/todo', (req, res) => {
  executeQuery('SELECT * FROM t_todo', [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo/:id', (req, res) => {
  const sql = 'SELECT * FROM t_todo WHERE t_id = @param0';
  const params = [{
    name: 'param0',
    type: TYPES.Int,
    value: parseInt(req.params.id)
  }];
  
  executeQuery(sql, params, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data[0] || {});
  });
});

// CRUD Operations
app.post('/project', (req, res) => {
  const { titel, color } = req.body;
  const sql = 'INSERT INTO p_project (p_titel, p_t_todos, p_color) VALUES (@param0, 0, @param1)';
  const params = [
    { name: 'param0', type: TYPES.NVarChar, value: titel },
    { name: 'param1', type: TYPES.NVarChar, value: color }
  ];
  
  executeQuery(sql, params, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Project created', titel, color });
  });
});

app.post('/todo', (req, res) => {
  const { titel, description, reminder, ending, priority, projectId } = req.body;
  const beginning = new Date().toISOString();
  const sql = `INSERT INTO t_todo (t_titel, t_description, t_reminder, t_beginning, t_ending, t_pr_priority, t_done, p_project_p_id) 
               VALUES (@param0, @param1, @param2, @param3, @param4, @param5, 0, @param6)`;
  const params = [
    { name: 'param0', type: TYPES.NVarChar, value: titel },
    { name: 'param1', type: TYPES.NVarChar, value: description },
    { name: 'param2', type: TYPES.DateTime, value: reminder },
    { name: 'param3', type: TYPES.DateTime, value: beginning },
    { name: 'param4', type: TYPES.DateTime, value: ending },
    { name: 'param5', type: TYPES.Int, value: priority },
    { name: 'param6', type: TYPES.Int, value: projectId }
  ];
  
  executeQuery(sql, params, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Todo created', titel, description });
  });
});

// Update and Delete endpoints
app.put('/todo/:id', (req, res) => {
  const { projectId, titel, description, reminder, beginning, ending, priority, done } = req.body;
  const sql = `UPDATE t_todo SET 
               p_project_p_id = @param0, 
               t_titel = @param1, 
               t_description = @param2, 
               t_reminder = @param3, 
               t_beginning = @param4, 
               t_ending = @param5, 
               t_pr_priority = @param6, 
               t_done = @param7 
               WHERE t_id = @param8`;
  const params = [
    { name: 'param0', type: TYPES.Int, value: projectId },
    { name: 'param1', type: TYPES.NVarChar, value: titel },
    { name: 'param2', type: TYPES.NVarChar, value: description },
    { name: 'param3', type: TYPES.DateTime, value: reminder },
    { name: 'param4', type: TYPES.DateTime, value: beginning },
    { name: 'param5', type: TYPES.DateTime, value: ending },
    { name: 'param6', type: TYPES.Int, value: priority },
    { name: 'param7', type: TYPES.Bit, value: done },
    { name: 'param8', type: TYPES.Int, value: parseInt(req.params.id) }
  ];
  
  executeQuery(sql, params, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Todo updated' });
  });
});

// ... (Other endpoints follow the same pattern with parameter definitions)

app.listen(port, () => {
  console.log(`🚀 Server läuft auf Port ${port}`);
});
