# ALMEJA Studio: Technical Architecture

ALMEJA Studio is a professional SaaS platform designed for the fashion industry, specifically focusing on swimwear and activewear. It leverages AI-generative models and 3D visualization to streamline the design-to-catalog process.

## 1. System Architecture

### Frontend (v0.1 Implementation)
- **Framework**: React 19 + Vite 6
- **Styling**: Tailwind CSS (Post-modern, high-luxury aesthetic)
- **State Management**: React Hooks + Local State (can be scaled to Redux/Zustand)
- **Animations**: Framer Motion (for smooth layout transitions and modal interactions)
- **Icons**: Lucide React

### Backend
- **Server**: Node.js + Express
- **API**: RESTful endpoints for design management
- **Database**: SQLite (using `better-sqlite3`) - Handles design metadata, fabric references, and model mappings.
- **Persistence Strategy**: Relational storage for design versioning and asset links.

## 2. Integrated Technologies (Proposed SaaS Pipeline)

### AI Generative Engine
- **Model**: Stable Diffusion XL / Gemini 2.0 (for prompt-to-sketch logic)
- **Workflow**:
  1. User inputs a "Creative Concept" (Natural Language).
  2. System enriches the prompt with category-specific technical constraints.
  3. AI generates initial 2D renders.

### 3. Human Model Consistency
To maintain a high-quality white-label catalog, the system uses "Fixed Neural Models":
- **Base Models**: Custom human avatars (Elena, Sofia) with fixed anatomical measurements.
- **Persistent Persona**: Using ControlNet (Canny/Depth) and IP-Adapter to ensure the garment fits the same human model consistently across iterations.

### 4. 3D & Hybrid Rendering Pipeline
- **3D Core**: Blender/CLO3D (Integrated via microservices).
- **Hybrid Approach**: 
  - 3D technical sketches define the geometry.
  - Generative AI applies the "Photorealistic Layer" based on real fabric textures from the database.

## 5. Folder Structure

```text
/
├── server.ts           # Express Backend & SQLite setup
├── src/
│   ├── App.tsx         # Main UI & Dashboard Logic
│   ├── types.ts        # Global TS Interfaces
│   ├── lib/            # Utilities (cn helper)
│   ├── components/     # UI Sub-components
│   └── index.css       # Tailwind entry point
├── swimtech.db         # Persistent SQLite database
└── ARCHITECTURE.md     # This document
```

## 6. Scalability & Cloud Strategy (Phase 2)
- **Database**: Migrate to PostgreSQL (Supabase/RDS).
- **Storage**: AWS S3 for technical sketches and high-res renders.
- **Compute**: Specialized GPU nodes for Stable Diffusion inference.
- **Auth**: Firebase Auth or Clerk for multi-tenant SaaS management.
