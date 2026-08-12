# Garage Talk Design Guidelines

## Design Approach

**System**: Material Design-inspired with YouTube video library patterns and Discord chat aesthetics
**Rationale**: Material Design excels at content-rich applications with clear information hierarchy. YouTube provides proven video grid patterns, while Discord offers effective real-time chat design. This combination creates a professional, efficient tool for mechanics who need quick access to technical information.

**Key Principles**:
- Information density over visual flair - mechanics need data fast
- Mobile-first design for shop floor usage
- Clear visual hierarchy for video content, search, and chat
- Consistent interaction patterns across features
- Professional automotive aesthetic (industrial, reliable, functional)

---

## Typography

**Font Families**:
- Primary: 'Inter' (Google Fonts) - Clean, highly legible for technical content
- Monospace: 'Roboto Mono' (Google Fonts) - For fault codes (P0300, etc.) and technical specifications

**Type Scale**:
- Hero/Page Titles: text-4xl font-bold (36px)
- Section Headers: text-2xl font-semibold (24px)
- Video Titles: text-lg font-medium (18px)
- Body Text: text-base (16px)
- Chat Messages: text-sm (14px)
- Metadata/Timestamps: text-xs (12px)
- Fault Codes: text-sm font-mono tracking-wide uppercase

**Hierarchy Application**:
- Video titles always bold to stand out in grids
- AI search results use semibold headers with regular body
- Chat usernames bold, messages regular weight
- Timestamps and secondary info use reduced opacity (60-70%)

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, and 16 for consistent rhythm
- Micro spacing (between related elements): p-2, gap-2
- Standard spacing (component padding, gaps): p-4, gap-4, m-4
- Section separation: py-8, mb-8
- Major sections: py-12, my-12
- Page margins: px-4 (mobile), px-8 (desktop)

**Grid Patterns**:
- Video Grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4
- Search Results: Single column max-w-4xl for readability
- Dashboard Stats: grid-cols-2 md:grid-cols-4 gap-4
- Chat Sidebar: Fixed width w-80 on desktop, full width on mobile

**Container Strategy**:
- Main content: max-w-7xl mx-auto px-4
- Reading content (AI summaries): max-w-3xl
- Full-width sections: Video player, chat interface

---

## Component Library

### Navigation Header
- Fixed top navigation: Sticky positioning with h-16
- Logo + Search bar (prominent, 50% width on desktop) + User menu
- Mobile: Hamburger menu, collapsible search
- Include quick access to "Upload Video" and "Active Chats" badges

### Video Components

**Video Card** (Grid Item):
- Aspect ratio 16:9 thumbnail container
- Title (2 lines max, truncate with ellipsis)
- Channel/uploader name with avatar (small, 24px circle)
- View count, timestamp, category badge
- Hover state: Slight elevation (shadow-md to shadow-lg)
- Card padding: p-3

**Video Player Page**:
- Player: Full width, max-w-5xl, aspect-ratio-16/9
- Title section: text-2xl bold, category badge, share/save actions
- Metadata row: Views, upload date, uploader info
- Description: Expandable (show more/less) with max-h-24 collapsed
- Related videos sidebar: w-96 on desktop, below player on mobile
- Comments section: Threaded, sorted by recent/popular

### Search Interface

**Search Bar**:
- Prominent placement in header (always visible)
- Input with leading search icon (Heroicons: MagnifyingGlassIcon)
- Toggle between "Standard Search" and "Gearhead Agent" modes
- Autocomplete dropdown with recent searches and suggestions

**Gearhead Agent Search Results**:
- Result cards with distinct treatment (border, slight background differentiation)
- Diagnostic summary section: prose max-w-none with clear formatting
- Suggested chat room tags (clickable chips) with ChatBubbleLeftIcon
- Video recommendations below with thumbnails
- Disclaimer text: text-xs at bottom

### Chat Interface

**Room List** (Sidebar/Mobile View):
- Room cards with: Icon, title, active user count, unread badge
- Categories: "Engine Faults", "OBD Codes", "General Help"
- "Create Room" button (prominent, PlusIcon)
- Active room highlighted with accent border

