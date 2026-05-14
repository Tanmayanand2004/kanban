const express = require('express');
const cors = require('cors');
const path = require('path');

const userRoutes  = require('./routes/users');
const boardRoutes = require('./routes/boards');
const taskRoutes  = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.use('/api/auth', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/tasks', taskRoutes);

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
});
