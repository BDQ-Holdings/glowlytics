# App Review Response — Glowlytics 1.2.0 (Submission 5fde5d3e-b1c5-4242-8f28-1ed92108b5b9)

Reply to App Review. Paste each section verbatim into App Store Connect under the matching guideline.

---

## Guideline 2.1(a) — Performance: Apple Sign-in error

Thank you for the detailed reproduction. We have shipped the following changes in the new build:

1. **Robust handling of every Apple Sign-In return state.** Our previous build surfaced a raw error message when the native Apple flow returned `signUp.status === "missing_requirements"`. This happens whenever Apple omits the user's email address (for example after the user has previously signed in with Apple to our bundle, or has chosen "Hide My Email"). The new build detects this state explicitly and shows a clear, actionable message asking the user to either share their email through the Apple prompt or use email sign-up, instead of an opaque technical error.
2. **Reviewer-friendly OAuth error copy.** All OAuth failure paths now show a single short message ("We couldn't complete sign-in right now. Please try again, or use email sign-in below.") instead of leaking internal redirect URLs or identity-provider host names. Verbose diagnostics remain available only in our internal development builds.
3. **`setActive` failures are caught.** If the Clerk session-activation call ever rejects, the user now sees "We couldn't start your session. Please try again." instead of a raw stack.
4. **Server-side verification.** We have re-verified our Clerk production instance configuration for the `com.glowlytics.app` bundle:
   - **Sign in with Apple** is enabled.
   - The Apple Services ID, Team ID, Key ID, and signing key match the values registered for `com.glowlytics.app` in Apple Developer.
   - The reviewer demo account `test@test.com` has **Bypass Client Trust** enabled and **no MFA**, per the previous review correspondence.

If the issue persists, please email or paste the exact on-device error string and we will reproduce immediately. The new build also gracefully falls back to email sign-up; the reviewer demo credentials remain `test@test.com` / `Test1234!`.

---

## Guideline 1.4.1 — Safety: Medical citations

We have made the clinical sources visible from every screen that surfaces medical-flavored guidance, not only in the legal document. Specifically in the new build:

1. **Every scan result page now shows a "Clinical Sources" card** that lists the American Academy of Dermatology (AAD), the American College of Obstetricians and Gynecologists (ACOG), and the World Health Organization UV Index references, with tap-through buttons that open the source URLs in the system browser. Previously this card was hidden when our RAG pipeline returned zero recommendations for a given scan; it now always renders with our evergreen reference set.
2. **The primary recommendation card (`ActionCard`)** that appears on the results, today, and signal-detail screens now carries an inline "Sources: AAD · ACOG · WHO" chip that opens the AAD treatment guidelines page on tap.
3. **A dedicated "Clinical sources" screen** is now available under Settings → Insights & data → Clinical sources, listing all five primary references (AAD acne, AAD sunscreen, ACOG menstrual cycle, ACOG pregnancy skin guidance, WHO UV Index) with direct deep-links.
4. **The privacy policy continues to host the full citation block** at section 19A ("Clinical Sources").

The user-facing reference URLs are:

- AAD Acne Care — https://www.aad.org/public/diseases/acne/derm-treat/treat
- AAD Sunscreen Guidance — https://www.aad.org/public/skin-hair-nails/skin-care/sunscreen/choosing-the-right-sunscreen
- ACOG Menstrual Cycle — https://www.acog.org/womens-health/infographics/the-menstrual-cycle
- ACOG Skin During Pregnancy — https://www.acog.org/womens-health/faqs/skin-conditions-during-pregnancy
- WHO UV Index — https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-%28uv%29-index

To verify in the reviewer demo account: complete any scan from the camera tab; the Clinical Sources card appears on the third story page of the results flow. Alternatively, Settings → Clinical sources lists the full set.

---

## Guideline 2.1 — Information Needed: Face Data

Below are complete answers to each question. The corresponding privacy-policy text is reproduced verbatim afterward.

### 1. What face data does the app collect?

During the live camera preview Glowlytics processes the following **on-device** face data, frame by frame, in volatile memory only:

- A face bounding box (x, y, width, height in image coordinates).
- An approximate face size in pixels.
- Head angle (pitch, yaw, roll) for alignment guidance.
- Facial landmark coordinates from the device-level face detector (MediaPipe FaceLandmarker for Android; ARKit FaceAnchor on iOS devices with TrueDepth). On iOS, this includes the ARKit face mesh (vertices, triangle indices, and blendShape coefficients) — used solely to compute facial-architecture metrics for the optional "Facial Architecture" feature.

We also capture a **still photo** of the user's face at the end of the scan, which is the input to our skin-analysis pipeline.

Glowlytics does **not** create a face-recognition template, a biometric identifier, or any embedding that could be used to recognize the user across sessions or devices.

### 2. Provide a complete and clear explanation of all planned uses of the collected face data.

