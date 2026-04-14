// Unit tests for ScoringEngine
// Run: node test.js

// ---- Extract ScoringEngine class from app.js ----
const fs = require('fs');
let src = fs.readFileSync(__dirname + '/app.js', 'utf8');
// Remove everything after the class (UI code, DOM references)
const classEnd = src.indexOf("// ==================== PERSISTENCE ====================");
src = src.substring(0, classEnd);
// Also extract buildOverSummary from UI section
const fullSrc = fs.readFileSync(__dirname + '/app.js', 'utf8');
const bosMatch = fullSrc.match(/function buildOverSummary\(history\)\{[\s\S]*?\n\}/);
if (bosMatch) src += '\n' + bosMatch[0];
// Make the class exportable
src += "\nmodule.exports = { ScoringEngine, buildOverSummary };";
const m = {};
const fn = new Function('module', 'exports', src);
fn(m, m.exports = {});
const { ScoringEngine, buildOverSummary } = m.exports;

// ---- Test framework ----
let passed = 0, failed = 0, total = 0;
const failures = [];

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function newEngine(overs) {
  const e = new ScoringEngine();
  e.startMatch('Team A', 'Team B', 'Bat1', 'Bat2', 'Bowl1', overs || null);
  return e;
}

// ================================================================
console.log('\n🏏 SCORING ENGINE UNIT TESTS\n');

// ---- Match Setup ----
console.log('📋 Match Setup');
test('startMatch initializes state correctly', () => {
  const e = newEngine();
  assertEqual(e.state.team1Name, 'Team A');
  assertEqual(e.state.team2Name, 'Team B');
  assertEqual(e.state.striker.name, 'Bat1');
  assertEqual(e.state.nonStriker.name, 'Bat2');
  assertEqual(e.state.currentBowler.name, 'Bowl1');
  assertEqual(e.state.matchStarted, true);
  assertEqual(e.state.runs, 0);
  assertEqual(e.state.wickets, 0);
  assertEqual(e.state.balls, 0);
  assertEqual(e.state.currentInning, 1);
});

test('startMatch with overs sets maxOvers', () => {
  const e = newEngine(20);
  assertEqual(e.state.maxOvers, 20);
});

test('startMatch without overs leaves maxOvers null', () => {
  const e = newEngine();
  assertEqual(e.state.maxOvers, null);
});

test('default team names when empty', () => {
  const e = new ScoringEngine();
  e.startMatch('', '', 'S', 'NS', 'B');
  assertEqual(e.state.team1Name, 'Team 1');
  assertEqual(e.state.team2Name, 'Team 2');
});

// ---- Add Runs ----
console.log('\n🏃 Add Runs');
test('addRuns(1) adds 1 run and swaps strike', () => {
  const e = newEngine();
  e.addRuns(1);
  assertEqual(e.state.runs, 1);
  assertEqual(e.state.balls, 1);
  assertEqual(e.state.striker.name, 'Bat2', 'Strike should swap on odd runs');
});

test('addRuns(2) adds 2 runs, no swap', () => {
  const e = newEngine();
  e.addRuns(2);
  assertEqual(e.state.runs, 2);
  assertEqual(e.state.striker.name, 'Bat1', 'No swap on even runs');
});

test('addRuns(4) records a four', () => {
  const e = newEngine();
  e.addRuns(4);
  assertEqual(e.state.runs, 4);
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.fours, 1);
});

test('addRuns(6) records a six', () => {
  const e = newEngine();
  e.addRuns(6);
  assertEqual(e.state.runs, 6);
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.sixes, 1);
});

test('batsman stats accumulate correctly', () => {
  const e = newEngine();
  e.addRuns(4); e.addRuns(6); e.addRuns(1);
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.runs, 11);
  assertEqual(bat.ballsFaced, 3);
  assertEqual(bat.fours, 1);
  assertEqual(bat.sixes, 1);
});

test('bowler stats accumulate correctly', () => {
  const e = newEngine();
  e.addRuns(4); e.addRuns(2);
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.runsConceded, 6);
  assertEqual(bw.ballsBowled, 2);
});

// ---- Dot Ball ----
console.log('\n⚫ Dot Ball');
test('dotBall increments balls but not runs', () => {
  const e = newEngine();
  e.dotBall();
  assertEqual(e.state.runs, 0);
  assertEqual(e.state.balls, 1);
  assertEqual(e.state.striker.ballsFaced, 1);
});