**Chat Window**:
- Header: Room name, user count, settings icon (EllipsisHorizontalIcon)
- Message container: flex-col-reverse for bottom-anchored scroll
- Message bubbles: 
  - Own messages: ml-auto, max-w-md
  - Others: mr-auto, max-w-md
  - Include avatar (32px), username, timestamp
  - System messages (joins/leaves): centered, italicized, reduced opacity
- Input area: Fixed bottom, text area with send button (PaperAirplaneIcon)
- @mention highlighting and autocomplete

### Dashboard

**Layout Structure**:
- Top stats row: grid-cols-2 md:grid-cols-4 (Videos Uploaded, Searches, Active Chats, Saves)
- Stat cards: p-6, number text-3xl bold, label text-sm
- Sections: "Recent Uploads", "Search History", "Active Discussions"
- Each section: Header with "View All" link, grid of items

**Activity Feed**:
- Timeline-style: Vertical line connector
- Items: Video uploads, search queries, chat activity
- Icons for each type (VideoIcon, MagnifyingGlassIcon, ChatBubbleIcon)
- Relative timestamps ("2 hours ago")

### Forms & Inputs

**Upload Form**:
- Large dropzone area (h-64) with dashed border for visual clarity
- File input or URL input toggle
- Form fields: Title (required), Description (textarea, h-32), Category (select dropdown)
- Tags input: Chip-based multi-select
- Submit button: Full width on mobile, auto width on desktop

**Standard Inputs**:
- Height: h-10 for text inputs, h-12 for search
- Padding: px-4, rounded-md
- Labels: text-sm font-medium, mb-2
- Helper text: text-xs, mt-1
- Error states: Border and text treatment differentiation

### Badges & Tags
- Category badges: Rounded pill shape (rounded-full), px-3 py-1, text-xs font-medium
- Fault codes: Monospace font, slightly larger (text-sm), letter-spacing
- User role badges: Small, uppercase, positioned near username
- Notification badges: Rounded circle with count, absolute positioned

---

## Icons

**Library**: Heroicons (outline style) via CDN
**Common Icons**:
- MagnifyingGlassIcon (search)
- VideoCameraIcon (videos)
- ChatBubbleLeftRightIcon (chat)
- WrenchScrewdriverIcon (tools/repairs)
- ExclamationTriangleIcon (fault warnings)
- PlusIcon (create/add)
- EllipsisVerticalIcon (more options)
- HeartIcon, BookmarkIcon (engagement)
- ArrowUpTrayIcon (upload)
- UserGroupIcon (community)

**Usage**: Icon size h-5 w-5 for inline, h-6 w-6 for buttons, h-8 w-8 for feature highlights

---

## Responsive Behavior

**Breakpoints**:
- Mobile: < 768px (single column, stacked navigation)
- Tablet: 768px - 1024px (2-column grids, visible sidebar)
- Desktop: > 1024px (multi-column grids, split layouts)

**Mobile Optimizations**:
- Bottom navigation bar for primary actions (Upload, Search, Chat, Profile)
- Swipeable video cards
- Full-screen chat on mobile
- Collapsible filters and sidebars
- Larger touch targets (min h-12 for buttons)

**Desktop Enhancements**:
- Persistent chat sidebar (can dock/undock)
- Hover previews for video thumbnails
- Keyboard shortcuts display
- Multi-column dashboard layouts

---

## Images

**Hero Section**: None - This is a utility application, not a marketing site. Focus on immediate functionality with search bar prominence.

**Video Thumbnails**: 
- 16:9 aspect ratio placeholders until actual thumbnails load
- Loading skeleton states (animated pulse)
- Fallback thumbnails for videos without custom images (automotive icon silhouette)

**User Avatars**:
- Circular, consistent sizes (24px list, 32px chat, 48px profile)
- Initials fallback with subtle background variation

**Icons Throughout**: 
- Category icons for video classifications (engine, transmission, electrical, etc.)
- Tool icons for different repair types
- Fault code visual indicators

---

## Animations

**Minimal Approach** - Only functional animations:
- Page transitions: Fade in (200ms)
- Chat message appearance: Slide up + fade (150ms)
- Loading states: Skeleton pulse
- Hover states: Scale 1.02 (100ms) for cards
- No decorative animations - mechanics need efficiency