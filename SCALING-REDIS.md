# Running more than one instance (Redis backplane)

How to run this demo's server on two or more instances behind a load balancer, using Redis. For the single-instance design, see [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status: documentation only, not tested.** The repo's code is **not** changed for this. Everything below comes from Microsoft's SignalR guidance and the NuGet package metadata (checked 2026-10-26). Treat the code as a starting point, and run the verification plan in section 9 before relying on it.

## 1. What breaks with more than one instance today

SignalR keeps every connection **in the memory of the server that accepted it**. Today that is the only server, so everything works. With two servers, A and B:

| Feature | Behaviour with 2 instances and no Redis |
|---|---|
| `Clients.All` (broadcast) | Reaches only tabs connected to the **same** instance as the sender |
| `Clients.User(userKey)` | Reaches only that user's connections **on this instance** |
| `Clients.Group` (tenant key) | Membership is stored per instance, so it reaches only members on this instance |
| Background task | The job runs on the instance that got the POST; the "Task completed" push reaches the user **only if their tab is on that same instance** |
| Reconnect to the other instance | Works, but tenant membership is not there until the client re-joins (the client already does) |

Symptom to recognise: alice (on A) broadcasts and bob (on B) sees nothing, with no error anywhere.

## 2. What Redis adds, and what it does not

The Redis **backplane** uses Redis pub/sub as a bus between servers. Every message a server sends is also published to Redis, every other server receives it, and each one delivers it to **its own** connections.

It gives you:

- Cross-instance `Clients.All`, `Clients.User` and `Clients.Group`
- Cross-instance `IHubContext` sends (so the background worker can notify a user connected to a different instance)

It does **not** give you:

- **No delivery guarantee.** Redis pub/sub is fire-and-forget. A message is not stored, replayed or retried. A client that is disconnected still misses it, exactly as today.
- **No shared task queue.** The in-memory `TaskQueue` is still per instance (section 6).
- **No sticky-session replacement** unless you also skip negotiation (section 5).
- **No cheap scaling.** Every message goes to every server, so Redis traffic grows with servers times messages.

## 3. Steps for the ASP.NET Core server

### 3.1 Run Redis

For local testing:

```bash
docker run -d --name redis -p 127.0.0.1:6379:6379 redis:7-alpine
```

For real use, use a managed Redis or one you operate with persistence and failover (section 7). Do not expose Redis publicly. Use a password and TLS.

### 3.2 Add the package

```bash
dotnet add server package Microsoft.AspNetCore.SignalR.StackExchangeRedis --version 10.0.14
```

This is the current stable 10.x release on NuGet and targets `net10.0`. Keep its major version equal to your .NET version.

### 3.3 Turn it on in `server/Program.cs`

Make it **optional**, so single-instance development keeps working with no Redis:

```csharp
using StackExchange.Redis;

var signalr = builder.Services.AddSignalR();

var redis = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redis))
{
    signalr.AddStackExchangeRedis(redis, options =>
    {
        // Isolates this app from any other app (or environment) sharing the same Redis.
        options.Configuration.ChannelPrefix = RedisChannel.Literal("notification-demo");
    });
}
```

Nothing else in the hub, the user id provider or the worker needs to change. `Clients.*` and `IHubContext` calls are routed through the backplane automatically.

### 3.4 Configure per environment

Pass the connection string through configuration, not code:

```bash
ConnectionStrings__Redis="localhost:6379" dotnet run --project server
# with a password and TLS (managed Redis):
ConnectionStrings__Redis="myhost:6380,password=...,ssl=true"
```

### 3.5 Remove the hard-coded values that block a second instance

These are fixed in the demo and must become configuration:

| Hard-coded today | Where | Change to |
|---|---|---|
| Port `5080` | `server/Properties/launchSettings.json` | Pass `--urls http://localhost:5081` (or `ASPNETCORE_URLS`) per instance |
| CORS origins `localhost:5173` / `127.0.0.1:5173` | `clientOrigins` in `server/Program.cs` | Read from configuration (the real site origin in production) |
| Server address `http://localhost:5080` | `SERVER` in `client/src/types.ts` | A build-time setting such as `import.meta.env.VITE_SERVER`, pointing at the **load balancer**, not at one instance |

## 4. Sizing and shape of the deployment

```
                        ┌────────────► Server A ──┐
Browser ──► Load balancer              (SignalR)   ├──► Redis (pub/sub)
                        └────────────► Server B ──┘
```

- The client talks only to the load balancer's address.
- Each server connects to the same Redis and uses the same `ChannelPrefix`.
- Servers are interchangeable. Identity comes from the `userKey` in the connection URL, so no server needs to remember who a user is across requests.

## 5. Load balancer requirements

SignalR needs the balancer to behave in two specific ways.

1. **WebSocket support**, with the `Upgrade` and `Connection` headers passed through, and an idle timeout comfortably above SignalR's 15-second keep-alive (60 seconds or more is typical).
2. **One of these two**, otherwise connections fail intermittently:
   - **Sticky sessions (session affinity).** SignalR starts with a `negotiate` HTTP request, then opens the real connection. With fallback transports (Server-Sent Events, long polling) all of those requests must reach the same server.
   - **Or WebSockets only, with negotiation skipped.** Then no affinity is needed. In `client/src/useHub.ts`:

     ```ts
     import { HttpTransportType } from "@microsoft/signalr";

     new HubConnectionBuilder()
       .withUrl(url, { skipNegotiation: true, transport: HttpTransportType.WebSockets })
     ```

     This is the simplest option when every client and proxy supports WebSockets. The cost is that clients which cannot use WebSockets cannot connect at all.