// ---- Over Completion ----
console.log('\n🔄 Over Completion');
test('6 dot balls complete an over and swap strike', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  assertEqual(e.state.balls, 6);
  assertEqual(e.oversDisplay, '1.0');
  assertEqual(e.state.currentBowler, null, 'Bowler should be null after over');
  assertEqual(e.state.striker.name, 'Bat2', 'Strike swaps at end of over');
});

test('oversDisplay shows correct format', () => {
  const e = newEngine();
  e.dotBall(); e.dotBall(); e.dotBall();
  assertEqual(e.oversDisplay, '0.3');
});

test('maiden over is recorded', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.maidens, 1);
});

test('over with runs is not a maiden', () => {
  const e = newEngine();
  e.addRuns(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.maidens, 0);
});

// ---- Swap Strike ----
console.log('\n🔀 Swap Strike');
test('swapStrike swaps striker and nonStriker', () => {
  const e = newEngine();
  assertEqual(e.state.striker.name, 'Bat1');
  e.swapStrike();
  assertEqual(e.state.striker.name, 'Bat2');
  assertEqual(e.state.nonStriker.name, 'Bat1');
});

// ---- Wickets ----
console.log('\n🏏 Wickets');
test('bowled wicket dismisses striker', () => {
  const e = newEngine();
  e.wicket('bowled', 'striker');
  assertEqual(e.state.wickets, 1);
  assertEqual(e.state.balls, 1);
  assertEqual(e.state.striker, null, 'Striker dismissed');
  assert(e.needsNewBatsman, 'Should need new batsman');
});

test('caught out wicket', () => {
  const e = newEngine();
  e.wicket('caught', 'striker');
  assertEqual(e.state.wickets, 1);
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.wicketsTaken, 1);
});

test('lbw wicket', () => {
  const e = newEngine();
  e.wicket('lbw', 'striker');
  assertEqual(e.state.wickets, 1);
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.wicketsTaken, 1);
});

test('stumped wicket', () => {
  const e = newEngine();
  e.wicket('stumped', 'striker');
  assertEqual(e.state.wickets, 1);
});

test('hit wicket', () => {
  const e = newEngine();
  e.wicket('hitwicket', 'striker');
  assertEqual(e.state.wickets, 1);
});

test('run out striker with 0 runs', () => {
  const e = newEngine();
  e.wicket('runout', 'striker', 0);
  assertEqual(e.state.wickets, 1);
  assertEqual(e.state.runs, 0);
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.wicketsTaken, 0, 'Run out should not credit bowler wicket');
});

test('run out non-striker with 2 runs', () => {
  const e = newEngine();
  e.wicket('runout', 'nonStriker', 2);
  assertEqual(e.state.wickets, 1);
  assertEqual(e.state.runs, 2);
  assertEqual(e.state.nonStriker, null, 'Non-striker dismissed');
  assertEqual(e.state.striker.name, 'Bat1', 'Striker still there');
});

test('run out with 1 run swaps then dismisses', () => {
  const e = newEngine();
  e.wicket('runout', 'striker', 1);
  assertEqual(e.state.wickets, 1);
  assertEqual(e.state.runs, 1);
});

test('cannot take more than 10 wickets', () => {
  const e = newEngine();
  for (let i = 0; i < 9; i++) {
    if (e.needsNewBowler) e.setNewBowler('Bowl1');
    e.wicket('bowled', 'striker');
    if (e.state.currentInning === 2) break;
    if (e.needsNewBatsman && e.state.wickets < 10) {
      e.setNewBatsman('Bat' + (i + 3));
    }
  }
  if (e.state.currentInning === 1) {
    if (e.needsNewBowler) e.setNewBowler('Bowl1');
    e.wicket('bowled', 'striker');
  }
  assertEqual(e.state.currentInning, 2, 'Should move to 2nd innings after all out');
});

// ---- New Batsman ----
console.log('\n🧑 New Batsman');
test('setNewBatsman fills vacant striker slot', () => {
  const e = newEngine();
  e.wicket('bowled', 'striker');
  assert(e.needsNewBatsman);
  e.setNewBatsman('Bat3');
  assertEqual(e.state.striker.name, 'Bat3');
  assertEqual(e.state.batsmenList.length, 3);
});

test('setNewBatsman fills vacant nonStriker slot', () => {
  const e = newEngine();
  e.wicket('runout', 'nonStriker', 0);
  e.setNewBatsman('Bat3');
  assertEqual(e.state.nonStriker.name, 'Bat3');
});

