using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;

namespace Server;

// The one payload every notification uses, whoever triggered it.
// "kind" tells the UI how to label it: broadcast | user | group | task.
public record AppNotification(string Id, string Kind, string Message, string? From, string? Group, DateTimeOffset SentAt)
{
    public static AppNotification Create(string kind, string message, string? from = null, string? group = null) =>
        new(Guid.NewGuid().ToString("N"), kind, message, from, group, DateTimeOffset.UtcNow);
}

// The methods the server can call on every client. With Hub<T> the compiler stops us
// from typo'ing an event name, which would otherwise fail silently.
public interface INotificationClient
{
    Task ReceiveNotification(AppNotification notification);
}

// DEMO ONLY: the "login" is just ?username=... on the connection URL. Anyone can claim any
// name. This is what makes Clients.User("alice") work; real apps read the user id from a JWT.
public class QueryStringUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) =>
        Normalize(connection.GetHttpContext()?.Request.Query["username"].ToString());

    public static string? Normalize(string? name)
    {
        var trimmed = name?.Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}

// A job for the background worker. The username is captured here because HttpContext is gone
// by the time the worker runs.
public record TaskJob(string Username, string TaskId);

// A bounded queue between the HTTP endpoint (producer) and TaskWorker (consumer).
public class TaskQueue
{
    private readonly Channel<TaskJob> _channel = Channel.CreateBounded<TaskJob>(100);

    public ValueTask EnqueueAsync(TaskJob job, CancellationToken ct = default) => _channel.Writer.WriteAsync(job, ct);

    public IAsyncEnumerable<TaskJob> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}

public class TaskWorker(TaskQueue queue, IHubContext<NotificationHub, INotificationClient> hub, ILogger<TaskWorker> log)
    : BackgroundService
{
    private static readonly TimeSpan WorkTime = TimeSpan.FromSeconds(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run each job concurrently, otherwise a second task would finish after 20 seconds.
        await Parallel.ForEachAsync(
            queue.ReadAllAsync(stoppingToken),
            new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = stoppingToken },
            RunJob);
    }

    private async ValueTask RunJob(TaskJob job, CancellationToken ct)
    {
        try
        {
            await Task.Delay(WorkTime, ct); // pretend to do real work
            // IHubContext has no Caller/Others; we target the user by name instead.
            await hub.Clients.User(job.Username).ReceiveNotification(
                AppNotification.Create("task", $"Task completed ({job.TaskId})", from: "server"));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // shutting down
        }
        catch (Exception ex)
        {
            // A failing job must not stop the host, which is the default for BackgroundService.
            log.LogError(ex, "Task {TaskId} for {User} failed", job.TaskId, job.Username);
        }
    }
}
