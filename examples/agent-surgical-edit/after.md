# Product Requirements

^[req-1 type=requirement status=open] Users must authenticate via OAuth 2.0.

^[req-2 type=requirement status=done] The dashboard must load in under 2 seconds.

^[req-3 type=requirement status=open depends=req-1] Admin users can manage other users' permissions.

## ^[arch] System Architecture

The system uses a microservices pattern.

## Tasks

- ^[task-1 type=task status=open] Implement login flow
- ^[task-2 type=task status=done] Write auth tests
