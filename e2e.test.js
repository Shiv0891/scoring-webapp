// End-to-end tests for Cricket Scorer using Puppeteer + Node test runner
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const FILE_URL = 'file://' + path.resolve(__dirname, 'index.html');

let browser, page;

before(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser.close(); });

async function freshPage() {
  const p = await browser.newPage();
  await p.setViewport({ width: 480, height: 960 });
  await p.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
  // Clear any persisted state so each test starts clean
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForSelector('#match-setup');
  // Helper: click via JS to avoid headless "not clickable" issues
  p.jsClick = async (sel) => p.$eval(sel, el => el.click());
  return p;
}

// Helper: fill setup and start match
async function startMatch(p, { team1 = 'India', team2 = 'Australia', overs = '5', striker = 'Rohit', nonStriker = 'Virat', bowler = 'Starc' } = {}) {
  await p.type('#setup-team1', team1);
  await p.type('#setup-team2', team2);
  await p.$eval('#setup-overs', (el, v) => { el.value = v; }, overs);
  await p.type('#setup-striker', striker);
  await p.type('#setup-nonstriker', nonStriker);
  await p.type('#setup-bowler', bowler);
  await p.$eval('#btn-start-match', el => el.click());
  await p.waitForSelector('#live-scoring:not(.hidden)');
}

