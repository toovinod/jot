package database

import (
	"context"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

func versionOneDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("JOT_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("JOT_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	schema := "migration_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, e = admin.Exec(ctx, `CREATE SCHEMA `+schema); e != nil {
		admin.Close()
		t.Fatal(e)
	}
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		db.Close()
		_, _ = admin.Exec(context.Background(), `DROP SCHEMA `+schema+` CASCADE`)
		admin.Close()
	})
	initial, e := migrationFiles.ReadFile("migrations/001_initial.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, string(initial)); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, `CREATE TABLE schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());INSERT INTO schema_migrations(version) VALUES(1)`); e != nil {
		t.Fatal(e)
	}
	return db
}
func legacyPost(t *testing.T, db *pgxpool.Pool, author, slug string, published bool) string {
	t.Helper()
	snapshot := domain.EmptySnapshot()
	snapshot.Title = "Existing post"
	snapshot.Slug = slug
	snapshot.Content.Content[0].Content = []domain.Node{{Type: "text", Text: "Legacy writing preserved."}}
	raw, e := json.Marshal(snapshot)
	if e != nil {
		t.Fatal(e)
	}
	id := uuid.NewString()
	var live []byte
	if published {
		live = raw
	}
	_, e = db.Exec(context.Background(), `INSERT INTO posts(id,author_id,draft,published,published_at) VALUES($1,$2,$3,$4,CASE WHEN $4::jsonb IS NOT NULL THEN now() END)`, id, author, raw, live)
	if e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec(context.Background(), `INSERT INTO revisions(post_id,snapshot) VALUES($1,$2)`, id, raw)
	if e != nil {
		t.Fatal(e)
	}
	return id
}
func legacyAuthor(t *testing.T, db *pgxpool.Pool) string {
	t.Helper()
	id := uuid.NewString()
	if _, e := db.Exec(context.Background(), `INSERT INTO users(id,email,password_hash,username,name) VALUES($1,'existing@example.com','test','existing','Existing')`, id); e != nil {
		t.Fatal(e)
	}
	return id
}
func TestMigrateUpgradesVersionOneAndIsIdempotent(t *testing.T) {
	db := versionOneDatabase(t)
	author := legacyAuthor(t, db)
	id := legacyPost(t, db, author, "existing-slug", false)
	liveID := legacyPost(t, db, author, "other-existing-slug", true)
	for i := 0; i < 14; i++ {
		legacyPost(t, db, author, "batch-"+strconv.Itoa(i), i%2 == 0)
	}
	private := domain.EmptySnapshot()
	private.Title = "Private migrated title"
	private.Slug = "other-existing-slug"
	private.Content.Content[0].Content = []domain.Node{{Type: "text", Text: "Private migrated excerpt"}}
	privateRaw, e := json.Marshal(private)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(context.Background(), `UPDATE posts SET draft=$2 WHERE id=$1`, liveID, privateRaw); e != nil {
		t.Fatal(e)
	}

	if e := Migrate(context.Background(), db); e != nil {
		t.Fatal(e)
	}
	var slug string
	if e := db.QueryRow(context.Background(), `SELECT first_published_slug FROM posts WHERE id=$1`, id).Scan(&slug); e != nil || slug != "existing-slug" {
		t.Fatalf("existing unpublished slug lost: %q %v", slug, e)
	}
	if e := Migrate(context.Background(), db); e != nil {
		t.Fatal(e)
	}
	var versions int
	if e := db.QueryRow(context.Background(), `SELECT count(*) FROM schema_migrations`).Scan(&versions); e != nil || versions != 3 {
		t.Fatalf("migration history=%d error=%v", versions, e)
	}
	var raw []byte
	if e := db.QueryRow(context.Background(), `SELECT published_summary FROM posts WHERE id=$1`, liveID).Scan(&raw); e != nil {
		t.Fatal(e)
	}
	var summary domain.SnapshotSummary
	if e := json.Unmarshal(raw, &summary); e != nil || summary.Excerpt != "Legacy writing preserved." || summary.ReadingMinutes != 1 {
		t.Fatalf("legacy summary lost content: %+v %v", summary, e)
	}
	var draftRaw []byte
	if e := db.QueryRow(context.Background(), `SELECT draft_summary FROM posts WHERE id=$1`, liveID).Scan(&draftRaw); e != nil {
		t.Fatal(e)
	}
	var draftSummary domain.SnapshotSummary
	if e := json.Unmarshal(draftRaw, &draftSummary); e != nil || draftSummary.Excerpt != "Private migrated excerpt" || summary.Excerpt == draftSummary.Excerpt {
		t.Fatal("summary backfill mixed private and published content")
	}
	var missing int
	if e := db.QueryRow(context.Background(), `SELECT count(*) FROM posts WHERE draft_summary='{}'::jsonb OR(published IS NOT NULL AND published_summary IS NULL)`).Scan(&missing); e != nil || missing != 0 {
		t.Fatal("backfill skipped a batch")
	}
	if _, e := db.Exec(context.Background(), `INSERT INTO posts(id,author_id,draft,first_published_slug) SELECT $1,author_id,draft,first_published_slug FROM posts WHERE id=$2`, uuid.NewString(), id); e == nil {
		t.Fatal("duplicate unpublished slug reservation accepted")
	}
}
func TestMigrateRejectsLegacySlugCollisionWithoutChangingURLs(t *testing.T) {
	db := versionOneDatabase(t)
	author := legacyAuthor(t, db)
	legacyPost(t, db, author, "collision", false)
	live := legacyPost(t, db, author, "collision", true)
	e := Migrate(context.Background(), db)
	if e == nil || (!strings.Contains(e.Error(), "Cannot reserve historical post slugs") || !strings.Contains(e.Error(), "Export")) {
		t.Fatalf("missing explicit historical collision error: %v", e)
	}
	var slug string
	if e = db.QueryRow(context.Background(), `SELECT published->>'slug' FROM posts WHERE id=$1`, live).Scan(&slug); e != nil || slug != "collision" {
		t.Fatal("failed migration changed live URL")
	}
	var versions int
	if e = db.QueryRow(context.Background(), `SELECT count(*) FROM schema_migrations`).Scan(&versions); e != nil || versions != 1 {
		t.Fatal("failed migration changed history")
	}
}

