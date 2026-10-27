using Microsoft.AspNetCore.SignalR;

namespace Server;

// A hub is created per call, so it holds no state. Anything long-lived lives in singletons.
public class NotificationHub : Hub<INotificationClient>
{
    private const int MaxLength = 280;

    // Clients.All: every connected tab, including the sender.
    public Task SendBroadcast(string message) =>
        Clients.All.ReceiveNotification(AppNotification.Create("broadcast", Clean(message), From()));

    // Clients.User: every connection that belongs to this username (same user in two tabs gets both).
    public Task SendToUser(string username, string message)
    {
        var target = QueryStringUserIdProvider.Normalize(username)
            ?? throw new HubException("Pick a username to send to.");
        return Clients.User(target).ReceiveNotification(AppNotification.Create("user", Clean(message), From()));
    }

    // Groups are per connection and are lost on reconnect, so the client re-joins after reconnecting.
    public async Task JoinGroup(string group)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(group));
    }

    public async Task LeaveGroup(string group)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(group));
    }

    public Task SendToGroup(string group, string message)
    {
        var name = GroupName(group);
        return Clients.Group(name).ReceiveNotification(AppNotification.Create("group", Clean(message), From(), name));
    }

    private string? From() => Context.UserIdentifier;

    // The input's maxLength does not stop a direct hub call, so validate on the server too.
    private static string Clean(string? message)
    {
        var text = message?.Trim() ?? "";
        if (text.Length == 0) throw new HubException("Message is empty.");
        if (text.Length > MaxLength) throw new HubException($"Message is longer than {MaxLength} characters.");
        return text;
    }

    private static string GroupName(string? group)
    {
        var name = group?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(name)) throw new HubException("Pick a group name.");
        if (name.Length > 40) throw new HubException("Group name is too long.");
        return name;
    }
}
