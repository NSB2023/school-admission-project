using System.Text.RegularExpressions;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Database")
    ?? throw new InvalidOperationException("Set ConnectionStrings__Database to a PostgreSQL connection string.");
var duration = builder.Configuration.GetValue("HOLD_DURATION_SECONDS", 600);
if (duration <= 0) throw new InvalidOperationException("HOLD_DURATION_SECONDS must be positive.");
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connection));
builder.Services.AddSingleton(sp => new Admissions(sp.GetRequiredService<NpgsqlDataSource>(), duration));
builder.Services.AddHostedService<ExpiryWorker>();
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration["FRONTEND_ORIGIN"] ?? "http://localhost:3000", "http://localhost:5173", "http://frontend")
        .AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseCors();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    try { await next(context); }
    catch (AdmissionException error)
    {
        context.Response.StatusCode = error.StatusCode;
        await context.Response.WriteAsJsonAsync(new { message = error.Message });
    }
    catch (BadHttpRequestException)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { message = "Please check the request fields and JSON format." });
    }
    catch (Exception error) when (error is NpgsqlException or TimeoutException)
    {
        app.Logger.LogError("Database request failed: {ErrorType}", error.GetType().Name);
        context.Response.StatusCode = 503;
        await context.Response.WriteAsJsonAsync(new { message = "The admissions service is temporarily unavailable. Please try again." });
    }
});
app.MapGet("/health", async (NpgsqlDataSource db) =>
{
    await using var command = db.CreateCommand("SELECT 1");
    await command.ExecuteScalarAsync();
    return Results.Ok(new { status = "ok" });
});
app.MapPost("/classes", async (CreateClassRequest request, Admissions admissions) =>
{
    if (string.IsNullOrWhiteSpace(request.Name) || request.TotalSeats <= 0)
        throw new AdmissionException(400, "Enter a class name and a positive whole number of seats.");
    var result = await admissions.CreateClass(request.Name.Trim(), request.TotalSeats);
    return Results.Created($"/classes/{result.Id}", result);
});
app.MapGet("/classes", (Admissions admissions) => admissions.Classes());
app.MapGet("/classes/{id}", async (string id, Admissions admissions) =>
    (await admissions.Classes(id)).SingleOrDefault() ?? throw new AdmissionException(404, "Class not found."));
app.MapPost("/classes/{id}/holds", async (string id, HttpRequest request, Admissions admissions) =>
{
    var hold = await admissions.CreateHold(id, Student(request));
    return Results.Created($"/holds/{hold.HoldId}", hold);
});
app.MapGet("/holds/{id}", async (string id, HttpRequest request, Admissions admissions) =>
    (await admissions.Holds(Student(request), id)).SingleOrDefault() ?? throw new AdmissionException(404, "Application not found."));
app.MapGet("/me/holds", (HttpRequest request, Admissions admissions) => admissions.Holds(Student(request)));
app.MapPost("/holds/{id}/confirm", async (string id, HttpRequest request, Admissions admissions) =>
    new { holdId = id, status = await admissions.ChangeHold(id, Student(request), confirm: true) });
app.MapDelete("/holds/{id}", async (string id, HttpRequest request, Admissions admissions) =>
{
    await admissions.ChangeHold(id, Student(request), confirm: false);
    return Results.NoContent();
});
await app.Services.GetRequiredService<Admissions>().Initialize();
app.Run();

static string Student(HttpRequest request)
{
    var id = request.Headers["X-Student-Id"].ToString();
    if (!Regex.IsMatch(id, "\\A[0-9]{17}\\z"))
        throw new AdmissionException(400, "Enter a valid 17-digit birth registration number.");
    return id;
}
public partial class Program;
public sealed record CreateClassRequest(string Name, int TotalSeats);
public sealed class AdmissionException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
