# Product Requirements — v2.1

## Authentication

^[req-auth-1 type=requirement status=done] The system shall support OAuth 2.0
authentication with Google and GitHub providers.

^[req-auth-2 type=requirement status=open] Sessions shall expire after 24 hours
of inactivity. Refresh tokens are valid for 30 days.

^[req-auth-3 type=requirement status=open depends=req-auth-1] Two-factor
authentication shall be available as an opt-in setting for all users.

## Performance

^[req-perf-1 type=requirement status=done] Page load time shall not exceed
2 seconds on a 3G connection for the top 10 most-visited pages.

^[req-perf-2 type=requirement status=open] API responses shall complete within
200ms at the 95th percentile under normal load (1000 concurrent users).

## Accessibility

^[req-a11y-1 type=requirement status=open] All pages shall meet WCAG 2.1 AA
compliance. Automated accessibility tests shall run in CI.

## Decisions

^[dec-1 type=decision] We chose Next.js over Remix for the frontend framework
due to better Vercel integration and team familiarity.

^[dec-2 type=decision supersedes=dec-1-draft] PostgreSQL was selected over
MongoDB because our data model is heavily relational and we need strong
transactional guarantees.
