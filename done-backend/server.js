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
    port: 1433,
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 30000
  }
};

// Helper function to get user ID from username
function getUserId(username, callback) {
  const connection = new Connection(config);
  connection.on('connect', err => {
    if (err) return callback(err);
    
    const request = new Request(
      `SELECT u_id FROM u_user WHERE u_username = @username`,
      (err) => {
        if (err) callback(err);
      }
    );
    
    request.addParameter('username', TYPES.VarChar, username);
    
    let userId = null;
    request.on('row', columns => {
      userId = columns[0].value;
    });
    
    request.on('requestCompleted', () => {
      callback(null, userId);
      connection.close();
    });
    
    request.on('error', err => {
      callback(err);
      connection.close();
    });
    
    connection.execSql(request);
  });
  
  connection.on('error', err => {
    callback(err);
  });
  
  connection.connect();
}

function executeQuery(sql, parameters = [], callback) {
  const connection = new Connection(config);
  const results = [];
  let callbackInvoked = false;

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

app.put('/user/:oldUsername', (req, res) => {
  const { oldUsername } = req.params;
  const { newUsername, newPassword } = req.body;
  let responded = false;

  if (!newUsername && !newPassword) {
    return res.status(400).json({
      error: 'At least one field (newUsername or newPassword) is required'
    });
  }

  if (newUsername && newUsername.length < 3) {
    return res.status(400).json({
      error: 'Username must be at least 3 characters'
    });
  }

  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters'
    });
  }

  if (newUsername) {
    executeQuery(
      `SELECT 1 FROM u_user WHERE u_username = @newUsername`,
      [{ name: 'newUsername', type: TYPES.NVarChar, value: newUsername }],
      (err, data) => {
        if (responded) return;
        
        if (err) {
          responded = true;
          return res.status(500).json({ error: err.message });
        }
        
        if (data.length > 0) {
          responded = true;
          return res.status(409).json({ error: 'Username already exists' });
        }
        
        updateUser();
      }
    );
  } else {
    updateUser();
  }

  function updateUser() {
    let sql = `UPDATE u_user SET `;
    const params = [];
    
    if (newUsername && newPassword) {
      sql += `u_username = @newUsername, u_password = @newPassword`;
      params.push(
        { name: 'newUsername', type: TYPES.NVarChar, value: newUsername },
        { name: 'newPassword', type: TYPES.NVarChar, value: newPassword }
      );
    } else if (newUsername) {
      sql += `u_username = @newUsername`;
      params.push({ name: 'newUsername', type: TYPES.NVarChar, value: newUsername });
    } else {
      sql += `u_password = @newPassword`;
      params.push({ name: 'newPassword', type: TYPES.NVarChar, value: newPassword });
    }
    
    sql += ` WHERE u_username = @oldUsername`;
    params.push({ name: 'oldUsername', type: TYPES.NVarChar, value: oldUsername });

    executeQuery(sql, params, (err, result) => {
      if (responded) return;
      responded = true;
      
      if (err) {
        console.error('User update error:', err);
        return res.status(500).json({ error: err.message });
      }
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        message: 'User updated successfully',
        updatedFields: {
          ...(newUsername && { username: newUsername }),
          ...(newPassword && { password: 'updated' })
        }
      });
    });
  }
});

// PROJECT ROUTES
app.get('/project/:id/user/:username', (req, res) => {
  const { id, username } = req.params;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `SELECT * FROM p_project WHERE p_id = @id AND u_user_id = @userId`,
      [
        { name: 'id', type: TYPES.Int, value: id },
        { name: 'userId', type: TYPES.Int, value: userId }
      ],
      (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        data.length ? res.json(data[0]) : res.status(404).json({ error: 'Project not found' });
      }
    );
  });
});

