// import bodyParser from 'body-parser';
import { config } from 'dotenv';
import cors from 'cors';
import express from 'express';
import pg from 'pg';

config();

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// console.log(pool);
// console.log('PGUSER', process.env.PGUSER);
// console.log('PGHOST', process.env.PGHOST);

const app = express();
const port = process.env.PORT || 3333;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for large HTML content
app.use(express.urlencoded({ extended: true }));
// app.use(bodyParser.json());
// app.use(bodyParser.raw({ type: 'application/vnd.custom-type' }));
// app.use(bodyParser.text({ type: 'text/html' }));

// Create table if it doesn't exist
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS html_content (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

pool
  .query(createTableQuery)
  .then(() => console.log('Table created or already exists'))
  .catch((err) => console.error('Error creating table:', err));

// Upload endpoint
app.post('/api/upload', async (req, res) => {
  const { title, html } = req.body;

  // Validation
  if (!title || !html) {
    return res.status(400).json({
      error: 'Both title and html fields are required',
    });
  }

  if (title.trim().length === 0 || html.trim().length === 0) {
    return res.status(400).json({
      error: 'Title and HTML content cannot be empty',
    });
  }

  try {
    const query = `
      INSERT INTO html_content (title, html_content, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP) 
      RETURNING id, title, created_at
    `;

    const values = [title.trim(), html.trim()];
    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Data uploaded successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      error: 'Failed to save data to database',
      details:
        process.env.NODE_ENV === 'production'
          ? undefined
          : (error as Error).message,
    });
  }
});

// Get all records endpoint
app.get('/api/content', async (req, res) => {
  try {
    const query = `
      SELECT id, title, created_at, updated_at,
             LENGTH(html_content) as content_length
      FROM html_content 
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      error: 'Failed to retrieve data from database',
    });
  }
});

// Get specific record by ID
app.get('/api/content/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      error: 'Valid ID parameter is required',
    });
  }

  try {
    const query = `
      SELECT id, title, html_content, created_at, updated_at 
      FROM html_content 
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Content not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      error: 'Failed to retrieve data from database',
    });
  }
});

// Update record endpoint
app.put('/api/content/:id', async (req, res) => {
  const { id } = req.params;
  const { title, html } = req.body;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      error: 'Valid ID parameter is required',
    });
  }

  if (!title || !html) {
    return res.status(400).json({
      error: 'Both title and html fields are required',
    });
  }

  try {
    const query = `
      UPDATE html_content 
      SET title = $1, html_content = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3 
      RETURNING id, title, updated_at
    `;

    const values = [title.trim(), html.trim(), id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Content not found',
      });
    }

    res.json({
      success: true,
      message: 'Data updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      error: 'Failed to update data in database',
    });
  }
});

// Delete record endpoint
app.delete('/api/content/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      error: 'Valid ID parameter is required',
    });
  }

  try {
    const query = 'DELETE FROM html_content WHERE id = $1 RETURNING id, title';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Content not found',
      });
    }

    res.json({
      success: true,
      message: 'Data deleted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      error: 'Failed to delete data from database',
    });
  }
});

// Error handling middleware
//@ts-ignore
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    details: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
