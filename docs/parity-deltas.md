# Parity deltas

Intentional differences from legacy `garage-talk-40` / `/legacy`.

| ID | Change | Reason (spec §1.3) |
|----|--------|--------------------|
| PD-1 | Google AdSense removed | Store-readiness / no ads in MVP |
| PD-2 | No in-app iOS digital subscription sales via Stripe | App Store 3.1.1; web/PWA checkout only |
| PD-3 | Spatial chat uses user-set consented location, not IP geolocation | Privacy; mechanism fixed, feature preserved |
| PD-4 | All `@replit/*`, Replit object storage, `stripe-replit-sync` removed | Standard tooling + direct Stripe SDK |
| PD-5 | Square removed | Consolidate on Stripe |
| PD-6 | Public Jitsi replaced by LiveKit | Self-managed live with OBS/RTMP parity |
