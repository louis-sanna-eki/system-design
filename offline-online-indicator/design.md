# Design Document

## 1. Overview

We need to build a system that can quickly and reliably indicate whether a user is online or offline in a chat application. The system must update a user’s online status within 10 seconds when they connect, be somewhat tolerant (lineant) in marking users offline, scale to support 5 million active users, and guarantee eventual consistency. In addition, the system must be highly available, durable, and cost-effective.

## 2. High-Level Architecture

> **Components:**
>
> - **Client (Browser/Mobile App):** Connects via WebSocket (using SocketIO) to receive realtime status updates.
> - **API Gateway / Load Balancer:** Routes incoming connections to available SocketIO servers.
> - **SocketIO Servers (Realtime Service):** Handle WebSocket connections, process connect/disconnect events, and push status updates.
> - **Presence Service & Shared State Store:** A highly available, low-latency store (e.g., Redis) that tracks the current presence state and last seen timestamps.
> - **Persistent Database:** A durable store (e.g., MySQL or MongoDB) for storing user metadata and audit logs (e.g., last seen timestamps) for historical analysis.
> - **Pub/Sub Mechanism:** Enables SocketIO servers to synchronize presence changes across instances without broadcasting to every connected client unnecessarily.

### Architecture Diagram (Textual)

```
                +-----------------+
                |     Clients     |
                | (Web/Mobile App)|
                +--------+--------+
                         |
                   [WebSocket]
                         |
                +--------v---------+
                |  Load Balancer   |
                +--------+---------+
                         |
              +----------+-----------+
              |                      |
      +-------v--------+     +-------v--------+
      | SocketIO Server| ... | SocketIO Server|
      +-------+--------+     +-------+--------+
              |                      |
        +-----v------+         +-----v------+
        | Redis (Pub)|         | Redis (Pub)|
        | & Presence |         | & Presence |
        +-----+------+         +-----+------+
              |                      |
        +-----v----------------------v-----+
        |       Persistent Database        |
        |    (MySQL / MongoDB, audit log)    |
        +------------------------------------+
```

## 3. Key Components & Decisions

### 3.1. SocketIO Servers (Realtime Service)
- **Responsibilities:**
  - Accept WebSocket connections and register events (connect, disconnect).
  - Emit realtime presence changes to subscribed clients.
  - Report status changes to the Presence Service.
- **Tradeoffs & Scaling:**
  - Horizontally scale the SocketIO servers behind a load balancer.
  - Use a pub/sub mechanism (via Redis) to synchronize state between instances.
  - **Cost-effective** since NodeJS with SocketIO is lightweight and asynchronous.

### 3.2. Presence Service & Shared State Store
- **Responsibilities:**
  - Maintain a mapping of user IDs to their online status and last seen timestamp.
  - Use an in-memory store (e.g., Redis) for fast lookups and low latency.
  - Manage timeouts: When a user disconnects, wait up to 10 seconds (grace period) before marking them offline.
  - Handle multiple connections per user by maintaining a counter or a session list.
- **Tradeoffs:**
  - In-memory store is fast but may require replication/clustering for high availability.
  - **Eventual consistency** is acceptable – the system may lag up to 10 seconds.

### 3.3. Persistent Database
- **Responsibilities:**
  - Store durable user metadata and offline “last seen” information.
  - Serve as a backup of the presence data and audit logs for historical analysis.
- **Tradeoffs:**
  - Writes can be asynchronous (e.g., through a background worker) to avoid blocking realtime updates.
  - Ensures data durability without compromising realtime performance.

### 3.4. Pub/Sub Mechanism
- **Responsibilities:**
  - Propagate presence updates between SocketIO servers without broadcasting to all clients directly.
  - Clients subscribe to specific channels (e.g., friend lists or chat groups) to receive targeted updates.
- **Tradeoffs:**
  - Reduces network overhead and minimizes unnecessary load on clients.
  - May become a chokepoint at very high scale, but can be partitioned or sharded as necessary.

## 4. Data Flow

1. **User Connects:**
   - Client connects via SocketIO.
   - SocketIO server receives the connection event, updates the Presence Service (e.g., set `user_id` status to online).
   - The Presence Service updates Redis and publishes the change via pub/sub.
   - Interested clients receive the online status update.

2. **User Disconnects:**
   - Client disconnect event is captured.
   - SocketIO server triggers a timer (e.g., 10 seconds grace period) in the Presence Service.
   - If no reconnection occurs, the user is marked offline, with the `last seen` timestamp updated.
   - The offline update is published to all subscribers.

