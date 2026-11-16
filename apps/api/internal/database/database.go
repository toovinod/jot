package database

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/config"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func Open(ctx context.Context, c config.Config) (*pgxpool.Pool, error) {
	if c.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	if e := config.Validate(c); e != nil {
		return nil, e
	}
	pc, e := pgxpool.ParseConfig(c.DatabaseURL)
	if e != nil {
		return nil, errors.New("invalid DATABASE_URL configuration")
	}
	pc.MaxConns = 10
	pc.MinConns = 0
	pc.ConnConfig.ConnectTimeout = 5 * time.Second
	p, e := pgxpool.NewWithConfig(ctx, pc)
	if e == nil {
		e = p.Ping(ctx)
	}
	if e != nil && p != nil {
		p.Close()
	}
	return p, e
}
func Migrate(ctx context.Context, p *pgxpool.Pool) error {
	migrations, e := loadMigrations(migrationFiles)
	if e != nil {
		return e
	}
	tx, e := p.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(773410031)`); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); e != nil {
		return e
	}
	for _, migration := range migrations {
		var applied bool
		if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, migration.Version).Scan(&applied); e != nil {
			return e
		}
		if applied {
			continue
		}
		if _, e = tx.Exec(ctx, migration.SQL); e != nil {
			var databaseError *pgconn.PgError
			if errors.As(e, &databaseError) && databaseError.Hint != "" {
				return fmt.Errorf("migration %s failed: %w. %s", migration.Filename, e, databaseError.Hint)
			}
			return fmt.Errorf("migration %s failed: %w", migration.Filename, e)
		}
		if migration.Version == 3 {
			if e = backfillPostSummaries(ctx, tx); e != nil {
				return fmt.Errorf("post summary backfill failed: %w", e)
			}
		}
		if _, e = tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES($1)`, migration.Version); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}

type migration struct {
	Version       int
	Filename, SQL string
}

func loadMigrations(files fs.FS) ([]migration, error) {
	entries, e := fs.ReadDir(files, "migrations")
	if e != nil {
		return nil, e
	}
	migrations := []migration{}
	seen := map[int]bool{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		prefix, name, ok := strings.Cut(entry.Name(), "_")
		version, e := strconv.Atoi(prefix)
		if !ok || e != nil || version < 1 || name == ".sql" || seen[version] {
			return nil, fmt.Errorf("invalid or duplicate migration filename %q", entry.Name())
		}
		seen[version] = true
		sql, e := fs.ReadFile(files, "migrations/"+entry.Name())
		if e != nil {
			return nil, e
		}
		migrations = append(migrations, migration{Version: version, Filename: entry.Name(), SQL: string(sql)})
	}
	sort.Slice(migrations, func(i, j int) bool { return migrations[i].Version < migrations[j].Version })
	return migrations, nil
}
