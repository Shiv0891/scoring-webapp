// Unit tests for ScoringEngine — uses Node built-in test runner (node --test)
// We extract the ScoringEngine class from app.js by evaluating it in isolation.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ── Bootstrap: load ScoringEngine without a DOM ──────────────────────
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
// Extract only the ScoringEngine class (ends at the closing brace after _checkForWinner)
const classEnd = src.indexOf('\n// ==================== PERSISTENCE');
const classSource = src.slice(0, classEnd);
const factory = new Function(classSource + '\nreturn ScoringEngine;');
const ScoringEngine = factory();

// Helper: create a ready-to-score engine
function freshEngine(overs = 20) {
  const e = new ScoringEngine();
  e.startMatch('India', 'Australia', 'Rohit', 'Virat', 'Starc', overs);
  return e;
}

// ═══════════════════════════════════════════════════════════════════════
//  1. Match Initialization
// ═══════════════════════════════════════════════════════════════════════
test('startMatch initialises state correctly', () => {
  const e = freshEngine(20);
  const s = e.state;
  assert.equal(s.matchStarted, true);
  assert.equal(s.team1Name, 'India');
  assert.equal(s.team2Name, 'Australia');
  assert.equal(s.maxOvers, 20);
  assert.equal(s.runs, 0);
  assert.equal(s.wickets, 0);
  assert.equal(s.balls, 0);
  assert.equal(s.currentInning, 1);
  assert.equal(s.striker.name, 'Rohit');
  assert.equal(s.nonStriker.name, 'Virat');
  assert.equal(s.currentBowler.name, 'Starc');
  assert.equal(s.batsmenList.length, 2);
  assert.equal(s.bowlersList.length, 1);
});

test('startMatch with no overs sets maxOvers to null', () => {
  const e = new ScoringEngine();
  e.startMatch('A', 'B', 'P1', 'P2', 'B1', null);
  assert.equal(e.state.maxOvers, null);
});

// ═══════════════════════════════════════════════════════════════════════
//  2. Run Scoring
// ═══════════════════════════════════════════════════════════════════════
test('addRuns increments score, balls, and batsman stats', () => {
  const e = freshEngine();
  e.addRuns(4);
  assert.equal(e.state.runs, 4);
  assert.equal(e.state.balls, 1);
  assert.equal(e.state.striker.runs, 4);
  assert.equal(e.state.striker.fours, 1);
  assert.equal(e.state.striker.ballsFaced, 1);
});

test('addRuns(6) records a six', () => {
  const e = freshEngine();
  e.addRuns(6);
  assert.equal(e.state.runs, 6);
  assert.equal(e.state.striker.sixes, 1);
});

test('odd runs swap strike', () => {
  const e = freshEngine();
  const originalStriker = e.state.striker.name;
  e.addRuns(1);
  assert.notEqual(e.state.striker.name, originalStriker);
});

test('even runs keep strike', () => {
  const e = freshEngine();
  const originalStriker = e.state.striker.name;
  e.addRuns(2);
  assert.equal(e.state.striker.name, originalStriker);
});

