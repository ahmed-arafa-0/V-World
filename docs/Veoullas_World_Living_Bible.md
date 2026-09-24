# Veoulla's World — Living World Bible

**Status:** Active discovery document  
**Version:** 0.29  
**Updated:** 2026-09-17  
**Authority:** Ahmed's explicit decisions in the current redesign conversation

**2026-09-17 — Voice-over removed from the entire experience, across all three phases (supersedes every voice-over/recorded-narration decision below).** See §3A-1. All dialogue and narrative text is preserved in all five languages; VAR remains the sole first-journey narrator; narration is now presented as cinematic text and direct dialogue as speech bubbles, with a localized Continue action pacing progression instead of audio duration. Background music, Walkman, ambience, and sound effects are unaffected. Every other mention of "voice-over"/"voiceover" in this document below §3A-1 describes the superseded design and is retained only as history, per this document's own supersession convention (see §3A's now-superseded line about the earlier text-only decision).

## 1. Document Rules

- This is a completely new project: both the implementation and the experience are being redesigned from zero.
- No code, architecture, interaction, or story decision from an older version is automatically inherited.
- Older ideas are retained only in **Previous Ideas — Not Approved** to prevent accidental loss or repetition.
- Every decision has one of four states: **Locked**, **Open**, **Deferred**, or **Rejected**.
- New question batches must update this document before the next batch begins.
- If two decisions conflict, the conflict must be shown explicitly rather than silently resolved.

## 2. Working Method

**Locked**

- Claude Code will implement the project.
- ChatGPT will manage discovery, architecture, specifications, prompts, acceptance criteria, and review of test evidence.
- Ahmed will test the experience, especially on real devices.
- Implementation must be divided into small, testable milestones rather than one giant build prompt.

## 2A. Claude Code Execution Deliverable

**Completed**

- `Claude_Code_Master_Build_Plan.md` defines the implementation architecture, repository structure, backend/Sheet gateway, global Definition of Done, and review process.
- Implementation is divided into milestones **M00–M18**, beginning with the project skeleton and Sheet gateway before any detailed world-building work.
- The plan includes a reusable Claude prompt wrapper and **45 acceptance tests** covering access, IP logging, localization, RTL/LTR, text-only narration progression (originally specified as voice-over — see §3A-1), story checkpoints, keys, navigation, every building system, VAR/Marcelino, birthday phases, replay protection, resilience, and full regression.
- Claude must receive one milestone at a time. M01 cannot begin until M00 evidence is reviewed and accepted, and the same gate applies throughout the sequence.

## 3. Technical Foundation

**Locked**

- Frontend: React + Vite + TypeScript.
- Hosting: Firebase Hosting.
- World media storage: a dedicated Google Drive owned by Ahmed's primary Google Pro account; Firebase Storage will not be used.
- VAR AI ownership: a second Google Pro account will own the Google Cloud/Google AI Studio project and Gemini API authorization used by the cat.
- SPA routes will use a Firebase rewrite to `/index.html`.
- The project starts in a new folder with no legacy code reuse.

**Provisional; to validate during technical design**

- CSS Modules for component styling.
- Zustand for shared application state.
- React Router for routes.
- Framer Motion for interface transitions.
- GSAP for cinematic camera movement and timelines.

**Deferred**

- Exact secure-backend provider and implementation and analytics tooling.

## 3A. Google Sheets, Access, and Runtime Data

**Locked**

- Google Sheets is the authoritative source for all editable world content and configuration, including:
  - multilingual UI and story text;
  - narration and dialogue records;
  - voice-over audio references for every supported language;
  - icon and symbol references;
  - asset references;
  - dates, schedules, countdowns, event flags, route rules, unlock rules, codes, rewards, keys, achievements, and Admin-controlled values.
- The final planning deliverables must include a complete Google Sheets workbook design: tab list, column schemas, validation rules, identifiers, relationships, examples, and Admin editing rules.
- Language records must support English, Egyptian Arabic, Italian, Greek, and French.
- Arabic presentation uses RTL. English, Italian, Greek, and French use LTR. Layout direction, alignment, icon mirroring rules, captions, and mixed-language content must be handled deliberately rather than by reversing the entire screen blindly.
- Approved voice-over content must exist in all five languages and remain synchronized with localized captions.
- The application starts in English on first open; Veoulla can change language later through the persistent Language control.
- The initial Gate narration is voice-over-enabled in all five languages. The earlier text-only release decision is superseded.
- The browser may attempt permitted audio playback automatically; if browser autoplay policy blocks it, the experience must show a minimal user gesture that enables audio without breaking the scene.
- Admin authentication is separate from Veoulla's Gate entry.
- Veoulla enters through the four-dial Gate code flow.
- Gate-code values and activation rules are read from Google Sheets, but code verification must occur through a secure backend rather than exposing the valid code in the browser.
- A secure backend is required to proxy private Sheet access, validate entry, update progress, and create trustworthy access logs. Firebase Hosting alone cannot securely perform those tasks.
- Opening/access logs must include the visitor IP captured server-side, timestamp, access result, and relevant session/device metadata.
- Runtime logs and per-user progress are written to Google Sheets through the backend; the frontend must never receive Sheet write credentials.
- Google Sheets is also the authoritative persistent store for all player state, including story progress/checkpoints, completed story beats, collected keys and quantities, spent keys, unlocks, achievements, message state, Farm inventory/progress, character choices, and event completion.
- Local device storage is only a performance/offline-resume cache. When local and Sheet state disagree, backend-validated Sheet state is authoritative unless a newer pending local transaction is safely reconciled.
- First-journey completion is stored both locally on the device and in the backend-controlled Sheet record.
- Completion occurs only when the final Map unlock succeeds at the end of the first journey; the backend then changes the user's completion value from `0` to `1`.
- The mandatory first journey normally runs once. A separate Admin-controlled Sheet flag can force it to run again; replay after the original completion may expose skip controls.
- **Temporary prototype security exception explicitly approved by Ahmed:** passwords, Gate codes, and third-party service keys may be stored as plaintext values in the private Google Sheet during the current build phase. Hashing and encryption are intentionally deferred.
- The Google Sheets connection credential is the only credential kept outside the Sheet, in a separate code/config file.
- That Google credential file belongs to the server/backend portion of the project and must not be imported into the React/Vite browser bundle; keeping the file server-side does not prevent the requested rapid prototype workflow.
- A visible `DEV_ONLY` warning must identify the plaintext-secrets tab so it cannot be mistaken for the later production security design.
- A later hardening milestone will migrate plaintext passwords/service keys to hashes, encryption, or managed secrets without changing the world-content schema.
- Firebase Storage is explicitly rejected for this build.
- Final images, video, audio, PDF files, sprite sheets, and other media binaries live in one organized Google Drive asset root. Google Sheets stores stable asset IDs, Drive file IDs, type, language, version, mobile/poster alternatives, preload priority, and enabled state.
- The backend exposes a same-origin media gateway that reads authorized Drive files through the Google Drive API, supports byte-range requests for audio/video, applies cache headers, and never exposes Drive credentials. Browser/service-worker caching may reduce repeated Drive downloads but is not authoritative storage.
- The Google service account used by the backend must be granted access to both the private Sheet and the Drive asset root. If My Drive sharing behavior blocks the required service-account workflow, Ahmed will use a dedicated shared folder/shared-drive-compatible arrangement or authorize the Drive owner through backend-only OAuth; React must never receive the token.
- Google Drive is the approved prototype media origin despite not being a purpose-built CDN. A later performance review may add a Google-hosted delivery/cache layer only if real-device tests show that Drive latency or quota limits harm the experience.
- VAR uses the official Gemini API through the backend. The second Google account owns the associated Google Cloud project, AI Studio key/authorization, billing/quota, and model configuration.
- The consumer Gemini/Google AI Pro subscription and Gemini API billing/quota are treated as separate products. The second account may own both, but the website requires a Gemini API authorization key and cannot rely on the account's Gemini web-app subscription or personal chat history.
- The Gemini authorization value may remain plaintext in the private Sheet under Ahmed's approved prototype exception, but it is read and used only by the backend and is never returned to React.
- Gemini is not VAR's permanent memory or canonical state. The backend assembles each AI request from Sheet-controlled character rules, approved world canon, recent conversation context, and Sheet-stored memory summaries; it writes approved summaries back to the Sheet.

