export type GarageRoom = {
  slug: string;
  name: string;
  category: string;
  status: "active" | "scheduled" | "coming-soon";
  members: number;
  description: string;
  tags: string[];
  pinnedResources: string[];
  activeUsers: string[];
  chat: { user: string; role: string; message: string; time: string }[];
  gearHeadPrompt: string;
};

export const GARAGE_ROOMS: GarageRoom[] = [
  {
    slug: "car-garage",
    name: "Car Garage",
    category: "Automotive",
    status: "active",
    members: 428,
    description:
      "Diagnostics, maintenance, daily drivers, classics, tuning, detailing, and right-to-repair talk.",
    tags: ["Cars", "OBD-II", "Repair", "Maintenance"],
    pinnedResources: [
      "Basic safety checklist",
      "OBD-II first-scan workflow",
      "Starter tool list",
    ],
    activeUsers: ["TorqueTom", "CadiyossJoe", "WrenchNurse"],
    chat: [
      {
        user: "TorqueTom",
        role: "Mechanic",
        message:
          "Start with codes, battery voltage, and air/fuel/spark before replacing parts.",
        time: "2:14 PM",
      },
      {
        user: "CadiyossJoe",
        role: "Host",
        message:
          "Drop your vehicle year, make, model, engine, and symptoms for better help.",
        time: "2:17 PM",
      },
      {
        user: "GearHead AI",
        role: "Assistant",
        message:
          "Safety note: use jack stands and disconnect power before risky work.",
        time: "2:18 PM",
      },
    ],
    gearHeadPrompt:
      "My car cranks but will not start. Walk me through safe first checks.",
  },
  {
    slug: "truck-bay",
    name: "Truck Bay",
    category: "Trucks",
    status: "active",
    members: 313,
    description:
      "Diesel, towing, off-road builds, work trucks, fleet maintenance, and bed/cab upgrades.",
    tags: ["Diesel", "Towing", "Off-road", "Fleet"],
    pinnedResources: [
      "Towing inspection checklist",
      "Diesel no-start basics",
      "Lift kit safety notes",
    ],
    activeUsers: ["DieselDawn", "LiftedLuis", "FleetFixer"],
    chat: [
      {
        user: "DieselDawn",
        role: "Builder",
        message: "Check grounds and fuel delivery before chasing sensors.",
        time: "1:32 PM",
      },
    ],
    gearHeadPrompt:
      "Help me plan a safe pre-trip inspection for a towing truck.",
  },
  {
    slug: "motorcycle-bench",
    name: "Motorcycle Bench",
    category: "Motorcycles",
    status: "scheduled",
    members: 192,
    description:
      "Bike repair, maintenance, custom builds, riding gear, and restoration progress.",
    tags: ["Motorcycles", "Restoration", "Safety", "Custom"],
    pinnedResources: [
      "Pre-ride inspection",
      "Chain and tire basics",
      "Brake safety reminder",
    ],
    activeUsers: ["MotoMia", "CafeRacerRay"],
    chat: [
      {
        user: "MotoMia",
        role: "Creator",
        message: "Tonight I am streaming a carb clean walkthrough.",
        time: "11:05 AM",
      },
    ],
    gearHeadPrompt: "Create a motorcycle pre-ride inspection checklist.",
  },
  {
    slug: "aviation-hangar",
    name: "Aviation Hangar",
    category: "Aviation",
    status: "coming-soon",
    members: 87,
    description:
      "Drones, RC aircraft, experimental aviation concepts, hangar tools, and safety-first discussions.",
    tags: ["Aviation", "Drones", "RC", "Safety"],
    pinnedResources: [
      "FAA/safety reminder",
      "Pre-flight checklist concept",
      "Battery handling basics",
    ],
    activeUsers: ["RotorRick"],
    chat: [
      {
        user: "RotorRick",
        role: "Pilot",
        message:
          "Aviation topics should stay safety-first and regulation-aware.",
        time: "9:20 AM",
      },
    ],
    gearHeadPrompt:
      "Help me create a safety-first checklist for a small drone project.",
  },
  {
    slug: "smart-home-garage",
    name: "Smart Home Garage",
    category: "Smart Home",
    status: "active",
    members: 246,
    description:
      "IoT devices, smart sensors, smart garage doors, cameras, home automation, and connected appliances.",
    tags: ["IoT", "Smart Home", "Sensors", "Automation"],
    pinnedResources: [
      "Router placement tips",
      "Device naming guide",
      "Basic smart-home security checklist",
    ],
    activeUsers: ["SensorSam", "OccularOps"],
    chat: [
      {
        user: "OccularOps",
        role: "Installer",
        message:
          "Segment smart devices from primary computers when possible.",
        time: "3:01 PM",
      },
    ],
    gearHeadPrompt:
      "Help me plan a secure smart garage camera and sensor setup.",
  },
  {
    slug: "computer-repair-bench",
    name: "Computer Repair Bench",
    category: "Computers",
    status: "active",
    members: 221,
    description:
      "PC repair, laptop issues, software cleanup, hardware upgrades, and right-to-repair support.",
    tags: ["PC Repair", "Laptops", "Diagnostics", "Data"],
    pinnedResources: [
      "Backup before repair",
      "Basic hardware checklist",
      "Malware cleanup notes",
    ],
    activeUsers: ["ByteBuilder", "FixItFran"],
    chat: [
      {
        user: "ByteBuilder",
        role: "Technician",
        message:
          "Back up personal data before wiping or reinstalling anything.",
        time: "4:11 PM",
      },
    ],
    gearHeadPrompt:
      "My laptop is slow. Give me a safe troubleshooting checklist.",
  },
  {
    slug: "wifi-lan-wlan-network-room",
    name: "Wi-Fi / LAN / WLAN Network Room",
    category: "Networking",
    status: "active",
    members: 277,
    description:
      "Router setup, access points, mesh Wi-Fi, LAN wiring, WLAN optimization, and home/business networks.",
    tags: ["Wi-Fi", "LAN", "WLAN", "Routers"],
    pinnedResources: [
      "Speed test checklist",
      "Mesh vs access point notes",
      "Cable labeling tips",
    ],
    activeUsers: ["PacketPam", "RouterRon"],
    chat: [
      {
        user: "PacketPam",
        role: "Network Tech",
        message:
          "Check modem signal, router placement, and channel congestion first.",
        time: "12:45 PM",
      },
    ],
    gearHeadPrompt:
      "Help me diagnose slow Wi-Fi in a two-story home.",
  },
  {
    slug: "appliance-repair-bay",
    name: "Appliance Repair Bay",
    category: "Home Repair",
    status: "scheduled",
    members: 164,
    description:
      "Washers, dryers, refrigerators, dishwashers, appliance diagnostics, and safety-first repair talk.",
    tags: ["Appliances", "Washer", "Dryer", "Home Repair"],
    pinnedResources: [
      "Disconnect power reminder",
      "Water leak checklist",
      "When to call a licensed pro",
    ],
    activeUsers: ["ApplianceAva"],
    chat: [
      {
        user: "ApplianceAva",
        role: "Repair Helper",
        message:
          "High-voltage appliance work should be handled by qualified technicians.",
        time: "10:30 AM",
      },
    ],
    gearHeadPrompt:
      "My washer will not drain. Give me safe checks before calling a pro.",
  },
  {
    slug: "creator-pit-lane",
    name: "Creator Pit Lane",
    category: "Creators",
    status: "active",
    members: 355,
    description:
      "Short clips, long tutorials, live streams, titles, thumbnails, scripts, and creator collaboration.",
    tags: ["Creators", "TikTok", "YouTube", "Live"],
    pinnedResources: [
      "Repair video shot list",
      "Creator title formulas",
      "Live session checklist",
    ],
    activeUsers: ["ClipClutch", "StudioSpark"],
    chat: [
      {
        user: "ClipClutch",
        role: "Creator",
        message:
          "Before/after clips work well when the problem is clear in the first 3 seconds.",
        time: "5:22 PM",
      },
    ],
    gearHeadPrompt:
      "Write a 60-second repair video script for a garage creator.",
  },
  {
    slug: "marketplace-bay",
    name: "Marketplace Bay",
    category: "Marketplace",
    status: "coming-soon",
    members: 119,
    description:
      "Parts, tools, local services, creator offers, smart garage gear, and future safe payment workflows.",
    tags: ["Parts", "Tools", "Services", "Stripe-ready"],
    pinnedResources: [
      "Marketplace safety rules",
      "Local service lead notes",
      "No live payments in MVP",
    ],
    activeUsers: ["PartsPete"],
    chat: [
      {
        user: "PartsPete",
        role: "Seller",
        message:
          "The MVP marketplace is only placeholders until payments are approved.",
        time: "8:58 AM",
      },
    ],
    gearHeadPrompt:
      "Help me write a safe marketplace listing for a used tool.",
  },
];

