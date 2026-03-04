# Gmail Email Scheduler

A full-stack application to schedule emails using Gmail API.

## Features
- Schedule multiple emails at different times.
- Recurrence support (Daily, Weekly, Monthly).
- Modern UI with Tailwind CSS.
- Secure OAuth2 authentication.

## Local Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <repo-folder>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   APP_URL=http://localhost:3000
   ```

4. **Run the application:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## Deployment (Back4App)

This project is ready for deployment on Back4App Containers using the provided `Dockerfile`.

1. Push this code to a GitHub repository.
2. Connect the repository to Back4App.
3. Set `APP_URL` in Back4App environment variables to your assigned `.run.app` or `.b4a.run` URL.

## Technologies Used
- **Frontend:** React, Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend:** Node.js, Express, Better-SQLite3.
- **Scheduling:** Node-Cron.
- **API:** Google APIs (Gmail).