// ═══════════════════════════════════════════════════════════════════════
//  1. Landing Page & Match Setup
// ═══════════════════════════════════════════════════════════════════════
describe('Match Setup', () => {
  test('shows match setup on load', async () => {
    page = await freshPage();
    const visible = await page.$eval('#match-setup', el => !el.classList.contains('hidden'));
    assert.equal(visible, true);
    const liveHidden = await page.$eval('#live-scoring', el => el.classList.contains('hidden'));
    assert.equal(liveHidden, true);
    await page.close();
  });

  test('does not start without required fields', async () => {
    page = await freshPage();
    await page.type('#setup-team1', 'India');
    await page.$eval('#btn-start-match', el => el.click());
    // Should still be on setup
    const visible = await page.$eval('#match-setup', el => !el.classList.contains('hidden'));
    assert.equal(visible, true);
    await page.close();
  });

  test('starts match with all fields filled', async () => {
    page = await freshPage();
    await startMatch(page);
    const scoreText = await page.$eval('#score-display', el => el.textContent);
    assert.equal(scoreText, '0/0');
    const oversText = await page.$eval('#overs-display', el => el.textContent);
    assert.ok(oversText.includes('0.0'));
    await page.close();
  });

  test('header shows team names after start', async () => {
    page = await freshPage();
    await startMatch(page);
    const matchup = await page.$eval('#header-matchup', el => el.textContent);
    assert.ok(matchup.includes('India'));
    assert.ok(matchup.includes('Australia'));
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  2. Run Scoring
// ═══════════════════════════════════════════════════════════════════════
describe('Run Scoring', () => {
  test('clicking +1 updates score to 1/0', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('[data-runs="1"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '1/0');
    await page.close();
  });

  test('clicking +4 updates score and shows 4 in over chips', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('[data-runs="4"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '4/0');
    const chips = await page.$eval('#over-chips', el => el.textContent.trim());
    assert.ok(chips.includes('4'));
    await page.close();
  });

  test('clicking +6 updates score', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('[data-runs="6"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '6/0');
    await page.close();
  });

  test('dot ball keeps score at 0', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('[data-dot]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '0/0');
    const overs = await page.$eval('#overs-display', el => el.textContent);
    assert.ok(overs.includes('0.1'));
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  3. Batsman Stats
// ═══════════════════════════════════════════════════════════════════════
describe('Batsman Stats', () => {
  test('batting table shows both batsmen', async () => {
    page = await freshPage();
    await startMatch(page);
    const rows = await page.$$eval('#batting-table tbody tr', trs => trs.map(tr => tr.textContent));
    assert.ok(rows.some(r => r.includes('Rohit')));
    assert.ok(rows.some(r => r.includes('Virat')));
    await page.close();
  });

  test('striker stats update after scoring', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('[data-runs="4"]');
    const cells = await page.$$eval('#batting-table tbody tr:first-child td', tds => tds.map(td => td.textContent));
    // Runs column (index 1)
    assert.equal(cells[1], '4');
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  4. Over Completion & New Bowler
// ═══════════════════════════════════════════════════════════════════════
describe('Over Completion', () => {
  test('after 6 dots, new bowler prompt appears', async () => {
    page = await freshPage();
    await startMatch(page);
    for (let i = 0; i < 6; i++) await page.jsClick('[data-dot]');
    const overs = await page.$eval('#overs-display', el => el.textContent);
    assert.ok(overs.includes('1.0'));
    const prompt = await page.$eval('#new-bowler-prompt', el => !el.classList.contains('hidden'));
    assert.equal(prompt, true);
    await page.close();
  });

  test('can set new bowler and continue scoring', async () => {
    page = await freshPage();
    await startMatch(page);
    for (let i = 0; i < 6; i++) await page.jsClick('[data-dot]');
    await page.type('#input-new-bowler', 'Cummins');
    await page.jsClick('#btn-confirm-bowler');
    // Now score a run
    await page.jsClick('[data-runs="1"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '1/0');
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  5. Wicket Flow
// ═══════════════════════════════════════════════════════════════════════
describe('Wickets', () => {
  test('WICKET button opens dismissal modal', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-wicket');
    const modal = await page.$eval('#modal-wicket-type', el => !el.classList.contains('hidden'));
    assert.equal(modal, true);
    await page.close();
  });

  test('bowled wicket updates score to 0/1 and prompts new batsman', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-wicket');
    await page.jsClick('[data-wicket-type="bowled"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '0/1');
    const prompt = await page.$eval('#new-batsman-prompt', el => !el.classList.contains('hidden'));
    assert.equal(prompt, true);
    await page.close();
  });

  test('can add new batsman after wicket and continue', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-wicket');
    await page.jsClick('[data-wicket-type="bowled"]');
    await page.type('#input-new-batsman', 'Pant');
    await page.jsClick('#btn-confirm-batsman');
    await page.jsClick('[data-runs="4"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '4/1');
    await page.close();
  });

  test('run out flow — select runs then who is out', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-wicket');
    await page.jsClick('[data-wicket-type="runout"]');
    // Run out runs modal
    const roModal = await page.$eval('#modal-runout-runs', el => !el.classList.contains('hidden'));
    assert.equal(roModal, true);
    await page.jsClick('[data-ro-runs="0"]');
    // Who is out modal
    const whoModal = await page.$eval('#modal-runout-who', el => !el.classList.contains('hidden'));
    assert.equal(whoModal, true);
    await page.jsClick('#btn-runout-striker');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '0/1');
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  6. Extras
// ═══════════════════════════════════════════════════════════════════════
describe('Extras', () => {
  test('wide adds 1 run, no ball count change', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-wide');
    await page.jsClick('[data-wide="0"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '1/0');
    const overs = await page.$eval('#overs-display', el => el.textContent);
    assert.ok(overs.includes('0.0')); // not a legal ball
    await page.close();
  });

  test('no ball (not hit) adds 1 run', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-noball');
    await page.jsClick('#btn-nb-no');
    await page.jsClick('[data-nb="0"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '1/0');
    await page.close();
  });

  test('bye adds runs', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-bye');
    await page.jsClick('[data-bye="2"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '2/0');
    await page.close();
  });

  test('leg bye adds runs', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-legbye');
    await page.jsClick('[data-lb="3"]');
    const score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '3/0');
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  7. Undo
// ═══════════════════════════════════════════════════════════════════════
describe('Undo', () => {
  test('undo reverts last ball', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('[data-runs="4"]');
    let score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '4/0');
    await page.jsClick('#btn-undo');
    score = await page.$eval('#score-display', el => el.textContent);
    assert.equal(score, '0/0');
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  8. Swap Strike
// ═══════════════════════════════════════════════════════════════════════
describe('Swap Strike', () => {
  test('swap button changes striker highlight', async () => {
    page = await freshPage();
    await startMatch(page);
    const before = await page.$eval('#batting-table tbody tr.is-striker td', td => td.textContent);
    await page.jsClick('#btn-swap');
    const after_ = await page.$eval('#batting-table tbody tr.is-striker td', td => td.textContent);
    assert.notEqual(before, after_);
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  9. Summary Modal
// ═══════════════════════════════════════════════════════════════════════
describe('Summary', () => {
  test('summary button opens modal', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-summary');
    const modal = await page.$eval('#modal-summary', el => !el.classList.contains('hidden'));
    assert.equal(modal, true);
    await page.close();
  });

  test('summary modal can be closed', async () => {
    page = await freshPage();
    await startMatch(page);
    await page.jsClick('#btn-summary');
    await page.jsClick('#btn-close-summary');
    const hidden = await page.$eval('#modal-summary', el => el.classList.contains('hidden'));
    assert.equal(hidden, true);
    await page.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  10. Full Innings Flow
// ═══════════════════════════════════════════════════════════════════════
describe('Full Innings Flow', () => {
  test('complete 1-over match and see result', async () => {
    page = await freshPage();
    await startMatch(page, { overs: '1' });
    // Bowl 6 dots — inning 1 over
    for (let i = 0; i < 6; i++) await page.jsClick('[data-dot]');
    // Should show setup for 2nd innings
    const setupVisible = await page.$eval('#match-setup', el => !el.classList.contains('hidden'));
    assert.equal(setupVisible, true);
    // Start 2nd innings
    await page.type('#setup-striker', 'Chase1');
    await page.type('#setup-nonstriker', 'Chase2');
    await page.type('#setup-bowler', 'Bowler2');
    await page.jsClick('#btn-start-match');
    // Bowl 6 dots — scores tied at 0, should be drawn
    for (let i = 0; i < 6; i++) await page.jsClick('[data-dot]');
    // Match result should appear
    const resultVisible = await page.$eval('#match-result', el => !el.classList.contains('hidden'));
    assert.equal(resultVisible, true);
    const resultText = await page.$eval('#result-text', el => el.textContent);
    assert.ok(resultText.includes('Drawn'));
    await page.close();
  });
});