// ---- New Bowler ----
console.log('\n🎳 New Bowler');
test('setNewBowler creates new bowler', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Bowl2');
  assertEqual(e.state.currentBowler.name, 'Bowl2');
  assertEqual(e.state.bowlersList.length, 2);
});

test('setNewBowler reuses existing bowler', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Bowl2');
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Bowl1');
  assertEqual(e.state.currentBowler.name, 'Bowl1');
  assertEqual(e.state.bowlersList.length, 2);
});

// ---- Wide ----
console.log('\n📏 Wide');
test('wide adds 1 run, no ball count', () => {
  const e = newEngine();
  e.wideRuns(1);
  assertEqual(e.state.runs, 1);
  assertEqual(e.state.balls, 0, 'Wide should not count as a ball');
  assertEqual(e.state.totalWides, 1);
});

test('wide with extra runs', () => {
  const e = newEngine();
  e.wideRuns(3); // 1 wide + 2 extra
  assertEqual(e.state.runs, 3);
  assertEqual(e.state.totalWides, 3);
});

test('wide credited to bowler', () => {
  const e = newEngine();
  e.wideRuns(1);
  const bw = e.state.bowlersList.find(b => b.name === 'Bowl1');
  assertEqual(bw.wides, 1);
  assertEqual(bw.runsConceded, 1);
});

test('wide with 2 extra runs swaps strike (odd additional)', () => {
  const e = newEngine();
  e.wideRuns(2); // 1 wide + 1 extra = 2 total, additional = 1 (odd) -> swap
  assertEqual(e.state.striker.name, 'Bat2', 'Should swap on odd additional runs');
});

// ---- No Ball ----
console.log('\n🚫 No Ball');
test('no ball not hit by bat adds 1 run', () => {
  const e = newEngine();
  e.noBallRuns(1, false);
  assertEqual(e.state.runs, 1);
  assertEqual(e.state.balls, 0, 'No ball should not count as legal delivery');
  assertEqual(e.state.totalNoBalls, 1);
});

test('no ball hit by bat credits batsman', () => {
  const e = newEngine();
  e.noBallRuns(5, true); // 1 NB + 4 runs by bat
  assertEqual(e.state.runs, 5);
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.runs, 4);
  assertEqual(bat.fours, 1);
  assertEqual(bat.ballsFaced, 1, 'NB hit by bat counts as ball faced');
});

test('no ball not hit by bat does not credit batsman runs', () => {
  const e = newEngine();
  e.noBallRuns(3, false); // 1 NB + 2 extra
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.runs, 0, 'Batsman should not get runs from NB not hit');
});

test('no ball with odd extras swaps strike', () => {
  const e = newEngine();
  e.noBallRuns(2, false); // 1+1=2, additional=1 (odd) -> swap
  assertEqual(e.state.striker.name, 'Bat2');
});

// ---- Bye ----
console.log('\n👋 Bye');
test('bye adds runs to team but not batsman', () => {
  const e = newEngine();
  e.bye(2);
  assertEqual(e.state.runs, 2);
  assertEqual(e.state.byes, 2);
  assertEqual(e.state.balls, 1);
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.runs, 0, 'Byes should not credit batsman');
  assertEqual(bat.ballsFaced, 1, 'Ball faced still counts');
});

test('bye with odd runs swaps strike', () => {
  const e = newEngine();
  e.bye(1);
  assertEqual(e.state.striker.name, 'Bat2');
});

test('bye with even runs no swap', () => {
  const e = newEngine();
  e.bye(2);
  assertEqual(e.state.striker.name, 'Bat1');
});

// ---- Leg Bye ----
console.log('\n🦵 Leg Bye');
test('leg bye adds runs to team but not batsman', () => {
  const e = newEngine();
  e.legBye(3);
  assertEqual(e.state.runs, 3);
  assertEqual(e.state.legByes, 3);
  const bat = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat.runs, 0);
});

test('leg bye with odd runs swaps strike', () => {
  const e = newEngine();
  e.legBye(1);
  assertEqual(e.state.striker.name, 'Bat2');
});

// ---- Extras Getters ----
console.log('\n📊 Extras Tracking');
test('totalExtras sums all extras', () => {
  const e = newEngine();
  e.wideRuns(1);
  e.noBallRuns(1, false);
  e.bye(2);
  e.legBye(1);
  assertEqual(e.totalExtras, 5);
  assertEqual(e.fieldingExtras, 3); // byes(2) + legByes(1)
  assertEqual(e.bowlingExtras, 2);  // wides(1) + noBalls(1)
});

