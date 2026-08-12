# Data map (PII & collection)

| Field / event | Table / sink | Purpose | Retention |
|---------------|--------------|---------|-----------|
| email | users.email | account identity | until account purge |
| username | users.username | public identity | until account purge |
| phone | users.phone | optional OTP | until account purge / verify expiry |
| password_hash | users.password_hash | auth | until account purge |
| city_text | users.city_text | profile / spatial pin label | user-controlled |
| ip_hash | sessions.ip_hash | session security (hashed) | session lifetime |
| email_signup | email_signup_log | marketing capture parity | policy TBD |