export const FEED_FILTERS = [
  "All",
  "Clips",
  "Tutorials",
  "Project Updates",
  "Questions",
  "Cars",
  "Smart Home",
  "Networking",
  "Appliances",
];

export const FEED_POSTS = [
  {
    type: "clip",
    title: "30-second no-start checklist",
    creator: "TorqueTom",
    category: "Cars",
    difficulty: "Beginner",
    excerpt:
      "Battery, fuel, spark, and scan-tool basics before replacing parts.",
  },
  {
    type: "tutorial",
    title: "Mesh Wi-Fi install for a garage office",
    creator: "PacketPam",
    category: "Networking",
    difficulty: "Intermediate",
    excerpt:
      "Placement, backhaul, SSID planning, and testing your real coverage.",
  },
  {
    type: "project update",
    title: "Smart garage camera plus sensor board",
    creator: "OccularOps",
    category: "Smart Home",
    difficulty: "Intermediate",
    excerpt:
      "A simple overview of cameras, door sensors, and notification routing.",
  },
  {
    type: "question",
    title: "Washer hums but will not drain",
    creator: "ApplianceAva",
    category: "Appliances",
    difficulty: "Safety First",
    excerpt:
      "Safe checks before touching pumps, belts, or electrical components.",
  },
];

export const GEARHEAD_PROMPTS = [
  "My car cranks but will not start. What safe checks should I do first?",
  "Help me plan a LAN/WLAN install for a garage workspace.",
  "Write a short repair tutorial script for a stuck garage door sensor.",
  "What should I check before calling a licensed appliance technician?",
];