func TestLoadMigrationsUsesNumericVersionsAndRejectsDuplicates(t *testing.T) {
	files := fstest.MapFS{"migrations/10_tenth.sql": {Data: []byte("SELECT 10;")}, "migrations/2_second.sql": {Data: []byte("SELECT 2;")}}
	migrations, e := loadMigrations(files)
	if e != nil {
		t.Fatal(e)
	}
	if len(migrations) != 2 || migrations[0].Version != 2 || migrations[1].Version != 10 {
		t.Fatal("migration order is not numeric")
	}
	files["migrations/02_duplicate.sql"] = &fstest.MapFile{Data: []byte("SELECT 2;")}
	if _, e = loadMigrations(files); e == nil {
		t.Fatal("duplicate numeric migration version accepted")
	}
}

func TestMigratePreservesCurrentLegacyURLsAndLatestUnpublishedSlug(t *testing.T) {
	db := versionOneDatabase(t)
	author := legacyAuthor(t, db)
	current := legacyPost(t, db, author, "former-slug", true)
	snapshot := domain.EmptySnapshot()
	snapshot.Title = "Current publication"
	snapshot.Slug = "current-slug"
	raw, e := json.Marshal(snapshot)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(context.Background(), `UPDATE posts SET draft=$2,published=$2 WHERE id=$1`, current, raw); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(context.Background(), `INSERT INTO revisions(post_id,snapshot) VALUES($1,$2)`, current, raw); e != nil {
		t.Fatal(e)
	}
	// This live URL is valid once the other legacy post has moved to its newer URL.
	former := legacyPost(t, db, author, "former-slug", true)
	unpublished := legacyPost(t, db, author, "unpublished-first", false)
	snapshot.Slug = "unpublished-latest"
	raw, e = json.Marshal(snapshot)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(context.Background(), `UPDATE posts SET draft=$2 WHERE id=$1`, unpublished, raw); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(context.Background(), `INSERT INTO revisions(post_id,snapshot) VALUES($1,$2)`, unpublished, raw); e != nil {
		t.Fatal(e)
	}
	for attempt := 0; attempt < 2; attempt++ {
		if e = Migrate(context.Background(), db); e != nil {
			t.Fatal(e)
		}
		var reserved, canonical, summarySlug string
		if e = db.QueryRow(context.Background(), `SELECT first_published_slug,published->>'slug',published_summary->>'slug' FROM posts WHERE id=$1`, current).Scan(&reserved, &canonical, &summarySlug); e != nil {
			t.Fatal(e)
		}
		if reserved != "current-slug" || canonical != reserved || summarySlug != reserved {
			t.Fatalf("current publication URL changed: reserved=%s canonical=%s summary=%s", reserved, canonical, summarySlug)
		}
		var resolved string
		if e = db.QueryRow(context.Background(), `SELECT id FROM posts WHERE author_id=$1 AND first_published_slug='current-slug' AND published IS NOT NULL`, author).Scan(&resolved); e != nil || resolved != current {
			t.Fatal("current public route no longer resolves its post")
		}
		if e = db.QueryRow(context.Background(), `SELECT first_published_slug FROM posts WHERE id=$1`, former).Scan(&reserved); e != nil || reserved != "former-slug" {
			t.Fatal("another current publication was displaced by a historical slug")
		}
		if e = db.QueryRow(context.Background(), `SELECT first_published_slug FROM posts WHERE id=$1`, unpublished).Scan(&reserved); e != nil || reserved != "unpublished-latest" {
			t.Fatal("unpublished legacy post did not retain its latest published URL")
		}
	}
}
