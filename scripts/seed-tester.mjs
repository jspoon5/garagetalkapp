/**
 * Best-effort live register for the two amateur testers.
 * Password reset for an existing username is handled on API boot
 * (see apps/api/src/seed-testers.ts), not by this public-API script.
 *
 *   node scripts/seed-tester.mjs
 */
const base = (process.env.API_BASE ?? "https://garagetalk-app.onrender.com").replace(/\/$/, "");
const testers = [
  { email: "tester@garagetalk.app", username: "tester", password: "GarageTalkTest1" },
  { email: "tester2@garagetalk.app", username: "tester2", password: "GarageTalkTest1" },
];

const headers = {
  "Content-Type": "application/json",
  Origin: base,
};

let failed = false;
for (const tester of testers) {
  const register = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers,
    body: JSON.stringify(tester),
  });

  if (register.ok) {
    const data = await register.json();
    console.log(`created tester ${data.user?.username} (${data.user?.email}) tier=${data.user?.tier ?? "amateur"}`);
    continue;
  }

  if (register.status === 409) {
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ username: tester.username, password: tester.password }),
    });
    if (login.ok) {
      console.log(`tester already existed; login ok for ${tester.username}`);
      continue;
    }
    failed = true;
    console.error(
      `tester ${tester.username} exists but login failed (${login.status}). Wait for the API boot seed after deploy, then retry login.`,
    );
    continue;
  }

  failed = true;
  console.error(`register failed for ${tester.username}: ${register.status} ${await register.text()}`);
}

process.exit(failed ? 1 : 0);
