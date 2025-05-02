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

function executeQuery(sql, callback) {
  const connection = new Connection(config);
  const results = [];

  connection.on('connect', err => {
    if (err) return callback(err);

    const request = new Request(sql, (err) => {
      if (err) return callback(err);
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

app.get('/project', (req, res) => {
  executeQuery("SELECT * FROM p_project", (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo', (req, res) => {
  executeQuery("SELECT * FROM t_todo", (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.listen(port, () => {
  console.log(`🚀 Server läuft auf Port ${port}`);
});
