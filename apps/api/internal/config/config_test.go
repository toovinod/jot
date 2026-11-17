package config

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestNeonStorageEnvironment(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("APP_ORIGIN", "http://localhost:3000")
	t.Setenv("S3_BUCKET", "jot")
	t.Setenv("S3_ENDPOINT", "")
	t.Setenv("S3_ACCESS_KEY_ID", "")
	t.Setenv("S3_SECRET_ACCESS_KEY", "")
	t.Setenv("S3_REGION", "")
	t.Setenv("S3_PUBLIC_URL", "")
	t.Setenv("AWS_ENDPOINT_URL_S3", "https://storage.example.com/")
	t.Setenv("AWS_REGION", "ap-southeast-1")
	t.Setenv("AWS_ACCESS_KEY_ID", "neon-key")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "neon-secret")
	cfg := FromEnv()
	if err := Validate(cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.S3PublicURL != "https://storage.example.com/jot" || cfg.S3Region != "ap-southeast-1" || cfg.S3AccessKey != "neon-key" || cfg.S3SecretKey != "neon-secret" {
		t.Fatal("CLI storage configuration did not resolve to the branch's public bucket")
	}
	t.Setenv("S3_ENDPOINT", "https://another-provider.example.com")
	t.Setenv("S3_ACCESS_KEY_ID", "explicit-key")
	t.Setenv("S3_SECRET_ACCESS_KEY", "explicit-secret")
	t.Setenv("S3_REGION", "us-east-2")
	t.Setenv("S3_PUBLIC_URL", "https://cdn.example.com/jot")
	cfg = FromEnv()
	if cfg.S3Endpoint != "https://another-provider.example.com" || cfg.S3AccessKey != "explicit-key" || cfg.S3SecretKey != "explicit-secret" || cfg.S3Region != "us-east-2" || cfg.S3PublicURL != "https://cdn.example.com/jot" {
		t.Fatal("explicit provider settings were overridden by managed storage variables")
	}
}

func TestStorageConfigurationRejectsUnusablePublicURLs(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	for _, publicURL := range []string{"javascript://media.example.com", "https://media.example.com?prefix=images", "https://media.example.com/images#asset", "https://user:secret@media.example.com", "https://media.example.com?", "https://:443"} {
		t.Run(publicURL, func(t *testing.T) {
			c := Config{Origin: "http://localhost:3000", S3Bucket: "images", S3AccessKey: "key", S3SecretKey: "secret", S3PublicURL: publicURL}
			if Validate(c) == nil {
				t.Fatalf("accepted unusable image base URL %q", publicURL)
			}
		})
	}
	c := Config{Origin: "http://localhost:3000", S3Bucket: "images", S3AccessKey: "key", S3SecretKey: "secret", S3PublicURL: "https://media.example.com/images"}
	if e := Validate(c); e != nil {
		t.Fatal(e)
	}
	c.S3SecretKey = ""
	if Validate(c) == nil {
		t.Fatal("partially configured S3 storage accepted")
	}
}
func TestOriginRejectsEmptyQueryAndHostname(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	for _, origin := range []string{"https://example.com?", "https://example.com#", "https://:443"} {
		if Validate(Config{Origin: origin}) == nil {
			t.Fatalf("accepted non-browser origin %q", origin)
		}
	}
}

func TestDatabasePasswordEnvironmentPreservesReservedCharacters(t *testing.T) {
	password := "reserved/@:#?='\\ password"
	t.Setenv("PGPASSWORD", password)
	cfg, err := pgxpool.ParseConfig("postgres://jot@postgres:5432/jot?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.Password != password {
		t.Fatal("database password was not preserved literally")
	}
	cfg, err = pgxpool.ParseConfig("postgres://jot:explicit@host/jot?sslmode=require")
	if err != nil || cfg.ConnConfig.Password != "explicit" {
		t.Fatal("explicit hosted URL password did not override environment")
	}
}

func TestUnknownApplicationEnvironmentCannotDisableTLSGuard(t *testing.T) {
	t.Setenv("APP_ENV", "prod")
	if Validate(Config{Origin: "http://example.com"}) == nil {
		t.Fatal("environment typo silently bypassed production TLS guard")
	}
	t.Setenv("APP_ENV", "production")
	if Validate(Config{Origin: "https://example.com"}) != nil {
		t.Fatal("valid production configuration rejected")
	}
}

func TestViewHashSecretIsOptionalButNotWeak(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("APP_ORIGIN", "http://localhost:3000")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")
	t.Setenv("S3_BUCKET", "")
	t.Setenv("VIEW_HASH_SECRET", "")
	if cfg := FromEnv(); cfg.ViewHashSecret != "" || Validate(cfg) != nil {
		t.Fatal("empty VIEW_HASH_SECRET should select the per-process secret")
	}
	t.Setenv("VIEW_HASH_SECRET", "short")
	if Validate(FromEnv()) == nil {
		t.Fatal("accepted a guessable VIEW_HASH_SECRET")
	}
	t.Setenv("VIEW_HASH_SECRET", "0123456789abcdef0123456789abcdef")
	if cfg := FromEnv(); cfg.ViewHashSecret != "0123456789abcdef0123456789abcdef" || Validate(cfg) != nil {
		t.Fatal("rejected a 32-character VIEW_HASH_SECRET")
	}
}
