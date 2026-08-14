# Issue Candidates (20)

1. Title: fix : add try-catch around JSON.parse calls in snyk.service.js
   Type: fix
   Category: bug
   Files: snyk/snyk.service.js
   Summary: Four JSON.parse(stdout) calls in snyk.service.js have no error handling — non-JSON snyk output causes uncaught exceptions.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

2. Title: fix : add timeout to ElevenLabs axios.post in VoiceAiService.js
   Type: fix
   Category: bug
   Files: backend/api/src/services/voice/VoiceAiService.js
   Summary: ElevenLabs axios.post has no timeout — the request can hang indefinitely if the API is unresponsive.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

3. Title: fix : wrap JSON.parse in try-catch for wasm stdout in wasi-runtime.js
   Type: fix
   Category: bug
   Files: wasi/wasi-runtime.js
   Summary: WASI executeFunction catches errors but the wasm stdout processing uses uncaught JSON.parse — non-JSON output crashes the runtime.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

4. Title: fix : add try-catch around JSON.parse for OPA CLI stdout in policy.service.js
   Type: fix
   Category: bug
   Files: k8s/opa/policy.service.js
   Summary: Policy service parses OPA CLI stdout with uncaught JSON.parse — non-JSON stderr-like output turns into a crash instead of a deny decision.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

5. Title: fix : paginated() returns hasNextPage=true for page 0 with a single page of results
   Type: fix
   Category: bug
   Files: backend/api/src/lib/apiResponse.js
   Summary: The paginated() helper returns hasNextPage=true when page=0 and totalPages=1 because the guard only checks Number(page) < totalPages without clamping negatives.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

6. Title: fix : remove duplicate 408 check in isTransientHttpStatus in core/retry.js
   Type: fix
   Category: bug
   Files: backend/api/src/core/retry.js
   Summary: isTransientHttpStatus checks status===408 on line 23 and again on line 25 — the second check is redundant dead code.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

7. Title: fix : trafficService.js falsy guard rejects valid 0 coordinates at equator or prime meridian
   Type: fix
   Category: bug
   Files: backend/api/src/services/trafficService.js
   Summary: getLiveTrafficMultiplier uses !pickupLat || !pickupLng which rejects valid 0,0 coordinates — locations on the equator or prime meridian silently skip traffic lookup.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

8. Title: fix : notificationService.js stores delivery OTP notification as order_update instead of delivery_otp
   Type: fix
   Category: bug
   Files: backend/api/src/services/notificationService.js
   Summary: sendDeliveryOtpNotification persists the notification row with notif_type=order_update but pushes with notifType=delivery_otp — the two channels disagree, confusing downstream consumers.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

9. Title: fix : sendDeliveryOtpNotification does not include the OTP value in the push payload
   Type: fix
   Category: bug
   Files: backend/api/src/services/notificationService.js
   Summary: sendDeliveryOtpNotification generates an OTP and sends a push notification but omits the OTP value from both the FCM data payload and the notification body — customers cannot display the OTP.
   Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
   Conflict risk: low

10. Title: fix : compression.js NaN threshold and level values when env vars are non-numeric
    Type: fix
    Category: bug
    Files: backend/api/src/config/compression.js
    Summary: COMPRESSION_THRESHOLD_BYTES and COMPRESSION_LEVEL use Number(env) without NaN guards — non-numeric env values produce NaN which propagates into the compression middleware.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

11. Title: fix : CursorDecoder.decodeCursor uses bare catch that swallows the caught error
    Type: fix
    Category: bug
    Files: backend/api/src/utils/cursorPagination.js
    Summary: decodeCursor has a bare catch {} that does not reference the caught error variable.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

12. Title: fix : replace console.log with logger in healthRoutes.js
    Type: fix
    Category: bug
    Files: backend/api/src/routes/healthRoutes.js
    Summary: healthRoutes.js uses console.log for operational messages instead of the shared logger.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

13. Title: fix : CacheManager.js catch blocks log errors without structured context
    Type: fix
    Category: bug
    Files: backend/api/src/cache/CacheManager.js
    Summary: CacheManager catch blocks call logger.error with a plain string message instead of structured {err} context.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

14. Title: fix : CacheEvent.js catch block does not reference the caught error variable
    Type: fix
    Category: bug
    Files: backend/api/src/cache/CacheEvent.js
    Summary: CacheEvent.js has a catch(e) block that does not reference the error variable.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

15. Title: fix : FraudDetectionService.trackBehavior missing null guard for userId
    Type: fix
    Category: bug
    Files: backend/api/src/services/security/anomalyDetectionService.js
    Summary: trackBehavior accepts null userId and proceeds to hash it, producing an anonymous fingerprint — it should throw or return early for null userId.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

16. Title: fix : ml.js parseWeightKgSafe missing NaN guard for invalid weight input
    Type: fix
    Category: bug
    Files: backend/api/src/services/ml.js
    Summary: parseWeightKgSafe does not guard against NaN inputs from parseFloat failure — NaN propagates to downstream ML model calls.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

17. Title: fix : paginated helper does not clamp negative page values to 1
    Type: fix
    Category: bug
    Files: backend/api/src/utils/pagination.js
    Summary: buildPagination accepts negative page values and passes them through without clamping to 1, producing negative offsets.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

18. Title: fix : orderDisplayId.parseDisplayId missing null guard for null input
    Type: fix
    Category: bug
    Files: backend/api/src/lib/orderDisplayId.js
    Summary: parseDisplayId throws TypeError when passed null instead of returning a structured error.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

19. Title: fix : malwareScanner.scan missing null guard for null buffer
    Type: fix
    Category: bug
    Files: backend/api/src/lib/malwareScanner.js
    Summary: scan() passes a null buffer to isBufferSafe which returns false (treated as malicious) instead of throwing a clear validation error.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low

20. Title: fix : predictionValidator.validatePrediction missing null guard for null input
    Type: fix
    Category: bug
    Files: backend/api/src/lib/predictionValidator.js
    Summary: validatePrediction throws TypeError when passed null instead of returning a ValidationError with a clear message.
    Verification: cd backend/api && npm ci && npm run test:unit -- --reporter=default
    Conflict risk: low