export const LIVE_EVENTS = [
  {
    title: "Saturday Car Diagnostics Clinic",
    host: "CadiyossJoe",
    room: "Car Garage",
    category: "Automotive",
    status: "live",
    schedule: "Today at 7:00 PM",
  },
  {
    title: "Wi-Fi Dead Zones in Garages",
    host: "PacketPam",
    room: "Wi-Fi / LAN / WLAN Network Room",
    category: "Networking",
    status: "scheduled",
    schedule: "Tomorrow at 6:30 PM",
  },
  {
    title: "Creator Pit Lane: Repair Shorts Review",
    host: "ClipClutch",
    room: "Creator Pit Lane",
    category: "Creators",
    status: "scheduled",
    schedule: "Friday at 8:00 PM",
  },
  {
    title: "Appliance Safety Basics",
    host: "ApplianceAva",
    room: "Appliance Repair Bay",
    category: "Home Repair",
    status: "ended",
    schedule: "Ended yesterday",
  },
];

export const MARKETPLACE_ITEMS = [
  {
    category: "Parts",
    title: "Used alternator testing checklist",
    note: "Placeholder listing for future verified parts posts.",
  },
  {
    category: "Tools",
    title: "Beginner diagnostic scanner kit",
    note: "Tool card for future affiliate or marketplace workflows.",
  },
  {
    category: "Local Services",
    title: "Wi-Fi and smart garage setup lead",
    note: "Local service booking placeholder.",
  },
  {
    category: "Creator Offers",
    title: "Paid repair class concept",
    note: "Future creator monetization placeholder.",
  },
  {
    category: "Smart Garage Gear",
    title: "Garage sensor starter bundle",
    note: "Future smart-home product listing placeholder.",
  },
];

export const GARAGE_PROFILE_SAMPLE = {
  name: "Joseph's Garage",
  role: "Founder / Veteran Builder / Garage Tech Creator",
  skills: [
    "Automotive",
    "Computer Repair",
    "Wi-Fi Installs",
    "Smart Home",
    "Appliance Support",
    "Creator Live Streams",
  ],
  projects: [
    "Garage Talk MVP",
    "Occular smart garage assistant",
    "LAN/WLAN service kit",
    "Repair video studio setup",
  ],
  vehiclesAndDevices: [
    "Daily driver",
    "Smart garage router",
    "Repair bench laptop",
    "Washer/dryer demo unit",
  ],
  favoriteRooms: [
    "Car Garage",
    "Wi-Fi / LAN / WLAN Network Room",
    "Creator Pit Lane",
  ],
  links: [
    "YouTube placeholder",
    "TikTok placeholder",
    "Local services page placeholder",
  ],
};

export function getRoomBySlug(slug: string | undefined) {
  return GARAGE_ROOMS.find((room) => room.slug === slug);
}