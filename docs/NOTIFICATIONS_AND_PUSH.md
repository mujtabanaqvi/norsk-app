# Notifications & Mobile Push System

The Norsk App incorporates a complete, bilingual, multi-platform notification system combining an **In-App Notification Center** and **Mobile Device Push Notifications** (via Expo Push Notification Service).

---

## 1. System Architecture

```
                      ┌─────────────────────────────────┐
                      │   Admin Portal / Cron / JIT     │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │  lib/notification-service.ts  │
                       └───────┬───────────────┬───────┘
                               │               │
       ┌───────────────────────┴──┐         ┌──┴─────────────────────────┐
       ▼                          ▼         ▼                            ▼
┌──────────────────┐    ┌─────────────────────┐             ┌─────────────────────────┐
│  notifications   │    │ user_notifications  │             │    user_push_tokens     │
│ (Campaigns & DDL)│    │ (User Inbox & State)│             │ (Active Device Tokens)  │
└──────────────────┘    └──────────┬──────────┘             └────────────┬────────────┘
                                   │                                     │
                                   ▼                                     ▼
                        ┌─────────────────────┐             ┌─────────────────────────┐
                        │   In-App Bell &     │             │ Expo Push REST API      │
                        │ Notification Modal  │             │ (https://exp.host/--/   │
                        │  (Web & Mobile)     │             │  api/v2/push/send)      │
                        └─────────────────────┘             └────────────┬────────────┘
                                                                         │
                                                ┌────────────────────────┴────────────────────────┐
                                                ▼                                                 ▼
                                     ┌─────────────────────┐                           ┌─────────────────────┐
                                     │  Google FCM v1      │                           │    Apple APNs       │
                                     │     (Android)       │                           │      (iOS)          │
                                     └──────────┬──────────┘                           └──────────┬──────────┘
                                                │                                                 │
                                                └────────────────────────┬────────────────────────┘
                                                                         │
                                                                         ▼
                                                        ┌─────────────────────────────────┐
                                                        │ User Device: Lockscreen / Tray  │
                                                        │ (Tap -> Deep-link to ExamSetup) │
                                                        └─────────────────────────────────┘
```

---

## 2. Notification Types & Triggers

| Type | Identifier | Trigger Mechanism | Target Route | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Daily Credits** | `DAILY_CREDITS` | JIT on app open or Admin quick action | `ExamSetup` | Informs user that daily speaking minutes and exams are refreshed for the Oslo calendar day. |
| **Practice Reminder** | `PRACTICE_REMINDER` | Automated cron / Admin quick action | `ExamSetup` | Encourages inactive users (2+ days without taking an oral exam) to practice. |
| **Announcement** | `ANNOUNCEMENT` | Admin Portal broadcast | Custom (`ExamSetup`, etc.) | System updates, new exam themes, or general app news. |
| **Promotion** | `PROMOTION` | Admin Portal broadcast | `Subscription` | Special offers, discount codes, or upgrade prompts targeted to free users. |
| **System** | `SYSTEM` | Admin or backend service | Configurable | Operational notifications and critical account alerts. |

### Deduplication Protection
Automated triggers (Daily Credits and Practice Reminders) enforce unique `dedupKey` patterns (e.g., `daily_credits:2026-11-06:usr_123` or `practice_reminder:2026-11-06:usr_123`). This guarantees users never receive more than one credit refresh or reminder per calendar day, even if background tasks run repeatedly.

---

## 3. Database Schema

Managed via Drizzle ORM in [`src/db/schema.ts`](../src/db/schema.ts):

1. **`notifications`**: Master record of all sent broadcasts, campaigns, and system notifications with target audiences (`ALL`, `FREE`, `STANDARD`, `PREMIUM`, `CUSTOM`), localized text, and target deep links.
2. **`user_notifications`**: Individual user inboxes storing read/unread state (`isRead`, `readAt`), delivery timestamps, and `dedupKey`.
3. **`user_push_tokens`**: Active Expo push tokens associated with users (`userId`, `token`, `platform`, `updatedAt`). Unique index on `(user_id, token)` ensures clean upserts.

---

## 4. Backend Implementation (`lib/notification-service.ts`)

### Expo Push Dispatcher
`sendExpoPushNotifications(messages: ExpoPushMessage[])`:
- Validates Expo token patterns (`ExponentPushToken[...]` or `ExpoPushToken[...]`).
- Chunks requests into slices of 100 messages per HTTP POST to `https://exp.host/--/api/v2/push/send`.
- Configures high priority, sound, and the Android channel `default`.
- Parses ticket responses: if any device reports `DeviceNotRegistered` (e.g. app uninstalled), the token is automatically purged from `user_push_tokens`.

