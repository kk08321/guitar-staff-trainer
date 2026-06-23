import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RotateCcw, Music2, Gauge, CheckCircle2 } from 'lucide-react';
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

const RANGE_PRESETS = {
  easy: { label: '基礎', soundingMin: 40, soundingMax: 52, maxQuestionFret: 12 },
  normal: { label: '標準', soundingMin: 40, soundingMax: 68, maxQuestionFret: 4 },
  full: { label: '広め', soundingMin: 40, soundingMax: 76, maxQuestionFret: 12 }
};

function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  return {
    midi,
    pitch: NOTE_NAMES[pc],
    name: DISPLAY_NAMES[pc],
    octave,
    label: `${NOTE_NAMES[pc]}${octave}`,
    accidental: NOTE_NAMES[pc].includes('#') ? '#' : ''
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
      candidates.push({
        ...midiToNote(writtenMidi),
        writtenMidi,
        soundingMidi,
        soundingLabel: midiToNote(soundingMidi).label,
        positions
      });
    }
  }

  return candidates;
}

function shuffleCandidates(candidates) {
  const shuffled = [...candidates];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function createQuestion(candidate) {
  return {
    ...candidate,
    id: crypto.randomUUID()
  };
}

function createDeck(rangeKey, avoidSoundingMidi = null) {
  const deck = shuffleCandidates(buildCandidates(rangeKey));

  if (avoidSoundingMidi !== null && deck.length > 1 && deck[0].soundingMidi === avoidSoundingMidi) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }

  return deck;
}

function drawQuestion(rangeKey, deck, avoidSoundingMidi = null) {
  let available = deck.length > 0 ? [...deck] : createDeck(rangeKey, avoidSoundingMidi);

  if (available.length > 1 && available[0].soundingMidi === avoidSoundingMidi) {
    const replacementIndex = available.findIndex((candidate) => candidate.soundingMidi !== avoidSoundingMidi);
    [available[0], available[replacementIndex]] = [available[replacementIndex], available[0]];
  }

  const [candidate, ...remainingDeck] = available;

  return {
    question: createQuestion(candidate),
    deck: remainingDeck
  };
}

function createPracticeState(rangeKey) {
  const firstDraw = drawQuestion(rangeKey, createDeck(rangeKey));
  const secondDraw = drawQuestion(rangeKey, firstDraw.deck, firstDraw.question.soundingMidi);

  return {
    question: firstDraw.question,
    nextPreview: secondDraw.question,
    deck: secondDraw.deck
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

function StaffNote({ note, x, active = false, preview = false }) {
  const layout = getNoteLayout(note, x);
  const groupClass = active ? 'activeNote' : preview ? 'previewNote' : '';

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

function Staff({ note, nextNote, streak }) {
  const staffLines = [0, 1, 2, 3, 4];

  return (
    <section className="staffPanel" aria-label="出題されている五線譜">
      <div className="staffHeader">
        <div>
          <span className="eyebrow">Now reading</span>
          <h1>Guitar Solfeggio</h1>
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
          <line x1="624" x2="624" y1="78" y2="150" className="barLine" />
          <StaffNote key={nextNote.id} note={nextNote} x={560} preview />
          <StaffNote key={note.id} note={note} x={365} active />
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

function App() {
  const [rangeKey, setRangeKey] = useState('easy');
  const [practice, setPractice] = useState(() => createPracticeState('easy'));
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('音符に対応する弦とフレットをタップ');
  const [score, setScore] = useState({ correct: 0, attempts: 0, streak: 0 });
  const { question, nextPreview } = practice;

  const answerText = useMemo(
    () => question.positions.map((position) => `${position.string}弦 ${position.fret}F`).join(' / '),
    [question]
  );

  function nextQuestion(nextRangeKey = rangeKey) {
    setPractice((current) => {
      const nextDraw = drawQuestion(nextRangeKey, current.deck, current.nextPreview.soundingMidi);

      return {
        question: current.nextPreview,
        nextPreview: nextDraw.question,
        deck: nextDraw.deck
      };
    });
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
    setPractice(createPracticeState(nextRangeKey));
    setSelected(null);
    setStatus('音符に対応する弦とフレットをタップ');
  }

  return (
    <main className="appShell">
      <Staff note={question} nextNote={nextPreview} streak={score.streak} />

      <section className="controlBand" aria-label="練習設定と状態">
        <div className="metric">
          <Music2 size={18} />
          <span>{question.name}</span>
          <strong>{question.label}</strong>
        </div>
        <div className="metric">
          <Gauge size={18} />
          <span>正答率</span>
          <strong>{score.attempts === 0 ? '--' : `${Math.round((score.correct / score.attempts) * 100)}%`}</strong>
        </div>
        <div className="segmented" role="group" aria-label="出題範囲">
          {Object.entries(RANGE_PRESETS).map(([key, range]) => (
            <button key={key} className={rangeKey === key ? 'active' : ''} type="button" onClick={() => handleRangeChange(key)}>
              {range.label}
            </button>
          ))}
        </div>
        <button className="iconButton" type="button" onClick={() => nextQuestion()} aria-label="次の音符">
          <RotateCcw size={20} />
        </button>
      </section>

      <div className={`statusLine ${selected ? 'visible' : ''}`} aria-live="polite">
        {status}
      </div>

      <Fretboard question={question} selected={selected} onPick={handlePick} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