// ---- Retired Hurt ----
console.log('\n🏥 Retired Hurt');
test('retireHurt removes striker', () => {
  const e = newEngine();
  e.addRuns(4);
  e.retireHurt('striker');
  assertEqual(e.state.striker, null);
  assertEqual(e.state.retiredHurt.length, 1);
  assertEqual(e.state.retiredHurt[0].name, 'Bat1');
  assertEqual(e.state.retiredHurt[0].runs, 4);
});

test('retireHurt removes nonStriker', () => {
  const e = newEngine();
  e.retireHurt('nonStriker');
  assertEqual(e.state.nonStriker, null);
  assertEqual(e.state.retiredHurt.length, 1);
  assertEqual(e.state.retiredHurt[0].name, 'Bat2');
});

test('needsNewBatsman is true after retired hurt', () => {
  const e = newEngine();
  e.retireHurt('striker');
  assert(e.needsNewBatsman, 'Should need new batsman after retired hurt');
});

test('returnBatsman brings back retired batsman', () => {
  const e = newEngine();
  e.addRuns(4);
  e.retireHurt('striker');
  e.returnBatsman('Bat1');
  assertEqual(e.state.striker.name, 'Bat1');
  assertEqual(e.state.striker.runs, 4, 'Should retain stats');
  assertEqual(e.state.retiredHurt.length, 0);
});

// ---- Undo ----
console.log('\n↩️  Undo');
test('undo reverts last action', () => {
  const e = newEngine();
  e.addRuns(4);
  assertEqual(e.state.runs, 4);
  e.undoLastBall();
  assertEqual(e.state.runs, 0);
  assertEqual(e.state.balls, 0);
});

test('undo reverts wicket', () => {
  const e = newEngine();
  e.wicket('bowled', 'striker');
  assertEqual(e.state.wickets, 1);
  e.undoLastBall();
  assertEqual(e.state.wickets, 0);
  assertEqual(e.state.striker.name, 'Bat1');
});

test('undo with no history does nothing', () => {
  const e = newEngine();
  e.undoLastBall(); // should not crash
  assertEqual(e.state.runs, 0);
});

// ---- Reset ----
console.log('\n🔁 Reset');
test('reset clears all state', () => {
  const e = newEngine();
  e.addRuns(4); e.addRuns(6);
  e.reset();
  assertEqual(e.state.runs, 0);
  assertEqual(e.state.matchStarted, false);
  assertEqual(e.stateHistory.length, 0);
});

// ---- Innings Transition (overs limit) ----
console.log('\n🔄 Innings Transition');
test('1st innings ends when maxOvers reached', () => {
  const e = newEngine(1); // 1 over match
  for (let i = 0; i < 6; i++) e.dotBall();
  assertEqual(e.state.currentInning, 2);
  assertEqual(e.state.hasInning1Score, true);
  assertEqual(e.state.inning1Runs, 0);
  assertEqual(e.state.matchStarted, false, 'Needs 2nd innings setup');
});

test('1st innings ends on all out (10 wickets)', () => {
  const e = newEngine();
  for (let i = 0; i < 9; i++) {
    if (e.needsNewBowler) e.setNewBowler('Bowl1');
    e.wicket('bowled', 'striker');
    if (e.state.currentInning === 2) break;
    if (e.needsNewBatsman && e.state.wickets < 10) {
      e.setNewBatsman('Bat' + (i + 3));
    }
  }
  if (e.state.currentInning === 1) {
    if (e.needsNewBowler) e.setNewBowler('Bowl1');
    e.wicket('bowled', 'striker');
  }
  assertEqual(e.state.currentInning, 2);
});

// ---- Second Innings ----
console.log('\n🏏 Second Innings');
test('startSecondInning sets up correctly', () => {
  const e = newEngine(1);
  e.addRuns(4); e.addRuns(2);
  for (let i = 0; i < 4; i++) e.dotBall();
  // Now in 2nd innings setup
  assertEqual(e.state.currentInning, 2);
  e.startSecondInning('Bat_A', 'Bat_B', 'Bowl_A');
  assertEqual(e.state.striker.name, 'Bat_A');
  assertEqual(e.state.nonStriker.name, 'Bat_B');
  assertEqual(e.state.currentBowler.name, 'Bowl_A');
  assertEqual(e.state.matchStarted, true);
  assertEqual(e.targetScore, 7, 'Target should be inning1Runs + 1');
});

