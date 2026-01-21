# PocketBase Authentication

## Overview

PocketBase uses stateless authentication with JWT tokens. Clients are authenticated by sending a valid `Authorization: YOUR_AUTH_TOKEN` header. There are no sessions—tokens are not stored in the database.

To "logout", simply clear the token from your local state: `pb.authStore.clear()`

**Note:** PocketBase admins (`_superusers`) are similar to regular auth records but:
- OAuth2 is not supported for `_superusers`
- Superusers can access and modify anything (API rules are ignored)

## Authenticate with Password

Enable the Identity/Password auth collection option. The default identity field is `email`, but you can use any unique field (must have a UNIQUE index).

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

const authData = await pb.collection("users").authWithPassword('test@example.com', '1234567890');

// Access auth data from authStore
console.log(pb.authStore.isValid);
console.log(pb.authStore.token);
console.log(pb.authStore.record.id);

// Logout
pb.authStore.clear();
```

## Authenticate with OTP

Enable the One-time password (OTP) auth collection option.

**Security Note:** OTP as a standalone method is less secure due to short numeric codes. For critical applications, use OTP with Multi-factor authentication.

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

// Request OTP
const result = await pb.collection('users').requestOTP('test@example.com');

// Authenticate with OTP
const authData = await pb.collection('users').authWithOTP(result.otpId, "YOUR_OTP");

// Access auth data
console.log(pb.authStore.isValid);
console.log(pb.authStore.token);

// Logout
pb.authStore.clear();
```

**Notes:**
- `otpId` is returned even if user doesn't exist (enumeration protection)
- Email is automatically marked as "verified" on successful OTP validation
- Email template can include `{OTP}` and `{OTP_ID}` placeholders for custom URLs

## Authenticate with OAuth2

Configure OAuth2 providers (Google, GitHub, Microsoft, etc.) in your auth collection options.

**Setup:**
1. Create OAuth2 app in provider's dashboard
2. Get Client ID and Client Secret
3. Register redirect URL: `https://yourdomain.com/api/oauth2-redirect` (or `http://127.0.0.1:8090/api/oauth2-redirect` for local)
4. Enable provider in PocketBase admin UI: Collections > {YOUR_COLLECTION} > Edit > Options > OAuth2

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://pocketbase.io');

// Opens popup window for OAuth2 flow
// Note: If popup is blocked on Safari, ensure click handler doesn't use async/await
pb.collection('users').authWithOAuth2({
    provider: 'google'
}).then((authData) => {
    console.log(pb.authStore.isValid);
    console.log(pb.authStore.token);
    console.log(pb.authStore.record.id);
    
    pb.authStore.clear();
});
```

## Multi-Factor Authentication (MFA)

PocketBase v0.23+ supports MFA, requiring authentication with 2 different methods.

**Flow:**
1. User authenticates with method A
2. On success, receive 401 with `{"mfaId": "..."}`
3. User authenticates with method B, including `mfaId` from step 2
4. On success, receive regular auth response (token + record data)

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

try {
  await pb.collection('users').authWithPassword('test@example.com', '1234567890');
} catch (err) {
  const mfaId = err.response?.mfaId;
  if (!mfaId) {
    throw err; // Not MFA, rethrow
  }

  // Authenticate with second method (OTP example)
  const result = await pb.collection('users').requestOTP('test@example.com');
  await pb.collection('users').authWithOTP(result.otpId, 'EMAIL_CODE', { 'mfaId': mfaId });
}
```

## User Impersonation

Superusers can generate impersonation tokens to authenticate as other users.

**Important:** Impersonate tokens have custom duration but are not renewable.

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

// Authenticate as superuser
await pb.collection("_superusers").authWithPassword("test@example.com", "1234567890");

// Impersonate user (duration in seconds, optional)
const impersonateClient = await pb.collection("users").impersonate("USER_RECORD_ID", 3600);

console.log(impersonateClient.authStore.token);
console.log(impersonateClient.authStore.record);

// Make requests as impersonated user
const items = await impersonateClient.collection("example").getFullList();
```

You can also generate impersonate tokens from the Dashboard: Collections > `_superusers` > {select superuser} > "Impersonate" dropdown.

## API Keys

PocketBase doesn't have traditional API keys. For server-to-server communication, you can use non-renewable `_superusers` impersonate tokens (generated via the impersonate API or Dashboard).

**Security Warning:** Superusers can access and modify anything. Use these tokens with extreme care and only for internal server-to-server communication.

**Invalidating tokens:** Change the superuser account password, or change the shared auth token secret from `_superusers` collection options to reset all superuser tokens.

## Token Verification

There's no dedicated token verification endpoint. To verify an existing auth token, call `pb.collection("users").authRefresh()`:

- **Valid token:** Returns new token with refreshed expiration and latest user data
- **Invalid token:** Returns error response

**Note:** `authRefresh()` doesn't invalidate previously issued tokens. The new token can be safely disregarded if not needed.

Performance: Token verification uses HS256 JWT algorithm with minimal overhead, similar to calling `getOne("USER_ID")`.