3. **Client Polling / Initial Load:**
   - Upon loading the user list, the client fetches the current state from the Presence Service or a cache backed by the persistent database.
   - The client groups the list (online first, then offline with “was online X mins ago”).

## 5. Scalability & Capacity Planning

- **5 Million Active Users:**
  - Use clustering and sharding strategies for the Redis cluster.
  - SocketIO servers can be scaled horizontally behind load balancers. Each server may handle thousands of connections, so proper load distribution is critical.
  - The pub/sub layer might need to be partitioned to avoid bottlenecks.
- **Cost-Effectiveness:**
  - Use cloud-based autoscaling to scale up/down based on demand.
  - Favor managed services (e.g., managed Redis, managed database) to reduce operational overhead.

## 6. Consistency, Locking, and Deadlocks

- **Consistency:**
  - The system is designed to be eventually consistent – immediate status is not critical as long as it updates within 10 seconds.
- **Locking & Deadlocks:**
  - Using Redis (which is single-threaded) reduces risk of deadlocks.
  - The system avoids heavy locking by using non-blocking operations and asynchronous IO (especially in NodeJS).
  - In the unlikely event of concurrent updates (e.g., multiple SocketIO connections for the same user), a simple counter or session list will ensure that the user is marked offline only when the last session is disconnected.

## 7. Potential Bottlenecks

- **Redis Pub/Sub:** As user count increases, the pub/sub mechanism may become a bottleneck. This can be mitigated by:
  - Partitioning channels (e.g., by region or friend groups).
  - Using Redis clusters with sharding.
- **Database Writes:** Persisting last seen timestamps asynchronously prevents blocking realtime flows.

---

# Prototype Outline

## Features
- **User List View:**
  - Displays all users.
  - Online users are shown at the top.
  - Offline users display “was online X mins ago.”
- **Realtime Updates:**
  - When a user connects/disconnects, the list updates in realtime via SocketIO events.
- **Group Filtering:**
  - Only push updates to users who are in each other’s contact lists (avoids broadcasting to all).

## Tech Stack

| Which       | Options                                        |
|-------------|------------------------------------------------|
| **Language**| NodeJS (with Express, for instance)            |
| **Database**| MongoDB (or MySQL, depending on preference)    |
| **Library** | SocketIO for realtime communication            |

## Implementation Details

1. **Server-Side (NodeJS):**
   - Set up an Express server integrated with SocketIO.
   - On `connection` event:
     - Authenticate the user.
     - Update Redis presence store (mark as online).
     - Broadcast to friends or subscribed channels that the user is online.
   - On `disconnect` event:
     - Start a 10-second timeout before marking the user offline.
     - If the user reconnects within that window, cancel the timeout.
     - Once marked offline, update Redis and push a status change via pub/sub.
   - Use asynchronous calls to interact with Redis and the database to ensure non-blocking operations.

2. **Client-Side:**
   - Connect to the SocketIO endpoint.
   - Fetch an initial user list (with online/offline status) from a REST endpoint.
   - Listen for realtime presence updates.
   - Update the UI (e.g., move online users to the top, update “was online” timestamps).

3. **Database Schema (Simplified):**

   ```sql
   CREATE TABLE users (
       user_id VARCHAR(255) PRIMARY KEY,
       username VARCHAR(255),
       last_seen TIMESTAMP,
       is_online BOOLEAN
   );
   ```

   - In practice, the in-memory store (Redis) handles realtime state, while this table persists historical data.

4. **Handling Asynchronous IO:**
   - Use asynchronous functions and proper error handling in NodeJS.
   - Avoid blocking operations during status broadcasts. Instead, use efficient pub/sub and targeted event emissions.

5. **Avoiding Broad Broadcasts:**
   - Maintain subscription channels (e.g., user-specific channels or friend-group channels).
   - When a status update occurs, emit the change only to relevant channels rather than to every connected client.

---

# Conclusion

This design meets the requirements:
- **Realtime updates** within 10 seconds.
- **Eventual consistency** with a tolerance for slight delays in marking offline.
- **Scalability** to support 5 million users by leveraging SocketIO, Redis (for in-memory state and pub/sub), and a persistent database.
- **Cost-effectiveness** by using asynchronous operations and managed services.

This design can serve as a blueprint for both the system’s production architecture and the prototype implementation, ensuring a simple yet robust online/offline indicator system.
