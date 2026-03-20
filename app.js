// ==================== SCORING ENGINE ====================
class ScoringEngine {
  constructor() {
    this.state = this._freshState();
    this.stateHistory = [];
  }
  _freshState() {
    return {
      runs:0, wickets:0, balls:0, currentInning:1,
      inning1Runs:0, inning1Wickets:0, hasInning1Score:false, inning1Balls:0,
      inning1BatsmenList:[], inning1BowlersList:[],
      inning1Byes:0, inning1LegByes:0, inning1Wides:0, inning1NoBalls:0,
      matchResult:null, maxOvers:null, history:[],
      striker:null, nonStriker:null, currentBowler:null,
      batsmenList:[], bowlersList:[], matchStarted:false,
      byes:0, legByes:0, totalWides:0, totalNoBalls:0,
      team1Name:'Team 1', team2Name:'Team 2'
    };
  }
  _dc(o){return JSON.parse(JSON.stringify(o))}
  _save(){this.stateHistory.push(this._dc(this.state))}

  // Getters
  get oversDisplay(){return Math.floor(this.state.balls/6)+'.'+this.state.balls%6}
  get targetScore(){return this.state.hasInning1Score?this.state.inning1Runs+1:null}
  get isScoringAllowed(){
    if(this.state.matchResult!==null)return false;
    if(this.state.maxOvers&&this.state.balls>=this.state.maxOvers*6)return false;
    return this.state.matchStarted;
  }
  get canDeclare(){return this.state.currentInning===1&&this.state.balls>0&&this.state.balls%6===0}
  get canTakeWicket(){return this.isScoringAllowed&&this.state.wickets<10}
  get needsNewBatsman(){return this.state.matchStarted&&(!this.state.striker||!this.state.nonStriker)&&this.state.wickets<10}
  get needsNewBowler(){return this.state.matchStarted&&!this.state.currentBowler}
  get legalBallsInOver(){return this.state.balls%6}
  get ballsRemaining(){return 6-this.legalBallsInOver}
  get fieldingExtras(){return this.state.byes+this.state.legByes}
  get bowlingExtras(){return this.state.totalWides+this.state.totalNoBalls}
  get totalExtras(){return this.fieldingExtras+this.bowlingExtras}
  get inning1FieldingExtras(){return this.state.inning1Byes+this.state.inning1LegByes}
  get inning1BowlingExtras(){return this.state.inning1Wides+this.state.inning1NoBalls}
  get inning1TotalExtras(){return this.inning1FieldingExtras+this.inning1BowlingExtras}
  get inning1OversDisplay(){return Math.floor(this.state.inning1Balls/6)+'.'+this.state.inning1Balls%6}

  get team1Nrr(){
    const s=this.state;
    if(s.currentInning!==2||!s.hasInning1Score||s.inning1Balls===0||s.balls===0||!s.maxOvers)return null;
    const allotted=s.maxOvers;
    const t1Overs=s.inning1Wickets>=10?allotted:s.inning1Balls/6;
    const t2Overs=s.wickets>=10?allotted:s.balls/6;
    if(t1Overs===0||t2Overs===0)return null;
    return s.inning1Runs/t1Overs-s.runs/t2Overs;
  }
  get team2Nrr(){const n=this.team1Nrr;return n===null?null:-n}

  get currentOverEvents(){
    const h=this.state.history, needed=this.legalBallsInOver;
    let legal=0, start=h.length;
    for(let i=h.length-1;i>=0;i--){
      if(h[i].type!=='wide'&&h[i].type!=='noBall')legal++;
      if(legal===needed){start=i;if(needed>0)break}
    }
    if(legal<needed)start=0;
    while(start>0){const p=h[start-1];if(p.type==='wide'||p.type==='noBall')start--;else break}
    return h.slice(start);
  }

  // Actions
  startMatch(t1,t2,striker,nonStriker,bowler){
    const b1={name:striker,runs:0,ballsFaced:0,fours:0,sixes:0,isOut:false};
    const b2={name:nonStriker,runs:0,ballsFaced:0,fours:0,sixes:0,isOut:false};
    const bw={name:bowler,runsConceded:0,ballsBowled:0,wicketsTaken:0,wides:0,noBalls:0,maidens:0};
    this.state=this._freshState();
    Object.assign(this.state,{striker:b1,nonStriker:b2,currentBowler:bw,batsmenList:[this._dc(b1),this._dc(b2)],bowlersList:[this._dc(bw)],matchStarted:true,team1Name:t1||'Team 1',team2Name:t2||'Team 2'});
  }

  swapStrike(){const t=this.state.striker;this.state.striker=this.state.nonStriker;this.state.nonStriker=t}

  setNewBatsman(name){
    const nb={name,runs:0,ballsFaced:0,fours:0,sixes:0,isOut:false};
    this.state.batsmenList.push(this._dc(nb));
    if(!this.state.striker)this.state.striker=this._dc(nb);
    else this.state.nonStriker=this._dc(nb);
  }

