using Microsoft.AspNetCore.SignalR;
using Server;

var builder = WebApplication.CreateBuilder(args);

const string ClientCors = "client";
string[] clientOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

builder.Services.AddSignalR();
builder.Services.AddSingleton<IUserIdProvider, QueryStringUserIdProvider>();
builder.Services.AddSingleton<TaskQueue>();
builder.Services.AddHostedService<TaskWorker>();

// SignalR needs credentials, and credentials need explicit origins (never AllowAnyOrigin).
builder.Services.AddCors(o => o.AddPolicy(ClientCors, p => p
    .WithOrigins(clientOrigins)
    .AllowAnyHeader()
    .WithMethods("GET", "POST")
    .AllowCredentials()));

var app = builder.Build();

app.UseCors(ClientCors); // before MapHub

app.MapHub<NotificationHub>("/hubs/notifications");

// Server-originated: return 202 right away; the TaskWorker pushes "Task completed" about 10s later.
app.MapPost("/api/tasks", async (HttpRequest request, TaskQueue queue) =>
{
    var userKey = QueryStringUserIdProvider.Normalize(request.Headers["X-User-Key"].ToString());
    if (userKey is null) return Results.BadRequest(new { error = "Send your user key in the X-User-Key header." });

    var taskId = Guid.NewGuid().ToString("N")[..6];
    await queue.EnqueueAsync(new TaskJob(userKey, taskId));
    return Results.Accepted(value: new { taskId });
});

app.Run();
