# NavSri — 360° Virtual Campus Navigator

**NavSri** is an interactive 360° virtual campus navigation and pathfinding system developed for **Srinivas Institute of Technology (SIT), Valachil, Mangalore** (Srinivas Group of Colleges).

---

## 🌟 Key Features

* **360° Panoramic Virtual Tour:** Immersive WebGL-rendered spherical panoramas across 26 landmark locations on campus using Marzipano.
* **Turn-by-Turn Campus Navigation:** Instantaneous client-side shortest-path calculation powered by the Breadth-First Search (BFS) graph algorithm (< 0.5 ms computation time).
* **Directional Hotspot Visual Cues:** Dynamic golden-yellow directional glowing indicators guide visitors room-to-room.
* **On-Campus QR Placard Positioning:** Instant location detection via mobile camera QR scanning.
* **Zero-Latency Client-Side Architecture:** No heavy backend, no database vulnerability, and 100% offline-ready once loaded.
* **Official SIT Institutional Theme:** Professional college branding with Deep Navy Blue (`#162354`) and Golden Yellow (`#f59e0b`) accents.

---

## 🏛️ Campus Coverage (26 Locations)

1. Entrance Gate 1
2. Entrance Gate 2
3. Garden View
4. Campus Temple
5. Nursing Entrance 1
6. Engineering Main Entrance
7. Engineering Main Stage
8. Office Entrance
9. Principal's Cabin
10. Office Inside
11. Office 2
12. First Floor Steps
13. First Floor
14. Physics Lab
15. CSE Computer Lab
16. 2nd Floor
17. Ethno Right
18. Ethno Left
19. 3rd Floor
20. Nexus
21. AI & Data Science (AIDS) Out
22. AI & Data Science (AIDS) In
23. 4th Floor
24. WRKube Innovation Center
25. CSBS Out
26. Auditorium

---

## 🚀 Deployment & Local Execution

NavSri is built with standard web technologies (HTML5, Vanilla CSS3, ES6 JavaScript) and has zero build steps:

```bash
# Serve locally
cd app-files
python -m http.server 8000
```
Open [http://localhost:8000/home.html](http://localhost:8000/home.html) in your browser.

---

## 📄 License
NavSri © Srinivas Institute of Technology, Valachil, Mangalore. All Rights Reserved.