  setNewBowler(name){
    const ex=this.state.bowlersList.find(b=>b.name===name);
    if(ex)this.state.currentBowler=this._dc(ex);
    else{const bw={name,runsConceded:0,ballsBowled:0,wicketsTaken:0,wides:0,noBalls:0,maidens:0};this.state.bowlersList.push(this._dc(bw));this.state.currentBowler=this._dc(bw)}
  }

  addRuns(r){
    if(!this.isScoringAllowed||!this.state.striker||!this.state.currentBowler)return;
    this._save();
    const s=this.state, str=s.striker, bw=s.currentBowler;
    str.runs+=r;str.ballsFaced++;if(r===4)str.fours++;if(r===6)str.sixes++;
    bw.runsConceded+=r;bw.ballsBowled++;
    s.runs+=r;s.balls++;s.history.push({type:'runs',value:r});
    const isOverEnd=s.balls%6===0, shouldSwap=r%2===1, finalSwap=shouldSwap!==isOverEnd;
    if(isOverEnd)this._applyMaiden(bw,{type:'runs',value:r});
    this._syncLists(str,bw);
    if(finalSwap){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t}
    if(isOverEnd)s.currentBowler=null;
    this._checkForWinner();
  }

  dotBall(){
    if(!this.isScoringAllowed||!this.state.striker||!this.state.currentBowler)return;
    this._save();
    const s=this.state, str=s.striker, bw=s.currentBowler;
    str.ballsFaced++;bw.ballsBowled++;
    s.balls++;s.history.push({type:'dot'});
    const isOverEnd=s.balls%6===0;
    if(isOverEnd)this._applyMaiden(bw,{type:'dot'});
    this._syncLists(str,bw);
    if(isOverEnd){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t;s.currentBowler=null}
    this._checkForWinner();
  }

  bye(runs){
    if(!this.isScoringAllowed||!this.state.striker||!this.state.currentBowler)return;
    this._save();
    const s=this.state, str=s.striker, bw=s.currentBowler;
    str.ballsFaced++;bw.ballsBowled++;
    s.runs+=runs;s.balls++;s.byes+=runs;s.history.push({type:'bye',value:runs});
    const isOverEnd=s.balls%6===0, shouldSwap=runs%2===1, finalSwap=shouldSwap!==isOverEnd;
    if(isOverEnd)this._applyMaiden(bw,{type:'bye',value:runs});
    this._syncLists(str,bw);
    if(finalSwap){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t}
    if(isOverEnd)s.currentBowler=null;
    this._checkForWinner();
  }

  legBye(runs){
    if(!this.isScoringAllowed||!this.state.striker||!this.state.currentBowler)return;
    this._save();
    const s=this.state, str=s.striker, bw=s.currentBowler;
    str.ballsFaced++;bw.ballsBowled++;
    s.runs+=runs;s.balls++;s.legByes+=runs;s.history.push({type:'legBye',value:runs});
    const isOverEnd=s.balls%6===0, shouldSwap=runs%2===1, finalSwap=shouldSwap!==isOverEnd;
    if(isOverEnd)this._applyMaiden(bw,{type:'legBye',value:runs});
    this._syncLists(str,bw);
    if(finalSwap){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t}
    if(isOverEnd)s.currentBowler=null;
    this._checkForWinner();
  }

  wicket(dismissalType,outBatsman,runOutRuns){
    // dismissalType: 'bowled','caught','lbw','runout'
    // outBatsman: 'striker' or 'nonStriker' (only used for runout)
    // runOutRuns: number of completed runs before run out (only for runout)
    if(!this.canTakeWicket||!this.state.striker||!this.state.currentBowler)return;
    this._save();
    const s=this.state, str=s.striker, bw=s.currentBowler;
    const isRunOut=dismissalType==='runout';
    const outIsStriker=!isRunOut||outBatsman==='striker';
    const dismissed=outIsStriker?str:s.nonStriker;
    dismissed.isOut=true;
    const roRuns=isRunOut&&runOutRuns?runOutRuns:0;
    if(roRuns>0){str.runs+=roRuns;if(roRuns===4)str.fours++;if(roRuns===6)str.sixes++;s.runs+=roRuns;bw.runsConceded+=roRuns}
    str.ballsFaced++;bw.ballsBowled++;if(!isRunOut)bw.wicketsTaken++;
    s.wickets++;s.balls++;s.history.push({type:'wicket',dismissal:dismissalType,outBatsman:outIsStriker?'striker':'nonStriker',runOutRuns:roRuns});
    this._syncLists(str,bw);
    if(isRunOut&&!outIsStriker)this._syncBatsman(s.nonStriker);

    if(s.wickets===10&&s.currentInning===1){
      const overs=Math.ceil(s.balls/6);
      this._applyMaiden(bw,{type:'wicket'});
      this._syncLists(str,bw);
      const saved={inning1Runs:s.runs,inning1Wickets:s.wickets,inning1Balls:s.balls,
        inning1BatsmenList:this._dc(s.batsmenList),inning1BowlersList:this._dc(s.bowlersList),
        inning1Byes:s.byes,inning1LegByes:s.legByes,inning1Wides:s.totalWides,inning1NoBalls:s.totalNoBalls,
        team1Name:s.team1Name,team2Name:s.team2Name};
      this.state=this._freshState();
      Object.assign(this.state,saved,{currentInning:2,hasInning1Score:true,maxOvers:overs});
      return;
    }
    // Swap strike for completed odd runs before removing dismissed batsman
    if(isRunOut&&roRuns%2===1){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t}
    const isOverEnd=s.balls%6===0;
    if(isOverEnd){this._applyMaiden(bw,{type:'wicket'});this._syncLists(str,bw)}
    // Determine who is out after any swap
    const strikerIsOut=s.striker&&s.striker.isOut;
    const nonStrikerIsOut=s.nonStriker&&s.nonStriker.isOut;
    if(isOverEnd){
      if(strikerIsOut){s.striker=s.nonStriker;s.nonStriker=null}
      else if(nonStrikerIsOut){s.nonStriker=null}
      else{const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t;/* normal over-end swap */}
      s.currentBowler=null;
    } else {
      if(strikerIsOut){s.striker=null}
      else if(nonStrikerIsOut){s.nonStriker=null}
    }
    this._checkForWinner();
  }