// ═══════════════════════════════════════════════════════════════════════
//  3. Dot Ball
// ═══════════════════════════════════════════════════════════════════════
test('dotBall increments balls but not runs', () => {
  const e = freshEngine();
  e.dotBall();
  assert.equal(e.state.runs, 0);
  assert.equal(e.state.balls, 1);
  assert.equal(e.state.striker.ballsFaced, 1);
  assert.equal(e.state.striker.runs, 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  4. Over Completion & Strike Rotation
// ═══════════════════════════════════════════════════════════════════════
test('after 6 dot balls, over ends: strike swaps and bowler is null', () => {
  const e = freshEngine();
  const strikerBefore = e.state.striker.name;
  for (let i = 0; i < 6; i++) e.dotBall();
  assert.equal(e.state.balls, 6);
  assert.notEqual(e.state.striker.name, strikerBefore);
  assert.equal(e.state.currentBowler, null);
});

test('oversDisplay shows correct format', () => {
  const e = freshEngine();
  assert.equal(e.oversDisplay, '0.0');
  e.dotBall();
  assert.equal(e.oversDisplay, '0.1');
  for (let i = 0; i < 5; i++) e.dotBall();
  assert.equal(e.oversDisplay, '1.0');
});

// ═══════════════════════════════════════════════════════════════════════
//  5. Bowler Management
// ═══════════════════════════════════════════════════════════════════════
test('setNewBowler creates new bowler if not existing', () => {
  const e = freshEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Cummins');
  assert.equal(e.state.currentBowler.name, 'Cummins');
  assert.equal(e.state.bowlersList.length, 2);
});

test('setNewBowler re-uses existing bowler', () => {
  const e = freshEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Cummins');
  // Bowl another over
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Starc');
  assert.equal(e.state.currentBowler.name, 'Starc');
  assert.equal(e.state.bowlersList.length, 2); // still 2
});

// ═══════════════════════════════════════════════════════════════════════
//  6. Wickets
// ═══════════════════════════════════════════════════════════════════════
test('bowled wicket increments wickets and marks batsman out', () => {
  const e = freshEngine();
  const outName = e.state.striker.name;
  e.wicket('bowled', 'striker');
  assert.equal(e.state.wickets, 1);
  assert.equal(e.state.balls, 1);
  const outBat = e.state.batsmenList.find(b => b.name === outName);
  assert.equal(outBat.isOut, true);
  assert.equal(e.state.striker, null); // needs new batsman
});

test('caught wicket credits bowler', () => {
  const e = freshEngine();
  e.wicket('caught', 'striker');
  const bw = e.state.bowlersList[0];
  assert.equal(bw.wicketsTaken, 1);
});

test('run out does not credit bowler with wicket', () => {
  const e = freshEngine();
  e.wicket('runout', 'striker', 0);
  const bw = e.state.bowlersList[0];
  assert.equal(bw.wicketsTaken, 0);
  assert.equal(e.state.wickets, 1);
});

test('run out with runs scored adds runs', () => {
  const e = freshEngine();
  e.wicket('runout', 'striker', 2);
  assert.equal(e.state.runs, 2);
  assert.equal(e.state.wickets, 1);
});

test('run out non-striker keeps striker at crease', () => {
  const e = freshEngine();
  const strikerName = e.state.striker.name;
  e.wicket('runout', 'nonStriker', 0);
  assert.equal(e.state.striker.name, strikerName);
  assert.equal(e.state.nonStriker, null);
});

// ═══════════════════════════════════════════════════════════════════════
//  7. New Batsman
// ═══════════════════════════════════════════════════════════════════════
test('setNewBatsman fills empty striker slot', () => {
  const e = freshEngine();
  e.wicket('bowled', 'striker');
  assert.equal(e.state.striker, null);
  e.setNewBatsman('Pant');
  assert.equal(e.state.striker.name, 'Pant');
  assert.equal(e.state.batsmenList.length, 3);
});

// ═══════════════════════════════════════════════════════════════════════
//  8. Extras — Wides
// ═══════════════════════════════════════════════════════════════════════
test('wide adds runs but no legal ball', () => {
  const e = freshEngine();
  e.wideRuns(1); // wide + 0 extra
  assert.equal(e.state.runs, 1);
  assert.equal(e.state.balls, 0); // not a legal ball
  assert.equal(e.state.totalWides, 1);
  const bw = e.state.bowlersList[0];
  assert.equal(bw.wides, 1);
  assert.equal(bw.runsConceded, 1);
});

test('wide with extra runs (e.g. wide+4)', () => {
  const e = freshEngine();
  e.wideRuns(5); // 1 wide + 4
  assert.equal(e.state.runs, 5);
  assert.equal(e.state.totalWides, 5);
});

// ═══════════════════════════════════════════════════════════════════════
//  9. Extras — No Balls
// ═══════════════════════════════════════════════════════════════════════
test('no ball (not hit) adds runs, no legal ball', () => {
  const e = freshEngine();
  e.noBallRuns(1, false); // 1 NB + 0 extra
  assert.equal(e.state.runs, 1);
  assert.equal(e.state.balls, 0);
  assert.equal(e.state.totalNoBalls, 1);
});

test('no ball hit by bat credits batsman runs', () => {
  const e = freshEngine();
  const strikerBefore = e.state.striker.name;
  e.noBallRuns(5, true); // 1 NB + 4 off bat
  assert.equal(e.state.runs, 5);
  const bat = e.state.batsmenList.find(b => b.name === strikerBefore);
  assert.equal(bat.runs, 4); // 4 off the bat
  assert.equal(bat.fours, 1);
});

// ═══════════════════════════════════════════════════════════════════════
//  10. Extras — Byes & Leg Byes
// ═══════════════════════════════════════════════════════════════════════
test('bye adds runs to team but not batsman', () => {
  const e = freshEngine();
  const strikerBefore = e.state.striker.name;
  e.bye(2);
  assert.equal(e.state.runs, 2);
  assert.equal(e.state.byes, 2);
  assert.equal(e.state.balls, 1);
  const bat = e.state.batsmenList.find(b => b.name === strikerBefore);
  assert.equal(bat.runs, 0);
});

test('leg bye adds runs to team but not batsman', () => {
  const e = freshEngine();
  e.legBye(3);
  assert.equal(e.state.runs, 3);
  assert.equal(e.state.legByes, 3);
  assert.equal(e.state.balls, 1);
});

// ═══════════════════════════════════════════════════════════════════════
//  11. Extras Getters
// ═══════════════════════════════════════════════════════════════════════
test('totalExtras computed correctly', () => {
  const e = freshEngine();
  e.bye(2);
  e.legBye(1);
  e.wideRuns(1);
  e.noBallRuns(1, false);
  assert.equal(e.fieldingExtras, 3);   // 2 byes + 1 lb
  assert.equal(e.bowlingExtras, 2);    // 1 wide + 1 nb
  assert.equal(e.totalExtras, 5);
});

// ═══════════════════════════════════════════════════════════════════════
//  12. Swap Strike
// ═══════════════════════════════════════════════════════════════════════
test('swapStrike swaps striker and non-striker', () => {
  const e = freshEngine();
  const s1 = e.state.striker.name;
  const s2 = e.state.nonStriker.name;
  e.swapStrike();
  assert.equal(e.state.striker.name, s2);
  assert.equal(e.state.nonStriker.name, s1);
});

// ═══════════════════════════════════════════════════════════════════════
//  13. Maiden Over
// ═══════════════════════════════════════════════════════════════════════
test('6 dot balls count as a maiden', () => {
  const e = freshEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  const bw = e.state.bowlersList.find(b => b.name === 'Starc');
  assert.equal(bw.maidens, 1);
});

test('over with runs is not a maiden', () => {
  const e = freshEngine();
  e.addRuns(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  const bw = e.state.bowlersList.find(b => b.name === 'Starc');
  assert.equal(bw.maidens, 0);
});

test('over with a wide is not a maiden', () => {
  const e = freshEngine();
  e.wideRuns(1);
  for (let i = 0; i < 6; i++) e.dotBall();
  const bw = e.state.bowlersList.find(b => b.name === 'Starc');
  assert.equal(bw.maidens, 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  14. Undo
// ═══════════════════════════════════════════════════════════════════════
test('undo reverts last ball', () => {
  const e = freshEngine();
  e.addRuns(4);
  assert.equal(e.state.runs, 4);
  e.undoLastBall();
  assert.equal(e.state.runs, 0);
  assert.equal(e.state.balls, 0);
});

test('undo with no history does nothing', () => {
  const e = freshEngine();
  e.undoLastBall(); // should not throw
  assert.equal(e.state.runs, 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  15. Innings Transition — Overs Exhausted
// ═══════════════════════════════════════════════════════════════════════
test('first innings ends when overs exhausted', () => {
  const e = freshEngine(1); // 1 over match
  for (let i = 0; i < 6; i++) e.dotBall();
  assert.equal(e.state.currentInning, 2);
  assert.equal(e.state.hasInning1Score, true);
  assert.equal(e.state.inning1Runs, 0);
  assert.equal(e.state.inning1Balls, 6);
});

// ═══════════════════════════════════════════════════════════════════════
//  16. Innings Transition — All Out
// ═══════════════════════════════════════════════════════════════════════
test('first innings ends at 10 wickets', () => {
  const e = freshEngine(50);
  for (let w = 0; w < 10; w++) {
    // Ensure bowler is set (over-end clears it)
    if (!e.state.currentBowler) e.setNewBowler('Bowler' + Math.floor(w / 6));
    e.wicket('bowled', 'striker');
    if (e.state.currentInning === 2) break; // auto-transitioned
    if (w < 9) e.setNewBatsman('Bat' + (w + 3));
  }
  assert.equal(e.state.currentInning, 2);
  assert.equal(e.state.hasInning1Score, true);
  assert.equal(e.state.inning1Wickets, 10);
});

// ═══════════════════════════════════════════════════════════════════════
//  17. Second Innings & Match Result
// ═══════════════════════════════════════════════════════════════════════
test('chasing team wins when target reached', () => {
  const e = freshEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  // Inning 2
  assert.equal(e.state.currentInning, 2);
  e.startSecondInning('Chase1', 'Chase2', 'Bowler2');
  assert.equal(e.targetScore, 7);
  e.addRuns(6);
  e.addRuns(1);
  assert.ok(e.state.matchResult);
  assert.ok(e.state.matchResult.includes('won'));
});

test('defending team wins when target not reached after overs', () => {
  const e = freshEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  assert.equal(e.state.currentInning, 2);
  e.startSecondInning('Chase1', 'Chase2', 'Bowler2');
  for (let i = 0; i < 6; i++) e.dotBall();
  assert.ok(e.state.matchResult);
  assert.ok(e.state.matchResult.includes('India')); // India (team1) wins
});

test('match tied when scores level and overs exhausted', () => {
  const e = freshEngine(1);
  e.addRuns(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  assert.equal(e.state.currentInning, 2);
  e.startSecondInning('Chase1', 'Chase2', 'Bowler2');
  // Score exactly 1 then get bowled out of remaining balls
  e.addRuns(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  assert.ok(e.state.matchResult);
  assert.ok(e.state.matchResult.includes('Drawn'));
});

// ═══════════════════════════════════════════════════════════════════════
//  18. Scoring Not Allowed After Result
// ═══════════════════════════════════════════════════════════════════════
test('cannot score after match result', () => {
  const e = freshEngine(1);
  for (let i = 0; i < 6; i++) e.dotBall();
  e.startSecondInning('C1', 'C2', 'B2');
  for (let i = 0; i < 6; i++) e.dotBall();
  assert.ok(e.state.matchResult);
  const runsBefore = e.state.runs;
  e.addRuns(4);
  assert.equal(e.state.runs, runsBefore); // unchanged
});

// ═══════════════════════════════════════════════════════════════════════
//  19. Retired Hurt
// ═══════════════════════════════════════════════════════════════════════
test('retireHurt moves batsman to retired list', () => {
  const e = freshEngine();
  const name = e.state.striker.name;
  e.retireHurt('striker');
  assert.equal(e.state.striker, null);
  assert.equal(e.state.retiredHurt.length, 1);
  assert.equal(e.state.retiredHurt[0].name, name);
});

test('returnBatsman brings retired batsman back', () => {
  const e = freshEngine();
  const name = e.state.striker.name;
  e.retireHurt('striker');
  e.returnBatsman(name);
  assert.equal(e.state.striker.name, name);
  assert.equal(e.state.retiredHurt.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  20. NRR Calculation
// ═══════════════════════════════════════════════════════════════════════
test('NRR is null during first innings', () => {
  const e = freshEngine();
  assert.equal(e.team1Nrr, null);
});

test('NRR computed in second innings', () => {
  const e = freshEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  e.startSecondInning('C1', 'C2', 'B2');
  e.addRuns(2);
  // team1Nrr = inn1RR - inn2RR
  assert.notEqual(e.team1Nrr, null);
  assert.notEqual(e.team2Nrr, null);
  assert.equal(e.team1Nrr, -e.team2Nrr);
});

// ═══════════════════════════════════════════════════════════════════════
//  21. Reset
// ═══════════════════════════════════════════════════════════════════════
test('reset clears all state', () => {
  const e = freshEngine();
  e.addRuns(4);
  e.reset();
  assert.equal(e.state.runs, 0);
  assert.equal(e.state.matchStarted, false);
  assert.equal(e.stateHistory.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  22. Current Over Events
// ═══════════════════════════════════════════════════════════════════════
test('currentOverEvents returns balls in current over', () => {
  const e = freshEngine();
  e.addRuns(1);
  e.dotBall();
  e.addRuns(4);
  assert.equal(e.currentOverEvents.length, 3);
});

test('currentOverEvents resets after over completes', () => {
  const e = freshEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  assert.equal(e.currentOverEvents.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  23. Bowler Stats
// ═══════════════════════════════════════════════════════════════════════
test('bowler stats track correctly across balls', () => {
  const e = freshEngine();
  e.addRuns(4);
  e.addRuns(2);
  e.dotBall();
  const bw = e.state.bowlersList[0];
  assert.equal(bw.runsConceded, 6);
  assert.equal(bw.ballsBowled, 3);
});

// ═══════════════════════════════════════════════════════════════════════
//  24. Edge Cases
// ═══════════════════════════════════════════════════════════════════════
test('cannot score in 2nd innings before startSecondInning called', () => {
  const e = freshEngine(50);
  for (let w = 0; w < 10; w++) {
    if (!e.state.currentBowler) e.setNewBowler('Bowler' + Math.floor(w / 6));
    e.wicket('bowled', 'striker');
    if (e.state.currentInning === 2) break;
    if (w < 9) e.setNewBatsman('Bat' + (w + 3));
  }
  // Auto-transitioned to inning 2 but matchStarted is false
  assert.equal(e.state.currentInning, 2);
  assert.equal(e.state.matchStarted, false);
  assert.equal(e.isScoringAllowed, false);
});

test('addRuns does nothing before match starts', () => {
  const e = new ScoringEngine();
  e.addRuns(4);
  assert.equal(e.state.runs, 0);
});

test('history records all events', () => {
  const e = freshEngine();
  e.addRuns(4);
  e.dotBall();
  e.wideRuns(1);
  e.bye(2);
  assert.equal(e.state.history.length, 4);
  assert.equal(e.state.history[0].type, 'runs');
  assert.equal(e.state.history[1].type, 'dot');
  assert.equal(e.state.history[2].type, 'wide');
  assert.equal(e.state.history[3].type, 'bye');
});
