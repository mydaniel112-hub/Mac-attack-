# Security Guidelines

## API Keys and Secrets

**IMPORTANT:** This app does not currently use any external API keys. If you add APIs in the future:

1. **Never commit API keys to version control**
   - Use `.env` files for local development
   - Use environment variables in production
   - Add `.env` to `.gitignore` (already done)

2. **Use environment variables**
   - Create `.env` file from `.env.example`
   - Access via `import.meta.env.VITE_API_KEY`
   - Only variables prefixed with `VITE_` are exposed to client code

3. **For sensitive keys, use a backend proxy**
   - Client-side code cannot truly hide API keys
   - For production apps, proxy API calls through your backend
   - Backend stores keys securely and makes API calls server-side

## Security Features Implemented

1. **Input Validation**
   - Color inputs validated with regex
   - Range inputs validated for min/max bounds
   - localStorage values sanitized

2. **Security Headers**
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY (prevents clickjacking)
   - X-XSS-Protection: enabled
   - Content-Security-Policy: strict source restrictions
   - Referrer-Policy: strict-origin-when-cross-origin

3. **Production Build Security**
   - Code minification and obfuscation
   - Console.log removal in production
   - Source maps disabled in production

4. **XSS Prevention**
   - React automatically escapes content
   - Color values validated before use in style attributes
   - Input sanitization utilities provided

## Best Practices

1. **Always validate user input**
2. **Use HTTPS in production**
3. **Keep dependencies updated**
4. **Review code changes for security issues**
5. **Never trust client-side data validation alone** (also validate server-side if you add a backend)

## Deployment Security

- Use HTTPS only
- Configure CSP headers on your hosting platform
- Set security headers via hosting provider or CDN
- Enable CORS appropriately if adding APIs
- Use environment variables for all secrets