// ---- Match Result ----
console.log('\n🏆 Match Result');
test('team2 wins by chasing target', () => {
  const e = newEngine(1);
  // Inning 1: score 6 runs
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  // Inning 2
  e.startSecondInning('A1', 'A2', 'B1');
  e.addRuns(6);
  e.addRuns(1);
  assert(e.state.matchResult !== null, 'Match should have result');
  assert(e.state.matchResult.includes('Team B'), 'Team B should win');
  assert(e.state.matchResult.includes('won'), 'Should say won');
});

test('team1 wins by runs when team2 all out', () => {
  const e = newEngine(2);
  // Inning 1: score 20 in 2 overs
  for (let i = 0; i < 6; i++) e.addRuns(2); // over 1: 12 runs
  e.setNewBowler('Bowl2');
  for (let i = 0; i < 4; i++) e.addRuns(2); // over 2: 8 more runs = 20 total
  for (let i = 0; i < 2; i++) e.dotBall();
  // Inning 2
  e.startSecondInning('A1', 'A2', 'B1');
  for (let i = 0; i < 9; i++) {
    if (e.needsNewBowler) e.setNewBowler('B1');
    e.wicket('bowled', 'striker');
    if (e.state.matchResult) break;
    if (e.needsNewBatsman && e.state.wickets < 10) {
      e.setNewBatsman('A' + (i + 3));
    }
  }
  if (!e.state.matchResult) {
    if (e.needsNewBowler) e.setNewBowler('B1');
    e.wicket('bowled', 'striker');
  }
  assert(e.state.matchResult !== null);
  assert(e.state.matchResult.includes('Team A'), 'Team A should win');
});