Example nginx fragment (illustrative, untested):

```nginx
upstream signalr_servers {
    server 127.0.0.1:5080;
    server 127.0.0.1:5081;
}
server {
    listen 80;
    location /hubs/ {
        proxy_pass http://signalr_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
    location /api/ {
        proxy_pass http://signalr_servers;
        proxy_set_header Host $host;
    }
}
```

If you rely on negotiation instead of skipping it, add affinity (for example `ip_hash;` in the upstream block, or your cloud balancer's cookie-based affinity).

## 6. The background task with several instances

What works unchanged:

- Instance A takes `POST /api/tasks`, queues the job in **its own** memory, runs it, and sends "Task completed" through `IHubContext`.
- With the backplane, that send is published to Redis, so the user receives it even if their tab is connected to instance B.

What does **not** work: the queue is per instance. If A stops or is redeployed while a job is waiting, the job is **lost**. If you need jobs to survive:

1. Replace the in-memory `Channel<TaskJob>` with a shared, durable queue: Redis Streams (consumer groups), a Redis list, RabbitMQ or Azure Service Bus.
2. Let any instance (or a separate worker process) consume. Each job should be processed by one consumer.
3. Make processing **idempotent**. Most queues are at-least-once, so a job can run twice. Derive the notification `id` from the task id (instead of a new GUID per send) so a duplicate is dropped by the client, which already ignores a repeated `id`.
4. If the worker runs as a separate process, it must also register the Redis backplane, or its `IHubContext` sends will reach nobody.

## 7. Redis operations

- **Single point of failure.** One Redis node is a single point of failure for cross-instance delivery. If it is unreachable, messages stop crossing between servers (local delivery on one server may continue). Use a managed Redis, or replicas with failover (for example Sentinel). If you plan to use Redis Cluster, check Microsoft's SignalR documentation for support and caveats first.
- **Security.** Password, TLS, private network. Never expose Redis to the internet.
- **One Redis, several apps or environments.** Give each a different `ChannelPrefix`.
- **Memory.** Pub/sub does not store messages, so memory use is small. Network use grows with message volume times servers.
- **Rolling deploys.** Restarting a server drops its connections. The client reconnects on its own (it never gives up) and re-joins its tenant keys, so a rolling restart is safe. Anything sent during the gap is lost.

## 8. Alternative: Azure SignalR Service

If you run on Azure, the managed service replaces both the backplane and the connection handling: the app servers no longer hold client connections, so scaling out needs no Redis and no sticky sessions. You add the `Microsoft.Azure.SignalR` package and call `AddAzureSignalR(...)`. It has a cost and moves connections off your own servers. See Microsoft's documentation for details.

## 9. Verification plan (run this before trusting any of it)

Prerequisite: the three changes in section 3.5 (ports, CORS origins, a configurable client server address).

1. Start Redis. Start **two** server instances on ports 5080 and 5081, both with the same `ConnectionStrings__Redis`.
2. Point two browser tabs at different instances (for example by building the client twice with different `VITE_SERVER` values, or by using the load balancer with affinity).
3. Check each, with alice on instance A and bob on instance B:

| Check | Expected |
|---|---|
| Broadcast from alice | Both tabs show one toast and one row |
| Direct message to `bob` | Only bob's tab receives it |
| Both join tenant `team`, alice sends to it | Bob receives it across instances |
| Bob starts a task | After about 10 seconds bob receives "Task completed", whichever instance handled the POST |
| Stop instance B | Bob's tab shows Reconnecting, then reconnects (to A via the balancer) and re-joins `team` |
| Stop Redis for a moment | Note what happens to cross-instance messages and that they recover when Redis returns |

4. Negative check: repeat step 3 **without** Redis. Alice's broadcast must **not** reach bob. If it does, the two tabs are on the same instance and the test proves nothing.

## 10. Checklist of changes

| Area | Change |
|---|---|
| `server/server.csproj` | Add `Microsoft.AspNetCore.SignalR.StackExchangeRedis` |
| `server/Program.cs` | Optional `AddStackExchangeRedis`; read CORS origins from configuration |
| `server/Properties/launchSettings.json` | Stop pinning the only port; pass `--urls` per instance |
| `client/src/types.ts` and `useHub.ts` | Configurable server URL; optionally `skipNegotiation` + WebSockets |
| Load balancer | WebSocket pass-through, idle timeout over 60 s, and sticky sessions unless negotiation is skipped |
| Infrastructure | Redis with password, TLS and failover; a distinct `ChannelPrefix` per environment |
| Background tasks | Only if jobs must survive a restart: a durable shared queue and idempotent processing |

## 11. The .NET Framework 4.6.2 variant

If you built the port described in [TUTORIAL-NET-FRAMEWORK-462.md](TUTORIAL-NET-FRAMEWORK-462.md), the idea is the same but the packages differ:

| Core | ASP.NET SignalR 2.x |
|---|---|
| `Microsoft.AspNetCore.SignalR.StackExchangeRedis` | `Microsoft.AspNet.SignalR.Redis` 2.4.3 (depends on `StackExchange.Redis.StrongName` 1.1.608) |
| `AddStackExchangeRedis(connectionString, ...)` | Before `MapSignalR`: `GlobalHost.DependencyResolver.UseRedis(server, port, password, "notification-demo")` (the last argument is the event key, the equivalent of the channel prefix) |

Also for several IIS servers: use the same `machineKey` on every server (SignalR protects connection tokens with it), and keep the load-balancer rules from section 5. `QueueBackgroundWorkItem` is per server and not durable, so the guidance in section 6 applies in full.
