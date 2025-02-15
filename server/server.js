const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('redis');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);

// Redis configuration
const pubClient = Redis.createClient({
  url: process.env.REDIS_URL
});
const subClient = pubClient.duplicate();

// Socket.IO configuration with Redis adapter
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  adapter: createAdapter(pubClient, subClient)
});

// Redis connection
(async () => {
  await pubClient.connect();
  await subClient.connect();
})();

// Redis error handling
pubClient.on('error', (err) => console.error('Redis Pub Error:', err));
subClient.on('error', (err) => console.error('Redis Sub Error:', err));

// Mock friends list (in a real app, this would come from a DB)
const getFriendsList = (userId) => {
  // Generate 20 users (1 to 20)
  const allUsers = Array.from({length: 20}, (_, i) => (i + 1).toString());
  
  // Each user is friends with 10 random other users
  const currentUserIndex = parseInt(userId) - 1;
  if (currentUserIndex < 0 || currentUserIndex >= allUsers.length) {
    return [];
  }

  // Shuffle array and get first 10 users (excluding self)
  return allUsers
    .filter(id => id !== userId)
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);
};

// Socket.IO connection handling
io.on('connection', async (socket) => {
  const userId = socket.handshake.query.userId;
  console.log(`User connected: ${userId}`);

  // Get user's friends list
  const friends = getFriendsList(userId);

  // Store user status in Redis
  await pubClient.hSet('users', userId, JSON.stringify({
    online: true,
    lastSeen: Date.now()
  }));

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Notify each friend about this user's online status
  const statusUpdate = {
    userId,
    status: 'online',
    timestamp: Date.now()
  };

  // Emit to each friend's room individually
  friends.forEach(friendId => {
    io.to(`user:${friendId}`).emit('userStatus', statusUpdate);
  });

  // Get initial status of friends
  socket.on('getFriendsStatus', async () => {
    const statuses = {};
    for (const friendId of friends) {
      const userData = await pubClient.hGet('users', friendId);
      if (userData) {
        statuses[friendId] = JSON.parse(userData);
      }
    }
    socket.emit('friendsStatus', statuses);
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${userId}`);

    await pubClient.hSet('users', userId, JSON.stringify({
      online: false,
      lastSeen: Date.now()
    }));

    // Notify each friend about offline status
    const offlineUpdate = {
      userId,
      status: 'offline',
      timestamp: Date.now()
    };

    friends.forEach(friendId => {
      io.to(`user:${friendId}`).emit('userStatus', offlineUpdate);
    });
  });

  // Handle socket errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Debug API route to get all statuses
app.get('/status', async (req, res) => {
  try {
    const statuses = await pubClient.hGetAll('users');
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pubClient.quit();
  await subClient.quit();
  process.exit(0);
}); 