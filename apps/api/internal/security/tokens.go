package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

func randomBytes() []byte {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return b
}
func RandomToken() string { return hex.EncodeToString(randomBytes()) }

// RandomURLToken is 32 random bytes in unpadded base64url (43 characters).
func RandomURLToken() string    { return base64.RawURLEncoding.EncodeToString(randomBytes()) }
func HashToken(v string) string { b := sha256.Sum256([]byte(v)); return hex.EncodeToString(b[:]) }