| Data | Purpose | Where it runs |
|---|---|---|
| Face bounding box + size + head angle | Live guidance overlay so the user can center their face, hold the device at the correct distance, and keep framing consistent across daily scans | 100% on-device, in volatile RAM, discarded when the camera screen closes |
| Facial landmark / mesh coordinates | (Android & non-TrueDepth iOS) Used only for the alignment overlay above. (TrueDepth iOS) Additionally used to compute deterministic facial-architecture metrics (canthal tilt, gonial angle, facial thirds/fifths, bizygomatic/bitemporal ratios, etc.) for the optional Facial Architecture feature; the resulting **numeric metrics** (not the raw mesh) may be sent to our backend for analysis | Capture: on-device. Bone-structure metric computation: on-device. Numeric metrics: optionally synced to encrypted backend if the user enables the Facial Architecture feature |
| Captured scan photo (which contains the face) | Sent to our secure backend for AI-powered skin analysis (lesion detection, skin-health scoring) | Encrypted in transit (TLS). Processed by our backend and by OpenAI under our zero-retention API agreement |

The live face mesh / landmark data itself is **never** transmitted off-device. Only the final still photo is.

### 3. Will the face data be shared with any third parties? Where will this information be stored?

- **Live face-mesh / landmark / bounding-box data: shared with no third party.** It exists only in volatile memory during an active camera session and is discarded when the session ends.
- **Captured scan photo (containing the face): shared with our skin-analysis backend (BDQ Holdings LLC), and with OpenAI for vision-based skin analysis.** OpenAI processes the image under our API agreement and does not retain it or use it for model training (we use the OpenAI Platform API with default zero-retention settings).
- **Storage:**
  - Locally: scan photos and analysis results are stored on-device in the app's sandboxed storage (AsyncStorage / file system) for offline viewing and trend history.
  - Backend: account data, analysis results, and a copy of scan photos are stored in our encrypted PostgreSQL database hosted on Railway. Data is encrypted in transit (TLS 1.2+) and at rest.
  - No live face-mesh / landmark data is stored in any backend.

### 4. How long will face data be retained?

- **Live face-mesh / landmark / bounding-box data:** zero retention. Discarded the moment the camera session ends — it is not written to disk or transmitted anywhere.
- **Captured scan photos that contain the face:** retained on the user's device and in our encrypted backend for as long as the user's account is active. The user can delete every photo and all derived data at any time via **Settings → Delete account**, which triggers a cascading deletion across our backend within 30 days, as required by App Store Guideline 5.1.1(v).

### 5. Where in the privacy policy is the app's collection, use, disclosure, sharing, and retention of face data explained?

Inside the app: **Settings → Privacy & data → Privacy policy**, or the link on the sign-up screen. The relevant sections are:

- **Section 11** — "Information We Collect" (face-data bullet)
- **Section 13A** — "Face Data and Facial Geometry" (dedicated section)
- **Section 14** — "Data Storage and Security" (ephemeral face-alignment data clause)
- **Section 17** — "Data Retention and Deletion" (zero-retention statement for live face-alignment data)
- **Section 15** — "Third-Party Services" (OpenAI clause)

The public privacy policy is also hosted at https://glowlytics.ai/privacy.

### 6. Quote the specific text from the privacy policy concerning face data.

**Section 11 — Information We Collect (face-data bullet):**

> Face data used for scan alignment: a face bounding box, approximate face size, head angle, and facial landmark / mesh coordinates generated on-device during live camera preview so we can position your face consistently. We do not create an identity template or perform face recognition.

**Section 13A — Face Data and Facial Geometry:**

> When you open the guided camera, Glowlytics processes limited face data on-device so it can align your scan consistently. This face data may include a face bounding box, approximate face size, head angle, and facial landmark / mesh coordinates during live preview.
>
> - Purpose: center your face, confirm distance, and keep scan framing consistent over time.
> - Retention: live face-alignment data is discarded when the camera session ends and is not stored as a reusable biometric template.
> - Sharing: live face-alignment data is not shared with third parties. Captured scan photos may be processed by our secure backend and OpenAI under our API agreement to generate non-diagnostic skin insights.
> - Limitations: Glowlytics does not use face data for identity verification, face recognition, emotion detection, advertising, or profiling.

**Section 14 — Data Storage (face-alignment clause):**

> Ephemeral face alignment data: live face bounding boxes and landmark / mesh coordinates stay on-device during camera preview and are discarded after the session ends.

**Section 17 — Data Retention (face-data clause):**

> Live face-alignment data is not retained beyond the active camera session. Captured scan photos that include your face are retained until you delete your account or request deletion.

**Section 15 — Third-Party Services (OpenAI clause, photo-handling):**

> OpenAI (vision analysis): captured scan photos, which may include your face, are sent to OpenAI's API for AI-powered skin analysis. OpenAI does not receive live face-mesh coordinates, and photos are not stored or used for training by OpenAI per our API data usage agreement.

---

We appreciate the careful review. Please let us know if any of the above answers should be expanded.
