# Viewpoint Arena

**Viewpoint Arena** is a minimalist simulation environment designed to study and demonstrate collaborative dynamics in 3D design reviews. Unlike standard CAD tools, this system focuses on **social presence**, **attention tracking**, and **AI-driven insight extraction**.

It simulates a multi-user environment where AI agents act as collaborators, allowing the user to evaluate how different viewpoint configurations affect communication and decision-making.

---

## 1. Viewpoint Configurations
The core of the application is the ability to switch between different "lenses" to view the collaborative session.

### 🕷️ Hybrid Split-Screen
*   **What it is:** A dual-viewport mode. The left screen remains your independent "Free View," while the right screen locks into the perspective of a specific collaborator.
*   **Use Case:** Allows you to maintain your own context while simultaneously seeing exactly what a colleague is referring to.
*   **How to use:** Toggle Split Screen, then select an agent from the right-hand sidebar to "tune in" to their video feed.

### 🧠 AI-Guided Focus
*   **What it is:** An autonomous camera mode driven by a "Center of Attention" algorithm.
*   **How it works:** The system calculates where all agents are looking in real-time. The camera automatically drifts to frame the area of highest collective interest.
*   **Interaction:** You can override this manually by dragging the mouse. When you release, the AI gently takes control back after a short delay.
*   **Customization:** Use the slider overlay to weight specific agents (e.g., prioritize the "Design Lead" over the "Observer").

### 🔗 Sync / Leader Mode
*   **What it is:** A formation-flying mode.
*   **How it works:** When enabled, all AI agents break their autonomous behavior and physically form up around you. They align their position and gaze with yours.
*   **Use Case:** Simulating a "Presenter" scenario where one person drives the review and ensures everyone is looking at the same feature.

---

## 2. The Intelligence Layer (Conversation & Insights)
The right-hand panel serves as the cognitive engine of the review, transforming raw movement and inspection into structured engineering data.

### 💬 Live Transcript
*   **Function:** Displays a real-time stream of simulated dialogue based on what agents are inspecting.
*   **Context-Aware:** If an agent is inspecting the "Filter Knob," the dialogue will specifically reference geometry issues or assembly concerns related to that part.

### ⚡ AI Insights Deck
*   **Function:** An analysis layer that listens to the transcript and automatically extracts high-value information.
*   **Categories:**
    *   **⚠️ Risks:** Potential failure points, interferences, or material concerns.
    *   **🛡️ Rationale:** Why a specific design decision was made (e.g., "stress reduction").
    *   **✅ Actions:** Tasks that need to be assigned (e.g., "Verify clearance").
*   **Card Interaction:** Clicking a card opens a detailed **Engineering Record**. This is an interactive form where you can review Priority, Status, Assignees, and Mitigations.
*   **Integration:** Cards feature simulated export buttons for **Knowledge Base**, **Meeting Notes**, and **PLM** linking.

---

## 3. Visual Analysis Tools

### 🔥 Attention Heatmap
*   **What it is:** A volumetric visualization overlay.
*   **How it works:** As agents look at specific parts of the product, those areas accumulate "heat."
*   **Visuals:** Areas glow Blue → Green → Red depending on how long they have been inspected. This reveals which parts of the design are drawing the most scrutiny (or confusion).

### 👁️ Visual Grounding Aids
*   **Frustums:** Wireframe cones showing exactly what an agent's camera sees.
*   **Gaze Rays:** Dashed lines indicating the exact center of their focus.
*   **Ghost Trails:** Path lines that show where an agent has been, helping users predict movement or understand inspection patterns.

---

## 4. Interaction & Controls

*   **Orbit:** Left Click + Drag
*   **Pan:** Right Click + Drag (or Shift + Left Click)
*   **Zoom:** Scroll Wheel
*   **Possess Agent:** Click directly on any agent avatar to instantly jump into their body (POV mode).
*   **Agent Styles:** Toggle between Abstract Boxes (Screens), Capsules, or Robots to test how avatar fidelity impacts spatial awareness.

---

## Tech Stack

*   **React 19**
*   **React Three Fiber (Three.js)**
*   **Zustand** (State Management)
*   **Tailwind CSS**
*   **Lucide React** (Icons)