  wideRuns(extra){
    if(!this.isScoringAllowed||!this.state.currentBowler)return;
    this._save();
    const s=this.state, bw=s.currentBowler;
    bw.runsConceded+=extra;bw.wides++;
    s.runs+=extra;s.totalWides+=extra;s.history.push({type:'wide',value:extra});
    this._syncBowler(bw);
    if((extra-1)%2===1){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t}
    this._checkForWinner();
  }

  noBallRuns(extra,hitByBat){
    if(!this.isScoringAllowed||!this.state.currentBowler||!this.state.striker)return;
    this._save();
    const s=this.state, bw=s.currentBowler, str=s.striker;
    bw.runsConceded+=extra;bw.noBalls++;
    if(hitByBat){const br=extra-1;str.runs+=br;str.ballsFaced++;if(br===4)str.fours++;if(br===6)str.sixes++;this._syncBatsman(str)}
    s.runs+=extra;s.totalNoBalls++;s.history.push({type:'noBall',value:extra,hitByBat});
    this._syncBowler(bw);
    if((extra-1)%2===1){const t=s.striker;s.striker=s.nonStriker;s.nonStriker=t}
    this._checkForWinner();
  }

  declareInning(){
    if(!this.canDeclare)return;
    const s=this.state;
    const saved={inning1Runs:s.runs,inning1Wickets:s.wickets,inning1Balls:s.balls,
      inning1BatsmenList:this._dc(s.batsmenList),inning1BowlersList:this._dc(s.bowlersList),
      inning1Byes:s.byes,inning1LegByes:s.legByes,inning1Wides:s.totalWides,inning1NoBalls:s.totalNoBalls,
      team1Name:s.team1Name,team2Name:s.team2Name};
    this.state=this._freshState();
    Object.assign(this.state,saved,{currentInning:2,hasInning1Score:true,maxOvers:saved.inning1Balls/6});
  }

  startSecondInning(striker,nonStriker,bowler){
    const b1={name:striker,runs:0,ballsFaced:0,fours:0,sixes:0,isOut:false};
    const b2={name:nonStriker,runs:0,ballsFaced:0,fours:0,sixes:0,isOut:false};
    const bw={name:bowler,runsConceded:0,ballsBowled:0,wicketsTaken:0,wides:0,noBalls:0,maidens:0};
    const s=this.state;
    s.striker=b1;s.nonStriker=b2;s.currentBowler=bw;
    s.batsmenList=[this._dc(b1),this._dc(b2)];s.bowlersList=[this._dc(bw)];s.matchStarted=true;
  }

  undoLastBall(){
    const prev=this.stateHistory.pop();
    if(prev)this.state=prev;
  }

  reset(){this.state=this._freshState();this.stateHistory=[]}

  // Private helpers
  _syncLists(str,bw){
    const s=this.state;
    s.batsmenList=s.batsmenList.map(b=>b.name===str.name?this._dc(str):b);
    s.bowlersList=s.bowlersList.map(b=>b.name===bw.name?this._dc(bw):b);
  }
  _syncBatsman(str){this.state.batsmenList=this.state.batsmenList.map(b=>b.name===str.name?this._dc(str):b)}
  _syncBowler(bw){this.state.bowlersList=this.state.bowlersList.map(b=>b.name===bw.name?this._dc(bw):b)}

