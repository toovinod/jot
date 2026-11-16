package httpapi

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/jot-project/jot/apps/api/internal/security"
)

const maxImageSize = 10 << 20
const maxConcurrentUploads = 4

var mediaPattern = regexp.MustCompile(`^[a-f0-9]{64}\.(png|jpg|gif)$`)

func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if r.Context().Err() != nil {
		writeError(w, 408, "Upload request was cancelled", "request_cancelled")
		return
	}
	// Admit uploads before multipart parsing allocates its in-memory file buffers.
	select {
	case s.uploadSlots <- struct{}{}:
		defer func() { <-s.uploadSlots }()
	default:
		w.Header().Set("Retry-After", "1")
		writeError(w, 429, "Too many uploads in progress; try again shortly", "upload_busy")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageSize+(1<<20))
	if e := r.ParseMultipartForm(maxImageSize); e != nil {
		writeError(w, 400, "Upload an image smaller than 10 MB", "invalid_upload")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, _, e := r.FormFile("file")
	if e != nil {
		writeError(w, 400, "An image file is required", "invalid_upload")
		return
	}
	defer f.Close()
	data, e := io.ReadAll(io.LimitReader(f, maxImageSize+1))
	if e != nil || len(data) > maxImageSize {
		writeError(w, 400, "Image is too large", "invalid_upload")
		return
	}
	cfg, format, e := image.DecodeConfig(bytes.NewReader(data))
	if e != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > 12000 || cfg.Height > 12000 || int64(cfg.Width)*int64(cfg.Height) > 40000000 {
		writeError(w, 400, "Supported images are PNG, JPEG and GIF, up to 40 megapixels", "invalid_upload")
		return
	}
	ext := map[string]string{"jpeg": "jpg", "png": "png", "gif": "gif"}[format]
	if ext == "" {
		writeError(w, 400, "Unsupported image format", "invalid_upload")
		return
	}
	key := security.RandomToken() + "." + ext
	contentType := map[string]string{"jpg": "image/jpeg", "png": "image/png", "gif": "image/gif"}[ext]
	assetURL := "/media/" + key
	if s.Config.S3Bucket != "" {
		assetURL = s.Config.S3PublicURL + "/" + key
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	if _, e = tx.Exec(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, u.ID); e != nil {
		writeInternalError(w, e)
		return
	}
	var used, recentBytes, count, recentCount int64
	e = tx.QueryRow(r.Context(), `SELECT COALESCE(sum(bytes),0),COALESCE(sum(bytes) FILTER(WHERE created_at>now()-interval '1 hour'),0),count(*),count(*) FILTER(WHERE created_at>now()-interval '1 hour') FROM media_assets WHERE user_id=$1`, u.ID).Scan(&used, &recentBytes, &count, &recentCount)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if used+int64(len(data)) > 256<<20 || recentBytes+int64(len(data)) > 50<<20 || count >= 2000 || recentCount >= 20 {
		writeError(w, 429, "Upload storage or hourly quota reached", "upload_quota")
		return
	}
	_, e = tx.Exec(r.Context(), `INSERT INTO media_assets(key,user_id,bytes,url) VALUES($1,$2,$3,$4)`, key, u.ID, len(data), assetURL)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	uploaded := false
	retainReservation := false
	defer func() {
		if !uploaded && !retainReservation {
			cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if _, err := s.DB.Exec(cleanup, `DELETE FROM media_assets WHERE key=$1`, key); err != nil {
				slog.Error("Upload reservation cleanup failed", "error", err)
			}
		}
	}()

	if s.Config.S3Bucket != "" {
		if s.Config.S3PublicURL == "" || s.Config.S3AccessKey == "" || s.Config.S3SecretKey == "" {
			writeError(w, 503, "Image storage is not configured", "storage_unavailable")
			return
		}
		options := s3.Options{Region: s.Config.S3Region, Credentials: credentials.NewStaticCredentialsProvider(s.Config.S3AccessKey, s.Config.S3SecretKey, ""), UsePathStyle: true, BaseEndpoint: optionalString(s.Config.S3Endpoint)}
		if s.storageHTTPClient != nil {
			options.HTTPClient = s.storageHTTPClient
		}
		client := s3.New(options)
		// A failed response can follow a committed object; keep its quota reservation.
		retainReservation = true
		_, e = client.PutObject(r.Context(), &s3.PutObjectInput{Bucket: aws.String(s.Config.S3Bucket), Key: aws.String(key), Body: bytes.NewReader(data), ContentType: aws.String(contentType), CacheControl: aws.String("public,max-age=31536000,immutable")})
		assetURL = s.Config.S3PublicURL + "/" + key
	} else {
		if e = os.MkdirAll(s.Config.UploadDir, 0700); e == nil {
			var out *os.File
			out, e = os.OpenFile(filepath.Join(s.Config.UploadDir, key), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if e == nil {
				_, e = out.Write(data)
				closeErr := out.Close()
				if e == nil {
					e = closeErr
				}
				if e != nil {
					if removalError := os.Remove(filepath.Join(s.Config.UploadDir, key)); removalError != nil && !os.IsNotExist(removalError) {
						retainReservation = true
						slog.Error("Failed upload file could not be removed", "error", removalError)
					}
				}
			}
		}
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	uploaded = true
	writeJSON(w, 201, map[string]string{"url": assetURL})
}
func optionalString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
func (s *Server) media(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if s.Config.S3Bucket != "" || !mediaPattern.MatchString(key) {
		notFound(w)
		return
	}
	f, e := os.Open(filepath.Join(s.Config.UploadDir, key))
	if e != nil {
		notFound(w)
		return
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil || !st.Mode().IsRegular() {
		notFound(w)
		return
	}
	ext := strings.TrimPrefix(filepath.Ext(key), ".")
	w.Header().Set("Content-Type", map[string]string{"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif"}[ext])
	w.Header().Set("Cache-Control", "public,max-age=31536000,immutable")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, key))
	http.ServeContent(w, r, key, st.ModTime(), f)
}
