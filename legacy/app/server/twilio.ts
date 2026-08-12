// Twilio integration for Garage Talk admin password recovery SMS
// Using Replit Twilio connector for secure credential management
import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.error('[Twilio] No Replit identity token found');
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  if (!hostname) {
    console.error('[Twilio] REPLIT_CONNECTORS_HOSTNAME not set');
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not set');
  }

  try {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      console.error('[Twilio] Failed to fetch credentials:', response.status);
      throw new Error(`Failed to fetch Twilio credentials: ${response.status}`);
    }

    const data = await response.json();
    connectionSettings = data.items?.[0];

    if (!connectionSettings || !connectionSettings.settings?.account_sid || 
        !connectionSettings.settings?.api_key || !connectionSettings.settings?.api_key_secret) {
      console.error('[Twilio] Not connected - missing credentials');
      throw new Error('Twilio not connected');
    }

    console.log('[Twilio] Credentials loaded successfully');

    return {
      accountSid: connectionSettings.settings.account_sid,
      apiKey: connectionSettings.settings.api_key,
      apiKeySecret: connectionSettings.settings.api_key_secret,
      phoneNumber: connectionSettings.settings.phone_number
    };
  } catch (error) {
    console.error('[Twilio] Error fetching credentials:', error);
    throw error;
  }
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, { accountSid });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export async function sendAdminRecoverySMS(toPhone: string, code: string) {
  console.log('[Twilio] Sending admin recovery SMS to:', toPhone);
  
  try {
    const client = await getTwilioClient();
    const fromPhone = await getTwilioFromPhoneNumber();

    if (!fromPhone) {
      throw new Error('Twilio phone number not configured');
    }

    const message = await client.messages.create({
      body: `Garage Talk Admin Recovery - Your verification code is: ${code}. This code expires in 15 minutes.`,
      from: fromPhone,
      to: toPhone
    });

    console.log('[Twilio] SMS sent successfully, SID:', message.sid);
    return message;
  } catch (error) {
    console.error('[Twilio] Failed to send SMS:', error);
    throw error;
  }
}

export async function sendAdminLoginSMS(toPhone: string, code: string) {
  console.log('[Twilio] Sending admin login 2FA SMS to:', toPhone);
  
  try {
    const client = await getTwilioClient();
    const fromPhone = await getTwilioFromPhoneNumber();

    if (!fromPhone) {
      throw new Error('Twilio phone number not configured');
    }

    const message = await client.messages.create({
      body: `Garage Talk Admin Login - Your verification code is: ${code}. This code expires in 10 minutes.`,
      from: fromPhone,
      to: toPhone
    });

    console.log('[Twilio] Login SMS sent successfully, SID:', message.sid);
    return message;
  } catch (error) {
    console.error('[Twilio] Failed to send login SMS:', error);
    throw error;
  }
}