  _applyMaiden(bw,action){
    if(bw.ballsBowled%6!==0)return;
    const full=[...this.state.history];
    // history already has this ball pushed; the action param matches last entry
    let legal=0,first=full.length;
    for(let i=full.length-1;i>=0;i--){
      if(full[i].type!=='wide'&&full[i].type!=='noBall')legal++;
      if(legal===6){first=i;break}
    }
    let start=first;
    while(start>0){const p=full[start-1];if(p.type==='wide'||p.type==='noBall')start--;else break}
    const events=full.slice(start);
    if(events.some(e=>e.type==='wide'||e.type==='noBall'))return;
    const runsOff=events.reduce((t,e)=>e.type==='runs'?t+e.value:t,0);
    if(runsOff===0)bw.maidens++;
  }

  _checkForWinner(){
    const s=this.state;
    if(s.currentInning!==2||!this.targetScore)return;
    const target=this.targetScore;
    if(s.runs>=target){s.matchResult=s.team2Name+' won by '+(10-s.wickets)+' wickets!';return}
    const maxReached=s.maxOvers&&s.balls>=s.maxOvers*6;
    if(s.wickets===10||maxReached){
      const need=target-s.runs;
      if(need===1)s.matchResult='Match Drawn!';
      else if(need>1)s.matchResult=s.team1Name+' won by '+(need-1)+' runs!';
      else s.matchResult=s.team2Name+' won!';
    }
  }
}

// ==================== UI ====================
const engine = new ScoringEngine();
let noBallHitByBat = false;

function $(id){return document.getElementById(id)}
function show(id){$(id).classList.remove('hidden')}
function hide(id){$(id).classList.add('hidden')}
function showModal(id){$(id).style.display='flex';$(id).classList.remove('hidden')}
function hideModal(id){$(id).style.display='';$(id).classList.add('hidden')}
function buzz(ms){if(navigator.vibrate)navigator.vibrate(ms||15)}

