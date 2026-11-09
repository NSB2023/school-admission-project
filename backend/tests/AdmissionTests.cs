using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting;
using Npgsql;
using Xunit;

public sealed class AdmissionTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;
    private const string Student = "20152691234567890";
    private const string Other = "20152691234567891";

    public AdmissionTests(WebApplicationFactory<Program> factory)
    {
        client = factory.CreateClient();
    }

    private async Task<JsonElement> CreateClass(int seats = 5)
    {
        var response = await client.PostAsJsonAsync("/classes", new { name = $"Class 6 – Morning {Guid.NewGuid()}", totalSeats = seats });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Json(response);
    }

    private Task<HttpResponseMessage> Send(HttpMethod method, string path, string? student = Student)
    {
        var request = new HttpRequestMessage(method, path);
        if (student is not null) request.Headers.Add("X-Student-Id", student);
        return client.SendAsync(request);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<JsonElement> Hold(string classId, string student = Student)
    {
        var response = await Send(HttpMethod.Post, $"/classes/{classId}/holds", student);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Json(response);
    }

    private static async Task Execute(string sql, string id)
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("ConnectionStrings__Database"));
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        await command.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task Class_contract_and_validation()
    {
        var c = await CreateClass();
        Assert.Equal(5, c.GetProperty("totalSeats").GetInt32());
        var id = c.GetProperty("id").GetString();
        var detail = await client.GetFromJsonAsync<JsonElement>($"/classes/{id}");
        Assert.Equal(0, detail.GetProperty("heldSeats").GetInt32());
        Assert.Equal(5, detail.GetProperty("availableSeats").GetInt32());
        var list = await client.GetFromJsonAsync<JsonElement>("/classes");
        Assert.Equal(JsonValueKind.Array, list.ValueKind);
        Assert.Contains(list.EnumerateArray(), x => x.GetProperty("id").GetString() == id);
        foreach (var invalid in new[] { new { name = "", totalSeats = 5 }, new { name = "Class", totalSeats = 0 }, new { name = "Class", totalSeats = -1 } })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/classes", invalid)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/classes/missing")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Post, "/classes/missing/holds")).StatusCode);
    }

    [Fact]
    public async Task Concurrent_requests_never_overbook()
    {
        var id = (await CreateClass()).GetProperty("id").GetString();
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tasks = Enumerable.Range(0, 50).Select(async i =>
        {
            await start.Task;
            return await Send(HttpMethod.Post, $"/classes/{id}/holds", (20152691234567000L + i).ToString());
        }).ToArray();
        start.SetResult();
        var results = await Task.WhenAll(tasks);
        Assert.Equal(5, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(45, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        var detail = await client.GetFromJsonAsync<JsonElement>($"/classes/{id}");
        Assert.Equal(5, detail.GetProperty("heldSeats").GetInt32());
        Assert.Equal(0, detail.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task Duplicate_student_and_confirmation_retries_are_safe()
    {
        var id = (await CreateClass(1)).GetProperty("id").GetString()!;
        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Send(HttpMethod.Post, $"/classes/{id}/holds")));
        var hold = await Json(Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(9, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(Student, hold.GetProperty("studentId").GetString());
        Assert.True(hold.GetProperty("expiresAt").GetDateTimeOffset() > DateTimeOffset.UtcNow);
        var holdId = hold.GetProperty("holdId").GetString();
        var confirms = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Send(HttpMethod.Post, $"/holds/{holdId}/confirm")));
        Assert.All(confirms, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var detail = await client.GetFromJsonAsync<JsonElement>($"/classes/{id}");
        Assert.Equal(1, detail.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(0, detail.GetProperty("heldSeats").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Delete, $"/holds/{holdId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Post, $"/classes/{id}/holds")).StatusCode);
    }

    [Fact]
    public async Task Ownership_history_cancellation_and_reapplication()
    {
        var id = (await CreateClass(1)).GetProperty("id").GetString()!;
        var hold = await Hold(id);
        var holdId = hold.GetProperty("holdId").GetString();
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Get, $"/holds/{holdId}", Other)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Post, $"/holds/{holdId}/confirm", Other)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Delete, $"/holds/{holdId}", Other)).StatusCode);
        Assert.Equal("HELD", (await Json(await Send(HttpMethod.Get, $"/holds/{holdId}"))).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await Send(HttpMethod.Delete, $"/holds/{holdId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Send(HttpMethod.Delete, $"/holds/{holdId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Post, $"/holds/{holdId}/confirm")).StatusCode);
        var next = await Hold(id);
        Assert.NotEqual(holdId, next.GetProperty("holdId").GetString());
        var mine = await Json(await Send(HttpMethod.Get, "/me/holds"));
        Assert.Contains(mine.EnumerateArray(), x => x.GetProperty("holdId").GetString() == holdId && x.GetProperty("status").GetString() == "CANCELLED");
        Assert.All(mine.EnumerateArray(), x => Assert.True(x.TryGetProperty("className", out _)));
        var others = await Json(await Send(HttpMethod.Get, "/me/holds", Other));
        Assert.DoesNotContain(others.EnumerateArray(), x => x.GetProperty("holdId").GetString() == holdId);
    }

    [Fact]
    public async Task Expiry_worker_releases_seats_without_API_calls()
    {
        var id = (await CreateClass(1)).GetProperty("id").GetString()!;
        var holdId = (await Hold(id)).GetProperty("holdId").GetString()!;
        await Execute("UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = @id", holdId);
        string? status = null;
        for (var i = 0; i < 40; i++)
        {
            await Task.Delay(100);
            await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("ConnectionStrings__Database"));
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand("SELECT status FROM holds WHERE id = @id", connection);
            command.Parameters.AddWithValue("id", holdId);
            status = (string?)await command.ExecuteScalarAsync();
            if (status == "EXPIRED") break;
        }
        Assert.Equal("EXPIRED", status);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Post, $"/holds/{holdId}/confirm")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Delete, $"/holds/{holdId}")).StatusCode);
        Assert.Equal("EXPIRED", (await Json(await Send(HttpMethod.Get, $"/holds/{holdId}"))).GetProperty("status").GetString());
        await Hold(id);
    }

    [Fact]
    public async Task Confirmation_and_cancellation_race_has_one_terminal_state()
    {
        var id = (await CreateClass(1)).GetProperty("id").GetString()!;
        var holdId = (await Hold(id)).GetProperty("holdId").GetString();
        var responses = await Task.WhenAll(Send(HttpMethod.Post, $"/holds/{holdId}/confirm"), Send(HttpMethod.Delete, $"/holds/{holdId}"));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        var state = (await Json(await Send(HttpMethod.Get, $"/holds/{holdId}"))).GetProperty("status").GetString();
        Assert.Contains(state, new[] { "CONFIRMED", "CANCELLED" });
        var detail = await client.GetFromJsonAsync<JsonElement>($"/classes/{id}");
        Assert.Equal(state == "CONFIRMED" ? 1 : 0, detail.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(0, detail.GetProperty("heldSeats").GetInt32());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("123")]
    [InlineData("2015269123456789x")]
    public async Task Invalid_identity_is_rejected(string? student)
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(HttpMethod.Get, "/me/holds", student)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(HttpMethod.Post, "/classes/missing/holds", student)).StatusCode);
    }

    [Fact]
    public async Task Unknown_hold_and_health_contracts()
    {
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Delete })
            Assert.Equal(HttpStatusCode.NotFound, (await Send(method, "/holds/missing")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Post, "/holds/missing/confirm")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task Malformed_fields_return_a_useful_JSON_error()
    {
        await using var production = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        using var productionClient = production.CreateClient();
        using var body = new StringContent("{\"name\":\"Class\",\"totalSeats\":1.5}", System.Text.Encoding.UTF8, "application/json");
        var response = await productionClient.PostAsync("/classes", body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await Json(response)).GetProperty("message").GetString()));
    }

    [Fact]
    public async Task Overdue_holds_cannot_confirm_and_can_be_reapplied_for()
    {
        var id = (await CreateClass(1)).GetProperty("id").GetString()!;
        var holdId = (await Hold(id)).GetProperty("holdId").GetString()!;
        await Execute("UPDATE holds SET expires_at = clock_timestamp() WHERE id = @id", holdId);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Post, $"/holds/{holdId}/confirm")).StatusCode);
        var detail = await client.GetFromJsonAsync<JsonElement>($"/classes/{id}");
        Assert.Equal(1, detail.GetProperty("availableSeats").GetInt32());
        await Hold(id);
    }
}
