using Npgsql;

public sealed record ClassCreated(string Id, string Name, int TotalSeats);
public sealed record ClassSummary(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats);
public sealed record HoldSummary(string HoldId, string ClassId, string StudentId, string ClassName, string Status, DateTime ExpiresAt);

public sealed class Admissions(NpgsqlDataSource db, int duration)
{
    public async Task Initialize()
    {
        await using var connection = await db.OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using var command = new NpgsqlCommand("""
            SELECT pg_advisory_xact_lock(19357679);
            CREATE TABLE IF NOT EXISTS classes (
                id text PRIMARY KEY, name text NOT NULL,
                total_seats integer NOT NULL CHECK (total_seats > 0),
                created_at timestamptz NOT NULL DEFAULT clock_timestamp()
            );
            CREATE TABLE IF NOT EXISTS holds (
                id text PRIMARY KEY, class_id text NOT NULL REFERENCES classes(id),
                student_id text NOT NULL CHECK (student_id ~ '^[0-9]{17}$'),
                status text NOT NULL CHECK (status IN ('HELD','CONFIRMED','EXPIRED','CANCELLED')),
                expires_at timestamptz NOT NULL,
                created_at timestamptz NOT NULL DEFAULT clock_timestamp()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_active_application
                ON holds (class_id, student_id) WHERE status IN ('HELD','CONFIRMED');
            CREATE INDEX IF NOT EXISTS hold_expiry ON holds (expires_at, class_id) WHERE status = 'HELD';
            CREATE INDEX IF NOT EXISTS student_applications ON holds (student_id, created_at DESC);
            """, connection, transaction);
        await command.ExecuteNonQueryAsync();
        await transaction.CommitAsync();
    }

    public async Task<ClassCreated> CreateClass(string name, int seats)
    {
        var id = Guid.NewGuid().ToString("N");
        await using var command = db.CreateCommand("INSERT INTO classes (id, name, total_seats) VALUES (@id, @name, @seats)");
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", name);
        command.Parameters.AddWithValue("seats", seats);
        await command.ExecuteNonQueryAsync();
        return new(id, name, seats);
    }

    public async Task<List<ClassSummary>> Classes(string? id = null)
    {
        await using var command = db.CreateCommand("""
            SELECT c.id, c.name, c.total_seats,
                count(h.id) FILTER (WHERE h.status = 'HELD' AND h.expires_at > statement_timestamp())::integer,
                count(h.id) FILTER (WHERE h.status = 'CONFIRMED')::integer
            FROM classes c LEFT JOIN holds h ON h.class_id = c.id
            WHERE (@id::text IS NULL OR c.id = @id)
            GROUP BY c.id ORDER BY c.created_at, c.id
            """);
        command.Parameters.AddWithValue("id", (object?)id ?? DBNull.Value);
        await using var reader = await command.ExecuteReaderAsync();
        var classes = new List<ClassSummary>();
        while (await reader.ReadAsync())
        {
            var total = reader.GetInt32(2);
            var held = reader.GetInt32(3);
            var confirmed = reader.GetInt32(4);
            classes.Add(new(reader.GetString(0), reader.GetString(1), total, held, confirmed, total - held - confirmed));
        }
        return classes;
    }

