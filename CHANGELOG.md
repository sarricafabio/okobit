# Okobit Changelog

## Version 1.2.0 (2025-12-14)

### New Features
- **Light Mode**: Introduced a fully functional Light Mode with a simple toggle switch in Settings
- **Custom Color Picker**: Built a custom, cohesive color picker (Hue & Saturation/Value) to replace the native browser input, featuring better UI integration and better performance compared to the laggy (when dragging) and ugly chrome color picker
- **Smart Text Contrast**: Accent-colored buttons now automatically switch their text color (black vs white) based on brightness for optimal readability with all accent colors

### UI/UX Improvements
- **GitHub Link**: Added clickable GitHub repository card in settings modal
- **Mobile UX Improvements**: Hidden keyboard cheat sheet button on mobile devices (only shown on tablets and desktop). Renamed safety settings for clarity.
- **Export Polish**: Added a green checkmark success indicator for successful data exports (previously it was the same icon as an error status)
- **Cleaner Modals**: Hid default scrollbars in Settings modal for a sleeker look across all browsers
- **Copy Button Fix**: The copy icon in user chat bubbles sometimes disappeared or changed functionality (e.g., to download image) under various conditions, especially when messages included images. The icon now consistently remains visible for all user messages and always functions to copy the message text

---

## Version 1.1.0 (2025-12-08)

### Major Improvements
- **Type Safety Overhaul**: Removed all `@ts-ignore` comments from the codebase
- **Bug Fix**: Fixed critical prompt bookmarking issue where undefined IDs caused silent failures
- **Environment Variables**: Added proper TypeScript support for Vite environment variables

### Technical Changes
- Created `src/vite-env.d.ts` for proper Vite type declarations
- Implemented type-safe environment variable detection
- Added runtime type guards for all Dexie operations with optional fields
- Fixed JSZip import to use built-in TypeScript definitions
- Improved chunk property access in streaming responses optimized

---

## Version 1.0.0 (Initial Release)

### Core Features
- **Image Generation**: Gemini 3 Pro Image integration
- **Conversational UI**: Full chat-style workflow with context
- **Project Management**: Unlimited projects with pinning, renaming, and organization
- **Global Gallery**: 50-image cap with bookmarking and bulk operations
- **Prompt History**: Recent and saved prompts with enhancement
- **Data Portability**: Full backup/restore via ZIP export
- **Mobile Friendly**: Responsive design with touch support
- **BYOK Architecture**: Client-side only, your key stays local

### Architecture
- React 19
- Vite build system
- Dexie.js for IndexedDB
- TailwindCSS for styling
- Full TypeScript support
- Zero backend dependencies

### Privacy First
- No accounts required
- No external storage
- No telemetry
- Client-side only operation
- Direct API calls to Google endpoints
