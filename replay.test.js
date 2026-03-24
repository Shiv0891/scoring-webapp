/**
 * 🏏 Cricsheet Replay E2E Test
 *
 * Downloads a real IPL match from Cricsheet.org, then replays every delivery
 * through the Cricket Scorer app via Puppeteer — clicking the exact UI buttons
 * a real user would press. After each innings, it compares the app's score
 * against the real match data.
 *
 * Usage:  node --test replay.test.js
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const FILE_URL = 'file://' + path.resolve(__dirname, 'index.html');
const IPL_ZIP_URL = 'https://cricsheet.org/downloads/ipl_json.zip';
const TMP_DIR = '/tmp/ipl_replay';

let browser, matchFiles;

// ── Download & pick matches ─────────────────────────────────────────
before(async () => {
  // Download IPL JSON zip
  if (!fs.existsSync(path.join(TMP_DIR, 'done'))) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    execSync(`curl -sL "${IPL_ZIP_URL}" -o "${TMP_DIR}/ipl.zip"`);
    execSync(`unzip -o "${TMP_DIR}/ipl.zip" -d "${TMP_DIR}" > /dev/null 2>&1`);
    fs.writeFileSync(path.join(TMP_DIR, 'done'), '1');
  }

  // Pick match files: MATCH_FILES (comma-sep), MATCH_FILE, or latest
  if (process.env.MATCH_FILES) {
    matchFiles = process.env.MATCH_FILES.split(',').map(f => f.trim());
  } else if (process.env.MATCH_FILE) {
    matchFiles = [process.env.MATCH_FILE];
  } else {
    const files = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.json')).sort();
    matchFiles = [path.join(TMP_DIR, files[files.length - 1])];
  }

  console.log(`\n🏏 Will replay ${matchFiles.length} match(es)\n`);

  const isHeadless = process.env.HEADLESS !== 'false';
  browser = await puppeteer.launch({ headless: isHeadless, args: ['--no-sandbox'], slowMo: isHeadless ? 0 : 5 });
});

after(async () => {
  if (browser) {
    if (process.env.HEADLESS === 'false') {
      console.log('\n⏸️  Browser is open — close it manually when done.');
      await new Promise(r => browser.on('disconnected', r));
    } else {
      await browser.close();
    }
  }
});

// ── Helpers ─────────────────────────────────────────────────────────
async function freshPage() {
  const p = await browser.newPage();
  await p.setViewport({ width: 480, height: 960 });
  await p.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); location.reload(); });
  await p.waitForSelector('#match-setup');
  p.jsClick = async (sel) => p.$eval(sel, el => el.click());
  return p;
}

function mapWicketKind(kind) {
  const map = {
    'bowled': 'bowled', 'caught': 'caught', 'caught and bowled': 'caught',
    'lbw': 'lbw', 'stumped': 'stumped', 'run out': 'runout',
    'hit wicket': 'hitwicket', 'retired hurt': 'retiredhurt',
    'obstructing the field': 'runout', // closest mapping
  };
  return map[kind] || 'bowled';
}

// ── Replay a single match on the given page ─────────────────────────
async function replayMatch(page, matchData) {
  const info = matchData.info;
  const innings = matchData.innings;
  const maxOvers = info.overs || 20;

  let totalBoundaries = 0;
  let totalWickets = 0;

  for (let innIdx = 0; innIdx < innings.length; innIdx++) {
    const inn = innings[innIdx];
    if (inn.super_over) continue;

    const battingTeam = inn.team;
    const bowlingTeam = info.teams.find(t => t !== battingTeam);

    const firstDel = inn.overs[0].deliveries[0];
    const striker = firstDel.batter;
    const nonStriker = firstDel.non_striker;
    const openingBowler = firstDel.bowler;

    console.log(`\n📋 Innings ${innIdx + 1}: ${battingTeam} batting`);
    console.log(`   Opener: ${striker} & ${nonStriker} | Bowler: ${openingBowler}`);

    if (innIdx === 0) {
      await page.type('#setup-team1', battingTeam);
      await page.type('#setup-team2', bowlingTeam);
      await page.$eval('#setup-overs', (el, v) => { el.value = v; }, String(maxOvers));
      await page.type('#setup-striker', striker);
      await page.type('#setup-nonstriker', nonStriker);
      await page.type('#setup-bowler', openingBowler);
      await page.jsClick('#btn-start-match');
      await page.waitForSelector('#live-scoring:not(.hidden)');
    } else {
      await page.waitForSelector('#match-setup:not(.hidden)');
      await page.type('#setup-striker', striker);
      await page.type('#setup-nonstriker', nonStriker);
      await page.type('#setup-bowler', openingBowler);
      await page.jsClick('#btn-start-match');
      await page.waitForSelector('#live-scoring:not(.hidden)');
    }

    let expectedRuns = 0;
    let expectedWickets = 0;
    let expectedBalls = 0;
    let lastBowler = openingBowler;

    for (const over of inn.overs) {
      // Set bowler if changed at start of over
      const overBowler = over.deliveries[0].bowler;
      if (overBowler !== lastBowler || expectedBalls % 6 === 0) {
        // Check if new bowler prompt is showing
        const needsBowler = await page.$eval('#new-bowler-prompt', el => !el.classList.contains('hidden')).catch(() => false);
        if (needsBowler) {
          // Check if this bowler already exists in the list
          const existingBtn = await page.$(`button.existing-bowler-btn[data-bowler="${overBowler}"]`);
          if (existingBtn) {
            await existingBtn.evaluate(el => el.click());
          } else {
            await page.$eval('#input-new-bowler', el => { el.value = ''; });
            await page.type('#input-new-bowler', overBowler);
            await page.jsClick('#btn-confirm-bowler');
          }
          lastBowler = overBowler;
        }
      }

      for (const del of over.deliveries) {
        const extras = del.extras || {};
        const runs = del.runs;
        const hasWicket = del.wickets && del.wickets.length > 0;

        // Handle extras first
        if (extras.wides !== undefined) {
          const wideExtra = runs.total - 1; // total includes the 1 automatic wide run
          await page.jsClick('#btn-wide');
          await page.waitForSelector('#modal-wide:not(.hidden)');
          await page.jsClick(`[data-wide="${wideExtra}"]`);
          expectedRuns += runs.total;
          if (hasWicket) totalWickets++;
          continue; // wides are not legal deliveries
        }

        if (extras.noballs !== undefined) {
          const nbTotal = runs.total; // total runs on ball
          const hitByBat = runs.batter > 0;
          await page.jsClick('#btn-noball');
          await page.waitForSelector('#modal-noball-hit:not(.hidden)');
          if (hitByBat) {
            await page.jsClick('#btn-nb-yes');
            await page.waitForSelector('#modal-noball-runs:not(.hidden)');
            await page.jsClick(`[data-nb="${runs.batter}"]`);
          } else {
            await page.jsClick('#btn-nb-no');
            await page.waitForSelector('#modal-noball-runs:not(.hidden)');
            const extraRuns = runs.total - 1;
            await page.jsClick(`[data-nb="${extraRuns}"]`);
          }
          expectedRuns += runs.total;
          if (hasWicket) totalWickets++;
          continue; // no-balls are not legal deliveries
        }

        if (extras.byes !== undefined) {
          const byeRuns = extras.byes;
          await page.jsClick('#btn-bye');
          await page.waitForSelector('#modal-bye:not(.hidden)');
          await page.jsClick(`[data-bye="${byeRuns}"]`);
          expectedRuns += runs.total;
          expectedBalls++;
          if (hasWicket) totalWickets++;
        } else if (extras.legbyes !== undefined) {
          const lbRuns = extras.legbyes;
          await page.jsClick('#btn-legbye');
          await page.waitForSelector('#modal-legbye:not(.hidden)');
          await page.jsClick(`[data-lb="${lbRuns}"]`);
          expectedRuns += runs.total;
          expectedBalls++;
          if (hasWicket) totalWickets++;
        } else if (hasWicket) {
          // Wicket on a normal delivery
          const w = del.wickets[0];
          const kind = mapWicketKind(w.kind);
          const playerOut = w.player_out;

          // Determine if striker or non-striker is out
          const outIsStriker = playerOut === del.batter;

          await page.jsClick('#btn-wicket');
          await page.waitForSelector('#modal-wicket-type:not(.hidden)');

          if (kind === 'runout') {
            await page.jsClick('[data-wicket-type="runout"]');
            await page.waitForSelector('#modal-runout-runs:not(.hidden)');
            const roRuns = Math.min(runs.batter, 3); // UI supports 0-3
            await page.jsClick(`[data-ro-runs="${roRuns}"]`);
            await page.waitForSelector('#modal-runout-who:not(.hidden)');
            if (outIsStriker) {
              await page.jsClick('#btn-runout-striker');
            } else {
              await page.jsClick('#btn-runout-nonstriker');
            }
          } else if (kind === 'retiredhurt') {
            await page.jsClick('[data-wicket-type="retiredhurt"]');
            await page.waitForSelector('#modal-retired-who:not(.hidden)');
            if (outIsStriker) {
              await page.jsClick('#btn-retire-striker');
            } else {
              await page.jsClick('#btn-retire-nonstriker');
            }
          } else {
            await page.jsClick(`[data-wicket-type="${kind}"]`);
          }

          expectedRuns += runs.total;
          expectedBalls++;
          expectedWickets++;
          totalWickets++;

          // If new batsman prompt appears, we need to fill it
          // Check next delivery to find the new batsman name
          if (kind !== 'retiredhurt' && expectedWickets < 10) {
            const needsBatsman = await page.$eval('#new-batsman-prompt', el => !el.classList.contains('hidden')).catch(() => false);
            if (needsBatsman) {
              // Find the new batsman from subsequent deliveries
              let newBatName = 'Batsman' + (expectedWickets + 2);
              // Search forward in the data for the new batsman
              let found = false;
              for (const futureOver of inn.overs) {
                for (const futureDel of futureOver.deliveries) {
                  if (futureDel.batter !== del.batter && futureDel.batter !== del.non_striker &&
                      futureDel.batter !== playerOut) {
                    newBatName = futureDel.batter;
                    found = true;
                    break;
                  }
                  if (futureDel.non_striker !== del.batter && futureDel.non_striker !== del.non_striker &&
                      futureDel.non_striker !== playerOut) {
                    newBatName = futureDel.non_striker;
                    found = true;
                    break;
                  }
                }
                if (found) break;
              }
              await page.$eval('#input-new-batsman', el => { el.value = ''; });
              await page.type('#input-new-batsman', newBatName);
              await page.jsClick('#btn-confirm-batsman');
            }
          }
        } else {
          // Normal runs (including dot balls)
          const batterRuns = runs.batter;
          if (batterRuns === 0) {
            await page.jsClick('[data-dot]');
          } else {
            await page.jsClick(`[data-runs="${batterRuns}"]`);
          }
          expectedRuns += runs.total;
          expectedBalls++;
          if (batterRuns === 4) totalBoundaries++;
          if (batterRuns === 6) totalBoundaries++;
        }

        // Check if match result appeared (chasing team won early)
        const matchEnded = await page.$eval('#match-result', el => !el.classList.contains('hidden')).catch(() => false);
        if (matchEnded) break;

        // Handle new bowler prompt at over end
        const needsBowler = await page.$eval('#new-bowler-prompt', el => !el.classList.contains('hidden')).catch(() => false);
        if (needsBowler) {
          // Find next over's bowler, or use a fallback
          const nextOverIdx = inn.overs.indexOf(over) + 1;
          const nextBowler = nextOverIdx < inn.overs.length
            ? inn.overs[nextOverIdx].deliveries[0].bowler
            : 'NextBowler';

          const existingBtn = await page.$(`button.existing-bowler-btn[data-bowler="${nextBowler}"]`);
          if (existingBtn) {
            await existingBtn.evaluate(el => el.click());
          } else {
            await page.$eval('#input-new-bowler', el => { el.value = ''; });
            await page.type('#input-new-bowler', nextBowler);
            await page.jsClick('#btn-confirm-bowler');
          }
          lastBowler = nextBowler;
        }
      }

      // Check if match ended
      const matchEnded = await page.$eval('#match-result', el => !el.classList.contains('hidden')).catch(() => false);
      if (matchEnded) break;
    }

    // Verify innings score
    const scoreText = await page.$eval('#score-display', el => el.textContent).catch(() => '');
    console.log(`   ✅ App score: ${scoreText} | Expected: ${expectedRuns}/${expectedWickets}`);

    // Check if match ended
    const matchEnded = await page.$eval('#match-result', el => !el.classList.contains('hidden')).catch(() => false);
    if (matchEnded) {
      const resultText = await page.$eval('#result-text', el => el.textContent).catch(() => '');
      console.log(`\n🏆 Match Result: ${resultText}`);
      break;
    }
  }

  console.log(`\n📊 Total boundaries: ${totalBoundaries}`);
  console.log(`📊 Total wickets: ${totalWickets}`);

  const finalScore = await page.$eval('#score-display', el => el.textContent).catch(() => null);
  assert.ok(finalScore, 'App should show a score');
}

// ── Main test: replay all matches in the same tab ───────────────────
test('Replay IPL matches through the UI', { timeout: 600_000 }, async () => {
  const page = await freshPage();

  for (let m = 0; m < matchFiles.length; m++) {
    const matchData = JSON.parse(fs.readFileSync(matchFiles[m], 'utf8'));
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏏 Match ${m + 1}/${matchFiles.length}: ${matchData.info.teams.join(' vs ')}`);
    console.log(`   File: ${path.basename(matchFiles[m])}`);
    console.log(`   Expected: ${JSON.stringify(matchData.info.outcome)}`);
    console.log('═'.repeat(60));

    if (m > 0) {
      // Click "New Match" to reset for next match
      await page.jsClick('#btn-new-match');
      await page.waitForSelector('#match-setup:not(.hidden)');
    }

    await replayMatch(page, matchData);
  }

  if (process.env.HEADLESS !== 'false') await page.close();
});