function render(){
  const s=engine.state, e=engine;

  // Header info
  if(s.matchStarted){
    hide('header-title');show('header-matchup');show('header-batting-label');
    $('header-matchup').textContent=s.team1Name+' vs '+s.team2Name;
    const battingTeam=s.currentInning===1?s.team1Name:s.team2Name;
    $('header-batting-label').textContent=battingTeam+' - Batting - Inning '+s.currentInning;
  } else {
    show('header-title');hide('header-matchup');hide('header-batting-label');
  }

  // Section visibility
  if(!s.matchStarted&&!s.matchResult){
    show('match-setup');hide('live-scoring');hide('match-result');
    if(s.currentInning===2){
      $('setup-title').textContent='2nd Innings Setup';
      $('setup-team-fields').classList.add('hidden');
    } else {
      $('setup-title').textContent='Match Setup';
      $('setup-team-fields').classList.remove('hidden');
    }
    return;
  }
  if(s.matchResult){
    hide('match-setup');hide('live-scoring');show('match-result');
    $('result-text').textContent=s.matchResult;
    return;
  }
  hide('match-setup');show('live-scoring');hide('match-result');

  // Prompts
  if(e.needsNewBatsman){show('new-batsman-prompt');$('input-new-batsman').value=''}else hide('new-batsman-prompt');
  if(e.needsNewBowler){
    show('new-bowler-prompt');$('input-new-bowler').value='';
    const list=$('existing-bowlers-list');list.innerHTML='';
    if(s.bowlersList.length>0){
      const lbl=document.createElement('p');lbl.textContent='Or select previous bowler:';lbl.style.fontSize='.8rem';lbl.style.color='#5a6a7a';lbl.style.margin='6px 0 4px';list.appendChild(lbl);
      s.bowlersList.forEach(b=>{
        const btn=document.createElement('button');btn.className='btn btn-outline existing-bowler-btn';btn.textContent=b.name;
        btn.onclick=()=>{engine.setNewBowler(b.name);render()};list.appendChild(btn);
      });
    }
    if(e.canDeclare)show('btn-declare-from-bowler');else hide('btn-declare-from-bowler');
  } else hide('new-bowler-prompt');

  // Score card
  $('score-display').textContent=s.runs+'/'+s.wickets;
  const oText=s.currentInning===2&&s.maxOvers?'Overs: '+e.oversDisplay+' / '+s.maxOvers:'Overs: '+e.oversDisplay;
  $('overs-display').textContent=oText;

  let chaseHTML='';
  if(s.currentInning===2&&e.targetScore){
    chaseHTML+='<span class="chase-badge badge-target">Target: '+e.targetScore+'</span>';
    const need=e.targetScore-s.runs;
    if(need>0){
      const totalBalls=s.maxOvers?s.maxOvers*6:null;
      const left=totalBalls?totalBalls-s.balls:null;
      const txt=left!==null?'Need '+need+' off '+left+' ball'+(left!==1?'s':''):'Need '+need+' runs';
      chaseHTML+='<span class="chase-badge badge-needed">'+txt+'</span>';
    }
  }
  $('chase-info').innerHTML=chaseHTML;

  // Scoring buttons
  document.querySelectorAll('#scoring-buttons .btn').forEach(b=>b.disabled=!e.isScoringAllowed);
  $('btn-wicket').disabled=!e.canTakeWicket;
  $('btn-wide').disabled=!e.isScoringAllowed;
  $('btn-noball').disabled=!e.isScoringAllowed;
  $('btn-bye').disabled=!e.isScoringAllowed;
  $('btn-legbye').disabled=!e.isScoringAllowed;
  $('btn-declare').disabled=!e.canDeclare;

  // Over summary
  const overNum=Math.floor(s.balls/6);
  $('over-title').textContent='Over '+(overNum+1);
  $('over-balls-remaining').textContent=e.ballsRemaining+' ball'+(e.ballsRemaining!==1?'s':'')+' remaining';
  const chips=$('over-chips');chips.innerHTML='';
  const events=e.currentOverEvents;
  events.forEach(ev=>{
    const d=document.createElement('div');d.className='ball-chip ';
    switch(ev.type){
      case 'dot':d.classList.add('chip-dot');d.textContent='0';break;
      case 'runs':d.classList.add(ev.value===4?'chip-four':ev.value===6?'chip-six':'chip-runs');d.textContent=ev.value;break;
      case 'wicket':d.classList.add('chip-wicket');d.textContent='W';break;
      case 'wide':d.classList.add('chip-wide');d.textContent=ev.value>1?'Wd+'+(ev.value-1):'Wd';break;
      case 'noBall':d.classList.add('chip-noball');d.textContent=ev.value>1?'Nb+'+(ev.value-1):'Nb';break;
      case 'bye':d.classList.add('chip-bye');d.textContent='B'+ev.value;break;
      case 'legBye':d.classList.add('chip-legbye');d.textContent='Lb'+ev.value;break;
    }
    chips.appendChild(d);
  });
  for(let i=0;i<e.ballsRemaining;i++){const d=document.createElement('div');d.className='ball-chip chip-pending';d.textContent='•';chips.appendChild(d)}
  const overRuns=events.reduce((t,ev)=>{
    if(ev.type==='runs')return t+ev.value;if(ev.type==='wide'||ev.type==='noBall')return t+ev.value;
    if(ev.type==='bye'||ev.type==='legBye')return t+ev.value;return t;
  },0);
  $('over-runs').textContent='This over: '+overRuns+' runs';

  // Batting table
  const batTb=$('batting-table').querySelector('tbody');batTb.innerHTML='';
  if(s.striker){const tr=batRow(s.striker,true);batTb.appendChild(tr)}
  if(s.nonStriker){const tr=batRow(s.nonStriker,false);batTb.appendChild(tr)}
  $('btn-swap').style.display=s.striker&&s.nonStriker?'':'none';

  // Bowling table
  const bowlTb=$('bowling-table').querySelector('tbody');bowlTb.innerHTML='';
  if(s.currentBowler){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+s.currentBowler.name+'</td><td>'+Math.floor(s.currentBowler.ballsBowled/6)+'.'+s.currentBowler.ballsBowled%6+'</td><td>'+s.currentBowler.maidens+'</td><td>'+s.currentBowler.runsConceded+'</td><td>'+s.currentBowler.wicketsTaken+'</td><td>'+(s.currentBowler.ballsBowled>0?(s.currentBowler.runsConceded*6/s.currentBowler.ballsBowled).toFixed(1):'0.0')+'</td>';
    bowlTb.appendChild(tr);
  }
}

function batRow(b,isStriker){
  const tr=document.createElement('tr');if(isStriker)tr.className='is-striker';
  const sr=b.ballsFaced>0?(b.runs*100/b.ballsFaced).toFixed(1):'0.0';
  tr.innerHTML='<td>'+(isStriker?b.name+' *':b.name)+'</td><td>'+b.runs+'</td><td>'+b.ballsFaced+'</td><td>'+b.fours+'</td><td>'+b.sixes+'</td><td>'+sr+'</td>';
  return tr;
}

