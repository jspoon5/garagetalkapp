// Google Calendar Integration Service
// Uses Replit's Google Calendar connector for authentication

import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Google Calendar not available: X_REPLIT_TOKEN not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEventData {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmails?: string[];
  meetingLink?: string;
}

export async function createCalendarEvent(eventData: CalendarEventData): Promise<string | null> {
  try {
    const calendar = await getGoogleCalendarClient();
    
    const event = {
      summary: eventData.title,
      description: eventData.description || '',
      start: {
        dateTime: eventData.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: eventData.endTime.toISOString(),
        timeZone: 'UTC',
      },
      attendees: eventData.attendeeEmails?.map(email => ({ email })) || [],
      conferenceData: eventData.meetingLink ? {
        conferenceSolution: {
          name: 'Garage Talk',
        },
        entryPoints: [{
          entryPointType: 'video',
          uri: eventData.meetingLink,
          label: 'Join Garage Talk Session',
        }],
      } : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all',
    });

    return response.data.id || null;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return null;
  }
}

export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<CalendarEventData>
): Promise<boolean> {
  try {
    const calendar = await getGoogleCalendarClient();
    
    const updateData: any = {};
    if (updates.title) updateData.summary = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.startTime) {
      updateData.start = {
        dateTime: updates.startTime.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (updates.endTime) {
      updateData.end = {
        dateTime: updates.endTime.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (updates.attendeeEmails) {
      updateData.attendees = updates.attendeeEmails.map(email => ({ email }));
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: updateData,
      sendUpdates: 'all',
    });

    return true;
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return false;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  try {
    const calendar = await getGoogleCalendarClient();
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });

    return true;
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return false;
  }
}

export async function isCalendarConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
