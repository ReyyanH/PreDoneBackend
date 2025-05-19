const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Connection, Request, TYPES } = require('tedious');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Database configuration
const config = {
  server: "doneserver.database.windows.net",
  authentication: {
    type: "default",
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    database: "doneDB_20250408",
    encrypt: true
  }
};

// Database connection helper
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

// Authentication middleware (basic example)
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });
  
  // Basic auth example (should be enhanced for production)
  const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  executeQuery(
    'SELECT u_username FROM u_user WHERE u_username = @user AND u_password = @pass',
    [
      { name: 'user', type: TYPES.VarChar, value: username },
      { name: 'pass', type: TYPES.VarChar, value: password }
    ],
    (err, data) => {
      if (err || !data.length) return res.status(401).json({ error: 'Invalid credentials' });
      req.user = data[0].u_username;
      next();
    }
  );
});

// Project Endpoints
app.get('/project', (req, res) => {
  executeQuery(
    'SELECT * FROM p_project',
    [],
    (err, data) => err ? res.status(500).json({ error: err.message }) : res.json(data)
  );
});

app.post('/project', (req, res) => {
  const { titel, color } = req.body;
  executeQuery(
    'INSERT INTO p_project (p_titel, p_color) OUTPUT INSERTED.p_id VALUES (@titel, @color)',
    [
      { name: 'titel', type: TYPES.VarChar, value: titel },
      { name: 'color', type: TYPES.VarChar, value: color }
    ],
    (err, data) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ 
        message: 'Project created',
        id: data[0].p_id,
        titel,
        color
      });
    }
  );
});

// Todo Endpoints (now user-scoped)
app.get('/todo', (req, res) => {
  executeQuery(
    `SELECT t.*, pr.pr_name as priority 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE t_user = @user`,
    [
      { name: 'user', type: TYPES.VarChar, value: req.user }
    ],
    (err, data) => err ? res.status(500).json({ error: err.message }) : res.json(data)
  );
});

app.post('/todo', (req, res) => {
  const { titel, description, reminder, ending, priority, projectId } = req.body;
  const beginning = new Date().toISOString();
  
  executeQuery(
    `INSERT INTO t_todo (
      t_titel, t_description, t_reminder, 
      t_beginning, t_ending, t_pr_priority, 
      t_done, p_project_p_id, t_user
    ) OUTPUT INSERTED.t_id 
     VALUES (
       @titel, @desc, @reminder, 
       @begin, @end, @priority, 
       0, @project, @user
     )`,
    [
      { name: 'titel', type: TYPES.VarChar, value: titel },
      { name: 'desc', type: TYPES.VarChar, value: description },
      { name: 'reminder', type: TYPES.DateTime, value: reminder },
      { name: 'begin', type: TYPES.DateTime, value: beginning },
      { name: 'end', type: TYPES.DateTime, value: ending },
      { name: 'priority', type: TYPES.Int, value: priority },
      { name: 'project', type: TYPES.Int, value: projectId },
      { name: 'user', type: TYPES.VarChar, value: req.user }
    ],
    (err, data) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ 
        message: 'Todo created',
        id: data[0].t_id,
        titel,
        beginning
      });
    }
  );
});

// Priority Endpoints
app.get('/priorities', (req, res) => {
  executeQuery(
    'SELECT pr_id as id, pr_name as name FROM pr_priority',
    [],
    (err, data) => err ? res.status(500).json({ error: err.message }) : res.json(data)
  );
});

// User Management Endpoints
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  executeQuery(
    'INSERT INTO u_user (u_username, u_password) VALUES (@user, @pass)',
    [
      { name: 'user', type: TYPES.VarChar, value: username },
      { name: 'pass', type: TYPES.VarChar, value: password }
    ],
    (err) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ message: 'User registered successfully' });
    }
  );
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