function renderSummary(){
  const s=engine.state, e=engine;
  const both=s.currentInning===2&&s.inning1BatsmenList.length>0;
  let h='';

  // Score box
  h+='<div class="summary-score-box">';
  if(both){
    h+='<div class="label">'+s.team1Name+' — 1st Innings</div>';
    h+='<div class="score">'+s.inning1Runs+'/'+s.inning1Wickets+'</div>';
    h+='<div class="overs">Overs: '+e.inning1OversDisplay+'</div><hr style="opacity:.2;margin:8px 0">';
    h+='<div class="label">'+s.team2Name+' — 2nd Innings</div>';
    h+='<div class="score">'+s.runs+'/'+s.wickets+'</div>';
    h+='<div class="overs">Overs: '+e.oversDisplay+'</div>';
  } else {
    const team=s.currentInning===1?s.team1Name:s.team2Name;
    h+='<div class="label">'+team+' — Inning '+s.currentInning+'</div>';
    h+='<div class="score">'+s.runs+'/'+s.wickets+'</div>';
    h+='<div class="overs">Overs: '+e.oversDisplay+'</div>';
  }
  h+='</div>';

  if(both){
    h+='<div class="summary-section-title">🏏 1st Innings — '+s.team1Name+'</div>';
    h+=inningsBatCard(s.inning1BatsmenList,null,null,s.inning1Runs,s.inning1Wickets,e.inning1OversDisplay,e.inning1TotalExtras,s.inning1Wides,s.inning1NoBalls,s.inning1Byes,s.inning1LegByes,true);
    h+='<div class="summary-section-title">🎯 Bowling</div>';
    h+=inningsBowlCard(s.inning1BowlersList);
    h+='<div class="summary-section-title">🏏 2nd Innings — '+s.team2Name+'</div>';
  } else {
    h+='<div class="summary-section-title">🏏 Batting</div>';
  }
  h+=inningsBatCard(s.batsmenList,s.striker,s.nonStriker,s.runs,s.wickets,e.oversDisplay,e.totalExtras,s.totalWides,s.totalNoBalls,s.byes,s.legByes,false);
  h+='<div class="summary-section-title">🎯 Bowling</div>';
  h+=inningsBowlCard(s.bowlersList);

  if(e.team1Nrr!==null){
    const fmt=n=>(n>=0?'+':'')+n.toFixed(3);
    h+='<div class="summary-section-title">📊 Net Run Rate</div><div class="summary-card">';
    h+='<div class="nrr-row"><span>'+s.team1Name+'</span><strong>'+fmt(e.team1Nrr)+'</strong></div>';
    h+='<div class="nrr-row"><span>'+s.team2Name+'</span><strong>'+fmt(e.team2Nrr)+'</strong></div></div>';
  }
  if(s.matchResult)h+='<div style="text-align:center;font-weight:700;font-size:1.1rem;margin-top:12px">'+s.matchResult+'</div>';
  $('summary-content').innerHTML=h;
}

function inningsBatCard(list,striker,nonStriker,runs,wk,overs,extras,wd,nb,b,lb,completed){
  let h='<div class="summary-card"><table class="summary-table"><thead><tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>';
  list.forEach(bat=>{
    const isStr=!completed&&striker&&bat.name===striker.name;
    const isNs=!completed&&nonStriker&&bat.name===nonStriker.name;
    let status='';if(isStr)status=' *';else if(isNs)status='';else if(bat.isOut)status=' (out)';else if(completed)status=' not out';
    const sr=bat.ballsFaced>0?(bat.runs*100/bat.ballsFaced).toFixed(1):'0.0';
    h+='<tr'+(isStr?' class="is-striker"':'')+'><td>'+bat.name+status+'</td><td><b>'+bat.runs+'</b></td><td>'+bat.ballsFaced+'</td><td>'+bat.fours+'</td><td>'+bat.sixes+'</td><td>'+sr+'</td></tr>';
  });
  h+='</tbody></table>';
  h+='<hr style="margin:6px 0;opacity:.2"><div style="font-size:.75rem"><b>Extras: '+extras+'</b></div>';
  h+='<div style="font-size:.8rem;font-weight:700">Total: '+runs+'/'+wk+' ('+overs+' ov)</div></div>';
  return h;
}

