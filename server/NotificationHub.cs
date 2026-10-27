using Microsoft.AspNetCore.SignalR;

namespace Server;

// A hub is created per call, so it holds no state. Anything long-lived lives in singletons.
public class NotificationHub : Hub<INotificationClient>
{
    private const int MaxLength = 280;

    // Clients.All: every connected tab, including the sender.
    public Task SendBroadcast(string message) =>
        Clients.All.ReceiveNotification(AppNotification.Create("broadcast", Clean(message), From()));

    // Clients.User: every connection that belongs to this user key (same user in two tabs gets both).
    public Task SendToUser(string userKey, string message)
    {
        var target = QueryStringUserIdProvider.Normalize(userKey)
            ?? throw new HubException("Pick a user key to send to.");
        return Clients.User(target).ReceiveNotification(AppNotification.Create("user", Clean(message), From()));
    }

    // A tenant key is implemented as a SignalR group. Membership is per connection and is lost on
    // reconnect, so the client re-joins its tenants after reconnecting.
    public async Task JoinTenant(string tenantKey)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, TenantName(tenantKey));
    }

    public async Task LeaveTenant(string tenantKey)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, TenantName(tenantKey));
    }

    public Task SendToTenant(string tenantKey, string message)
    {
        var name = TenantName(tenantKey);
        return Clients.Group(name).ReceiveNotification(AppNotification.Create("tenant", Clean(message), From(), name));
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

    private static string TenantName(string? tenantKey)
    {
        var name = tenantKey?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(name)) throw new HubException("Pick a tenant key.");
        if (name.Length > 40) throw new HubException("Tenant key is too long.");
        return name;
    }
}
