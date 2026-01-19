# Golf Mac - Shot Tracker

A React-based golf ball tracking application with camera-based motion detection.

## Features

- 📹 Real-time ball detection and tracking
- 🗺️ GPS course selection
- 📅 Calendar with streak tracking
- ⚙️ Customizable trace effects and colors
- 🎨 Vibrant, modern UI

## Security

This app has been configured with security best practices:

- ✅ Input validation on all user inputs
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ XSS prevention
- ✅ Environment variable support for API keys
- ✅ Production code minification and obfuscation

**Important Security Note:** This app does not currently use any external API keys. If you add APIs in the future, remember that client-side JavaScript cannot truly hide API keys - they will be visible in the browser. For production apps with sensitive API keys, use a backend proxy server.

See [SECURITY.md](./SECURITY.md) for detailed security guidelines.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production Build

```bash
npm run build
```

The built files will be in the `dist` directory.

## Environment Variables

Copy `.env.example` to `.env` and fill in any API keys if needed:

```bash
cp .env.example .env
```

**Note:** The `.env` file is gitignored and will not be committed to version control.

## Technologies

- React 18
- Vite
- Tailwind CSS
- Lucide React (icons)

## Browser Support

- Modern browsers with camera API support
- Mobile browsers (iOS Safari, Chrome Android)
- Requires HTTPS for camera access (except localhost)

## License

Private project