function inningsBowlCard(list){
  let h='<div class="summary-card"><table class="summary-table"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Eco</th></tr></thead><tbody>';
  list.forEach(b=>{
    const od=Math.floor(b.ballsBowled/6)+'.'+b.ballsBowled%6;
    const eco=b.ballsBowled>0?(b.runsConceded*6/b.ballsBowled).toFixed(1):'0.0';
    h+='<tr><td>'+b.name+'</td><td>'+od+'</td><td>'+b.maidens+'</td><td>'+b.runsConceded+'</td><td>'+b.wicketsTaken+'</td><td>'+eco+'</td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded',()=>{
  render();

  // Start match
  $('btn-start-match').onclick=()=>{
    const s=engine.state;
    const str=$('setup-striker').value.trim(), ns=$('setup-nonstriker').value.trim(), bw=$('setup-bowler').value.trim();
    if(!str||!ns||!bw)return;
    if(s.currentInning===2){
      engine.startSecondInning(str,ns,bw);
    } else {
      const t1=$('setup-team1').value.trim()||'Team 1', t2=$('setup-team2').value.trim()||'Team 2';
      engine.startMatch(t1,t2,str,ns,bw);
    }
    $('setup-striker').value='';$('setup-nonstriker').value='';$('setup-bowler').value='';
    $('setup-team1').value='';$('setup-team2').value='';
    render();
  };

  // Scoring buttons
  document.querySelectorAll('[data-runs]').forEach(btn=>{
    btn.onclick=()=>{buzz();engine.addRuns(parseInt(btn.dataset.runs));render()}
  });
  document.querySelector('[data-dot]').onclick=()=>{buzz();engine.dotBall();render()};

  // Wicket
  let runOutRunsScored=0;
  $('btn-wicket').onclick=()=>{buzz(30);showModal('modal-wicket-type')};
  document.querySelectorAll('[data-wicket-type]').forEach(btn=>{
    btn.onclick=()=>{
      const type=btn.dataset.wicketType;
      hideModal('modal-wicket-type');
      if(type==='runout'){
        showModal('modal-runout-runs');
      } else {
        engine.wicket(type,'striker');render();
      }
    }
  });
  document.querySelectorAll('[data-ro-runs]').forEach(btn=>{
    btn.onclick=()=>{
      runOutRunsScored=parseInt(btn.dataset.roRuns);
      hideModal('modal-runout-runs');
      const s=engine.state;
      $('btn-runout-striker').textContent=s.striker?s.striker.name+' (Striker)':'Striker';
      $('btn-runout-nonstriker').textContent=s.nonStriker?s.nonStriker.name+' (Non-Striker)':'Non-Striker';
      showModal('modal-runout-who');
    }
  });
  $('btn-runout-striker').onclick=()=>{hideModal('modal-runout-who');engine.wicket('runout','striker',runOutRunsScored);render()};
  $('btn-runout-nonstriker').onclick=()=>{hideModal('modal-runout-who');engine.wicket('runout','nonStriker',runOutRunsScored);render()};

  // Extras
  $('btn-wide').onclick=()=>showModal('modal-wide');
  document.querySelectorAll('[data-wide]').forEach(btn=>{
    btn.onclick=()=>{engine.wideRuns(1+parseInt(btn.dataset.wide));hideModal('modal-wide');render()}
  });

  $('btn-noball').onclick=()=>showModal('modal-noball-hit');
  $('btn-nb-yes').onclick=()=>{noBallHitByBat=true;hideModal('modal-noball-hit');$('nb-runs-subtitle').textContent='1 NB extra added. How many runs did the batsman score?';showModal('modal-noball-runs')};
  $('btn-nb-no').onclick=()=>{noBallHitByBat=false;hideModal('modal-noball-hit');$('nb-runs-subtitle').textContent='1 run added. How many additional runs?';showModal('modal-noball-runs')};
  document.querySelectorAll('[data-nb]').forEach(btn=>{
    btn.onclick=()=>{engine.noBallRuns(1+parseInt(btn.dataset.nb),noBallHitByBat);hideModal('modal-noball-runs');render()}
  });

  $('btn-bye').onclick=()=>showModal('modal-bye');
  document.querySelectorAll('[data-bye]').forEach(btn=>{
    btn.onclick=()=>{engine.bye(parseInt(btn.dataset.bye));hideModal('modal-bye');render()}
  });

  $('btn-legbye').onclick=()=>showModal('modal-legbye');
  document.querySelectorAll('[data-lb]').forEach(btn=>{
    btn.onclick=()=>{engine.legBye(parseInt(btn.dataset.lb));hideModal('modal-legbye');render()}
  });

  // Controls
  $('btn-undo').onclick=()=>{engine.undoLastBall();render()};
  $('btn-reset').onclick=()=>showModal('modal-reset');
  $('btn-reset-cancel').onclick=()=>hideModal('modal-reset');
  $('btn-reset-yes').onclick=()=>{engine.reset();hideModal('modal-reset');render()};
  $('btn-declare').onclick=()=>{engine.declareInning();render()};
  $('btn-declare-from-bowler').onclick=()=>{engine.declareInning();render()};

  // Swap
  $('btn-swap').onclick=()=>{engine.swapStrike();render()};

  // Summary
  $('btn-summary').onclick=()=>{renderSummary();showModal('modal-summary')};
  $('btn-result-summary').onclick=()=>{renderSummary();showModal('modal-summary')};
  $('btn-close-summary').onclick=()=>hideModal('modal-summary');
  $('btn-download-pdf').onclick=()=>{
    const s=engine.state, e=engine;
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF();
    const pw=doc.internal.pageSize.getWidth();
    let y=15;

    // Title
    doc.setFontSize(16);doc.setFont(undefined,'bold');
    doc.text(s.team1Name+' vs '+s.team2Name,pw/2,y,{align:'center'});y+=8;
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    doc.text('Match Summary',pw/2,y,{align:'center'});y+=10;

    const both=s.currentInning===2&&s.inning1BatsmenList.length>0;

    function addScoreLine(team,inning,runs,wk,overs){
      doc.setFontSize(11);doc.setFont(undefined,'bold');
      doc.text(team+' — '+inning,pw/2,y,{align:'center'});y+=6;
      doc.setFontSize(20);
      doc.text(''+runs+'/'+wk,pw/2,y,{align:'center'});y+=7;
      doc.setFontSize(9);doc.setFont(undefined,'normal');
      doc.text('Overs: '+overs,pw/2,y,{align:'center'});y+=8;
    }

    if(both){
      addScoreLine(s.team1Name,'1st Innings',s.inning1Runs,s.inning1Wickets,e.inning1OversDisplay);
      addScoreLine(s.team2Name,'2nd Innings',s.runs,s.wickets,e.oversDisplay);
    } else {
      const team=s.currentInning===1?s.team1Name:s.team2Name;
      addScoreLine(team,'Inning '+s.currentInning,s.runs,s.wickets,e.oversDisplay);
    }

    function addBatTable(title,list,striker,nonStriker,runs,wk,overs,extras,wd,nb,b,lb,completed){
      doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text(title,14,y);y+=2;
      const batRows=list.map(bat=>{
        const isStr=!completed&&striker&&bat.name===striker.name;
        const isNs=!completed&&nonStriker&&bat.name===nonStriker.name;
        let status='';if(isStr)status=' *';else if(isNs)status='';else if(bat.isOut)status=' (out)';else if(completed)status=' not out';
        const sr=bat.ballsFaced>0?(bat.runs*100/bat.ballsFaced).toFixed(1):'0.0';
        return [bat.name+status,bat.runs,bat.ballsFaced,bat.fours,bat.sixes,sr];
      });
      doc.autoTable({startY:y,head:[['Batsman','R','B','4s','6s','SR']],body:batRows,theme:'grid',
        headStyles:{fillColor:[26,115,232],fontSize:8},bodyStyles:{fontSize:8},margin:{left:14,right:14}});
      y=doc.lastAutoTable.finalY+3;
      doc.setFontSize(8);doc.setFont(undefined,'normal');
      doc.text('Extras: '+extras,14,y);y+=4;
      doc.setFont(undefined,'bold');
      doc.text('Total: '+runs+'/'+wk+' ('+overs+' ov)',14,y);y+=8;
      doc.setFont(undefined,'normal');
    }

    function addBowlTable(title,list){
      doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text(title,14,y);y+=2;
      const bowlRows=list.map(b=>{
        const od=Math.floor(b.ballsBowled/6)+'.'+b.ballsBowled%6;
        const eco=b.ballsBowled>0?(b.runsConceded*6/b.ballsBowled).toFixed(1):'0.0';
        return [b.name,od,b.maidens,b.runsConceded,b.wicketsTaken,eco];
      });
      doc.autoTable({startY:y,head:[['Bowler','O','M','R','W','Eco']],body:bowlRows,theme:'grid',
        headStyles:{fillColor:[26,115,232],fontSize:8},bodyStyles:{fontSize:8},margin:{left:14,right:14}});
      y=doc.lastAutoTable.finalY+8;
    }

    if(both){
      addBatTable('1st Innings — '+s.team1Name,s.inning1BatsmenList,null,null,s.inning1Runs,s.inning1Wickets,e.inning1OversDisplay,e.inning1TotalExtras,s.inning1Wides,s.inning1NoBalls,s.inning1Byes,s.inning1LegByes,true);
      addBowlTable('Bowling',s.inning1BowlersList);
      addBatTable('2nd Innings — '+s.team2Name,s.batsmenList,s.striker,s.nonStriker,s.runs,s.wickets,e.oversDisplay,e.totalExtras,s.totalWides,s.totalNoBalls,s.byes,s.legByes,false);
    } else {
      addBatTable('Batting',s.batsmenList,s.striker,s.nonStriker,s.runs,s.wickets,e.oversDisplay,e.totalExtras,s.totalWides,s.totalNoBalls,s.byes,s.legByes,false);
    }
    addBowlTable('Bowling',s.bowlersList);

    if(e.team1Nrr!==null){
      const fmt=n=>(n>=0?'+':'')+n.toFixed(3);
      doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text('Net Run Rate',14,y);y+=6;
      doc.setFontSize(9);doc.setFont(undefined,'normal');
      doc.text(s.team1Name+': '+fmt(e.team1Nrr),14,y);y+=5;
      doc.text(s.team2Name+': '+fmt(e.team2Nrr),14,y);y+=8;
    }
    if(s.matchResult){
      doc.setFontSize(12);doc.setFont(undefined,'bold');
      doc.text(s.matchResult,pw/2,y,{align:'center'});
    }

    const filename=(s.team1Name+' vs '+s.team2Name).replace(/[^a-zA-Z0-9 ]/g,'')+' - Match Summary.pdf';
    doc.save(filename);
  };

  // New match
  $('btn-new-match').onclick=()=>{engine.reset();render()};

  // New batsman
  $('btn-confirm-batsman').onclick=()=>{
    const n=$('input-new-batsman').value.trim();if(!n)return;
    engine.setNewBatsman(n);render();
  };

  // New bowler
  $('btn-confirm-bowler').onclick=()=>{
    const n=$('input-new-bowler').value.trim();if(!n)return;
    engine.setNewBowler(n);render();
  };

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.onclick=e=>{if(e.target===m)hideModal(m.id)}
  });
});
