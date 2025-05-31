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
  server: process.env.DB_SERVER,
  authentication: {
    type: "default",
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    database: process.env.DB_NAME,
    encrypt: true,
    port: 1433, // Explicit port for Azure SQL
    trustServerCertificate: false, // Should be false in production
    connectTimeout: 30000, // 30 seconds timeout
    requestTimeout: 30000  // 30 seconds timeout
  }
};

function executeQuery(sql, parameters = [], callback) {
  const connection = new Connection(config);
  const results = [];
  let callbackInvoked = false;

  // Safe callback wrapper
  const safeCallback = (err, data) => {
    if (callbackInvoked) return;
    callbackInvoked = true;
    try {
      callback(err, data);
    } finally {
      connection.close();
    }
  };

  connection.on('connect', err => {
    if (err) return safeCallback(err);
    
    const request = new Request(sql, err => {
      if (err) safeCallback(err);
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
      safeCallback(null, results);
    });

    request.on('error', err => {
      safeCallback(err);
    });

    connection.execSql(request);
  });

  connection.on('error', err => {
    safeCallback(err);
  });

  connection.connect();
}

// User Routess
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



app.get('/project/:id/user/:user', (req, res) => {
  executeQuery(
    `SELECT * FROM p_project WHERE p_id = @id AND t_user = @user`,
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

app.post('/project/:user', (req, res) => {
  const { user } = req.params;
  const { title, color } = req.body;
  let responded = false;

  // First verify user exists
  executeQuery(
    `SELECT 1 FROM u_user WHERE u_username = @user`,
    [{ name: 'user', type: TYPES.VarChar, value: user }],
    (err, userExists) => {
      if (responded) return;
      if (err) {
        responded = true;
        return res.status(500).json({ error: err.message });
      }
      if (userExists.length === 0) {
        responded = true;
        return res.status(400).json({ error: 'User does not exist' });
      }

      // Create project
      executeQuery(
        `INSERT INTO p_project (p_title, p_color, t_user) 
         OUTPUT INSERTED.p_id
         VALUES (@title, @color, @user)`,
        [
          { name: 'title', type: TYPES.VarChar, value: title },
          { name: 'color', type: TYPES.VarChar, value: color },
          { name: 'user', type: TYPES.VarChar, value: user }
        ],
        (err, data) => {
          if (responded) return;
          responded = true;
          
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          // Check if data is valid
          if (!data || !data.length || !data[0].p_id) {
            return res.status(500).json({ 
              error: 'Failed to create project or retrieve project ID' 
            });
          }
          
          res.status(201).json({ projectId: data[0].p_id });
        }
      );
    }
  );
});

// GET - Get all projects for a user
app.get('/projects/:user', (req, res) => {
  executeQuery(
    `SELECT * FROM p_project WHERE t_user = @user`,
    [{ name: 'user', type: TYPES.VarChar, value: req.params.user }],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

app.delete('/project/:id/user/:user', (req, res) => {
  executeQuery(
    `DELETE FROM p_project 
     WHERE p_id = @id AND t_user = @user`,
    [
      { name: 'id', type: TYPES.Int, value: req.params.id },
      { name: 'user', type: TYPES.VarChar, value: req.params.user }
    ],
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
  const { title, description, projectId, priority, ending, reminder } = req.body;

  executeQuery(
    `INSERT INTO t_todo (
      t_title, t_description, t_user, p_project_p_id, 
      t_pr_priority, t_done, t_beginning, t_ending, t_reminder
    ) VALUES (
      @title, @description, @user, @projectId, 
      @priority, 0, GETDATE(), @ending, @reminder
    )`,
    [
      { name: 'title', type: TYPES.VarChar, value: title },
      { name: 'description', type: TYPES.VarChar, value: description },
      { name: 'user', type: TYPES.VarChar, value: user },
      { name: 'projectId', type: TYPES.Int, value: projectId },
      { name: 'priority', type: TYPES.Int, value: priority },
      { name: 'ending', type: TYPES.DateTime, value: ending || null },
      { name: 'reminder', type: TYPES.DateTime, value: reminder || null }
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

// PUT - Update a project (full update)
app.put('/project/:id/user/:user', (req, res) => {
  const { id, user } = req.params;
  const { title, color } = req.body;

  if (!title && !color) {
    return res.status(400).json({ error: 'Title or color required for update' });
  }

  // Verify user exists
  executeQuery(
    `SELECT 1 FROM u_user WHERE u_username = @user`,
    [{ name: 'user', type: TYPES.VarChar, value: user }],
    (err, userExists) => {
      if (err) return res.status(500).json({ error: err.message });
      if (userExists.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Build dynamic update query
      let updateFields = [];
      let params = [
        { name: 'id', type: TYPES.Int, value: id },
        { name: 'user', type: TYPES.VarChar, value: user }
      ];

      if (title) {
        updateFields.push('p_title = @title');
        params.push({ name: 'title', type: TYPES.VarChar, value: title });
      }
      
      if (color) {
        updateFields.push('p_color = @color');
        params.push({ name: 'color', type: TYPES.VarChar, value: color });
      }

      const sql = `
        UPDATE p_project 
        SET ${updateFields.join(', ')} 
        WHERE p_id = @id AND t_user = @user
      `;

      executeQuery(sql, params, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (data.affectedRows === 0) {
          return res.status(404).json({ 
            error: 'Project not found or user mismatch' 
          });
        }
        
        res.json({ message: 'Project updated successfully' });
      });
    }
  );
});
app.put('/todo/:id/user/:user', (req, res) => {
  const { id, user } = req.params;
  const { title, description, reminder, beginning, ending, priority, done } = req.body;
  let responded = false;

  // Validate required fields
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  executeQuery(
    `UPDATE t_todo SET
      t_title = @title,
      t_description = @description,
      t_reminder = @reminder,
      t_beginning = @beginning,
      t_ending = @ending,
      t_pr_priority = @priority,
      t_done = @done
     WHERE t_id = @id AND t_user = @user`,
    [
      { name: 'title', type: TYPES.VarChar, value: title },
      { name: 'description', type: TYPES.VarChar, value: description },
      { name: 'reminder', type: TYPES.DateTime, value: reminder || null },
      { name: 'beginning', type: TYPES.DateTime, value: beginning },
      { name: 'ending', type: TYPES.DateTime, value: ending || null },
      { name: 'priority', type: TYPES.Int, value: priority },
      { name: 'done', type: TYPES.Bit, value: done ? 1 : 0 },
      { name: 'id', type: TYPES.Int, value: id },
      { name: 'user', type: TYPES.VarChar, value: user }
    ],
    (err) => {
      if (responded) return;
      responded = true;
      
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ message: 'Todo updated' });
    }
  );
});

app.delete('/todo/:id/user/:user', (req, res) => {
  executeQuery(
    `DELETE FROM t_todo WHERE t_id = @id AND t_user = @user`,
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

// Add these routes after your existing routes

// GET - Get all users
app.get('/users', (req, res) => {
  executeQuery(
    `SELECT * FROM u_user`,
    [],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

// GET - Get all priorities
app.get('/priorities', (req, res) => {
  executeQuery(
    `SELECT * FROM pr_priority`,
    [],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

// Add this with your other todo routes
app.get('/project/:projectId/todos', (req, res) => {
  executeQuery(
    `SELECT t.*, pr.pr_name as priority_name 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE p_project_p_id = @projectId`,
    [
      { name: 'projectId', type: TYPES.Int, value: req.params.projectId }
    ],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

// Add this with your other todo routes
app.get('/todo/filter', (req, res) => {
  const { start, end, priority, user } = req.query;
  let sql = `SELECT t.*, pr.pr_name as priority_name 
             FROM t_todo t
             JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
             WHERE 1=1`;
  const params = [];

  if (start) {
    sql += ' AND t_ending >= @start';
    params.push({ name: 'start', type: TYPES.DateTime, value: start });
  }
  if (end) {
    sql += ' AND t_ending <= @end';
    params.push({ name: 'end', type: TYPES.DateTime, value: end });
  }
  if (priority) {
    sql += ' AND t.t_pr_priority = @priority';
    params.push({ name: 'priority', type: TYPES.Int, value: priority });
  }

  executeQuery(sql, params, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/todo/date/:date', (req, res) => {
  const date = req.params.date;
  const user = req.query.user; 
  
  if (!user) {
    return res.status(400).json({ error: 'User parameter is required' });
  }

  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;
  
  executeQuery(
    `SELECT t.*, pr.pr_name as priority_name 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE t.t_user = @user 
       AND t.t_ending >= @startDate 
       AND t.t_ending <= @endDate`,
    [
      { name: 'user', type: TYPES.VarChar, value: user },
      { name: 'startDate', type: TYPES.DateTime, value: startDate },
      { name: 'endDate', type: TYPES.DateTime, value: endDate }
    ],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

app.get('/todo/filter/done', (req, res) => {
  const user = req.query.user;
  
  if (!user) {
    return res.status(400).json({ error: 'User parameter is required' });
  }

  executeQuery(
    `SELECT t.*, pr.pr_name as priority_name 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE t.t_user = @user AND t.t_done = 1`,
    [
      { name: 'user', type: TYPES.VarChar, value: user }
    ],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

app.get('/todo/search', (req, res) => {
  const { term, user, searchDescription = 'false' } = req.query;
  let responded = false;
  
  // Validate required parameters
  if (!term || !user) {
    return res.status(400).json({
      error: 'Both "term" and "user" query parameters are required'
    });
  }

  // Prepare search parameters
  const searchTerm = `%${term}%`;
  const searchDesc = searchDescription.toLowerCase() === 'true';
  
  let sql = `
    SELECT t.*, pr.pr_name as priority_name 
    FROM t_todo t
    JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
    WHERE t.t_user = @user
      AND (t.t_title LIKE @term
  `;
  
  // Conditionally add description search
  if (searchDesc) {
    sql += ` OR t.t_description LIKE @term`;
  }
  
  sql += `)`;
  
  executeQuery(
    sql,
    [
      { name: 'user', type: TYPES.VarChar, value: user },
      { name: 'term', type: TYPES.VarChar, value: searchTerm }
    ],
    (err, data) => {
      if (responded) return;
      responded = true;
      
      if (err) {
        console.error('Search error:', err);
        return res.status(500).json({ error: err.message });
      }
      
      res.json(data);
    }
  );
});

// Add before app.listen
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Graceful shutdown
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use((err, req, res, next) => {
  console.error('Global Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`🚀 Server läuft auf Port ${port}`);
});