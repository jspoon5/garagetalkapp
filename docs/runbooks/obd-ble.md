# OBD BLE ENV_LIMITED runbook

Hardware validation is ENV_LIMITED because it requires a vehicle or bench ECU, an ELM327-compatible BLE adapter, and a Chromium browser with Web Bluetooth.

## Adapter setup

1. Plug the ELM327 BLE adapter into the OBD-II port.
2. Open a Chromium desktop browser with Web Bluetooth enabled.
3. Pair only from the Garage Talk OBD flow; do not pair the device in OS settings first.
4. Expected initialization command sequence: `ATZ`, `ATE0`, `ATSP0`.

## Smoke test

1. Connect to the adapter and confirm the fingerprint is remembered.
2. Read stored DTCs with mode `03` and pending DTCs with mode `07`.
3. Start live PID polling for RPM (`010C`), coolant (`0105`), MAF (`0110`), and fuel trims (`0106`, `0107`).
4. Confirm snapshots appear on the active diagnostic session.

## iOS fallback

iOS Safari does not expose Web Bluetooth. Show the unsupported-browser fallback and offer manual DTC entry plus photo/audio upload instead.
