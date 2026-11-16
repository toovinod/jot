package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

func RandomToken() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func HashToken(v string) string { b := sha256.Sum256([]byte(v)); return hex.EncodeToString(b[:]) }
