# Gmail Scheduler on Hugging Face Spaces

This project is configured to run on Hugging Face Spaces using Docker.

## Setup Instructions

### 1. Create a New Space
- Go to [huggingface.co/new-space](https://huggingface.co/new-space).
- Select **Docker** as the SDK.
- Choose the **Blank** template.

### 2. Configure Secrets
In your Space settings, add the following **Secrets**:
- `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret.
- `GEMINI_API_KEY`: (Optional) For AI features.

### 3. Persistent Storage (Optional but Recommended)
To keep your scheduled emails and user sessions after a restart:
- Go to **Settings** in your Space.
- Scroll to **Persistent Storage**.
- Choose a tier (the free tier is usually enough for SQLite).
- The app is configured to use `/app/data/scheduler.db` if the directory exists.

### 4. Update Google OAuth Redirect URI
Add the following URL to your Google Cloud Console's "Authorized redirect URIs":
`https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/auth/callback`

## Local Development
1. `npm install`
2. `npm run dev`