app.post('/project/:username', (req, res) => {
  const { username } = req.params;
  const { title, color } = req.body;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `INSERT INTO p_project (p_title, p_color, u_user_id) 
       OUTPUT INSERTED.p_id
       VALUES (@title, @color, @userId)`,
      [
        { name: 'title', type: TYPES.VarChar, value: title },
        { name: 'color', type: TYPES.VarChar, value: color },
        { name: 'userId', type: TYPES.Int, value: userId }
      ],
      (err, data) => {
        
        if (!data || !data.length || !data[0].p_id) {
          return res.status(500).json({ 
            error: 'Failed to create project or retrieve project ID' 
          });
        }
        
        res.status(201).json({ projectId: data[0].p_id });
      }
    );
  });
});

app.get('/projects/:username', (req, res) => {
  const { username } = req.params;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `SELECT * FROM p_project WHERE u_user_id = @userId`,
      [{ name: 'userId', type: TYPES.Int, value: userId }],
      (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
      }
    );
  });
});

app.delete('/project/:id/user/:username', (req, res) => {
  const { id, username } = req.params;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `DELETE FROM p_project 
       WHERE p_id = @id AND u_user_id = @userId`,
      [
        { name: 'id', type: TYPES.Int, value: id },
        { name: 'userId', type: TYPES.Int, value: userId }
      ],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Project deleted' });
      }
    );
  });
});