### Automated Broadcast Functions
- `sendDailyCreditsNotification(userId, now)`: Ensures daily notification exists for user.
- `sendPracticeReminderNotification(userId, daysInactive, now)`: Delivers reminder for inactive users.
- `triggerDailyCreditsBroadcast(now)`: Batch dispatches to all active users without today's credit notification.
- `triggerPracticeRemindersBroadcast(daysThreshold, now)`: Batch dispatches to users whose last exam session was older than the threshold.
- `createBroadcastNotification(params)`: Admin announcement delivery with optional `sendPush: boolean`.

---

## 5. Mobile Client Integration

### Notification Channel & Permissions ([`src/lib/push-notifications.ts`](../src/lib/push-notifications.ts))
- **Foreground Behavior**: Configured with `Notifications.setNotificationHandler` to show banners, play sounds, and set badges even when the app is actively in use.
- **Android Notification Channel**:
  ```ts
  Notifications.setNotificationChannelAsync('default', {
    name: 'Snakkly Varsler',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#BA0C2F',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
  ```
- **Permission Check**: Uses `Notifications.requestPermissionsAsync()` and Android 13+ `POST_NOTIFICATIONS` runtime checks.

### Push Token Lifecycle & Real-Time Sync ([`src/hooks/useNotifications.tsx`](../src/hooks/useNotifications.tsx))
- When an authenticated user opens the app, `registerDevicePushToken()` retrieves the Expo Push Token using EAS Project ID `d5e390c5-69b7-4798-b01d-15b3ecb57aab` and posts it to `/api/notifications/push-token`.
- When a push notification arrives while foregrounded, `Notifications.addNotificationReceivedListener` immediately refreshes the inbox and bell badge count.

### Deep Linking from Notification Tap ([`App.tsx`](../App.tsx))
- `subscribeToNotificationResponse()` listens for banner taps from the lockscreen or system tray and automatically navigates the React Navigation stack to the target screen (`ExamSetup`, `Subscription`, `Referral`, etc.).

---

## 6. Admin Management Portal (`/admin#notifications`)

Located at [`app/admin/_components/NotificationsPanel.tsx`](../app/admin/_components/NotificationsPanel.tsx):
- **Live Metrics**: Shows count of registered mobile devices and unique push-enabled users.
- **Quick Action Triggers**: One-click triggers for daily credits and inactivity reminders.
- **Compose Drawer**:
  - Bilingual templates ("Daglige kreditter", "Øvingspåminnelse", "Kampanje/Tilbud", "Systemoppdatering").
  - Target audience selector (`ALL`, `FREE`, `STANDARD`, `PREMIUM`, `CUSTOM`).
  - Checkbox toggle: `[x] Send også som push-varsel til mobil (låseskjerm / varsellinje)`.
  - In-app route selector (`ExamSetup`, `Subscription`, `LearningProfile`, `Referral`).
- **History Table**: Displays past broadcasts with recipient counts, read counts, and percentage read rates.

---

## 7. Production Credentials & EAS Build Setup

### Google Play (Android / FCM v1)
1. **`google-services.json` Handling**:
   - `google-services.json` is listed in `.gitignore` to protect client keys from Git repository alerts.
   - [`app.config.js`](../app.config.js) dynamically resolves `googleServicesFile`:
     ```js
     googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'
     ```
   - For EAS cloud builds, upload `google-services.json` as a secret file environment variable:
     ```bash
     eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --visibility sensitive --path ./google-services.json
     ```
2. **FCM v1 Service Account Key**:
   - In [Firebase Console](https://console.firebase.google.com/), open your project (`com.snakkly.app`) → **Project Settings** → **Service accounts**.
   - Click **Generate new private key** (downloads a `.json` file).
   - In [expo.dev](https://expo.dev) → Project `norsk-app` → **Project Settings** → **Credentials** → **Android** → Under **FCM V1 Service Account Key**, upload this JSON key.

### Apple App Store (iOS / APNs)
- Run `eas build --platform ios`. EAS will prompt to automatically generate and register the **Apple Push Notification service key (.p8)** with your Apple Developer account.
- Alternatively, upload an APNs `.p8` key manually under **Credentials** → **iOS** in the Expo dashboard.