test('match drawn when scores level and innings ends', () => {
  const e = newEngine(1);
  // Inning 1: score 1
  e.addRuns(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  // Inning 2: score 1, then overs done
  e.startSecondInning('A1', 'A2', 'B1');
  e.addRuns(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  assert(e.state.matchResult !== null);
  assert(e.state.matchResult.includes('Drawn'), 'Should be drawn');
});

// ---- isScoringAllowed ----
console.log('\n🔒 Scoring Guards');
test('scoring not allowed before match starts', () => {
  const e = new ScoringEngine();
  assertEqual(e.isScoringAllowed, false);
});

test('scoring not allowed after match result', () => {
  const e = newEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  e.startSecondInning('A1', 'A2', 'B1');
  for (let i = 0; i < 7; i++) e.addRuns(1); // chase 7 to win
  assertEqual(e.isScoringAllowed, false);
});

test('scoring not allowed when maxOvers reached', () => {
  const e = newEngine(1);
  for (let i = 0; i < 6; i++) e.dotBall();
  // Now in 2nd innings setup - scoring not allowed
  assertEqual(e.isScoringAllowed, false);
});

// ---- NRR ----
console.log('\n📈 Net Run Rate');
test('NRR is null in 1st innings', () => {
  const e = newEngine(5);
  e.addRuns(4);
  assertEqual(e.team1Nrr, null);
});

test('NRR calculated in 2nd innings', () => {
  const e = newEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  e.startSecondInning('A1', 'A2', 'B1');
  e.addRuns(2);
  assert(e.team1Nrr !== null, 'NRR should be calculated');
  assert(e.team2Nrr !== null, 'Team2 NRR should be calculated');
  assert(e.team1Nrr === -e.team2Nrr, 'NRRs should be opposite');
});

// ---- Current Over Events ----
console.log('\n📝 Current Over Events');
test('currentOverEvents tracks balls in current over', () => {
  const e = newEngine();
  e.dotBall();
  e.addRuns(4);
  assertEqual(e.currentOverEvents.length, 2);
});

test('currentOverEvents includes wides/noballs', () => {
  const e = newEngine();
  e.dotBall();
  e.wideRuns(1);
  e.addRuns(2);
  assertEqual(e.currentOverEvents.length, 3);
});

// ---- balls/overs helpers ----
console.log('\n⚾ Ball Counting');
test('legalBallsInOver correct mid-over', () => {
  const e = newEngine();
  e.dotBall(); e.dotBall(); e.dotBall();
  assertEqual(e.legalBallsInOver, 3);
  assertEqual(e.ballsRemaining, 3);
});

test('wides and noballs dont count as legal balls', () => {
  const e = newEngine();
  e.wideRuns(1);
  e.noBallRuns(1, false);
  e.dotBall();
  assertEqual(e.state.balls, 1, 'Only 1 legal ball');
  assertEqual(e.legalBallsInOver, 1);
});

// ---- History tracking ----
console.log('\n📜 Event History');
test('history records all events', () => {
  const e = newEngine();
  e.addRuns(4);
  e.dotBall();
  e.wideRuns(1);
  e.bye(2);
  assertEqual(e.state.history.length, 4);
  assertEqual(e.state.history[0].type, 'runs');
  assertEqual(e.state.history[1].type, 'dot');
  assertEqual(e.state.history[2].type, 'wide');
  assertEqual(e.state.history[3].type, 'bye');
});

test('wicket event includes dismissal details', () => {
  const e = newEngine();
  e.wicket('caught', 'striker');
  const ev = e.state.history[0];
  assertEqual(ev.type, 'wicket');
  assertEqual(ev.dismissal, 'caught');
  assertEqual(ev.outBatsman, 'striker');
});

// ---- Edge Cases ----
console.log('\n🧪 Edge Cases');
test('addRuns does nothing without striker', () => {
  const e = newEngine();
  e.wicket('bowled', 'striker');
  const runsBefore = e.state.runs;
  e.addRuns(4); // should be ignored, no striker
  assertEqual(e.state.runs, runsBefore);
});

test('addRuns does nothing without bowler (between overs)', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  // No bowler set
  const runsBefore = e.state.runs;
  e.addRuns(4);
  assertEqual(e.state.runs, runsBefore);
});

test('multiple undos work correctly', () => {
  const e = newEngine();
  e.addRuns(1);
  e.addRuns(2);
  e.addRuns(3);
  assertEqual(e.state.runs, 6);
  e.undoLastBall();
  assertEqual(e.state.runs, 3);
  e.undoLastBall();
  assertEqual(e.state.runs, 1);
  e.undoLastBall();
  assertEqual(e.state.runs, 0);
});

test('strike rotation correct over 1 odd run + over end', () => {
  const e = newEngine();
  // Ball 1-5: dots (no swap mid-over)
  for (let i = 0; i < 5; i++) e.dotBall();
  // Ball 6: 1 run -> odd run swap + over-end swap cancel out
  e.addRuns(1);
  // Odd runs XOR over-end: 1 swap cancels out, striker stays
  assertEqual(e.state.striker.name, 'Bat1', 'Odd run at over end cancels swap');
});

// ---- Overthrows ----
console.log('\n🔁 Overthrows');
test('overthrow adds runs to team but not batsman', () => {
  const e = newEngine();
  e.addRuns(2); // Bat1 has 2 runs
  e.overthrow(3); // odd runs swap strike, so striker is now Bat2
  assertEqual(e.state.runs, 5, 'Team should have 5 runs');
  const bat1 = e.state.batsmenList.find(b => b.name === 'Bat1');
  assertEqual(bat1.runs, 2, 'Batsman should still have 2 runs');
  assertEqual(e.state.overthrows, 3, 'Overthrows should be 3');
});

test('overthrow does not increment ball count', () => {
  const e = newEngine();
  e.dotBall();
  const ballsBefore = e.state.balls;
  e.overthrow(2);
  assertEqual(e.state.balls, ballsBefore, 'Ball count should not change');
});

test('overthrow with odd runs swaps strike', () => {
  const e = newEngine();
  e.overthrow(1);
  assertEqual(e.state.striker.name, 'Bat2', 'Odd overthrow should swap strike');
});

test('overthrow with even runs does not swap strike', () => {
  const e = newEngine();
  e.overthrow(2);
  assertEqual(e.state.striker.name, 'Bat1', 'Even overthrow should not swap');
});

test('overthrow included in fielding extras', () => {
  const e = newEngine();
  e.overthrow(3);
  e.bye(1);
  assertEqual(e.fieldingExtras, 4, 'Fielding extras = overthrows + byes');
});

test('overthrow included in total extras', () => {
  const e = newEngine();
  e.overthrow(2);
  e.wideRuns(1);
  assertEqual(e.totalExtras, 3, 'Total extras = overthrows + wides');
});

test('overthrow records history event', () => {
  const e = newEngine();
  e.overthrow(4);
  const ev = e.state.history[0];
  assertEqual(ev.type, 'overthrow');
  assertEqual(ev.value, 4);
});

test('overthrow can be undone', () => {
  const e = newEngine();
  e.addRuns(2);
  e.overthrow(3);
  assertEqual(e.state.runs, 5);
  e.undoLastBall();
  assertEqual(e.state.runs, 2);
  assertEqual(e.state.overthrows, 0);
});

test('overthrow not allowed when scoring not allowed', () => {
  const e = new ScoringEngine();
  e.overthrow(2);
  assertEqual(e.state.runs, 0, 'Should not add runs before match starts');
});

test('overthrow can trigger winner in 2nd innings', () => {
  const e = newEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  e.startSecondInning('A1', 'A2', 'B1');
  e.addRuns(4);
  e.overthrow(3); // total = 7, target = 7
  assert(e.state.matchResult !== null, 'Overthrow should trigger win');
  assert(e.state.matchResult.includes('Team B'), 'Team B should win');
});

test('overthrow does not count as legal ball in currentOverEvents', () => {
  const e = newEngine();
  e.dotBall();
  e.overthrow(2);
  e.dotBall();
  assertEqual(e.legalBallsInOver, 2, 'Overthrow should not count as legal ball');
  assertEqual(e.currentOverEvents.length, 3, 'All 3 events should show in over');
});

// ---- Bowler name in history ----
console.log('\n🎳 Bowler Name in History');
test('history events include bowler name', () => {
  const e = newEngine();
  e.addRuns(4);
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('dot ball includes bowler name', () => {
  const e = newEngine();
  e.dotBall();
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('wide includes bowler name', () => {
  const e = newEngine();
  e.wideRuns(1);
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('no ball includes bowler name', () => {
  const e = newEngine();
  e.noBallRuns(1, false);
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('bye includes bowler name', () => {
  const e = newEngine();
  e.bye(1);
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('leg bye includes bowler name', () => {
  const e = newEngine();
  e.legBye(1);
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('wicket includes bowler name', () => {
  const e = newEngine();
  e.wicket('bowled', 'striker');
  assertEqual(e.state.history[0].bowler, 'Bowl1');
});

test('bowler name changes with new bowler', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall();
  e.setNewBowler('Bowl2');
  e.addRuns(2);
  const lastEv = e.state.history[e.state.history.length - 1];
  assertEqual(lastEv.bowler, 'Bowl2');
});

// ---- Inning 1 history preserved ----
console.log('\n📜 Inning 1 History Preservation');
test('inning1History saved on overs-based transition', () => {
  const e = newEngine(1);
  e.addRuns(4);
  for (let i = 0; i < 5; i++) e.dotBall();
  assertEqual(e.state.currentInning, 2);
  assert(e.state.inning1History.length > 0, 'Inning1 history should be saved');
  assertEqual(e.state.inning1History[0].type, 'runs');
  assertEqual(e.state.inning1History[0].value, 4);
});

test('inning1History saved on all-out transition', () => {
  const e = newEngine();
  for (let i = 0; i < 9; i++) {
    if (e.needsNewBowler) e.setNewBowler('Bowl1');
    e.wicket('bowled', 'striker');
    if (e.state.currentInning === 2) break;
    if (e.needsNewBatsman && e.state.wickets < 10) {
      e.setNewBatsman('Bat' + (i + 3));
    }
  }
  if (e.state.currentInning === 1) {
    if (e.needsNewBowler) e.setNewBowler('Bowl1');
    e.wicket('bowled', 'striker');
  }
  assertEqual(e.state.currentInning, 2);
  assert(e.state.inning1History.length > 0, 'Inning1 history should be saved on all-out');
});

// ---- Overthrows in innings transition ----
console.log('\n🔁 Overthrows in Innings Transition');
test('overthrows preserved in inning1 on transition', () => {
  const e = newEngine(1);
  e.addRuns(2);
  e.overthrow(3);
  for (let i = 0; i < 5; i++) e.dotBall();
  assertEqual(e.state.currentInning, 2);
  assertEqual(e.state.inning1Overthrows, 3);
});

test('inning1 fielding extras include overthrows', () => {
  const e = newEngine(1);
  e.addRuns(2);
  e.overthrow(3);
  e.bye(1);
  for (let i = 0; i < 5; i++) e.dotBall();
  assertEqual(e.state.currentInning, 2);
  assertEqual(e.inning1FieldingExtras, 4, 'Inning1 fielding extras = overthrows + byes');
});

// ---- buildOverSummary ----
console.log('\n📊 Over-by-Over Summary');
test('buildOverSummary computes runs per over correctly', () => {
  const e = newEngine();
  e.addRuns(4); e.addRuns(2); e.dotBall(); e.dotBall(); e.addRuns(1); e.dotBall(); // over 1: 7 runs
  const summary = buildOverSummary(e.state.history);
  assertEqual(summary.length, 1);
  assertEqual(summary[0].over, 1);
  assertEqual(summary[0].runs, 7);
  assertEqual(summary[0].bowler, 'Bowl1');
});

test('buildOverSummary handles multiple overs', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall(); // over 1: 0 runs
  e.setNewBowler('Bowl2');
  e.addRuns(4); e.addRuns(2); for (let i = 0; i < 4; i++) e.dotBall(); // over 2: 6 runs
  const summary = buildOverSummary(e.state.history);
  assertEqual(summary.length, 2);
  assertEqual(summary[0].runs, 0);
  assertEqual(summary[0].bowler, 'Bowl1');
  assertEqual(summary[1].runs, 6);
  assertEqual(summary[1].bowler, 'Bowl2');
});

test('buildOverSummary includes wides and no balls in over runs', () => {
  const e = newEngine();
  e.wideRuns(1); // 1 run, no legal ball
  e.addRuns(2);
  for (let i = 0; i < 5; i++) e.dotBall();
  const summary = buildOverSummary(e.state.history);
  assertEqual(summary.length, 1);
  assertEqual(summary[0].runs, 3, 'Over should include wide runs');
});

test('buildOverSummary includes overthrows in over runs', () => {
  const e = newEngine();
  e.addRuns(2);
  e.overthrow(3);
  for (let i = 0; i < 5; i++) e.dotBall();
  const summary = buildOverSummary(e.state.history);
  assertEqual(summary.length, 1);
  assertEqual(summary[0].runs, 5, 'Over should include overthrow runs');
});

test('buildOverSummary handles partial over', () => {
  const e = newEngine();
  e.addRuns(4); e.dotBall(); e.addRuns(2);
  const summary = buildOverSummary(e.state.history);
  assertEqual(summary.length, 1);
  assertEqual(summary[0].runs, 6);
});

test('buildOverSummary handles empty history', () => {
  const summary = buildOverSummary([]);
  assertEqual(summary.length, 0);
});

test('buildOverSummary handles null history', () => {
  const summary = buildOverSummary(null);
  assertEqual(summary.length, 0);
});

test('buildOverSummary includes wicket run-out runs', () => {
  const e = newEngine();
  e.wicket('runout', 'striker', 2);
  e.setNewBatsman('Bat3');
  for (let i = 0; i < 5; i++) e.dotBall();
  const summary = buildOverSummary(e.state.history);
  assertEqual(summary[0].runs, 2, 'Over should include run-out runs');
});

// ---- Undo at start of over (bowler change) ----
console.log('\n↩️  Bowler Change via Undo');
test('clearing bowler at start of new over allows re-selection', () => {
  const e = newEngine();
  for (let i = 0; i < 6; i++) e.dotBall(); // complete over 1
  e.setNewBowler('Bowl2');
  // At start of over 2, balls % 6 === 0, bowler is set
  assertEqual(e.state.currentBowler.name, 'Bowl2');
  assertEqual(e.state.balls % 6, 0);
  // Simulate what the UI undo does: clear bowler
  e.state.currentBowler = null;
  assert(e.needsNewBowler, 'Should need new bowler after clearing');
  e.setNewBowler('Bowl3');
  assertEqual(e.state.currentBowler.name, 'Bowl3');
});

test('undo last ball from bowler prompt restores previous over state', () => {
  const e = newEngine();
  e.addRuns(4);
  for (let i = 0; i < 5; i++) e.dotBall(); // complete over 1
  assertEqual(e.state.balls, 6);
  assertEqual(e.state.currentBowler, null);
  // Undo last ball goes back to ball 5 of over 1
  e.undoLastBall();
  assertEqual(e.state.balls, 5);
  assert(e.state.currentBowler !== null, 'Bowler should be restored');
});

// ---- 2nd Innings Setup Undo ----
console.log('\n↩️  2nd Innings Setup Undo');
test('undo from 2nd innings setup returns to 1st innings', () => {
  const e = newEngine(1);
  e.addRuns(6);
  for (let i = 0; i < 5; i++) e.dotBall();
  assertEqual(e.state.currentInning, 2);
  assertEqual(e.state.matchStarted, false);
  // Undo should go back to last ball of 1st innings
  e.undoLastBall();
  assertEqual(e.state.currentInning, 1, 'Should be back in 1st innings');
  assertEqual(e.state.matchStarted, true, 'Match should be started');
  assertEqual(e.state.balls, 5, 'Should be at ball 5');
});

// ================================================================
// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed}/${total} passed, ${failed} failed\n`);
if (failures.length > 0) {
  console.log('Failed tests:');
  failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
  console.log('');
  process.exit(1);
}