    public async Task<List<HoldSummary>> Holds(string student, string? id = null)
    {
        await using var command = db.CreateCommand("""
            SELECT h.id, h.class_id, h.student_id, c.name,
                CASE WHEN h.status = 'HELD' AND h.expires_at <= statement_timestamp() THEN 'EXPIRED' ELSE h.status END,
                h.expires_at
            FROM holds h JOIN classes c ON c.id = h.class_id
            WHERE h.student_id = @student AND (@id::text IS NULL OR h.id = @id)
            ORDER BY h.created_at DESC, h.id
            """);
        command.Parameters.AddWithValue("student", student);
        command.Parameters.AddWithValue("id", (object?)id ?? DBNull.Value);
        await using var reader = await command.ExecuteReaderAsync();
        var holds = new List<HoldSummary>();
        while (await reader.ReadAsync())
            holds.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetDateTime(5)));
        return holds;
    }

    // All occupancy changes lock the class first, including the expiry worker.
    private static async Task<(int Seats, string Name, DateTime Now)> LockClass(NpgsqlConnection connection, NpgsqlTransaction transaction, string id)
    {
        int seats;
        string name;
        await using (var command = new NpgsqlCommand("SELECT total_seats, name FROM classes WHERE id = @id FOR UPDATE", connection, transaction))
        {
            command.Parameters.AddWithValue("id", id);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) throw new AdmissionException(404, "Class not found.");
            seats = reader.GetInt32(0);
            name = reader.GetString(1);
        }
        // Transaction timestamps can predate lock waits. Read actual time after acquiring the lock.
        await using var time = new NpgsqlCommand("SELECT clock_timestamp()", connection, transaction);
        var now = (DateTime)(await time.ExecuteScalarAsync())!;
        await using var expire = new NpgsqlCommand("UPDATE holds SET status = 'EXPIRED' WHERE class_id = @id AND status = 'HELD' AND expires_at <= @now", connection, transaction);
        expire.Parameters.AddWithValue("id", id);
        expire.Parameters.AddWithValue("now", now);
        await expire.ExecuteNonQueryAsync();
        return (seats, name, now);
    }

    public async Task<HoldSummary> CreateHold(string classId, string student)
    {
        await using var connection = await db.OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var c = await LockClass(connection, transaction, classId);
        await using (var count = new NpgsqlCommand("""
            SELECT count(*)::integer, count(*) FILTER (WHERE student_id = @student)::integer
            FROM holds WHERE class_id = @class AND status IN ('HELD','CONFIRMED')
            """, connection, transaction))
        {
            count.Parameters.AddWithValue("class", classId);
            count.Parameters.AddWithValue("student", student);
            await using var reader = await count.ExecuteReaderAsync();
            await reader.ReadAsync();
            if (reader.GetInt32(1) > 0) throw new AdmissionException(409, "You already have an active application for this class.");
            if (reader.GetInt32(0) >= c.Seats) throw new AdmissionException(409, "All seats in this class are currently reserved. Please choose another class or check again later.");
        }
        var hold = new HoldSummary(Guid.NewGuid().ToString("N"), classId, student, c.Name, "HELD", c.Now.AddSeconds(duration));
        await using var insert = new NpgsqlCommand("INSERT INTO holds (id, class_id, student_id, status, expires_at) VALUES (@id, @class, @student, 'HELD', @expiry)", connection, transaction);
        insert.Parameters.AddWithValue("id", hold.HoldId);
        insert.Parameters.AddWithValue("class", classId);
        insert.Parameters.AddWithValue("student", student);
        insert.Parameters.AddWithValue("expiry", hold.ExpiresAt);
        await insert.ExecuteNonQueryAsync();
        await transaction.CommitAsync();
        return hold;
    }

    public async Task<string> ChangeHold(string id, string student, bool confirm)
    {
        await using var connection = await db.OpenConnectionAsync();
        string classId;
        await using (var find = new NpgsqlCommand("SELECT class_id FROM holds WHERE id = @id AND student_id = @student", connection))
        {
            find.Parameters.AddWithValue("id", id);
            find.Parameters.AddWithValue("student", student);
            classId = (string?)await find.ExecuteScalarAsync() ?? throw new AdmissionException(404, "Application not found.");
        }
        await using var transaction = await connection.BeginTransactionAsync();
        await LockClass(connection, transaction, classId);
        string state;
        await using (var read = new NpgsqlCommand("SELECT status FROM holds WHERE id = @id", connection, transaction))
        {
            read.Parameters.AddWithValue("id", id);
            state = (string)(await read.ExecuteScalarAsync())!;
        }
        var target = confirm ? "CONFIRMED" : "CANCELLED";
        if (state != target && state != "HELD")
            throw new AdmissionException(409, state == "EXPIRED" ? "This reservation has expired. Please apply again if a seat is available." : "This application can no longer be changed.");
        if (state == "HELD")
        {
            await using var change = new NpgsqlCommand("UPDATE holds SET status = @status WHERE id = @id", connection, transaction);
            change.Parameters.AddWithValue("status", target);
            change.Parameters.AddWithValue("id", id);
            await change.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
        return target;
    }

    public async Task Expire(CancellationToken cancellationToken)
    {
        var ids = new List<string>();
        await using (var command = db.CreateCommand("SELECT DISTINCT class_id FROM holds WHERE status = 'HELD' AND expires_at <= statement_timestamp() LIMIT 100"))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
        foreach (var id in ids)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await using var connection = await db.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            await LockClass(connection, transaction, id);
            await transaction.CommitAsync(cancellationToken);
        }
    }
}
