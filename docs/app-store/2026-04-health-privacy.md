# App Store Connect — Health data declaration

Added 2026-04-09 as part of the Pattern Engine rollout.

## Privacy Nutrition Label

- **Data Type:** Health → Health (includes Heart Rate, Sleep, Exercise Data, Other Health Data)
- **Purpose:** App Functionality
- **Linked to User:** NO
- **Used for Tracking:** NO

## Corresponding iOS Configuration

- `NSHealthShareUsageDescription` in `RadianceIQ/app.json` (both infoPlist and plugin config)
- Current text: "Glowlytics reads sleep, heart rate, HRV, steps, mindful minutes, and menstrual flow from Apple Health to find patterns in your skin. This data stays on your device."

## Data Handling

- Health data is stored exclusively on-device via AsyncStorage
- Never transmitted to backend servers
- Not shared with third parties
- Not used for advertising or tracking
- User can revoke via iOS Settings → Health → Data Access & Devices → Glowlytics

## Action Required

Verify these settings in App Store Connect → App Privacy before submitting the next build.
