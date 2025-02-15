const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('redis');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Redis client
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
});

(async () => {
  await redisClient.connect();
})();

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO connection handling
io.on('connection', async (socket) => {
  const userId = socket.handshake.query.userId;
  console.log(`User connected: ${userId}`);

  // Set user as online
  await redisClient.hSet('users', userId, JSON.stringify({
    online: true,
    lastSeen: Date.now()
  }));

  // Broadcast to all clients that user is online
  socket.broadcast.emit('userStatus', {
    userId,
    status: 'online'
  });

  // Get all users status
  socket.on('getAllUsers', async () => {
    const users = await redisClient.hGetAll('users');
    socket.emit('allUsers', users);
  });

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${userId}`);
    
    // Set user as offline with last seen
    await redisClient.hSet('users', userId, JSON.stringify({
      online: false,
      lastSeen: Date.now()
    }));

    // Broadcast to all clients that user is offline
    socket.broadcast.emit('userStatus', {
      userId,
      status: 'offline'
    });
  });
});

// Basic HTTP endpoints
app.get('/users', async (req, res) => {
  const users = await redisClient.hGetAll('users');
  res.json(users);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 