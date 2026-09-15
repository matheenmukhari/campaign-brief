const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import database connection (triggers the connection test)
require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/briefs', require('./routes/briefs'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));

// Health check endpoint — proves the server is alive
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SelectProperty Campaign Briefing API is running',
    timestamp: new Date().toISOString(),
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
