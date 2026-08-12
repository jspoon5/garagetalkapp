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
| auth_token_hash | auth_tokens.token_hash | email verify / password reset | token expiry |
| passkey_credential | passkeys.credential_id + public_key | WebAuthn login | until account purge |
| city_pin | users.city_text | optional map pin label | user-removable |
| city_pin_lat | users.location_lat | consented approximate city pin latitude; never derived from IP | user-removable |
| city_pin_lng | users.location_lng | consented approximate city pin longitude; never derived from IP | user-removable |
| city_pin_consent | users.location_consent_at | records explicit location-pin consent time | user-removable |