app.put('/project/:id/user/:username', (req, res) => {
  const { id, username } = req.params;
  const { title, color } = req.body;

  if (!title && !color) {
    return res.status(400).json({ error: 'Title or color required for update' });
  }

  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });

    let updateFields = [];
    let params = [
      { name: 'id', type: TYPES.Int, value: id },
      { name: 'userId', type: TYPES.Int, value: userId }
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
      WHERE p_id = @id AND u_user_id = @userId
    `;

    executeQuery(sql, params, (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (data.length === 0) {
        return res.status(404).json({ 
          error: 'Project not found or user mismatch' 
        });
      }
      
      res.json({ message: 'Project updated successfully' });
    });
  });
});

// TODO ROUTES
app.get('/todo/:id/user/:username', (req, res) => {
  const { id, username } = req.params;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `SELECT t.*, pr.pr_name as priority_name 
       FROM t_todo t
       JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
       WHERE t.t_id = @id AND t.u_user_id = @userId`,
      [
        { name: 'id', type: TYPES.Int, value: id },
        { name: 'userId', type: TYPES.Int, value: userId }
      ],
      (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        data.length ? res.json(data[0]) : res.status(404).json({ error: 'Todo not found' });
      }
    );
  });
});

app.post('/todo/:username', (req, res) => {
  const { username } = req.params;
  const { title, description, projectId, priority, ending, reminder } = req.body;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `INSERT INTO t_todo (
        t_title, t_description, u_user_id, p_project_p_id, 
        t_pr_priority, t_done, t_beginning, t_ending, t_reminder
      ) VALUES (
        @title, @description, @userId, @projectId, 
        @priority, 0, GETDATE(), @ending, @reminder
      )`,
      [
        { name: 'title', type: TYPES.VarChar, value: title },
        { name: 'description', type: TYPES.VarChar, value: description },
        { name: 'userId', type: TYPES.Int, value: userId },
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
});

app.get('/todos/:username', (req, res) => {
  const { username } = req.params;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `SELECT t.*, pr.pr_name as priority_name 
       FROM t_todo t
       JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
       WHERE t.u_user_id = @userId`,
      [{ name: 'userId', type: TYPES.Int, value: userId }],
      (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
      }
    );
  });
});

app.delete('/todo/:id/:username', (req, res) => {
  const { id, username } = req.params;
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `DELETE FROM t_todo WHERE t_id = @id AND u_user_id = @userId`,
      [
        { name: 'id', type: TYPES.Int, value: id },
        { name: 'userId', type: TYPES.Int, value: userId }
      ],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Todo deleted' });
      }
    );
  });
});

app.put('/todo/:id/user/:username', (req, res) => {
  const { id, username } = req.params;
  const { title, description, reminder, beginning, ending, priority, done, projectId  } = req.body;
  let responded = false;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `UPDATE t_todo SET
        t_titel = @title,
        t_description = @description,
        t_reminder = @reminder,
        t_beginning = @beginning,
        t_ending = @ending,
        t_pr_priority = @priority,
        t_done = @done,
        p_project_p_id = @projectId
       WHERE t_id = @id AND u_user_id = @userId`,
      [
        { name: 'title', type: TYPES.VarChar, value: title },
        { name: 'description', type: TYPES.VarChar, value: description },
        { name: 'reminder', type: TYPES.DateTime, value: reminder || null },
        { name: 'beginning', type: TYPES.DateTime, value: beginning },
        { name: 'ending', type: TYPES.DateTime, value: ending || null },
        { name: 'priority', type: TYPES.Int, value: priority },
        { name: 'done', type: TYPES.Bit, value: done ? 1 : 0 },
        { name: 'projectId', type: TYPES.Int, value: projectId },
        { name: 'id', type: TYPES.Int, value: id },
        { name: 'userId', type: TYPES.Int, value: userId }
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
});
// ADDITIONAL ROUTE
app.get('/users', (req, res) => {
  executeQuery(`SELECT * FROM u_user`, [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/priorities', (req, res) => {
  executeQuery(`SELECT * FROM pr_priority`, [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/project/:projectId/todos', (req, res) => {
  executeQuery(
    `SELECT t.*, pr.pr_name as priority_name 
     FROM t_todo t
     JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
     WHERE p_project_p_id = @projectId`,
    [{ name: 'projectId', type: TYPES.Int, value: req.params.projectId }],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(data);
    }
  );
});

app.get('/todo/filter', (req, res) => {
  const { start, end, priority, user } = req.query;
  
  getUserId(user, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    let sql = `SELECT t.*, pr.pr_name as priority_name 
               FROM t_todo t
               JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
               WHERE t.u_user_id = @userId`;
    const params = [
      { name: 'userId', type: TYPES.Int, value: userId }
    ];

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
});

app.get('/todo/date/:date', (req, res) => {
  const date = req.params.date;
  const username = req.query.user; 
  
  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    const startDate = `${date}T00:00:00`;
    const endDate = `${date}T23:59:59`;
    
    executeQuery(
      `SELECT t.*, pr.pr_name as priority_name 
       FROM t_todo t
       JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
       WHERE t.u_user_id = @userId 
         AND t.t_ending >= @startDate 
         AND t.t_ending <= @endDate`,
      [
        { name: 'userId', type: TYPES.Int, value: userId },
        { name: 'startDate', type: TYPES.DateTime, value: startDate },
        { name: 'endDate', type: TYPES.DateTime, value: endDate }
      ],
      (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
      }
    );
  });
});

app.get('/todo/filter/done', (req, res) => {
  const username = req.query.user;
  
  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }
  
  getUserId(username, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    executeQuery(
      `SELECT t.*, pr.pr_name as priority_name 
       FROM t_todo t
       JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
       WHERE t.u_user_id = @userId AND t.t_done = 1`,
      [{ name: 'userId', type: TYPES.Int, value: userId }],
      (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
      }
    );
  });
});

app.get('/todo/search', (req, res) => {
  const {term, user, searchDescription = 'false' } = req.query;
  let responded = false;
  
  if (!term || !user) {
    return res.status(400).json({
      error: 'Both "term" and "username" query parameters are required'
    });
  }

  getUserId(user, (err, userId) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!userId) return res.status(404).json({ error: 'User not found' });

    const searchTerm = `%${term}%`;
    const searchDesc = searchDescription.toLowerCase() === 'true';
    
    let sql = `
      SELECT t.*, pr.pr_name as priority_name 
      FROM t_todo t
      JOIN pr_priority pr ON t.t_pr_priority = pr.pr_id
      WHERE t.u_user_id = @userId
        AND (t.t_title LIKE @term
    `;
    
    if (searchDesc) {
      sql += ` OR t.t_description LIKE @term`;
    }
    
    sql += `)`;
    
    executeQuery(
      sql,
      [
        { name: 'userId', type: TYPES.Int, value: userId },
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
});

// ERROR HANDLING AND SERVER START
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
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