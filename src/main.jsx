import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RotateCcw, Music2, Gauge, CheckCircle2, Hand, Mic } from 'lucide-react';
import './styles.css';

const STRINGS = [
  { number: 1, name: '1弦', open: 64, label: 'E' },
  { number: 2, name: '2弦', open: 59, label: 'B' },
  { number: 3, name: '3弦', open: 55, label: 'G' },
  { number: 4, name: '4弦', open: 50, label: 'D' },
  { number: 5, name: '5弦', open: 45, label: 'A' },
  { number: 6, name: '6弦', open: 40, label: 'E' }
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DISPLAY_NAMES = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
const DIATONIC_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const STAFF_BASE_STEP = 2;
const STAFF_BOTTOM_LINE_Y = 150;
const MAX_FRET = 12;
const FFT_SIZE = 16384;
const MIN_DETECT_MIDI = 40;
const MAX_DETECT_MIDI = 76;
const MIN_SPECTRUM_MIDI = 40;
const MAX_SPECTRUM_MIDI = 76;
const DEFAULT_SIGNAL_THRESHOLD = 42;
const DEFAULT_VOLUME_GATE = 0.018;
const DEFAULT_SENSITIVITY = 55;
const STABLE_NOTE_DURATION_MS = 50;
const DEFAULT_REFERENCE_PITCH = 442.0;
const HPS_HARMONICS = 5;
const PHRASE_LENGTH = 8;
const CHROMATIC_ACCENT_RATE = 0.42;

const SCALE_PATTERNS = {
  major: {
    intervals: [0, 2, 4, 5, 7, 9, 11],
    stableIntervals: [0, 4, 7]
  },
  minor: {
    intervals: [0, 2, 3, 5, 7, 8, 10],
    stableIntervals: [0, 3, 7]
  }
};

const KEY_PRESETS = {
  cMajor: { label: 'C major', root: 0, pattern: 'major' },
  gMajor: { label: 'G major', root: 7, pattern: 'major' },
  dMajor: { label: 'D major', root: 2, pattern: 'major' },
  aMajor: { label: 'A major', root: 9, pattern: 'major' },
  eMajor: { label: 'E major', root: 4, pattern: 'major' },
  aMinor: { label: 'A minor', root: 9, pattern: 'minor' },
  eMinor: { label: 'E minor', root: 4, pattern: 'minor' },
  bMinor: { label: 'B minor', root: 11, pattern: 'minor' },
  fsMinor: { label: 'F# minor', root: 6, pattern: 'minor' }
};
const DEFAULT_KEY_PRESET = 'cMajor';

const RANGE_PRESETS = {
  easy: { label: '基礎', soundingMin: 40, soundingMax: 52, maxQuestionFret: 12 },
  normal: { label: '標準', soundingMin: 40, soundingMax: 68, maxQuestionFret: 4 },
  full: { label: '広め', soundingMin: 40, soundingMax: 76, maxQuestionFret: 12 }
};

function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const pitch = NOTE_NAMES[pc];
  return {
    midi,
    pitch,
    name: DISPLAY_NAMES[pc],
    octave,
    label: `${pitch}${octave}`,
    accidental: pitch.includes('#') ? '#' : ''
  };
}

function frequencyToMidi(frequency, referencePitch = DEFAULT_REFERENCE_PITCH) {
  return Math.round(69 + 12 * Math.log2(frequency / referencePitch));
}

function midiToFrequency(midi, referencePitch = DEFAULT_REFERENCE_PITCH) {
  return referencePitch * 2 ** ((midi - 69) / 12);
}

function getDetectionRange(referencePitch = DEFAULT_REFERENCE_PITCH) {
  return {
    minFrequency: midiToFrequency(MIN_DETECT_MIDI, referencePitch),
    maxFrequency: midiToFrequency(MAX_DETECT_MIDI, referencePitch)
  };
}

function getSpectrumPeak(frequencyData, sampleRate, referencePitch = DEFAULT_REFERENCE_PITCH) {
  const nyquist = sampleRate / 2;
  const { minFrequency, maxFrequency } = getDetectionRange(referencePitch);
  const minBin = Math.max(1, Math.floor((minFrequency / nyquist) * frequencyData.length));
  const maxBin = Math.min(frequencyData.length - 1, Math.ceil((maxFrequency / nyquist) * frequencyData.length));
  let peakBin = 0;
  let peakValue = 0;

  for (let bin = minBin; bin <= maxBin; bin += 1) {
    if (frequencyData[bin] > peakValue) {
      peakValue = frequencyData[bin];
      peakBin = bin;
    }
  }

  return {
    frequency: (peakBin * nyquist) / frequencyData.length,
    peakBin,
    peakValue
  };
}