**Open**

- Final Google Sheets workbook/tab architecture and exact schemas.
- Secure backend choice, Sheet caching strategy, API quotas, write queue, conflict handling, and outage fallback.
- Veoulla-code hashing/rotation, Admin authentication method, session lifetime, logout, and rate limiting.
- Exact access-log columns, IP retention, privacy notice, device/session identifiers, Admin log viewer, and log cleanup policy.
- Icon format rules, asset versioning, Drive folder layout, media-gateway caching, and fallback behavior when a Sheet reference is invalid.
- Later-production security migration: hashing, encryption/managed secrets, rotation, and secure Admin recovery.

## 3A-1. Voice-Over Removal (Ahmed's decision, 2026-09-17)

**Locked — supersedes every voice-over/recorded-narration decision elsewhere in this document**

- Voice-over is removed from the entire Veoulla's World experience, across all three build phases. This supersedes all previous requirements for recorded narration, five-language voice-over, and Ahmed supplying recordings (including §3A's "The initial Gate narration is voice-over-enabled in all five languages" line, which is itself now superseded in the opposite direction).
- All dialogue and narrative text remains in English, Egyptian Arabic, Italian, Greek, and French. VAR remains the sole narrator of the first-visit story.
- Narration (VAR's storytelling voice) is presented as cinematic text. Direct dialogue is presented in speech bubbles. `displayMode` on the `15_DIALOGUE` row decides which.
- Audio-paced story progression is replaced by text progression: a localized "Continue" action appears once the text is fully shown, and the player advances the story themselves. Essential dialogue is never auto-dismissed before the player can read it. Checkpoint/resume behavior and the mandatory first journey are unaffected.
- Background music, the Walkman, ambience, and sound effects are unaffected and continue exactly as designed — including the Church/Café/Arcade audio rules. Browser audio-enabling behavior (the "one minimal user gesture" pattern) is preserved only for this remaining audio, not for narration.
- Marcelino's mailbox voice-note support (Ahmed's personal recorded messages to Veoulla) is a distinct feature and is unaffected by this decision — this removes narrated story dialogue, not personal message attachments.
- `16_VOICEOVER` and every historical row in it remain in the Sheet, untouched, with no destructive migration. The runtime simply no longer reads that tab. `15_DIALOGUE.voiceover_id` also remains as a column with historical values; it is no longer resolved by the runtime.
- Every mention of "voice-over"/"voiceover" elsewhere in this document (§3A, §8A, the §18J beat table, the birthday section, and others) describes the now-superseded audio design and is retained as history rather than rewritten, per this document's own §1 rule that decisions are layered, not silently overwritten.

## 3B. Google Sheets Blueprint Deliverable

**Completed**

