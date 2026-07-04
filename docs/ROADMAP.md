# Build Roadmap

This project is built in six phases, each one a working, demoable product on its own.

- [ ] **Phase 1 — Canvas + sync.** Multiplayer drawing/shapes/move, live cursors, presence. Single server instance, in-memory, no accounts yet.
- [ ] **Phase 2 — Auth + friends + boards.** Login (email/password + Google/GitHub), a dashboard of your boards, adding friends. PostgreSQL via Docker from this point on.
- [ ] **Phase 3 — Chat.** DMs and group chats between friends.
- [ ] **Phase 4 — Video calls.** Camera/mic while sketching together, via a self-hosted LiveKit server.
- [ ] **Phase 5 — Anonymous viewer links.** A shareable, read-only link to watch a board's canvas, chat, and call — no account required.
- [ ] **Phase 6 — Scale-out.** Add Redis (shared sessions + Hocuspocus's Redis extension), containerize everything with Docker Compose, run 2+ Node instances behind an nginx load balancer, and demonstrate two clients on different instances staying in sync.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how each phase fits into the overall system, and the plan at `C:\Users\ninja\.claude\plans\yes-move-to-project-iridescent-truffle.md` for the full folder structure this roadmap maps to.