function getInterpolatedSpectrumValue(frequencyData, bin) {
  const lowerBin = Math.max(0, Math.floor(bin));
  const upperBin = Math.min(frequencyData.length - 1, lowerBin + 1);
  const ratio = bin - lowerBin;
  return (frequencyData[lowerBin] ?? 0) * (1 - ratio) + (frequencyData[upperBin] ?? 0) * ratio;
}

function getHpsPitch(frequencyData, sampleRate, referencePitch = DEFAULT_REFERENCE_PITCH) {
  const nyquist = sampleRate / 2;
  let bestMidi = null;
  let bestFrequency = 0;
  let bestScore = -Infinity;

  for (let midi = MIN_DETECT_MIDI; midi <= MAX_DETECT_MIDI; midi += 1) {
    const frequency = midiToFrequency(midi, referencePitch);
    let score = 0;

    for (let harmonic = 1; harmonic <= HPS_HARMONICS; harmonic += 1) {
      const harmonicFrequency = frequency * harmonic;

      if (harmonicFrequency >= nyquist) {
        break;
      }

      const harmonicBin = (harmonicFrequency / nyquist) * frequencyData.length;
      const value = getInterpolatedSpectrumValue(frequencyData, harmonicBin) / 255;
      score += Math.log(0.02 + value) / harmonic;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMidi = midi;
      bestFrequency = frequency;
    }
  }

  if (bestMidi === null) {
    return null;
  }

  return {
    frequency: bestFrequency,
    midi: bestMidi,
    peakBin: Math.round((bestFrequency / nyquist) * frequencyData.length),
    score: bestScore
  };
}

function getPitchDetection(
  frequencyData,
  sampleRate,
  referencePitch = DEFAULT_REFERENCE_PITCH,
  signalThreshold = DEFAULT_SIGNAL_THRESHOLD
) {
  const spectrumPeak = getSpectrumPeak(frequencyData, sampleRate, referencePitch);

  if (spectrumPeak.peakValue < signalThreshold) {
    return null;
  }

  const hpsPitch = getHpsPitch(frequencyData, sampleRate, referencePitch);
  const frequency = hpsPitch?.frequency ?? spectrumPeak.frequency;
  const source = hpsPitch ? 'hps' : 'peak';

  const midi = hpsPitch?.midi ?? frequencyToMidi(frequency, referencePitch);

  if (!Number.isFinite(midi) || midi < MIN_DETECT_MIDI || midi > MAX_DETECT_MIDI) {
    return null;
  }

  const nyquist = sampleRate / 2;
  const peakBin = Math.round((frequency / nyquist) * frequencyData.length);

  return {
    frequency,
    level: spectrumPeak.peakValue,
    peakBin,
    midi,
    note: midiToNote(midi),
    source
  };
}

function getRmsLevel(timeData) {
  const sumSquares = timeData.reduce((sum, value) => {
    const normalized = (value - 128) / 128;
    return sum + normalized * normalized;
  }, 0);

  return Math.sqrt(sumSquares / timeData.length);
}

function getDetectionThresholds(sensitivity) {
  const normalized = sensitivity / 100;

  return {
    signalThreshold: Math.round(95 - normalized * 70),
    volumeGate: 0.045 - normalized * 0.038
  };
}

function getFretPositions(midi, maxFret = MAX_FRET) {
  return STRINGS.flatMap((string) => {
    const fret = midi - string.open;
    return fret >= 0 && fret <= maxFret ? [{ string: string.number, fret }] : [];
  });
}

function buildCandidates(rangeKey) {
  const range = RANGE_PRESETS[rangeKey];
  const candidates = [];

  for (let soundingMidi = range.soundingMin; soundingMidi <= range.soundingMax; soundingMidi += 1) {
    const positions = getFretPositions(soundingMidi, range.maxQuestionFret);
    if (positions.length > 0) {
      const writtenMidi = soundingMidi + 12;
      const soundingNote = midiToNote(soundingMidi);
      candidates.push({
        ...midiToNote(writtenMidi),
        writtenMidi,
        soundingMidi,
        soundingLabel: soundingNote.label,
        soundingName: soundingNote.name,
        positions
      });
    }
  }

  return candidates;
}

