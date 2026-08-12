# Garage Talk

## Overview
Garage Talk is a web-based platform for automotive mechanics designed to foster collaboration and knowledge sharing. It integrates video sharing for tutorials, AI-powered fault diagnosis, podcast forums for discussions, and real-time chat rooms for troubleshooting. The platform supports a 4-tier subscription model via Stripe, offering varied access to features such as the "Gearhead Agent" (AI diagnostic assistant) and Jitsi Meet for live video streaming. Key capabilities include uploading repair content, AI-driven diagnostics, community discussions, and live collaboration, with a business vision to enhance the automotive repair community's efficiency and connectivity.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React 18, TypeScript, and Vite. It employs Wouter for routing, TanStack Query for server state management, and shadcn/ui with Tailwind CSS for a Material Design-inspired UI. Typography uses Inter and Roboto Mono, with a responsive, mobile-first grid system. The platform includes a landing page, authentication flows, a user dashboard, and a floating global navigation bar. It also features PWA capabilities and is prepared for native Android builds using Capacitor. Internationalization is supported via `react-i18next`, with language detection and a user-selectable language switcher.

### Backend
The backend is built with Express.js on Node.js, providing a REST API and a WebSocket server for real-time communication. It features centralized error handling and uses JSON for data exchange.

### Database
Drizzle ORM with PostgreSQL (Neon Database) manages data, utilizing a schema-first approach. Core data models include Users, Videos, Chat Rooms, Messages, and Searches, all using UUIDs for primary keys and Zod for validation.

### Real-Time Communication
A WebSocket server powers real-time chat rooms, including spatial virtual chat rooms with Leaflet maps for interactive, proximity-based messaging. Location privacy is maintained through IP-based geolocation, displaying only city-level information and respecting VPN usage.

### User Presence Tracking
The platform features real-time online/offline status tracking for users. Presence is managed through WebSocket connections with reference counting to handle multiple browser tabs/connections per user. A 5-second grace period prevents status flickering during reconnects. Online status is displayed in chat rooms with a green indicator dot on user avatars and "Online/Offline" text labels in user profile popovers.

### AI Integration
The "Gearhead Agent" uses OpenAI's GPT-3.5/4 for natural language automotive fault diagnosis, providing diagnostic summaries, causes, fixes, and related content suggestions. Access is tiered based on subscription level.

### Live Video & Scheduling
Jitsi Meet is integrated for live video streaming, screen sharing, and conferencing, with features tiered by subscription. Paid tiers can schedule sessions in advance using Google Calendar integration, and live streams can be recorded to cloud storage or downloaded locally.

### Admin Portal
A separate admin portal (`/admin/login`) offers dashboard statistics, real-time analytics, user management, and configuration settings, secured with session-based authentication. Admin password recovery (`/admin/recovery`) uses two-factor authentication requiring both email and phone verification with cryptographically secure OTP codes.

## External Dependencies

*   **AI/ML:** OpenAI API (via Replit AI Integrations)
*   **Ad Monetization:** Google AdSense
*   **Database:** Neon PostgreSQL
*   **Video Streaming:** Jitsi Meet
*   **Payments:** Stripe
*   **Object Storage:** Replit Object Storage
*   **Email:** Resend (for transactional emails like password reset)
*   **Calendar:** Google Calendar API (via Replit Google Calendar connector)
*   **SMS:** Twilio (for phone number authentication OTP codes)