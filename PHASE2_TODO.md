# Echo Phase 2 todos

- [x] Investigate (3 Explore agents) + user decisions + write plan
- [x] Step 1: server.py scan_library + /api/library, remove admin/CET routing, delete catalog.json, update banner
- [x] Step 2: app.js init fetch /api/library, drop tracks.json+catalog merge, remove legacy route regex, simplify compareTracks
- [x] Step 3: index.html search box + app.js trees + styles.css tree/search styles
- [x] Step 4: delete admin.html, ui/admin.js, ui/admin.css; clean references (README rewritten)
- [x] Step 5: tests/test_scan.py (unittest 11), curl smoke, node --test regression, headless Chrome E2E 11/11
- [x] Step 6: docs (dev-guide/roadmap/migration/architecture), tag v0.2-library, push origin develop + tag
- [x] Final Phase 2 report (Changed/Why/Files/Tests/Result/Risks/Next)

Process notes: one commit per step, each independently revertable; never touch tracks.json/transcripts/cet6/audio/cet6/data_tools (history).
