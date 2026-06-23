# Guitar Staff Trainer

A browser-based trainer for mapping staff notation to classical guitar fretboard positions.

## Overview

Guitar Staff Trainer helps classical guitar beginners practice reading standard staff notation and locating the corresponding string and fret on the guitar fretboard.

The app shows a random note on the staff. Tap the matching string and fret position on the fretboard to answer. When the answer is correct, the next note moves in and the exercise continues.

## Features

- Staff notation quiz for classical guitar
- Fretboard UI with open strings and frets 1-12
- Treble staff display with guitar transposition handling
- Multiple practice ranges:
  - Basic: lower beginner range
  - Standard: low-position notes from 6th string open to 1st string 4th fret
  - Wide: broader range up to the 12th fret
- Shuffled question deck to reduce short-term repetition
- Accuracy and streak tracking
- Responsive browser UI

## Tech Stack

- React
- Vite
- lucide-react

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Azure Static Web Apps

This project is ready to deploy as a static Vite app.

Recommended build settings:

```text
App location: /
Output location: dist
Build command: npm run build
```

`staticwebapp.config.json` includes a navigation fallback so the app can be served as a single-page application.

## Notes

Classical guitar sounds one octave lower than written. The app accounts for this by displaying the written staff note while checking answers against the corresponding sounding pitch on the fretboard.
