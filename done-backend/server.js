const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Connection, Request } = require('tedious');
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

    params.forEach((param, index) => {
      request.addParameter(`param${index}`, param.type, param.value);
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

app.get('/', (req, res) => {
  res.send('✅ Tedious-Backend läuft!');
});

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.get('/project', (req, res) => {
  executeQuery('SELECT * FROM p_project', [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo', (req, res) => {
  executeQuery('SELECT * FROM t_todo', [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/project/:nr', (req, res) => {
  executeQuery('SELECT p_titel, p_t_todos, p_color FROM p_project WHERE p_id = ?', [req.params.nr], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data[0]);
  });
});

app.get('/project/:nr/todo', (req, res) => {
  executeQuery('SELECT t_id, t_titel, t_description, t_done, t_reminder, t_beginning, t_ending, t_pr_priority FROM t_todo WHERE p_project_p_id = ?', [req.params.nr], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/project/:pnr/todo/:tnr', (req, res) => {
  executeQuery('SELECT t_titel, t_description, t_done, t_reminder, t_beginning, t_ending, t_pr_priority, p_project_p_id FROM t_todo WHERE p_project_p_id = ? AND t_id = ?', [req.params.pnr, req.params.tnr], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data[0]);
  });
});

app.get('/todo/:id', (req, res) => {
  executeQuery('SELECT * FROM t_todo WHERE t_id = ?', [req.params.id], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data[0]);
  });
});

app.post('/project', (req, res) => {
  const { titel, color } = req.body;
  executeQuery('INSERT INTO p_project (p_titel, p_t_todos, p_color) VALUES (?, 0, ?)', [titel, color], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Project created', titel, color });
  });
});

app.post('/todo', (req, res) => {
  const { titel, description, reminder, ending, priority, projectId } = req.body;
  const beginning = new Date().toISOString();
  executeQuery('INSERT INTO t_todo (t_titel, t_description, t_reminder, t_beginning, t_ending, t_pr_priority, t_done, p_project_p_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)', 
  [titel, description, reminder, beginning, ending, priority, projectId], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Todo created', titel, description, reminder, beginning, ending, priority, projectId });
  });
});

app.put('/todo/:id', (req, res) => {
  const { projectId, titel, description, reminder, beginning, ending, priority, done } = req.body;
  executeQuery('UPDATE t_todo SET p_project_p_id = ?, t_titel = ?, t_description = ?, t_reminder = ?, t_beginning = ?, t_ending = ?, t_pr_priority = ?, t_done = ? WHERE t_id = ?', 
  [projectId, titel, description, reminder, beginning, ending, priority, done, req.params.id], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Todo updated' });
  });
});

app.put('/project/:pnr', (req, res) => {
  const { titel, color } = req.body;
  executeQuery('UPDATE p_project SET p_titel = ?, p_color = ? WHERE p_id = ?', [titel, color, req.params.pnr], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Project updated' });
  });
});

app.delete('/todo/:id', (req, res) => {
  executeQuery('DELETE FROM t_todo WHERE t_id = ?', [req.params.id], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Todo deleted' });
  });
});

app.delete('/project/:pnr', (req, res) => {
  executeQuery('DELETE FROM p_project WHERE p_id = ?', [req.params.pnr], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Project deleted' });
  });
});

app.delete('/project/:pnr/todo', (req, res) => {
  executeQuery('DELETE FROM t_todo WHERE p_project_p_id = ?', [req.params.pnr], (err, data) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Todos deleted' });
  });
});

app.get('/todo/ending/:date', (req, res) => {
  executeQuery('SELECT * FROM t_todo WHERE t_ending = ?', [req.params.date], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo/date/:date', (req, res) => {
  const date = req.params.date;
  const startDate = `${date}00:00:00`;
  const endDate = `${date}23:59:59`;
  executeQuery('SELECT * FROM t_todo WHERE t_ending >= ? AND t_ending <= ?', [startDate, endDate], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo/filter', (req, res) => {
  const { start, end, priority } = req.query;
  let sql = 'SELECT * FROM t_todo WHERE 1=1';
  const params = [];
  if (start) {
    sql += ' AND t_ending >= ?';
    params.push(start);
  }
  if (end) {
    sql += ' AND t_ending <= ?';
    params.push(end);
  }
  if (priority) {
    sql += ' AND t_pr_priority = ?';
    params.push(priority);
  }
  executeQuery(sql, params, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo/filter/done', (req, res) => {
  executeQuery('SELECT * FROM t_todo WHERE t_done = 1', [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo/search/:search', (req, res) => {
  const search = `%${req.params.search}%`;
  executeQuery('SELECT * FROM t_todo WHERE t_titel LIKE ?', [search], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.listen(port, () => {
  console.log(`🚀 Server läuft auf Port ${port}`);
});
