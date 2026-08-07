// Resend integration for Garage Talk password reset emails
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.error('[Email] No Replit identity token found - check REPL_IDENTITY or WEB_REPL_RENEWAL');
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  if (!hostname) {
    console.error('[Email] REPLIT_CONNECTORS_HOSTNAME not set');
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not set');
  }

  try {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      console.error('[Email] Failed to fetch Resend credentials:', response.status, response.statusText);
      throw new Error(`Failed to fetch Resend credentials: ${response.status}`);
    }

    const data = await response.json();
    connectionSettings = data.items?.[0];

    if (!connectionSettings || !connectionSettings.settings?.api_key) {
      console.error('[Email] Resend not connected - no API key found in connection settings');
      throw new Error('Resend not connected');
    }

    if (!connectionSettings.settings?.from_email) {
      console.error('[Email] Resend from_email not configured');
      throw new Error('Resend from_email not configured');
    }

    console.log('[Email] Resend credentials loaded successfully, from:', connectionSettings.settings.from_email);

    return {
      apiKey: connectionSettings.settings.api_key, 
      fromEmail: connectionSettings.settings.from_email
    };
  } catch (error) {
    console.error('[Email] Error fetching Resend credentials:', error);
    throw error;
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendPasswordResetEmail(
  toEmail: string, 
  resetToken: string, 
  username: string
) {
  console.log('[Email] Sending password reset email to:', toEmail);
  
  const { client, fromEmail } = await getResendClient();
  
  // Get the app URL - use REPLIT_DOMAINS for deployed apps, or dev domain for development
  const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const appUrl = domains[0] 
    ? `https://${domains[0]}` 
    : devDomain 
    ? `https://${devDomain}` 
    : 'http://localhost:5000';
  
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;
  
  console.log('[Email] Reset URL:', resetUrl);
  console.log('[Email] From:', fromEmail);
  
  try {
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Reset Your Garage Talk Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #d32f2f;">Garage Talk</h1>
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${username},</p>
          <p>We received a request to reset your password for your Garage Talk account.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">Garage Talk - The Mechanic's Community</p>
        </div>
      `
    });

    if (error) {
      console.error('[Email] Resend API error:', error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    console.log('[Email] Password reset email sent successfully, id:', data?.id);
    return data;
  } catch (sendError) {
    console.error('[Email] Failed to send email:', sendError);
    throw sendError;
  }
}

export async function sendAdminRecoveryEmail(
  toEmail: string, 
  code: string, 
  username: string
) {
  console.log('[Email] Sending admin recovery email to:', toEmail);
  
  const { client, fromEmail } = await getResendClient();
  
  try {
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Garage Talk Admin - Password Recovery Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #d32f2f;">Garage Talk Admin</h1>
          <h2 style="color: #333;">Password Recovery Verification</h2>
          <p>Hi ${username},</p>
          <p>You have requested to reset your admin password. Use the verification code below:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d32f2f;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
          <p style="color: #666; font-size: 14px;">You will also receive a verification code via SMS. Both codes are required to reset your password.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please secure your account immediately.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">Garage Talk Admin Portal - Two-Factor Authentication</p>
        </div>
      `
    });

    if (error) {
      console.error('[Email] Resend API error:', error);
      throw new Error(`Failed to send admin recovery email: ${error.message}`);
    }

    console.log('[Email] Admin recovery email sent successfully, id:', data?.id);
    return data;
  } catch (sendError) {
    console.error('[Email] Failed to send admin recovery email:', sendError);
    throw sendError;
  }
}

export async function sendAdminLoginEmail(
  toEmail: string,
  code: string,
  username: string
) {
  console.log('[Email] Sending admin login 2FA email to:', toEmail);
  
  const { client, fromEmail } = await getResendClient();
  
  try {
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Garage Talk Admin - Login Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #d32f2f;">Garage Talk Admin</h1>
          <h2 style="color: #333;">Login Verification</h2>
          <p>Hi ${username},</p>
          <p>A login attempt was made to your admin account. Use the verification code below to complete your sign-in:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d32f2f;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 14px;">You will also receive a verification code via SMS. Both codes are required to complete login.</p>
          <p style="color: #666; font-size: 14px;">If you didn't attempt to log in, please secure your account immediately.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">Garage Talk Admin Portal - Two-Factor Authentication</p>
        </div>
      `
    });

    if (error) {
      console.error('[Email] Resend API error:', error);
      throw new Error(`Failed to send admin login email: ${error.message}`);
    }

    console.log('[Email] Admin login email sent successfully, id:', data?.id);
    return data;
  } catch (sendError) {
    console.error('[Email] Failed to send admin login email:', sendError);
    throw sendError;
  }
}
