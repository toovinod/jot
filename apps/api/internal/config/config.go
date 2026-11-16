package config

import (
	"errors"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const DefaultOpenAIModel = "gpt-6-luna"

type Config struct {
	DatabaseURL       string
	Addr              string
	Origin            string
	UploadDir         string
	OpenAIKey         string
	OpenAIModel       string
	ResendKey         string
	EmailFrom         string
	S3Bucket          string
	S3Endpoint        string
	S3Region          string
	S3AccessKey       string
	S3SecretKey       string
	S3PublicURL       string
	TrustedProxyCIDRs string
}

func FromEnv() Config {
	bucket := os.Getenv("S3_BUCKET")
	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey, secretKey := os.Getenv("S3_ACCESS_KEY_ID"), os.Getenv("S3_SECRET_ACCESS_KEY")
	region := os.Getenv("S3_REGION")
	publicURL := os.Getenv("S3_PUBLIC_URL")
	if managedEndpoint := os.Getenv("AWS_ENDPOINT_URL_S3"); managedEndpoint != "" && endpoint == "" && accessKey == "" && secretKey == "" {
		endpoint = managedEndpoint
		accessKey, secretKey = os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("AWS_SECRET_ACCESS_KEY")
		if region == "" {
			region = os.Getenv("AWS_REGION")
		}
		if publicURL == "" && bucket != "" {
			publicURL = strings.TrimRight(endpoint, "/") + "/" + url.PathEscape(bucket)
		}
	}
	if region == "" {
		region = "auto"
	}
	return Config{
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		Addr:              env("API_ADDR", ":8080"),
		Origin:            strings.TrimRight(env("APP_ORIGIN", "http://localhost:3000"), "/"),
		TrustedProxyCIDRs: os.Getenv("TRUSTED_PROXY_CIDRS"),
		UploadDir:         env("UPLOAD_DIR", "./uploads"),
		OpenAIKey:         os.Getenv("OPENAI_API_KEY"),
		OpenAIModel:       env("OPENAI_MODEL", DefaultOpenAIModel),
		ResendKey:         os.Getenv("RESEND_API_KEY"),
		EmailFrom:         os.Getenv("EMAIL_FROM"),
		S3Bucket:          bucket,
		S3Endpoint:        endpoint,
		S3Region:          region,
		S3AccessKey:       accessKey,
		S3SecretKey:       secretKey,
		S3PublicURL:       strings.TrimRight(publicURL, "/"),
	}
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func (c Config) EmailEnabled() bool { return c.ResendKey != "" && c.EmailFrom != "" }
func ParseTrustedProxies(raw string) ([]netip.Prefix, error) {
	prefixes := []netip.Prefix{}
	if raw == "" {
		return prefixes, nil
	}
	parts := strings.Split(raw, ",")
	if len(parts) > 32 {
		return nil, errors.New("TRUSTED_PROXY_CIDRS accepts at most 32 prefixes")
	}
	for _, part := range parts {
		p, e := netip.ParsePrefix(strings.TrimSpace(part))
		if e != nil || p.Bits() == 0 {
			return nil, errors.New("TRUSTED_PROXY_CIDRS requires valid, restricted CIDR prefixes")
		}
		prefixes = append(prefixes, p.Masked())
	}
	return prefixes, nil
}
func Validate(c Config) error {
	environment := os.Getenv("APP_ENV")
	if environment != "" && environment != "development" && environment != "test" && environment != "production" {
		return errors.New("APP_ENV must be development, test or production")
	}
	if _, e := ParseTrustedProxies(c.TrustedProxyCIDRs); e != nil {
		return e
	}
	u, valid := parseHTTPBase(c.Origin)
	if !valid || u.Path != "" {
		return errors.New("APP_ORIGIN must be an absolute HTTP or HTTPS origin without a path")
	}
	if os.Getenv("APP_ENV") == "production" && u.Scheme != "https" {
		return errors.New("production APP_ORIGIN must use HTTPS")
	}
	if c.S3Bucket != "" {
		if c.S3AccessKey == "" || c.S3SecretKey == "" || c.S3PublicURL == "" {
			return errors.New("S3_BUCKET requires S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_URL")
		}
		public, ok := parseHTTPBase(c.S3PublicURL)
		if !ok || len(c.S3PublicURL)+69 > 2000 {
			return errors.New("S3_PUBLIC_URL must be an absolute HTTP or HTTPS image base URL without credentials, query or fragment")
		}
		if u.Scheme == "https" && public.Scheme != "https" {
			return errors.New("S3_PUBLIC_URL must use HTTPS when APP_ORIGIN uses HTTPS")
		}
		if c.S3Endpoint != "" {
			if _, ok := parseHTTPBase(c.S3Endpoint); !ok {
				return errors.New("S3_ENDPOINT must be an absolute HTTP or HTTPS base URL")
			}
		}
	}
	return nil
}

func parseHTTPBase(raw string) (*url.URL, bool) {
	u, e := url.Parse(raw)
	if e != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || strings.Contains(raw, "#") || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, false
	}
	if port := u.Port(); port != "" {
		n, e := strconv.Atoi(port)
		if e != nil || n < 1 || n > 65535 {
			return nil, false
		}
	}
	return u, true
}
