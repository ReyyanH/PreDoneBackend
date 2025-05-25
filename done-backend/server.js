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

function executeQuery(sql, parameters = [], callback) {
  const connection = new Connection(config);
  const results = [];

  connection.on('connect', err => {
    if (err) return callback(err);

    const request = new Request(sql, (err) => {
      if (err) return callback(err);
    });

    parameters.forEach(param => {
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

// User Routes
app.post('/user', (req, res) => {
  const { username, password } = req.body;
  executeQuery(
    `INSERT INTO u_user (u_username, u_password) VALUES (@username, @password)`,
    [
      { name: 'username', type: TYPES.VarChar, value: username },
      { name: 'password', type: TYPES.VarChar, value: password }
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'User created' });
    }
  );
});

app.get('/users', (req, res) => {
  executeQuery("SELECT u_username, u_password FROM u_user", (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/projects/:user', (req, res) => {
  executeQuery(
    `SELECT p.* FROM p_project p
     JOIN t_todo t ON p.p_id = t.p_project_p_id
     WHERE t.t_user = @user
     GROUP BY p.p_id, p.p_titel, p.p_color`,
    [{ name: 'user', type: TYPES.VarChar, value: req.params.user }],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

app.get('/project/:id/user/:user', (req, res) => {
  executeQuery(
    `SELECT p.* FROM p_project p
     JOIN t_todo t ON p.p_id = t.p_project_p_id
     WHERE p.p_id = @id AND t.t_user = @user`,
    [
      { name: 'id', type: TYPES.Int, value: req.params.id },
      { name: 'user', type: TYPES.VarChar, value: req.params.user }
    ],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      data.length ? res.json(data[0]) : res.status(404).json({ error: 'Project not found' });
    }
  );
});

app.post('/project', (req, res) => {
  const { title, color } = req.body;
  executeQuery(
    `INSERT INTO p_project (p_titel, p_color) OUTPUT INSERTED.p_id VALUES (@title, @color)`,
    [
      { name: 'title', type: TYPES.VarChar, value: title },
      { name: 'color', type: TYPES.VarChar, value: color }
    ],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ projectId: data[0].p_id });
    }
  );
});

app.delete('/project/:id', (req, res) => {
  executeQuery(
    `DELETE FROM p_project WHERE p_id = @id`,
    [{ name: 'id', type: TYPES.Int, value: req.params.id }],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Project deleted' });
    }
  );
});

app.get('/todo/:id/user/:user', (req, res) => {
  executeQuery(
    `SELECT t.*, pr.pr_name as priority_name 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE t.t_id = @id AND t.t_user = @user`,
    [
      { name: 'id', type: TYPES.Int, value: req.params.id },
      { name: 'user', type: TYPES.VarChar, value: req.params.user }
    ],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      data.length ? res.json(data[0]) : res.status(404).json({ error: 'Todo not found' });
    }
  );
});

// POST - Create todo for specific user
app.post('/todo/:user', (req, res) => {
  const { user } = req.params;
  const { title, description, projectId, priority } = req.body;

  executeQuery(
    `INSERT INTO t_todo (t_titel, t_description, t_user, p_project_p_id, t_pr_priority, t_done, t_beginning)
     VALUES (@title, @description, @user, @projectId, @priority, 0, GETDATE())`,
    [
      { name: 'title', type: TYPES.VarChar, value: title },
      { name: 'description', type: TYPES.VarChar, value: description },
      { name: 'user', type: TYPES.VarChar, value: user },
      { name: 'projectId', type: TYPES.Int, value: projectId },
      { name: 'priority', type: TYPES.Int, value: priority }
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Todo created' });
    }
  );
});

// GET - Get all todos for a user
app.get('/todos/:user', (req, res) => {
  executeQuery(
    `SELECT t.*, pr.pr_name as priority_name 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE t.t_user = @user`,
    [{ name: 'user', type: TYPES.VarChar, value: req.params.user }],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

// DELETE - Delete a todo for specific user
app.delete('/todo/:id/:user', (req, res) => {
  executeQuery(
    `DELETE FROM t_todo WHERE t_id = @id AND t_user = @user`,
    [
      { name: 'id', type: TYPES.Int, value: req.params.id },
      { name: 'user', type: TYPES.VarChar, value: req.params.user }
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Todo deleted' });
    }
  );
});

app.put('/todo/:id', (req, res) => {
  const { title, description, reminder, beginning, ending, priority, done } = req.body;
  executeQuery(
    `UPDATE t_todo SET
      t_titel = @title,
      t_description = @description,
      t_reminder = @reminder,
      t_beginning = @beginning,
      t_ending = @ending,
      t_pr_priority = @priority,
      t_done = @done
     WHERE t_id = @id`,
    [
      { name: 'title', type: TYPES.VarChar, value: title },
      { name: 'description', type: TYPES.VarChar, value: description },
      { name: 'reminder', type: TYPES.DateTime, value: reminder },
      { name: 'beginning', type: TYPES.DateTime, value: beginning },
      { name: 'ending', type: TYPES.DateTime, value: ending },
      { name: 'priority', type: TYPES.Int, value: priority },
      { name: 'done', type: TYPES.Int, value: done },
      { name: 'id', type: TYPES.Int, value: req.params.id }
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Todo updated' });
    }
  );
});

app.delete('/todo/:id', (req, res) => {
  executeQuery(
    `DELETE FROM t_todo WHERE t_id = @id`,
    [{ name: 'id', type: TYPES.Int, value: req.params.id }],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Todo deleted' });
    }
  );
});

// Additional Existing Routes
app.get('/', (req, res) => {
  res.send('✅ Enhanced Backend läuft!');
});

app.get('/priorities', (req, res) => {
  executeQuery("SELECT * FROM pr_priority", (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.listen(port, () => {
  console.log(`🚀 Server läuft auf Port ${port}`);
});