function createQuestion(candidate) {
  return {
    ...candidate,
    id: crypto.randomUUID()
  };
}

function getPitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

function getScalePitchClasses(keyPreset) {
  const pattern = SCALE_PATTERNS[keyPreset.pattern];
  return pattern.intervals.map((interval) => getPitchClass(keyPreset.root + interval));
}

function getStablePitchClasses(keyPreset) {
  const pattern = SCALE_PATTERNS[keyPreset.pattern];
  return pattern.stableIntervals.map((interval) => getPitchClass(keyPreset.root + interval));
}

function getChromaticApproachPitchClasses(scalePitchClasses) {
  return scalePitchClasses
    .map((pitchClass) => getPitchClass(pitchClass - 1))
    .filter((pitchClass) => !scalePitchClasses.includes(pitchClass));
}

function weightedRandom(candidates, getWeight) {
  const weighted = candidates.map((candidate) => ({
    candidate,
    weight: Math.max(0, getWeight(candidate))
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);

  if (total <= 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let target = Math.random() * total;

  for (const item of weighted) {
    target -= item.weight;

    if (target <= 0) {
      return item.candidate;
    }
  }

  return weighted[weighted.length - 1].candidate;
}

function selectCandidate(candidates, avoidSoundingMidi = null, getWeight = () => 1) {
  const available = candidates.filter((candidate) => candidate.soundingMidi !== avoidSoundingMidi);
  const pool = available.length > 0 ? available : candidates;

  if (pool.length === 0) {
    return null;
  }

  return weightedRandom(pool, getWeight);
}

function getCandidateBySoundingMidi(candidates, soundingMidi, avoidSoundingMidi = null) {
  if (soundingMidi === null || soundingMidi === avoidSoundingMidi) {
    return null;
  }

  return candidates.find((candidate) => candidate.soundingMidi === soundingMidi) ?? null;
}

function getDiatonicWeight(candidate, phrasePosition, stablePitchClasses) {
  const pitchClass = getPitchClass(candidate.soundingMidi);
  const isStable = stablePitchClasses.includes(pitchClass);

  if (phrasePosition === 0 || phrasePosition === 4) {
    return isStable ? 5 : 1.4;
  }

  if (phrasePosition === PHRASE_LENGTH - 1) {
    return isStable ? 7 : 1;
  }

  return isStable ? 2 : 1;
}

function drawQuestion(rangeKey, keyPresetKey, generator, avoidSoundingMidi = null) {
  const candidates = buildCandidates(rangeKey);
  const keyPreset = KEY_PRESETS[keyPresetKey] ?? KEY_PRESETS[DEFAULT_KEY_PRESET];
  const scalePitchClasses = getScalePitchClasses(keyPreset);
  const stablePitchClasses = getStablePitchClasses(keyPreset);
  const chromaticApproachPitchClasses = getChromaticApproachPitchClasses(scalePitchClasses);
  const phrasePosition = generator.phraseIndex % PHRASE_LENGTH;
  const diatonicCandidates = candidates.filter((candidate) => scalePitchClasses.includes(getPitchClass(candidate.soundingMidi)));
  const chromaticCandidates = candidates.filter((candidate) => chromaticApproachPitchClasses.includes(getPitchClass(candidate.soundingMidi)));
  const pendingResolution = getCandidateBySoundingMidi(candidates, generator.pendingResolutionMidi, avoidSoundingMidi);
  let candidate = phrasePosition === PHRASE_LENGTH - 1 ? pendingResolution : null;
  let pendingResolutionMidi = phrasePosition === PHRASE_LENGTH - 1 ? null : generator.pendingResolutionMidi;

  if (!candidate && phrasePosition === PHRASE_LENGTH - 2 && Math.random() < CHROMATIC_ACCENT_RATE) {
    const resolvingChromaticCandidates = chromaticCandidates.filter((chromaticCandidate) => {
      const resolutionMidi = chromaticCandidate.soundingMidi + 1;
      return getCandidateBySoundingMidi(candidates, resolutionMidi) && scalePitchClasses.includes(getPitchClass(resolutionMidi));
    });

    candidate = selectCandidate(
      resolvingChromaticCandidates,
      avoidSoundingMidi,
      (chromaticCandidate) => (stablePitchClasses.includes(getPitchClass(chromaticCandidate.soundingMidi + 1)) ? 3 : 1.6)
    );
    pendingResolutionMidi = candidate ? candidate.soundingMidi + 1 : null;
  }

  if (!candidate) {
    candidate = selectCandidate(
      diatonicCandidates,
      avoidSoundingMidi,
      (diatonicCandidate) => getDiatonicWeight(diatonicCandidate, phrasePosition, stablePitchClasses)
    );
    pendingResolutionMidi = phrasePosition === PHRASE_LENGTH - 1 ? null : pendingResolutionMidi;
  }

  if (!candidate) {
    candidate = selectCandidate(candidates, avoidSoundingMidi);
    pendingResolutionMidi = null;
  }

  return {
    question: createQuestion(candidate),
    generator: {
      phraseIndex: generator.phraseIndex + 1,
      pendingResolutionMidi
    }
  };
}

function drawQuestions(rangeKey, keyPresetKey, generator, count, avoidSoundingMidi = null) {
  const questions = [];
  let currentGenerator = generator;
  let previousSoundingMidi = avoidSoundingMidi;

  for (let i = 0; i < count; i += 1) {
    const draw = drawQuestion(rangeKey, keyPresetKey, currentGenerator, previousSoundingMidi);
    questions.push(draw.question);
    currentGenerator = draw.generator;
    previousSoundingMidi = draw.question.soundingMidi;
  }

  return {
    questions,
    generator: currentGenerator
  };
}

function createPracticeState(rangeKey, keyPresetKey = DEFAULT_KEY_PRESET) {
  const initialDraw = drawQuestions(rangeKey, keyPresetKey, { phraseIndex: 0, pendingResolutionMidi: null }, 4);
  const [question, ...previewNotes] = initialDraw.questions;

  return {
    question,
    previewNotes,
    generator: initialDraw.generator
  };
}

function advancePracticeState(current, rangeKey, keyPresetKey = DEFAULT_KEY_PRESET) {
  const nextDraw = drawQuestion(
    rangeKey,
    keyPresetKey,
    current.generator,
    current.previewNotes[current.previewNotes.length - 1].soundingMidi
  );

  return {
    question: current.previewNotes[0],
    previewNotes: [...current.previewNotes.slice(1), nextDraw.question],
    generator: nextDraw.generator
  };
}

function getStaffStep(note) {
  const letter = note.pitch[0];
  return (note.octave - 4) * 7 + DIATONIC_INDEX[letter];
}

function getNoteLayout(note, x) {
  const step = getStaffStep(note);
  const distance = step - STAFF_BASE_STEP;
  const y = STAFF_BOTTOM_LINE_Y - distance * 9;
  const lowLedgerLines = [0, 1, 2, 3].filter((i) => y >= 168 + i * 18);
  const highLedgerLines = [0, 1, 2].filter((i) => y <= 60 - i * 18);

  return { x, y, lowLedgerLines, highLedgerLines };
}

function StaffNote({ note, x, active = false, preview = false, previewIndex = 0 }) {
  const layout = getNoteLayout(note, x);
  const groupClass = active ? 'activeNote' : preview ? `previewNote previewNote${previewIndex + 1}` : '';

  return (
    <g className={groupClass}>
      {layout.lowLedgerLines.map((_, i) => (
        <line key={`low-${i}`} x1={layout.x - 22} x2={layout.x + 22} y1={168 + i * 18} y2={168 + i * 18} className="ledger" />
      ))}
      {layout.highLedgerLines.map((_, i) => (
        <line key={`high-${i}`} x1={layout.x - 22} x2={layout.x + 22} y1={60 - i * 18} y2={60 - i * 18} className="ledger" />
      ))}
      {note.accidental && (
        <text x={layout.x - 46} y={layout.y + 7} className="accidental">
          #
        </text>
      )}
      <ellipse cx={layout.x} cy={layout.y} rx="15" ry="10.5" transform={`rotate(-18 ${layout.x} ${layout.y})`} className="noteHead" />
      <line x1={layout.x + 14} y1={layout.y - 6} x2={layout.x + 14} y2={layout.y - 62} className="stem" />
      <path
        d={`M${layout.x + 14} ${layout.y - 62} C ${layout.x + 43} ${layout.y - 58}, ${layout.x + 48} ${layout.y - 40}, ${layout.x + 24} ${layout.y - 27} C ${layout.x + 48} ${layout.y - 51}, ${layout.x + 39} ${layout.y - 62}, ${layout.x + 14} ${layout.y - 69} Z`}
        className="eighthFlag"
      />
    </g>
  );
}

function Staff({ note, previewNotes, streak }) {
  const staffLines = [0, 1, 2, 3, 4];
  const previewPositions = [455, 550, 645];

  return (
    <section className="staffPanel" aria-label="出題されている五線譜">
      <div className="staffHeader">
        <div>
          <h1>Guitar staff trainer</h1>
        </div>
        <div className="streak" aria-label={`連続正解 ${streak}`}>
          <CheckCircle2 size={18} />
          {streak}
        </div>
      </div>

      <div className="scoreRail" aria-hidden="true">
        <svg viewBox="0 0 760 260" role="img">
          {staffLines.map((line) => (
            <line
              key={line}
              x1="78"
              x2="702"
              y1={78 + line * 18}
              y2={78 + line * 18}
              className="staffLine"
            />
          ))}
          <text x="86" y="164" className="clef">
            𝄞
          </text>
          <line x1="198" x2="198" y1="78" y2="150" className="barLine" />
          <line x1="706" x2="706" y1="78" y2="150" className="barLine" />
          {previewNotes.map((previewNote, index) => (
            <StaffNote
              key={previewNote.id}
              note={previewNote}
              x={previewPositions[index]}
              preview
              previewIndex={index}
            />
          ))}
          <StaffNote key={note.id} note={note} x={315} active />
        </svg>
      </div>
    </section>
  );
}

function Fretboard({ question, selected, onPick }) {
  const validKeys = new Set(question.positions.map((position) => `${position.string}-${position.fret}`));
  const frets = Array.from({ length: MAX_FRET }, (_, index) => index + 1);

  return (
    <section className="fretboardPanel" aria-label="ギターのフレットボード">
      <div className="nut" aria-hidden="true" />
      <div className="fretNumbers" aria-hidden="true">
        <span />
        {frets.map((fret) => (
          <span key={fret}>{fret}</span>
        ))}
      </div>
      <div className="fretboard">
        {STRINGS.map((string) => (
          <React.Fragment key={string.number}>
            <button
              className={`stringLabel ${selected?.key === `${string.number}-0` ? (validKeys.has(`${string.number}-0`) ? 'correct' : 'wrong') : ''}`}
              type="button"
              onClick={() => onPick({ string: string.number, fret: 0, key: `${string.number}-0` })}
              aria-label={`${string.name} 開放弦`}
            >
              <span className="stringWire labelWire" aria-hidden="true" />
              <strong>{string.name}</strong>
              <span>{string.label}</span>
              <span className="openHit" aria-hidden="true" />
            </button>
            {frets.map((fret) => {
              const key = `${string.number}-${fret}`;
              const state = selected?.key === key ? (validKeys.has(key) ? 'correct' : 'wrong') : '';

              return (
                <button
                  key={key}
                  className={`fretButton ${state}`}
                  type="button"
                  onClick={() => onPick({ string: string.number, fret, key })}
                  aria-label={`${string.name} ${fret}フレット`}
                >
                  <span className="stringWire" aria-hidden="true" />
                  <span className="fretDot">{fret === 0 ? '0' : ''}</span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function PracticeControls({
  question,
  score,
  rangeKey,
  keyPresetKey,
  onRangeChange,
  onKeyPresetChange,
  onNext,
  noteValue = question.label
}) {
  return (
    <section className="controlBand" aria-label="練習設定と状態">
      <div className="metric">
        <Music2 size={18} />
        <span>{question.name}</span>
        <strong>{noteValue}</strong>
      </div>
      <div className="metric">
        <Gauge size={18} />
        <span>正答率</span>
        <strong>{score.attempts === 0 ? '--' : `${Math.round((score.correct / score.attempts) * 100)}%`}</strong>
      </div>
      <div className="segmented" role="group" aria-label="出題範囲">
        {Object.entries(RANGE_PRESETS).map(([key, range]) => (
          <button key={key} className={rangeKey === key ? 'active' : ''} type="button" onClick={() => onRangeChange(key)}>
            {range.label}
          </button>
        ))}
      </div>
      <label className="keySelect">
        <span>調性</span>
        <select value={keyPresetKey} onChange={(event) => onKeyPresetChange(event.target.value)}>
          {Object.entries(KEY_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <button className="iconButton" type="button" onClick={onNext} aria-label="次の音符">
        <RotateCcw size={20} />
      </button>
    </section>
  );
}

const TABS = [
  { key: 'fretboard', label: '指板', icon: Hand },
  { key: 'audio', label: '実音', icon: Mic }
];

function FretboardPractice() {
  const [rangeKey, setRangeKey] = useState('easy');
  const [keyPresetKey, setKeyPresetKey] = useState(DEFAULT_KEY_PRESET);
  const [practice, setPractice] = useState(() => createPracticeState('easy', DEFAULT_KEY_PRESET));
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('音符に対応する弦とフレットをタップ');
  const [score, setScore] = useState({ correct: 0, attempts: 0, streak: 0 });
  const { question, previewNotes } = practice;

  const answerText = useMemo(
    () => question.positions.map((position) => `${position.string}弦 ${position.fret}F`).join(' / '),
    [question]
  );

  function nextQuestion(nextRangeKey = rangeKey, nextKeyPresetKey = keyPresetKey) {
    setPractice((current) => advancePracticeState(current, nextRangeKey, nextKeyPresetKey));
    setSelected(null);
    setStatus('音符に対応する弦とフレットをタップ');
  }

  function handlePick(position) {
    const isCorrect = question.positions.some((answer) => answer.string === position.string && answer.fret === position.fret);
    setSelected(position);
    setScore((current) => ({
      correct: current.correct + (isCorrect ? 1 : 0),
      attempts: current.attempts + 1,
      streak: isCorrect ? current.streak + 1 : 0
    }));

    if (isCorrect) {
      setStatus(`${question.label} 正解`);
      window.setTimeout(() => nextQuestion(), 520);
      return;
    }

    setStatus(`もう一度。正解例: ${answerText}`);
  }

  function handleRangeChange(nextRangeKey) {
    setRangeKey(nextRangeKey);
    setPractice(createPracticeState(nextRangeKey, keyPresetKey));
    setSelected(null);
    setStatus('音符に対応する弦とフレットをタップ');
  }

  function handleKeyPresetChange(nextKeyPresetKey) {
    setKeyPresetKey(nextKeyPresetKey);
    setPractice(createPracticeState(rangeKey, nextKeyPresetKey));
    setSelected(null);
    setStatus('音符に対応する弦とフレットをタップ');
  }

  return (
    <main className="appShell">
      <Staff note={question} previewNotes={previewNotes} streak={score.streak} />

      <PracticeControls
        question={question}
        score={score}
        rangeKey={rangeKey}
        keyPresetKey={keyPresetKey}
        onRangeChange={handleRangeChange}
        onKeyPresetChange={handleKeyPresetChange}
        onNext={() => nextQuestion()}
      />

      <div className={`statusLine ${selected ? 'visible' : ''}`} aria-live="polite">
        {status}
      </div>

      <Fretboard question={question} selected={selected} onPick={handlePick} />
    </main>
  );
}

function AudioPractice() {
  const [rangeKey, setRangeKey] = useState('easy');
  const [keyPresetKey, setKeyPresetKey] = useState(DEFAULT_KEY_PRESET);
  const [practice, setPractice] = useState(() => createPracticeState('easy', DEFAULT_KEY_PRESET));
  const [status, setStatus] = useState('対応する実音を鳴らす');
  const [score, setScore] = useState({ correct: 0, attempts: 0, streak: 0 });
  const [isListening, setIsListening] = useState(false);
  const [detected, setDetected] = useState(null);
  const [audioError, setAudioError] = useState('');
  const [referencePitch, setReferencePitch] = useState(DEFAULT_REFERENCE_PITCH);
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const detectionThresholds = useMemo(() => getDetectionThresholds(sensitivity), [sensitivity]);
  const { question, previewNotes } = practice;
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(0);
  const stableMidiRef = useRef(null);
  const stableSinceRef = useRef(0);
  const judgingRef = useRef(false);
  const questionRef = useRef(question);
  const rangeKeyRef = useRef(rangeKey);
  const keyPresetKeyRef = useRef(keyPresetKey);
  const referencePitchRef = useRef(referencePitch);
  const detectionThresholdsRef = useRef(detectionThresholds);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);

  useEffect(() => {
    rangeKeyRef.current = rangeKey;
  }, [rangeKey]);

  useEffect(() => {
    keyPresetKeyRef.current = keyPresetKey;
  }, [keyPresetKey]);

  useEffect(() => {
    referencePitchRef.current = referencePitch;
  }, [referencePitch]);

  useEffect(() => {
    detectionThresholdsRef.current = detectionThresholds;
  }, [detectionThresholds]);

  useEffect(() => () => stopListening(), []);

  function nextQuestion(nextRangeKey = rangeKey, nextKeyPresetKey = keyPresetKey) {
    setPractice((current) => advancePracticeState(current, nextRangeKey, nextKeyPresetKey));
    setStatus('対応する実音を鳴らす');
    judgingRef.current = false;
    stableMidiRef.current = null;
    stableSinceRef.current = 0;
  }

  function handleRangeChange(nextRangeKey) {
    setRangeKey(nextRangeKey);
    setPractice(createPracticeState(nextRangeKey, keyPresetKey));
    setStatus('対応する実音を鳴らす');
    judgingRef.current = false;
    stableMidiRef.current = null;
    stableSinceRef.current = 0;
  }

  function handleKeyPresetChange(nextKeyPresetKey) {
    setKeyPresetKey(nextKeyPresetKey);
    setPractice(createPracticeState(rangeKey, nextKeyPresetKey));
    setStatus('対応する実音を鳴らす');
    judgingRef.current = false;
    stableMidiRef.current = null;
    stableSinceRef.current = 0;
  }

  function drawSpectrum(frequencyData, highlightedBin = null) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    const barCount = 72;
    const minFrequency = midiToFrequency(MIN_SPECTRUM_MIDI, referencePitchRef.current);
    const maxFrequency = midiToFrequency(MAX_SPECTRUM_MIDI, referencePitchRef.current);
    const nyquist = (audioContextRef.current?.sampleRate ?? 44100) / 2;
    const minBin = Math.max(1, Math.floor((minFrequency / nyquist) * frequencyData.length));
    const maxBin = Math.min(frequencyData.length - 1, Math.ceil((maxFrequency / nyquist) * frequencyData.length));
    const binSpan = Math.max(1, maxBin - minBin);
    const highlightedBar =
      highlightedBin === null || highlightedBin < minBin || highlightedBin > maxBin
        ? null
        : Math.floor(((highlightedBin - minBin) / binSpan) * barCount);

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#11130f';
    context.fillRect(0, 0, width, height);

    const { signalThreshold } = detectionThresholdsRef.current;
    const thresholdY = height - (signalThreshold / 255) * (height - 10);

    for (let i = 0; i < barCount; i += 1) {
      const startBin = Math.floor(minBin + (i / barCount) * binSpan);
      const endBin = Math.max(startBin + 1, Math.floor(minBin + ((i + 1) / barCount) * binSpan));
      let value = 0;

      for (let bin = startBin; bin <= Math.min(endBin, maxBin); bin += 1) {
        value = Math.max(value, frequencyData[bin] ?? 0);
      }

      const barHeight = Math.max(2, (value / 255) * (height - 10));
      const x = (i / barCount) * width;
      const barWidth = width / barCount - 2;
      context.fillStyle = i === highlightedBar ? '#d3a13b' : value > signalThreshold ? '#2b7a78' : '#667173';
      context.fillRect(x, height - barHeight, barWidth, barHeight);
    }

    context.strokeStyle = '#d8483e';
    context.lineWidth = 2;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(0, thresholdY);
    context.lineTo(width, thresholdY);
    context.stroke();
    context.setLineDash([]);
  }

  function judgeDetectedMidi(detection) {
    if (judgingRef.current) {
      return false;
    }

    const now = performance.now();

    if (stableMidiRef.current === detection.midi) {
      if (now - stableSinceRef.current < STABLE_NOTE_DURATION_MS) {
        return false;
      }
    } else {
      stableMidiRef.current = detection.midi;
      stableSinceRef.current = now;
      setDetected(null);
      return false;
    }

    setDetected(detection);
    judgingRef.current = true;
    const targetMidi = questionRef.current.soundingMidi;
    const isCorrect = detection.midi === targetMidi;

    setScore((current) => ({
      correct: current.correct + (isCorrect ? 1 : 0),
      attempts: current.attempts + 1,
      streak: isCorrect ? current.streak + 1 : 0
    }));
    setStatus(isCorrect ? `${detection.note.label} 正解` : `${detection.note.label} ではありません`);

    window.setTimeout(() => {
      if (isCorrect) {
        nextQuestion(rangeKeyRef.current, keyPresetKeyRef.current);
      } else {
        judgingRef.current = false;
        stableMidiRef.current = null;
        stableSinceRef.current = 0;
      }
    }, isCorrect ? 520 : 700);

    return true;
  }

  function analyseFrame() {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;

    if (!analyser || !audioContext) {
      return;
    }

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(frequencyData);

    const rmsLevel = getRmsLevel(timeData);

    const { signalThreshold, volumeGate } = detectionThresholdsRef.current;

    const detection = getPitchDetection(
      frequencyData,
      audioContext.sampleRate,
      referencePitchRef.current,
      signalThreshold
    );

    if (rmsLevel < volumeGate) {
      drawSpectrum(frequencyData);
      setDetected(null);
      stableMidiRef.current = null;
      stableSinceRef.current = 0;
      animationRef.current = window.requestAnimationFrame(analyseFrame);
      return;
    }

    drawSpectrum(frequencyData, detection?.peakBin ?? null);

    if (detection) {
      judgeDetectedMidi(detection);
    } else {
      setDetected(null);
      stableMidiRef.current = null;
      stableSinceRef.current = 0;
    }

    animationRef.current = window.requestAnimationFrame(analyseFrame);
  }

  async function startListening() {
    setAudioError('');

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;

      if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
        throw new Error('Audio input is not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false
        }
      });
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      streamRef.current = stream;
      setIsListening(true);
      setStatus('マイク入力を解析中');
      animationRef.current = window.requestAnimationFrame(analyseFrame);
    } catch (error) {
      setAudioError('マイクを開始できませんでした');
      setStatus('マイク権限を確認してください');
    }
  }

  function stopListening() {
    window.cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    sourceRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    stableMidiRef.current = null;
    stableSinceRef.current = 0;
    judgingRef.current = false;
    setIsListening(false);
    setDetected(null);
  }

  return (
    <main className="appShell">
      <Staff note={question} previewNotes={previewNotes} streak={score.streak} />

      <PracticeControls
        question={question}
        score={score}
        rangeKey={rangeKey}
        keyPresetKey={keyPresetKey}
        onRangeChange={handleRangeChange}
        onKeyPresetChange={handleKeyPresetChange}
        onNext={() => nextQuestion()}
        noteValue={question.soundingLabel}
      />

      <div className="statusLine visible" aria-live="polite">
        {status}
      </div>

      <section className="fftPanel" aria-label="FFT解析">
        <div className="fftHeader">
          <div className="detectedNote">
            <span>検出音</span>
            <strong>{detected ? detected.note.label : '--'}</strong>
            <small>{detected ? `${Math.round(detected.frequency)}Hz` : audioError || '入力待ち'}</small>
          </div>
          <button className={`micButton ${isListening ? 'active' : ''}`} type="button" onClick={isListening ? stopListening : startListening}>
            <Mic size={18} />
            {isListening ? '停止' : 'マイク開始'}
          </button>
        </div>
        <label className="pitchControl">
          <span>A</span>
          <input
            type="number"
            min="430"
            max="450"
            step="0.1"
            value={referencePitch}
            onChange={(event) => setReferencePitch(Number(event.target.value) || DEFAULT_REFERENCE_PITCH)}
          />
          <span>Hz</span>
        </label>
        <label className="sensitivityControl">
          <span>感度</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sensitivity}
            onChange={(event) => setSensitivity(Number(event.target.value))}
          />
          <strong>{sensitivity}</strong>
        </label>
        <canvas ref={canvasRef} className="fftCanvas" width="720" height="190" />
      </section>
    </main>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('fretboard');

  return (
    <>
      {activeTab === 'fretboard' ? <FretboardPractice /> : <AudioPractice />}

      <nav className="bottomTabs" aria-label="練習モード">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              className={isActive ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