- A concrete import-ready workbook has been created as **Veoullas_World_Google_Sheets_Blueprint.xlsx**.
- The workbook contains 42 organized tabs covering:
  - app configuration, users, temporary plaintext secrets, Admin flags, entry/IP logs, and sessions;
  - supported languages, localized UI text, icons, assets, locations, and scenes;
  - routes, 18 first-journey beats, dialogue, five-language text (originally voice-over — see §3A-1; `16_VOICEOVER`'s historical rows remain but are unread), events, and birthday phases;
  - messages, songs, key catalog/rules, achievements, and all per-user progress/state tables;
  - Farm, Church, VARcade, Everkeep, VAR, and Marcelino configuration/state;
  - the append-only VAR conversation archive and durable cross-session VAR memories (`40_VAR_CONVERSATIONS`, `41_VAR_MEMORIES`);
  - a full data dictionary and central validation lists.
- The workbook includes sample IDs/rows, placeholders, formulas, table filters, frozen headers, validations, enabled-state highlighting, and a visible red `DEV_ONLY` plaintext credential warning.
- `24_PLAYER_PROGRESS` is the authoritative story/checkpoint record.
- `25_PLAYER_KEYS` is the authoritative found/spent/available key inventory, with available quantity calculated from found minus spent.
- The workbook is designed to be imported into Google Sheets and connected through the server/backend Sheet gateway.

## 4. Core World Identity

**Locked**

- The world is one magical island.
- The experience structure is hybrid: free exploration plus progressive unlocking.
- Emotional identity: a peaceful, personal magical home with mysteries hidden beneath it.
- It is an interactive illustrated cinematic world, not a conventional website and not a full 3D game.
- Outside the overview map, the experience is first-person.
- The island overview may show Veoulla's avatar and current location.

## 5. Island Geography

**Locked**

- The island is organized around one principal road.
- The Gateway exists outside the physical island/world; crossing it transports the experience to the Beach arrival point.
- The arrival side begins with the sea/beach.
- Three literal steps lead from the beach to the main road; this is not three staircases or three flights.
- The island has three clear elevation bands: Beach, village/road, and Museum height.
- A naturally winding main road climbs from the Beach toward the Museum.
- Buildings sit on both sides of the road.
- Immediately after the steps: Church on the left and Vinyl Café on the right.
- Mid-road: Farm on the left and Arcade on the right.
- Upper road: the map's existing natural/farm landscape on the left and Cottage with its mailbox on the right.
- The Museum stands at the end of the main road.
- The Museum is a large elevated visual anchor that can be seen from the Beach.
- There is no dedicated village square; the primary public circulation space is the road itself.
- The entrance has the main sandy Beach; the remainder of the island edge mixes rock, cliffs, and natural coastline as represented by the visual map reference.
- Only the main Beach is an explorable sea-access area in the current world plan.
- No secret paths are planned in the current scope.
- The island uses a medium spatial scale: traversal feels meaningful without becoming long.
- The island conceptually contains four connected atmospheres without visible level boundaries:
  1. Arrival: Gate, dock/arrival edge, and beach.
  2. Village: Cottage, Café, and Arcade.
  3. Spiritual/natural: Church, gardens, and Farm.
  4. Cultural/final: Museum and space for special events.
- The initial route is linear.

**Open**

- Exact scale, distances, turns, and elevation measurements.
- Technical scene segmentation for the continuous exterior journey.

## 6. View and Camera Model

**Locked**

- The overview uses a living illustrated high-angle island map.
- Outdoor and indoor exploration is first-person.
- Outdoor regional views combine normal eye-level and slightly elevated cinematic framing when appropriate.
- The Map control causes the camera to rise/pull back into the full island overview.
- Outdoor areas are connected through visible journeys rather than ordinary loading screens.
- Scene seams are hidden using natural occluders such as trees, walls, doors, tunnels, and foreground objects.
- Transition treatment can vary by route; magical mist is reserved for appropriate magical transitions.
- The continuous exterior route uses a building-level chain of overlapping scene packages rather than grouping two buildings into one destination scene.
- Every building receives its own dedicated approach/focus scene even when it sits opposite another building on the same road node.
- Connector scenes deliberately retain part of the previous location while introducing part of the next location, preserving believable distance and orientation.
- Ahmed's required opening geography example is:
  1. Beach-focused scene.
  2. Beach + the three literal steps.
  3. Remaining/near portion of the three steps + Church approach.
  4. Church-focused scene.
  5. Continue the same overlapping pattern for every following building and landmark.
- Opposite-side buildings can share a road position while still using separate first-person focus views reached by a camera turn or short repositioning movement.
- Shared edge landmarks, road geometry, lighting direction, and foreground occluders make adjacent scene packages appear continuous.
- Travel time can compress the map's literal distance without implying that buildings are physically adjacent.

## 7. Movement

**Locked**

- Movement combines manual control and click/tap-to-destination automatic travel.
- Manual controls include drag/swipe, desktop mouse/keyboard, and clicking a reachable point on the path.
- Tapping a destination can start a guided cinematic journey.
- The full journey is shown on first traversal.
- Previously experienced journeys can offer Skip or Fast Travel.
- The movement-space model is a controlled hybrid:
  - travel between regions follows invisible rails and authored navigation nodes;
  - each region permits bounded pseudo-free first-person movement and look-around;
  - the player may drag/swipe, use desktop controls, or click/tap reachable path points;
  - the camera is clamped to the artwork's designed bounds;
  - long journeys remain guided and cinematic;
  - selected spaces such as the Beach or Farm may offer wider exploration than narrow road segments;
  - unrestricted 360-degree free roaming is intentionally excluded because it would expose the limits of the 2D artwork.

**Open**

- Collision/boundary feedback and how the player turns between forward, backward, left, and right views.

## 8. Scene Construction and Animation

**Locked**

- Core technique: multilayer 2.5D painted scenes.
- Parallax creates depth during camera movement.
- Selective looping video is allowed for large natural motion such as the sea.
- CSS, sprite sequences, particles, and small loops handle details such as candles, smoke, tree movement, screens, and lights.
- Full-scene background videos are not the default.
- Each interior has its own art direction and spatial behavior.
- Interiors combine layered animation with building-specific layouts; they are not forced into one template.

## 8A. Visual Art Direction

**Locked**

- The visual style combines:
  - warm, soft painterly storybook appeal;
  - cinematic, moody Arcane-inspired lighting and depth;
  - warmer and gentler character rendering than the environments.
- Architecture belongs to one coherent fantasy world, while each building may express its own identity through shape, decor, and purpose.
- Magic is clearly visible but remains elegant rather than covering every object in glow.
- Natural environmental colors dominate; violet and pink act as identity accents, lighting cues, and magical details.
- Building areas feel cozy and personal, while the sea, road perspectives, and elevated Museum give the island a grander scale.
- Time-of-day changes reuse the layered scenes while changing sky, shadows, window lights, practical lamps, and grading—not only applying one flat color filter.
- Night combines violet moonlight, warm windows/lamps, and a pronounced but controlled star-filled sky.
- Weather appears as visual and audio layers such as cloud, rain, fog, wind, and surface reactions; clarity and usability must remain protected.
- Persistent UI mixes world-like physical objects with restrained translucent violet-glass interface treatment.
- Narration is presented as cinematic bottom-of-screen text (originally the caption for a voice-over; per §3A-1, this is now the text itself — there is no voice-over).
- VAR's direct dialogue is presented through speech bubbles in the initial release.
- Marcelino initially communicates through movement and sounds rather than written dialogue.
- The current island-map asset is retained as the structural/visual map asset unless Ahmed later approves a revision.
- Other current assets—including the Gate and avatar—are references and may be regenerated.
- The island uses real ocean video behind/around it rather than a fully illustrated animated sea.

## 9. Interaction Language

**Locked**

- Interactive objects may be activated through either the object itself or its diamond marker.
- Important objects may require the player to approach before the interaction becomes available.
- Diamond markers pulse gently.
- A marker may disappear after the object is discovered.
- Nearby interactive objects use a combination of subtle glow/movement and soft audio feedback.
- Some collectibles are visible; others are hidden inside environmental details or interactions.

## 10. Persistent Interface

**Locked concept; exact layout still open**

- Back control inside buildings.
- Map control.
- Language control.
- Walkman/music control.
- The controls persist across world scenes unless a deliberate cinematic or sacred-space rule hides/disables them.

## 10A. Progression, Keys, Daily Return, and Languages

**Locked**

- Unlock conditions may combine story progress, calendar date/time, collected keys, and achievements.
- Keys are the only world collectible currency/system; collectible stars are rejected.
- Every location has its own visually distinct key shape rather than one universal design.
- A location's key can have multiple collectible copies, with locks able to require different quantities.
- Veoulla can collect no more than one copy of the same location-key shape per calendar day.
- A key shape does not have to appear every day; availability can follow scheduled dates or story conditions.
- The Beach key is provisionally shell-shaped; the final shell/key artwork will be designed later.
- The Cottage mailbox provides one or more date-matched messages per day and contains no songs; dated song releases belong to the Vinyl Café.
- The achievement system mixes visible achievements with secret achievements.
- Completed scenes may be replayed, but replay does not award the same key, achievement, or other one-time reward twice.
- The world supports five languages:
  - English;
  - Egyptian Arabic;
  - Italian;
  - Greek;
  - French.

**Open**

- Exact key inventory, names, designs, sources, locks, and award animations.
- Exact achievement catalog and where achievements are displayed.
- Daily quote/song ownership rules for missed days and revisits.
- Default language and first-time language-selection behavior.

## 11. Map and Avatar

**Locked**

- The map is a living illustrated overview with ambient sea, clouds, lighting, or similar subtle movement.
- The avatar shows Veoulla's current location.
- The avatar supports idle, travel/glide, and arrival states.
- During map travel, the avatar can move along the island road.
- Outside the map, the experience remains first-person and the avatar is not normally visible.
- Locked locations are covered by magical mist or vines rather than only displaying a generic padlock.

## 12. World Time, Weather, and Sound

**Locked**

- Normal time follows Veoulla's device time.
- Story events can override the displayed world date/time.
- The administrator can control or simulate the world's date and time.
- Weather combines scheduled story events with real-world weather input.
- Each region has its own ambient soundscape.
- Walkman music can continue over regional ambience.
- The Church is an exception: music stops completely on entry.

**Open**

- Location used for real weather if Veoulla travels or denies location permission.
- Whether the Church also suppresses UI sound effects or only Walkman/music.
- Time-zone and anti-clock-tampering rules for birthday-critical events.

## 13. Persistence and World Change

**Locked**

- Important actions can create permanent visible changes in the island.
- Some special/birthday/seasonal changes may later reset or transform.
- Progress memory must eventually cover meaningful discoveries, unlocks, collectibles, choices, messages, and achievements; exact storage design is deferred.
- Replay rules will be specified separately.

## 13A. First-Visit Freedom Rule

**Locked**

- Veoulla's first visit follows a mandatory authored story route.
- During that first route, destination order is controlled by the story even where multiple buildings are physically available at the same road node.
- After completing the required first-visit story, the island changes to unrestricted destination choice within whatever locations have been unlocked.
- The exact route, story beats, interruption/resume behavior, and moment at which free exploration activates are deferred to the dedicated first-opening design phase.

## 14. Accessibility and Comfort

**Current decision**

- Reduced-motion or skip controls are not shown by default solely as a design requirement.
- They may be added if real-device testing shows that Veoulla needs them.

**Engineering safeguard still required**

- Cinematic sequences must remain recoverable if interrupted, backgrounded, refreshed, or slowed by the device.

## 15. Characters and Arcade

**Locked**

- VAR exists physically within the world rather than only as a chat button.
- VAR accompanies Veoulla throughout active exploration; location-specific poses and actions may still change with the current scene, story, and progression.
- Every Arcade machine contains its own distinct playable game.
- The Arcade includes a scoreboard.
- Distinct keys can gate Arcade machines or content.

**Open**

- VAR's exact personality, visual magic details, personal backstory/secrets, AI safety rules, and technical architecture.
- Number, themes, controls, scoring rules, and unlock order of Arcade games.

## 16. Visual References Received

These are references, not final approved assets:

- High-angle island illustration with the seven-location composition.
- Wide-screen island/ocean implementation screenshot.
- Dark violet carved gate with four input dials.
- Three-pose warm illustrated Veoulla avatar.
- Gate-closed storyboard: code dials and bottom cinematic text (originally a voiceover caption; per §3A-1 it is now the text itself).
- Gate-opening storyboard: split doors reveal the island through the opening.
- Cottage/Arcade regional storyboard: first-person regional scene, mailbox, interaction diamonds, persistent Map/Language/Walkman controls, and a horizontally connected camera space.
- Arcade storyboard: physical cabinets, a locked cabinet, scoreboard, VAR/cat presence, Back, Map, Language, and Walkman. The stars shown in the old drawing are not part of the approved new-world design.

## 17. Previous Ideas — Not Approved for the New World

The following were recovered from older planning only to avoid losing or unknowingly repeating them. They are **not current decisions**:

- Entry code `2609`.
- A.S. Door/Chamber and code `1911`.
- Earlier Marcelino proposal: a small chick with intentionally limited abilities during the first year. The chick form is now approved, but the old first-year limitation is not inherited.
- Earlier VAR bundle: a white magical AI cat with memory, guidance, translation, teaching, and world knowledge. The white magical cat form and selected current abilities are now approved; only the current character sections define them.
- Painting Canvas.
- Candle/night interaction.
- Balloon Festival.
- Puzzle Pieces.
- Seed Collection.
- Daily Login/Today's Visit.
- Collectible stars (explicitly rejected for the new world; keys replace them).
- Village Square/Sunflower Tree.
- Garden, Lighthouse, Hidden Chamber, VAR study/library, and The Origin.
- Layered public/private access model.

Each item must be discussed again before moving out of this section.

## 18. Deferred Experience Design

- First link opening and first-run experience.
- Gate dialogue, code, and exact entrance choreography (voice-over no longer applies — see §3A-1).
- Daily pre-birthday loop.
- Final hours before the birthday.
- Midnight birthday transformation.
- Hours and days after the birthday.
- Long-term annual life of the world.
- Detailed design of every building.
- Admin panel and operational controls.

## 18A. Sea / Beach

**Locked**

- Role: the island arrival space, a calm refuge, and a location for gradually unlocked small interactions.
- Physical elements include sand, sea, rocks, a dock/pier, boat, loungers, umbrellas, a special sitting point, shells, and a night lantern.
- Veoulla can approach the shoreline until animated waves visually reach the first-person camera, supported by close water audio.
- Planned interactions are progressively introduced rather than presented all at once:
  - sit and watch the sea;
  - write or draw on the sand;
  - find/open messages in bottles;
  - interact with shells for sounds or short memories;
  - watch a sunset cinematic.
- The boat is initially a small reactive environmental interaction: it moves/rocks and produces appropriate sound; no free boat driving is approved.
- Several messages in bottles can appear on different scheduled dates.
- The Beach changes through tide, sand objects/marks, boat state, birds, lighting, and weather.
- When Walkman music plays, sea ambience automatically lowers but remains audible.
- Official location name: **Marevi Cove**.
- Poetic subtitle: **The Whispering Shore**.
- Approved localized official names:
  - English: `Marevi Cove`;
  - Egyptian Arabic: `خليج ماريفي`;
  - Italian: `Cala Marevi`;
  - Greek: `Όρμος Μαρέβι`;
  - French: `Crique de Marevi`.

**Open**

- Exact Beach key schedule, quantity, hiding rules, and which lock(s) use it.
- Message-in-a-bottle texts and dates.
- Sand drawing input method and whether drawings persist.
- Sunset cinematic trigger and replay rules.

## 18B. Church

**Locked**

- Display name remains the simple localized equivalent of **Church**; no fantasy or saint name is added to the navigation label.
- Architectural and spiritual reference: Ahmed identified **كنيسة الملاك والعذراء في بيجام** as Veoulla's real church. Its exact official name, denomination, and visual details must be verified before producing final art or religious copy.
- Role: a calm spiritual sanctuary combining prayer, dated Bible verses/messages, manually selected hymns, a personal photo/story, illustrated Bible stories, and quizzes that award achievements.
- Interior structure: a complete church interior with the primary interactions concentrated in a quiet side area.
- A dedicated candle corner allows Veoulla to light candles by tapping them; no written intention is required for the basic interaction.
- Planned interactions are progressively introduced:
  - light candles;
  - read a scheduled Bible verse/message;
  - manually play a hymn;
  - view the personal photo and read its story;
  - browse illustrated Bible stories;
  - complete religious quizzes;
  - sit in silence.
- The Church key is either awarded by a quiz or discovered outside the Church in a candle-shaped form. It must not be placed near the altar or inside a sacred object.
- Verses and messages are explicitly scheduled by date in Google Sheets rather than selected randomly.
- Religious text uses an approved source edition for each language and preserves its reference; free translation is not the authoritative display source.
- The personal photo and its story are available from the first visit and are also driven from Google Sheets.
- Bible-story images and associated story content are content-managed rather than baked into the scene artwork.
- Walkman music stops completely upon entering the Church.
- No background hymn auto-plays. A hymn plays only after deliberate user interaction.
- The default atmosphere is silence, with optional exterior bell and bird sounds where appropriate.
- Daily religious quizzes can award achievements; this is an approved exception to the Church otherwise functioning as a calm sanctuary.
- Quiz length varies by scheduled day rather than using one fixed question count.
- Quiz question formats combine multiple choice and true/false.
- After an incorrect response, the experience shows an explanation and scripture reference, then permits another attempt.
- Approved quiz achievement families include:
  - first completed quiz;
  - perfect/correct completion;
  - consecutive-day streaks;
  - completion of a themed Bible story/book set.
- Quiz questions come from a reviewed Google Sheets question bank containing the answer, explanation, and scripture reference; live AI generation is not the authoritative source.
- Each scheduled day can present one Bible story with one or multiple images.
- A daily Bible story becomes part of a permanent expanding gallery after it is opened.
- Ordinary candles reset daily, while candles associated with important occasions remain visibly preserved.
- Google Sheets/date logic chooses whether a given day's Church key is earned through the quiz or discovered outside the building.

**Open**

- Exact official identity and denomination details of the real reference church.
- Exact daily quiz schedule, difficulty, scoring, and achievement thresholds.
- Shape/name of the Church key beyond the current candle-shaped exterior option.
- Exact Bible-story gallery presentation, schedule, and interaction style.
- Exact photo, story, hymns, verses, messages, and Google Sheets schemas.
- Whether bell/bird ambience follows real time, scheduled moments, or a fixed loop.

## 18B-1. Church Audio — Hymn Replaced by Gospel Reading (Ahmed's decision, 2026-09-22)

**Locked — supersedes §18B's hymn bullets for the player experience; §18B's other bullets (candle
corner, verse/story/quiz, Walkman-stops-on-entry, no voice-over) are unaffected**

- The manually-played hymn feature described in §18B ("manually play a hymn... no background hymn
  auto-plays... a hymn plays only after deliberate user interaction") is replaced in the player
  experience by a supplied Gospel reading. This is a distinct decision from §3A-1: the reading is
  ordinary remaining Church audio, not narration, and is not affected by the voice-over removal.
- The reading autoplays (browser policy permitting, with the same one-tap "enable audio" fallback
  used elsewhere) at 5% volume, and only while the player is inside the Church interior or the
  candle-corner close-up — the two visual states the Church view ever renders. Moving between those
  two views never restarts it, since both are sub-states of one mounted view, not separate page
  loads.
- Leaving the Church (returning to the Beach) fades the reading out and stops it, mirroring the
  existing hymn-fade behavior it replaces.
- The Walkman and the cat remain absent inside the Church exactly as before (§18B, §12): the Walkman
  pauses on entering and stays paused after leaving until the player explicitly presses play again —
  this was already the existing "silence" behavior and needed no change.
- A short bell plays once on arrival at the Church exterior (the approach view before the door),
  deduplicated per arrival so revisiting the same spot does not re-ring it.
- `20_SONGS` rows with `location_id: 'church'` (the hymn catalog) are unaffected and remain in the
  Sheet — nothing is deleted; the player experience simply no longer surfaces a hymn-picker panel.
  A future decision could reintroduce a distinct hymn feature without conflicting with this one.
- No voice-over/narration is reintroduced by this decision (§3A-1 is unaffected and still governs
  narration).

## 18C. Vinyl Café

**Locked**

- Display name remains **Vinyl Café**, localized where appropriate without replacing its recognizable identity.
- Role: the island's main music hub for listening, discovering songs, browsing an expanding catalog, and submitting song requests.
- Interior identity: a cozy combination of a vinyl record shop and café.
- Primary visual music feature: a vintage gramophone supported by a wall/display of vinyl records.
- The catalog contains a full browsable library, not only the current day's song.
- The current day's selection is highlighted, while previously introduced songs remain permanently accessible.
- One or multiple new songs may be added on the same scheduled date.
- A selected Café song can be transferred to the persistent Walkman and continue playing while Veoulla explores the island.
- Veoulla can type a song request; it is sent to Ahmed's Admin workflow for review rather than being added automatically.
- Approved Café interactions currently include:
  - choose a drink;
  - read a card/message explaining why a song was selected.
- Music Quiz and Favorites are not currently approved Café features.
- The Café key is music-note shaped.
- Google Sheets/date rules decide where or how that day's Café key is obtained.
- Default ambience contains quiet café/environmental sound and subtle vinyl crackle.
- Music does not auto-play merely because the Café was entered; playback begins through user interaction.
- VAR may sit in a corner or near a window according to the character's world schedule.

**Open**

- Exact library browsing interface, catalog metadata, search, sorting, and multilingual presentation.
- Song-request fields, notification method, moderation state, and Admin response flow.
- Drink list, drink interaction, persistence, and whether selections affect later content.
- Song explanation-card schema and whether one card can contain text, image, voiceover, or a personal dedication.
- Exact gramophone/record playback animation.
- Music hosting, streaming, caching, offline behavior, and copyright/licensing constraints.
- Exact Café key schedule, count, hiding rules, and reward use.

## 18D. Arcade

**Locked**

- Role: both a story location and the island's challenge center for games, scores, keys, and achievements.
- The Arcade launches with three physical machines and grows to five over time.
- At the first Arcade visit, one machine is playable and every other installed machine requires keys/progression.
- Approved game families:
  - memory-card game;
  - catching game using themed objects such as mangoes, blueberries, or world items;
  - picture/logic puzzle;
  - maze/adventure involving VAR;
  - trivia.
- Rhythm and space-shooter games are not in the currently approved set.
- Game difficulty adapts upward according to player performance rather than relying only on manually selected difficulty levels.
- Play attempts are unlimited; any daily key or achievement reward can be earned only once per eligible period.
- The Scoreboard combines:
  - Veoulla's personal best scores;
  - recent attempts and improvement history;
  - Arcade achievements.
- Challenges can award both achievements and keys. Story-scene unlocks are not currently defined as direct Arcade rewards.
- The Arcade's location key is shaped like a retro arcade token/coin.
- There is no separate Daily Challenge system.
- VAR reacts to wins and losses and can offer hints when Veoulla becomes stuck.
- The room uses one primary row of physical arcade cabinets, matching the storyboard direction rather than splitting into multiple floors/zones.
- Official fantasy retro name: **VARcade**.
- During active gameplay, the current Walkman track continues at an automatically reduced volume.
- Games have sound effects but no separate game-music tracks.

**Open**

- Exact schedule for adding machines four and five.
- Mapping of approved game families to physical cabinets and launch order.
- Detailed mechanics, controls, scoring, adaptive-difficulty curves, hint limits, and accessibility for each game.
- Exact achievement and key thresholds.
- Five-language presentation of the proper name `VARcade` and any localized subtitle.

## 18E. Farm

**Locked**

- The Farm is an active living system whose plants develop across real days and react to weather; it is not only scenic decoration.
- Core crops are sunflowers, mangoes, and blueberries.
- Physical composition includes outdoor fields, mango trees, blueberry rows, a sunflower field, and a barn.
- Veoulla actively plants seeds, waters them, waits through their configured growth duration, and harvests mature crops.
- Growth uses real-day durations, with each crop's exact duration and schedule configured through Google Sheets.
- Real rain automatically waters eligible plants.
- Seeds and harvested produce use a dedicated Farm inventory separate from the world's key inventory.
- Harvest uses across the world include:
  - mangoes and blueberries for Vinyl Café drinks;
  - sunflowers for Cottage decoration;
  - selected crops for messages, achievements, or special unlock conditions.
- The Farm's location key is sunflower-shaped.
- Ambient wildlife includes birds and butterflies.
- Marcelino can move between the Cottage area and the Farm according to scheduled appearances and story events.
- Approved Farm achievement families include first planting, first harvest, planting every crop type, maintaining plants across multiple days, and harvesting a rare crop.
- Official fantasy name: **Sunberry Fields**.
- Plants that miss watering can wilt and stop progressing, but they do not permanently die.
- Each crop's watering frequency is individually configured through Google Sheets.
- The Barn begins as part of the exterior Farm scene and is planned to unlock later as a small enterable interior.

**Open**

- Subtitle and five-language treatment of `Sunberry Fields`.
- Exact seed acquisition rules, inventory limits, plot count, crop quantities, and harvesting yields.
- Exact wilt thresholds, recovery timing, and visual stages.
- Exact real-weather location/fallback behavior and protection against weather-service failure.
- Exact recipes, crop costs, Cottage decorations, messages, achievements, and rare-crop rules.
- Barn unlock condition and eventual interior interactions.
- Marcelino's exact Farm actions, animation set, and event-specific behavior.

## 18F. Veoulla's Cottage

**Locked**

- Official name: **Veoulla's Cottage**.
- Role: Veoulla's main personal home, daily-return hub, companion home, and collection point for messages, gifts, and memories.
- Interior uses a living room plus a reading/memory corner; a separate bedroom is not included.
- The mailbox remains outside the Cottage as shown on the island map.
- The mailbox can deliver one or multiple scheduled items on the same day, including messages, images/cards, gifts, keys, and voice notes. It does not deliver songs.
- Each mailbox message has an independently randomized initial display language; a day can therefore contain mixed languages.
- Message language is independent of the currently selected interface language.
- Every message includes a ribbon control that translates it into any of the five supported languages.
- Opened messages remain archived and can be reread later.
- The countdown is represented by a natural in-world clock/calendar element and must display days, hours, minutes, and seconds.
- Countdown target date/time is configured through Google Sheets so the same system can later count down to another event.
- When a countdown completes, it becomes a framed memory bearing the completed event date.
- Veoulla can place unlocked sunflowers, harvested items, and decorations inside the Cottage.
- Nail polish remains decorative rather than a gameplay interaction.
- The Cottage key is letter/envelope shaped.
- The window reflects current world time, weather, and selected memory scenes.
- VAR and Marcelino each have a visible dedicated place inside the Cottage, even when the character is currently elsewhere.
- Ambient audio combines fireplace sound, soft room ambience, exterior rain/wind when applicable, and the current Walkman music.

**Open**

- Exact message-randomization rules, translation storage/API behavior, and prevention of repeating the same initial language pattern.
- Mailbox unread/read/archive presentation and multi-item delivery animation.
- Gift, card, image, voice-note, and key schemas in Google Sheets.
- Exact Cottage layout, decor slots, inventory consumption rules, and room-state persistence.
- Exact countdown and completed-event data schemas.
- VAR/Marcelino home-corner designs and behavior.

## 18G. Museum

**Locked**

- The Museum is the elevated destination at the end of the island road and the place that gathers world memories, achievements, stories, and opened gifts.
- Approved content includes:
  - an archived previous birthday site;
  - the existing birthday comic PDF;
  - a future comic for the current year when available;
  - world achievements;
  - photos and memories;
  - important messages;
  - opened gifts;
  - Bible-story material originating from the Church.
- A friendship/world timeline is explicitly excluded.
- Spatial structure combines a central hall with separate themed galleries/wings that open progressively.
- The central hall combines a living world/progress map with a central mysterious artifact.
- The previous birthday site is opened through a portal into a preserved independent archive rather than recreated as screenshots.
- The existing comic is consumed directly from Ahmed's PDF asset and displayed through an in-world page-turning book reader; it is not redrawn from zero.
- A second book/comic for the current year may be added later.
- Unlocked achievements cause physical paintings, sculptures, artifacts, or display objects to appear in the Museum.
- Secret achievements use empty display positions without revealing their names/descriptions before unlock.
- Memories can unlock by scheduled date and can also be added later through the Admin workflow.
- To inspect content, Veoulla approaches an exhibit and opens it; an exhibit may include enlarged imagery, text, date, sound, or story.
- Veoulla cannot add or curate Museum content herself in the current scope; Admin controls additions.
- Gallery wings may unlock through a combination of keys, dates, and achievements.
- The Museum key is a distinctive ancient/golden key appropriate to the island's final landmark.
- It is earned through both: collecting a required set/quantity of other location keys and solving a puzzle on the final road.
- On the first visit, the central hall is open while gallery wings remain locked.
- Ambient audio uses quiet room tone, footsteps, a distant clock/echo, and the Walkman continuing at reduced volume.
- VAR may appear at selected exhibits and react to or explain them, but has no permanently approved Museum office.
- Reaching the last gallery does not automatically trigger a special ending or secret exit.
- Personal Museum content is accessible only to Veoulla.
- Official fantasy name: **The Everkeep**.
- Official subtitle: **Museum of Stories & Wonders**.

**Open**

- Arabic, Italian, Greek, and French treatment of the official name and subtitle.
- Gallery list, floor plan, initial/open/locked content allocation, and gallery unlock sequence.
- Exact central artifact identity and behavior.
- Archived-site technical preservation method and access behavior.
- PDF book-reader controls, mobile layout, bookmarks, progress memory, and optional narration.
- Current-year comic scope and production date.
- Achievement-to-exhibit mapping and empty-display visual language.
- Museum-key prerequisite counts and final-road puzzle design.
- Detailed access-control model that enforces Veoulla-only personal content.

## 18H. VAR

**Locked**

- VAR is a white magical cat rendered in the world's warm painterly, semi-realistic character style.
- `VAR` is a secret identifier/identity rather than the cat's ordinary player-facing name.
- **VARcade** remains the Arcade's fixed official name even after Veoulla gives the cat a personal name.
- During the mandatory first journey, Veoulla names the cat herself; the chosen name can be changed later.
- The cat initially refuses to state a name before Veoulla completes the naming moment.
- Veoulla also chooses the cat's gender/presentation.
- VAR is present from the beginning at the Gate and already knows Veoulla before she arrives.
- VAR's central narrative function is to be a character with a personal story and secrets of its own, rather than merely a generic helper.
- VAR is the sole narrator of the first-visit story.
- VAR's direct dialogue appears in speech bubbles (per §3A-1, text-only — no voice-over).
- First-visit narration is attributed to VAR and presented as cinematic text in all five languages, with a localized Continue action pacing progression (per §3A-1).
- Conversation uses a hybrid model:
  - authored, deterministic dialogue for story-critical scenes;
  - optional AI conversation outside those critical beats.
- VAR can remember all currently approved memory categories:
  - visited places;
  - achievements and collected keys;
  - choices and favorites;
  - summaries of important conversations;
  - moods Veoulla explicitly shares.
- VAR's knowledge may combine island/world canon, approved Google Sheets content, and limited safe general knowledge.
- VAR may initiate interaction at important events, discoveries, or when Veoulla returns after an absence; it should not constantly interrupt ordinary exploration.
- VAR accompanies Veoulla throughout active exploration.
- VAR can be petted, receive items or gifts, play with Veoulla, and be photographed. Carrying VAR is not an approved interaction.
- VAR has blue eyes and wears a collar that displays the personal name selected by Veoulla.
- The approved core personality is affectionate, highly intelligent, playful, protective of Veoulla, and occasionally jealous of Marcelino.
- VAR's principal emotional vulnerability is fear of losing Veoulla.
- The nature of VAR's central secret is intentionally undefined for now; the world may plant clues without confirming an answer.
- The reason VAR already knows Veoulla remains unexplained throughout the first year.
- Renaming is available from the collar, VAR's Cottage place, and Settings; the collar is the in-world representation of the change.

**Open**

- Exact naming-scene wording, allowed characters/length, rename confirmation behavior, and when/how the secret identifier `VAR` is revealed.
- Gender options and their localization/pronoun behavior; whether gender selection can also be changed later.
- Size, additional markings, magical effects, collar design, poses, and animation list.
- Humor style, emotional boundaries, likes/dislikes, other fears, and how jealousy/protectiveness appear without becoming controlling or disruptive.
- Exact Gate introduction and the clue schedule for VAR's secret and prior knowledge of Veoulla.
- Narration-caption layout versus ordinary speech-bubble layout, voice casting/production, and per-line caption timing.
- AI availability, model/provider, backend security, latency/cost limits, offline fallback, moderation, and failure behavior.
- Memory consent, edit/delete controls, retention, summarization rules, sensitive-topic boundaries, and data schema.
- Exact rules for blending world canon, Sheets content, and safe general knowledge without hallucinating island facts.
- Exploration-follow behavior, path/teleport transitions, idle positions inside each building, and behavior during Map view, cinematics, games, and Church silence.

## 18I. Marcelino

**Locked**

- Marcelino is a small, cute, simple yellow chick and remains physically small rather than aging or growing into a larger form.
- Marcelino is present from the first visit.
- Marcelino's principal roles are:
  - delivering all mailbox messages;
  - bringing items from unknown places;
  - creating light comic moments.
- Marcelino does not speak at first and gradually learns limited communication over time.
- When VAR and Marcelino appear together, VAR handles spoken/text dialogue while Marcelino communicates through movement and sounds.
- Marcelino's primary area combines the Cottage mailbox/garden with scheduled movement between the Cottage and Farm.
- Normal visibility is approximately once or twice per day, controlled by Google Sheets schedules and story events rather than unrestricted permanent presence.
- VAR protects and teaches Marcelino. They are friends who may bicker affectionately; Marcelino sometimes annoys VAR, but their bond remains warm.
- Marcelino is an authored character and does not use an AI conversation system.
- Marcelino delivers every mailbox message, including days with multiple messages.
- Only Marcelino may temporarily disappear as part of a deliberately authored character story; VAR does not use this absence story mechanic.
- Marcelino may display needs such as hunger, tiredness, comfort, or curiosity, but Veoulla is not required to manage them as a daily-care system.
- Marcelino is mischievous, easily frightened, fond of food, loves collecting things, and often sleeps in unusual places.
- Marcelino carries a small mailbag as his signature accessory.
- Marcelino first appears at Veoulla's Cottage during the mandatory first visit.
- Learning to communicate combines dated Google Sheets milestones, the number of completed deliveries, and Veoulla's direct interactions with him.
- When several messages arrive on one day, an important message is delivered separately and the remaining messages arrive together.
- If Veoulla is absent at a scheduled delivery, Marcelino retries the delivery on her next visit.
- Optional interactions with Marcelino's visible needs may sometimes award achievements, but ignoring those needs does not punish Veoulla.
- The duration of a scripted Marcelino disappearance is configured per event through Google Sheets.
- Items Marcelino may bring from unknown places include messages, gifts, rare keys, Farm seeds, and mysterious objects reserved for future stories. Ordinary photo/card delivery is not part of this special unknown-place item list.

**Open**

- Exact Cottage entrance, how Marcelino and VAR already know each other, and the first delivered message.
- Size, additional markings, mailbag design, animation list, sound palette, favorite foods/objects, fear triggers, and comic behavior limits.
- Origin of the unknown-place items and whether their mystery becomes a future story thread.
- Communication-learning stages, exact combined milestone formula, vocabulary ceiling, and whether learned words persist permanently.
- Exact daily schedule rows, delivery times, retry presentation, Farm actions, and any appearance outside the Cottage/Farm route.
- Multi-message delivery animations, carrying capacity, special gift/key handling, and what happens during a scripted absence.
- Achievement list and anti-farming rules for optional care interactions.

## 18J. First Opening and Mandatory First Journey

**Locked experience decisions**

- Launch presentation runs in this order:
  1. black screen with sea ambience and a short opening line;
  2. **Veoulla's World** title/logo;
  3. reveal of the closed Gate.
- The application begins in English without a separate pre-world language-selection screen. The persistent Language control becomes available later in the experience.
- Desktop/laptop and mobile are equally important target experiences.
- Audio attempts to begin automatically when browser policy permits. A minimal tap/click-to-enable-audio fallback appears only when required by the browser.
- Admin uses a separate authenticated entry; Veoulla enters through the story Gate.
- The Gate uses four physical number dials.
- The valid Gate code is selected from active Google Sheets data and can change without a frontend rebuild.
- An incorrect Gate attempt produces a small physical shake and error sound. VAR does not automatically provide a hint under the current decision.
- Before VAR is visible, Veoulla first receives a line of dialogue/narration from her.
- VAR then appears and greets Veoulla warmly.
- After successful entry, the two Gate doors open slowly while a widening slit of light reveals the island and the music rises.
- VAR jumps through first; Veoulla follows by moving through the open Gate herself.
- Arrival begins with a wide cinematic view of Marevi Cove and then settles into first-person control.
- On the Beach, VAR asks Veoulla to give her a personal name and choose her gender/presentation. The answer is written onto the magical collar and saved.
- The first journey is peaceful and contains no danger. Its combined purposes are:
  - guide Veoulla to her Cottage/home;
  - deliver the first message through Marcelino;
  - introduce the island's locations;
  - collect the first required set of keys;
  - reach The Everkeep;
  - establish that the island already recognizes Veoulla;
  - provide a calm welcome rather than a crisis to solve.
- Mandatory route order:
  1. Gate;
  2. Marevi Cove / Beach;
  3. Church;
  4. Vinyl Café;
  5. VARcade;
  6. Veoulla's Cottage;
  7. Sunberry Fields;
  8. The Everkeep.
- Every visited location receives a full introductory scene rather than an exterior-only preview or a very short tooltip.
- The introduction has no fixed target duration; pacing is driven by the complete experience and Veoulla's interactions.
- The journey awards multiple configured keys whose combined requirement opens The Everkeep.
- The Map is unavailable at the beginning. VAR introduces and unlocks it only at the conclusion of the journey.
- The Walkman is received and activated at Vinyl Café.
- Marcelino first appears from the Cottage garden carrying his mailbag.
- Marcelino delivers the first message and then runs away. The first message is explicitly from Ahmed, while its localized content, active date, optional personal voice-note reference (an intentional, distinct feature per §3A-1 — not narrated dialogue), and presentation rules come from Google Sheets.
- The journey enters The Everkeep and ends inside its Central Hall.
- At the ending, VAR states that Veoulla is now free to explore and gives/unlocks the Map as an in-world object. The Map then appears as an available persistent control.
- The successful Map unlock is the authoritative story-completion moment.
- The first journey is non-skippable during its original run.
- After original completion, it does not run again automatically. It can reappear only when the Admin activates the dedicated replay/force flag in Google Sheets.
- A forced replay can offer Replay/Skip behavior because the original mandatory experience has already been completed.
- Progress uses scene-level checkpoints. If the page closes or fails mid-journey, Veoulla is offered **Continue** or **Restart** and Continue resumes from the latest safe checkpoint.
- Completion is confirmed through both backend state and local device state.
- On normal visits after completion, Veoulla begins at Veoulla's Cottage.

**Recommended state model derived from the locked behavior**

- Keep separate per-user fields instead of reusing one ambiguous value:
  - `first_journey_completed`: initially `0`; backend changes it to `1` only after Map unlock succeeds;
  - `force_first_journey`: normally `0`; Admin changes it to `1` to force one new presentation;
  - `first_journey_checkpoint`: latest recoverable scene/beat identifier;
  - `first_journey_completed_at`: authoritative completion timestamp;
  - `first_journey_version`: content version last completed.
- After a forced journey finishes, the backend resets `force_first_journey` to `0` without clearing the historical completion fields.
- If the Sheet write is temporarily unavailable at the final beat, the client stores a pending completion transaction locally, permits the completed experience to continue, and retries through the backend. Veoulla must not be trapped in the introduction because of a temporary Sheet outage.

**First-opening storyboard — proposed execution based on locked decisions**

| Beat | Visual and interaction | Audio / localized presentation | State and Sheet responsibility |
| --- | --- | --- | --- |
| 01. Bootstrap | Black screen while essential configuration and first scene assets load. A short line fades in, followed by the world title. | Sea ambience attempts autoplay (unaffected by §3A-1); the fading-in line uses the active English row initially, as text — no voice-over. Show one unobtrusive sound-enabling gesture only if ambience playback is blocked. | Create an entry-log event, resolve active Gate/story versions, access rules, language rows, icon references, and asset URLs. |
| 02. Closed Gate | Title recedes to reveal the closed carved Gate and four number dials. Admin access remains a separate restrained control/route. | Wind/sea distance, low Gate ambience, localized instructions. | Start or resume a secure Veoulla entry session; never send the valid code to the browser. |
| 03. Unseen VAR | A speech/caption appears before the cat is shown. The source initially has no personal name label because VAR refuses to state one. | Warm localized VAR line, shown as text with a Continue action (per §3A-1, no voice-over); Arabic switches text direction to RTL. | Dialogue ID, translations, speaker behavior, and next beat come from Sheets. |
| 04. VAR reveal | VAR steps into view and greets Veoulla warmly. The Gate dials become interactive. | Character reveal cue and localized welcome. | Save `var_encountered`; do not yet save a personal cat name or gender. |
| 05. Gate attempt | Veoulla rotates four physical dials and submits. Wrong entries create only a small shake and error sound. | Mechanical clicks and a restrained failure cue. | Backend validates against the current active Sheet-configured code and logs success/failure, timestamp, session, and server-observed IP. Rate limiting remains a technical design item. |
| 06. Gate opening | Correct validation creates a light seam; both doors open slowly, the island becomes visible, and music rises. VAR jumps through and waits beyond the threshold. | Full multilingual success narration as text (per §3A-1) and cinematic musical rise (unaffected). | Mark Gate passed and checkpoint before transition so refresh never requires another successful code entry within the valid session. |
| 07. Cove arrival | Veoulla follows through. A wide Marevi Cove cinematic establishes sea, beach, three steps, road, buildings, and distant Everkeep; camera settles into first person. | Waves and first Beach theme; localized narration explains only what is emotionally necessary. | Load the active first-journey route row and Beach introduction package. |
| 08. Naming | On the Beach, VAR asks Veoulla to choose a personal name and gender/presentation. The magical collar forms/displays the chosen name. | VAR's prompt as text (per §3A-1, no voice-over), accessible text input, localized confirmation. | Backend writes the personal name, gender/presentation, pronoun/localization choice, and timestamp; local state mirrors it. |
| 09. Beach introduction | Full Marevi Cove introduction and one signature Beach interaction lead to its configured introductory key/reward. The three steps then draw attention toward the road. | Beach ambience remains dominant; VAR explains the first key without over-tutorializing. | Interaction, key type, key availability, and reward animation are resolved from Sheets and checkpointed. |
| 10. Church | The guided path crosses the three steps and enters the Church. Music stops completely. Veoulla receives the full spiritual-space introduction and completes the configured first-visit interaction/key route. | Silence/room tone, allowed bells/birds (unaffected by §3A-1); localized narration is text. | Load dated verse/story/quiz/candle configuration and introductory reward from Sheets. |
| 11. Vinyl Café | Journey crosses to Vinyl Café. Veoulla receives the full Café introduction, activates the Walkman, and experiences the configured first song/drink/explanation interaction and key reward. | Café ambience and vinyl crackle; chosen song begins only after interaction. | Walkman unlock, active song rows, five-language explanation, icon/cover/audio references, and reward are Sheet-driven. |
| 12. VARcade | Veoulla enters VARcade, sees the machine row and scoreboard, and plays the configured introductory machine/challenge before receiving its eligible token key. | Walkman lowers during play; game uses sound effects only. | Machine availability, first game, score rule, reward, icons, and dialogue rows come from Sheets. |
| 13. Cottage and Marcelino | The Cottage receives a full exterior/interior introduction. Marcelino emerges from the garden with his mailbag, delivers Ahmed's first message, and runs away. | Marcelino sounds (unaffected), VAR reaction as text, and Ahmed-message text in the active language — plus Ahmed's own personal mailbox voice-note, which is a distinct feature per §3A-1 and unaffected by narration voice-over removal. | Message content and five language variants, delivery state, Cottage key/reward, and archive record are Sheet-driven and checkpointed. |
| 14. Farm | Guided route continues to Sunberry Fields for the full Farm introduction and its configured first plant/water/harvest-or-key interaction. | Farm ambience, wildlife, and localized guidance. | Crop/tutorial state, weather behavior, seed/key reward, icons, timings, and completion rules come from Sheets. |
| 15. Everkeep approach | The road rises to The Everkeep. The collected configured key set becomes visible/acknowledged and unlocks the entrance. | Quiet elevated ambience, distant clock, key resonance, and restrained narration. | Backend verifies required key inventory against the active first-journey unlock rule; no client-only unlock decision. |
| 16. Central Hall | Veoulla enters the Central Hall, sees the living progress element and mysterious artifact, and receives the final welcome rather than a danger/cliffhanger. | Museum room tone, footsteps/clock, reduced Walkman, five-language final narration. | Load central-hall state and prepare the final completion transaction. |
| 17. Freedom and Map | VAR tells Veoulla she is free to explore and presents/unlocks the Map. The Map opens for the first time, showing Veoulla's avatar and the island. | Completion cue, localized text (per §3A-1), then normal Map ambience. | Atomically mark `first_journey_completed=1`, store timestamp/version, clear checkpoint, reset any consumed force flag, unlock Map, and log completion. |
| 18. Next visit | After completion, normal launches resume at Veoulla's Cottage unless an Admin force flag requests the journey again. | Cottage ambience and date-matched content. | Reconcile device/backend state, fetch current daily content, and avoid replaying original one-time rewards. |

**Still open for later specification, not another First-Opening concept questionnaire**

- Final written dialogue scripts in five languages (voice-over scripts no longer apply — see §3A-1).
- Exact introductory interaction and exact key quantity at each location.
- Active Gate codes, validity dates, attempt limits, cooldowns, and session duration.
- Asset production list, music/SFX timing, and performance budgets (voice casting no longer applies — see §3A-1).
- Final Sheet tab/column design and backend transaction API.
- Exact entry-log retention/privacy rules and Admin log-viewer presentation.

## 18K. Birthday Event Timeline

**Status: Locked — approved by Ahmed**

**Event foundation**

- Proposed primary event ID: `birthday_2026`.
- Proposed target moment: **26 September 2026 at 00:00:00, Africa/Cairo time**.
- Exact target, timezone, phase boundaries, enabled state, content, icons, assets, music, narration text (originally voice-over — see §3A-1), rewards, and override state are all Sheet-driven and contain no hard-coded birthday logic in React.
- Environment phases follow authoritative event time. One-time personal scenes follow player progress, so Veoulla cannot permanently miss the birthday story by being offline at midnight.
- If the mandatory first journey is still incomplete when the birthday phase becomes active, the first journey finishes first; the birthday opening is queued immediately after Map unlock.
- Admin can simulate any phase without changing the device clock and can force replay of the one-time birthday story.

**Proposed phase timeline**

| Phase | Default time window | What Veoulla sees | Story/content behavior |
| --- | --- | --- | --- |
| B0. Ordinary world | Earlier than T−24h | Normal island time/weather. Cottage countdown continues naturally. | Normal dated content; no obvious party takeover. Very small clues may be enabled individually from Sheets. |
| B1. Final day | T−24h to T−6h | Countdown enters its final day. A few violet/gold ribbons, sunflowers, parcels, covered objects, and subtle lights begin appearing across existing scenes. | VAR behaves warmly but avoids explaining; Marcelino makes unusual deliveries. No forced travel. |
| B2. Preparations | T−6h to T−1h | More windows and path lanterns illuminate. Café prepares a special record; Farm shows a prepared sunflower arrangement; Everkeep artifact pulses faintly. | New pre-birthday messages arrive as text (per §3A-1). Birthday rewards remain locked. |
| B3. Near moment | T−1h to T−10m | Sky grading becomes violet/gold and the island feels expectant. Cottage countdown becomes visually prominent without blocking exploration. | VAR may give one gentle reminder that something is approaching. All normal progress remains available. |
| B4. Invitation | T−10m to T−60s | Map and Cottage clock glow. A non-destructive invitation guides Veoulla toward the Cottage or lets her continue until the final minute. | Current interaction checkpoints before the transition. Admin can disable the guided invitation from Sheets. |
| B5. Final countdown | T−60s to T0 | Current scene safely settles into a synchronized island countdown. Lights lower briefly; the last ten seconds receive distinct visual beats. | Localized numbers and five-language narration text come from Sheets (per §3A-1, text-only — no audio dependency). |
| B6. Birthday reveal | T0 to T+1h | At zero, the island changes to warm violet/gold celebration lighting; lanterns, flowers, ribbons, sky effects, and building details reveal together. | VAR delivers the first birthday greeting. Marcelino arrives with Ahmed's special birthday message. The one-time birthday story becomes claimable. |
| B7. Main celebration | T+1h to T+6h | Every location has a highlighted birthday interaction, but Veoulla keeps freedom of movement. Map shows the suggested celebration trail. | Messages, gifts, keys, Café music, Church blessing/verse, Farm flowers, VARcade challenge, and Everkeep exhibit are enabled according to Sheets. |
| B8. Birthday evening | T+6h to T+24h | Celebration becomes calmer: sunset/night lighting, glowing paths, warm windows, and persistent special decor. | All main birthday content remains claimable. Missed exact-midnight sequence plays on the first eligible visit. |
| B9. Afterglow | T+24h to T+72h | Some decorations remain while the world gradually returns to its normal seasonal state. | Unclaimed personal messages/gifts remain available; time-limited cosmetic reactions may fade. |
| B10. Permanent memory | After T+72h | Ordinary world returns. Selected birthday objects/photos appear permanently in The Everkeep and the completed Cottage countdown becomes a framed memory. | Birthday story, messages, gifts, and achievements remain archived. Replay gives no duplicate one-time rewards. |

**Proposed one-time birthday story flow**

1. The active scene checkpoints safely and the island performs the final synchronized countdown when Veoulla is online at T−60s.
2. At T0—or on her first eligible visit after T0—VAR begins the localized birthday greeting.
3. Marcelino arrives with Ahmed's special birthday message; message text, images, gifts, audio, caption timings, and language variants come from Sheets.
4. The Map opens in celebration mode and highlights an optional route rather than forcing the ordinary first-journey rails.
5. Each building offers one signature birthday moment:
   - **Marevi Cove:** sunrise/sunset or sea-light reveal and a personal bottle/message moment;
   - **Church:** a respectful birthday verse, prayer/blessing, candle interaction, and dated story/quiz content; Walkman remains stopped;
   - **Vinyl Café:** one or more dated birthday songs and their explanation cards;
   - **VARcade:** a birthday challenge with one-time achievement/key reward;
   - **Veoulla's Cottage:** Ahmed's principal message, gifts, countdown completion, and decorated home state;
   - **Sunberry Fields:** sunflower celebration and harvest/planting gift;
   - **The Everkeep:** final birthday exhibit/memory that records the event permanently.
6. The suggested route finishes at The Everkeep, but Veoulla may pause, revisit, or complete locations in another order after the opening greeting.
7. Completing the final configured birthday beat writes `birthday_story_completed=1`, timestamp, story version, claimed reward IDs, and exhibit unlocks to the user's Sheet state.

**Missed-time and replay rules**

- Missing midnight never loses the story. On the first visit after T0, the world plays a shorter arrival transition followed by the full unclaimed personal sequence.
- A birthday interaction may be time-themed without becoming permanently missable unless its Sheet row explicitly says `expires=true`.
- Messages, opened gifts, achievements, photos, and the final exhibit remain permanent.
- Admin may set `force_birthday_story=1` or choose a `forced_phase_id` to test/replay any phase.
- Replay never duplicates keys, gifts, crops, achievements, or other one-time rewards already recorded in Sheets.

**Proposed birthday state fields**

- `birthday_story_status`: `not_started`, `active`, `completed`.
- `birthday_story_checkpoint`.
- `birthday_story_version`.
- `birthday_story_started_at`.
- `birthday_story_completed_at`.
- `birthday_reward_ids_claimed`.
- `birthday_location_beats_completed`.
- `force_birthday_story`.
- `forced_phase_id`.
- `event_time_override` and `event_time_override_enabled`.

**Open content inputs**

- Exact Ahmed messages, gifts, songs, Bible verse/story, images, final exhibit, narration text (voice-over scripts no longer apply — see §3A-1), and reward quantities will be inserted later through the Google Sheets content plan.

## 19. Immediate Next Topic

Give Claude Code the M00 prompt, review its implementation evidence, and accept or reject M00 before beginning M01.


## Release corrections authorized 2026-09-24

Ahmed explicitly authorized the reviewed application release to the existing Render FREE service, including commit/push/deploy; this supersedes the earlier deployment deferral for this release only. Church interior and candle corner are now completely silent: no hymns, Gospel playback, enable prompt, or reading mute controls. The exterior arrival bell remains. No paid service, billing change, Firebase deployment, real-owner reset, or production review clock is authorized. See `docs/reports/RELEASE_FIXES_2026-09-24.md`.
