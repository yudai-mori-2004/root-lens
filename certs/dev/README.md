# Dev Certificates (NOT for production)

These keys exist in the repository intentionally for local development.
Production keys are generated and stored in AWS KMS (non-extractable).

## Files

| File | Purpose |
|------|---------|
| `root-ca.pem` / `root-ca-key.pem` | Dev Root CA (pathLenConstraint:1, 20 years) |
| `ios-intermediate-ca.pem` / `*-key.pem` | Dev iOS Intermediate CA (pathLenConstraint:0, 5 years) |
| `android-intermediate-ca.pem` / `*-key.pem` | Dev Android Intermediate CA (pathLenConstraint:0, 5 years) |

## Regeneration

```bash
rm root-ca.pem root-ca-key.pem
./gen-root-ca.sh
./gen-intermediate-ca.sh ios
./gen-intermediate-ca.sh android
```
