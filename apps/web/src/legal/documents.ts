export const LEGAL_ENTITY = "Garage Talk Inc.";
export const LEGAL_EFFECTIVE_DATE = "August 22, 2026";
export const MIN_AGE_LABEL = "13";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export const privacyPolicySections: LegalSection[] = [
  {
    title: "Overview",
    paragraphs: [
      `${LEGAL_ENTITY} (“Garage Talk,” “we,” “us,” or “our”) operates the Garage Talk website, app, and related services (collectively, the “Service”).`,
      "This Privacy Policy explains what information we collect, how we use it, and the choices you have. By creating an account or using the Service, you agree to this Privacy Policy.",
    ],
  },
  {
    title: "Who may use Garage Talk",
    paragraphs: [
      `The Service is intended for users who are at least ${MIN_AGE_LABEL} years old. We do not knowingly collect personal information from children under ${MIN_AGE_LABEL}.`,
      "If you believe a child under 13 has provided us information, contact us at privacy@garagetalk.app and we will take steps to delete it.",
    ],
  },
  {
    title: "Information we collect",
    paragraphs: [
      "Account information: email address, username, password (stored as a secure hash), profile details you choose to provide, and year of birth used for age verification.",
      "Usage information: posts, messages, garage/vehicle data, marketplace activity, live session participation, AI diagnostic prompts, and similar content you submit through the Service.",
      "Payment information: subscription and tip payments are processed by Stripe. We receive billing status and limited transaction metadata, not full card numbers.",
      "Device and log data: IP address, browser type, device identifiers, session cookies, and diagnostic logs used for security, fraud prevention, and service reliability.",
      "Location: only if you choose to add city or location information to your profile or grant location-related permissions.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "Provide, operate, and improve the Service, including chat rooms, live video, marketplace listings, GearHead AI diagnostics, and account features.",
      "Process payments, subscriptions, tips, and creator payouts.",
      "Send transactional emails such as verification, password reset, and service notices.",
      "Enforce our terms, prevent abuse, and protect the safety of users and the platform.",
      "Comply with law and respond to lawful requests.",
    ],
  },
  {
    title: "How we share information",
    paragraphs: [
      "Public content you post (such as room messages, listings, or live session metadata) may be visible to other users according to the feature you use.",
      "Service providers that help us run the Service (hosting, email, payments, video, storage, analytics, and AI providers) receive information only as needed to perform their work.",
      "We may disclose information if required by law, to protect rights and safety, or in connection with a merger, acquisition, or asset sale with appropriate safeguards.",
      "We do not sell your personal information.",
    ],
  },
  {
    title: "Your choices and rights",
    paragraphs: [
      "You may update profile information, export your data from account settings, and request account deletion.",
      "You may opt out of non-essential emails where those controls are offered.",
      "Depending on where you live, you may have additional rights to access, correct, delete, or port personal information. Contact privacy@garagetalk.app to exercise those rights.",
    ],
  },
  {
    title: "Data retention and security",
    paragraphs: [
      "We retain information while your account is active and as needed to provide the Service, comply with law, resolve disputes, and enforce agreements.",
      "We use administrative, technical, and organizational safeguards designed to protect information. No method of transmission or storage is completely secure.",
    ],
  },
  {
    title: "International users",
    paragraphs: [
      "If you access the Service from outside the United States, you understand that information may be processed in the United States and other countries where we or our providers operate.",
    ],
  },
  {
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. We will post the revised version with a new effective date. Continued use after changes become effective means you accept the updated policy.",
    ],
  },
  {
    title: "Contact us",
    paragraphs: [
      `${LEGAL_ENTITY}`,
      "privacy@garagetalk.app",
    ],
  },
];

export const termsOfUseSections: LegalSection[] = [
  {
    title: "Agreement",
    paragraphs: [
      `These Terms of Use (“Terms”) are a binding agreement between you and ${LEGAL_ENTITY} governing your use of Garage Talk.`,
      `You must be at least ${MIN_AGE_LABEL} years old to use the Service.`,
    ],
  },
  {
    title: "Your account",
    paragraphs: [
      "You are responsible for your account credentials and for activity under your account.",
      "You agree to provide accurate information and not impersonate others or create accounts for anyone under 13.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "Do not use the Service for unlawful, harassing, fraudulent, or dangerous activity, including unsafe automotive advice presented as professional instruction without appropriate qualifications.",
      "Do not attempt to disrupt, scrape, reverse engineer, or compromise the Service or other users’ data.",
      "We may suspend or terminate accounts that violate these Terms or create risk for the community.",
    ],
  },
  {
    title: "Content and licenses",
    paragraphs: [
      "You retain ownership of content you submit, but grant Garage Talk a license to host, display, and distribute that content as needed to operate the Service.",
      "GearHead AI output is informational only and is not a substitute for a qualified mechanic, manufacturer service procedures, or professional inspection.",
    ],
  },
  {
    title: "Paid features",
    paragraphs: [
      "Subscriptions, tips, marketplace transactions, and virtual gifts are subject to posted pricing and third-party payment terms.",
      "Fees are generally non-refundable except where required by law or explicitly stated.",
    ],
  },
  {
    title: "Disclaimers and limitation of liability",
    paragraphs: [
      'THE SERVICE IS PROVIDED “AS IS” WITHOUT WARRANTIES OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, GARAGE TALK INC. WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.',
    ],
  },
  {
    title: "Contact",
    paragraphs: ["Questions about these Terms: legal@garagetalk.app"],
  },
];
