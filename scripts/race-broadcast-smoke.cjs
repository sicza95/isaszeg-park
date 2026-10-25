const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const tempBase = path.resolve(__dirname,'../tmp');
  await fs.mkdir(tempBase,{recursive:true});
  const root = await fs.mkdtemp(path.join(tempBase,'broadcast-smoke-'));
  const errors = [], remote = [];
  const app = await electron.launch({args:[path.join(__dirname,'smoke-entry.cjs'),'--no-sandbox'],env:{...process.env,ISASZEG_SMOKE_HOME:root}});
  try {
    const desk=await app.firstWindow();
    await app.context().route(/^https?:/,route=>{remote.push(route.request().url());return route.abort();});
    desk.on('pageerror',error=>errors.push(error.message));
    await desk.waitForSelector('.queue-item');
    await expect(desk.locator('.race-jumps button')).toHaveCount(3);
    for(const section of ['racecard','replay','results'])await expect(desk.locator(`[data-jump="${section}"]`)).toBeVisible();
    await expect(desk.locator('[data-jump="results"]')).toBeDisabled();
    await expect.poll(()=>app.windows().some(window=>window.url().endsWith('display.html')),{timeout:15000}).toBe(true);
    const audience=app.windows().find(window=>window.url().endsWith('display.html'));
    assert.ok(audience); audience.on('pageerror',error=>errors.push(error.message));
    await audience.evaluate(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.effectiveDirective));});
    const {referenceMeeting}=await import('../src/shared/reference-219.mjs');
    await desk.evaluate(async registration=>{await window.replay.saveRegistration(registration);await window.replay.patchSettings({racecardSeconds:5});},referenceMeeting);
    const clip=process.env.ISASZEG_BROADCAST_CLIP || path.resolve(__dirname,'../test/fixtures/sample.mp4');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},clip);
    await desk.locator('#import-button').click();await desk.locator('#choose-files').click();await desk.locator('#confirm-import').click();
    await expect(desk.locator('#import-results')).toContainText('added to the loop');
    let state=await desk.evaluate(()=>window.replay.init());
    const item=state.meeting.items.find(item=>item.kind==='race'),row=desk.locator(`[data-item="${item.id}"]`);
    assert.equal(item.raceId,'source-1');
    await expect(row).toContainText('Race 01 · CGRC Trophy');await expect(row).toContainText('Linked race 01');
    await row.locator('[data-play]').first().click();
    await expect(desk.locator('#playing-mode')).toContainText('RACE CARD');
    await desk.locator('#play-pause').click();
    await expect(audience.locator('.racecard-mode')).toHaveCount(1);
    await expect(audience.locator('.racecard-details h2')).toHaveText('CGRC Trophy');
    await expect(audience.locator('.racecard-details .runner-status')).toHaveCount(0);
    await expect(audience.locator('.racecard-heading .broadcast-card-eyebrow')).toHaveText('RACE CARD');
    await expect(audience.locator('.racecard-footer')).toContainText('ISASZEG PARK');
    await expect(audience.locator('.racecard-footer')).toContainText('STARTING LINE-UP');
    await expect(audience.locator('.racecard-footer')).toContainText('REPLAY STARTS IN');
    await expect(audience.locator('.broadcast-entries-label')).not.toContainText('RACE CARD');
    await expect(audience.locator('.race-broadcast')).toContainText('275 m');
    await expect(audience.locator('.race-broadcast')).toContainText('S3');
    assert.equal(await audience.locator('video').evaluate(v=>v.paused),true);
    await expect(desk.locator('#seek')).toBeDisabled();
    await expect.poll(()=>audience.locator('.country-flag').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
    await expect(audience.locator('video')).toBeVisible();
    await expect.poll(()=>audience.locator('video').evaluate(v=>v.readyState>=2&&!v.seeking&&v.currentTime>.5)).toBe(true);
    const reverseStart=await audience.locator('video').evaluate(v=>v.currentTime);
    const cardProgress=await audience.locator('.stage').evaluate(stage=>stage.style.getPropertyValue('--racecard-progress'));
    await audience.waitForTimeout(150);
    assert.equal(await audience.locator('.stage').evaluate(stage=>stage.style.getPropertyValue('--racecard-progress')),cardProgress,'Pausing holds the card progress bar');
    assert.equal(await audience.locator('video').evaluate(v=>v.muted),true);
    await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});
    await audience.screenshot({path:path.join(__dirname,'../test-results/racecard.png')});
    await desk.screenshot({path:path.join(__dirname,'../test-results/linked-race-desk.png'),fullPage:true});
    await desk.locator('#play-pause').click();
    await expect.poll(()=>audience.locator('video').evaluate(v=>v.currentTime)).toBeLessThan(reverseStart-.25);
    await expect.poll(()=>audience.locator('.broadcast-entry').first().evaluate(row=>getComputedStyle(row).opacity),{intervals:[50]}).toBe('1');
    assert.equal(await audience.locator('.broadcast-entry').last().evaluate(row=>getComputedStyle(row).opacity),'0','Race-card runners reveal in trap order');
    await audience.screenshot({path:path.join(__dirname,'../test-results/racecard-reveal.png')});
    assert.ok(await audience.locator('.stage').evaluate(stage=>Number(stage.style.getPropertyValue('--racecard-progress')))>Number(cardProgress),'The card progress bar advances with its countdown');
    // currentTime changes when a seek is requested, even if its picture never
    // reaches the screen. Check actual compositor frames in a visible window.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('display.html')).show());
    await audience.bringToFront();
    const reverseFrames=await audience.locator('video').evaluate(video=>new Promise((resolve,reject)=>{
      const frames=[];let callback;
      const timeout=setTimeout(()=>{video.cancelVideoFrameCallback(callback);reject(new Error('Reverse preview did not present three moving frames'));},2500);
      const frame=(now,metadata)=>{
        if(!frames.length||metadata.mediaTime<frames.at(-1).time-.02)frames.push({at:now,time:metadata.mediaTime});
        if(frames.length===3){clearTimeout(timeout);resolve(frames);}
        else callback=video.requestVideoFrameCallback(frame);
      };
      callback=video.requestVideoFrameCallback(frame);
    }));
    assert.ok(reverseFrames[2].time<reverseFrames[0].time-.04,'Decoded frames move backwards');
    await desk.locator('#play-pause').click();
    await audience.keyboard.press('Enter');
    await expect(audience.locator('.racecard-exit')).toHaveCount(1);
    assert.equal(await audience.locator('video').evaluate(v=>v.paused),true,'Skipping a paused card retains pause');
    await desk.locator('#play-pause').click();
    await audience.waitForTimeout(350);
    const transition=await audience.locator('.stage').evaluate(stage=>({
      progress:Number(stage.style.getPropertyValue('--racecard-exit')),
      transform:getComputedStyle(stage.querySelector('.racecard-details')).transform,
      filter:getComputedStyle(stage.querySelector('video')).filter
    }));
    assert.ok(transition.progress>0&&transition.progress<1,'Transition progresses over its final second');
    assert.notEqual(transition.transform,'none');
    await audience.screenshot({path:path.join(__dirname,'../test-results/racecard-transition.png')});
    await expect(audience.locator('.replay-mode')).toHaveCount(1);
    await expect.poll(()=>audience.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(.5);
    await audience.waitForTimeout(800);
    await desk.locator('#play-pause').click();
    await expect(audience.locator('.replay-details')).toBeVisible();
    await expect(audience.locator('.replay-race-details')).toBeVisible();
    await expect(audience.locator('.replay-race-details h3')).toHaveText('CGRC Trophy');
    await expect(audience.locator('.replay-race-details')).toContainText('275 m');
    await expect(audience.locator('.racecard-details')).toBeHidden();
    await expect(audience.locator('.race-broadcast-tag')).toHaveCount(0);
    await expect(audience.locator('video')).toBeVisible();
    const geometry=await audience.locator('.stage').evaluate(stage=>{
      const video=stage.querySelector('video').getBoundingClientRect(),bounds=stage.getBoundingClientRect();
      return {full:video.width===bounds.width&&video.height===bounds.height,filter:getComputedStyle(stage.querySelector('video')).filter,background:getComputedStyle(stage.querySelector('.replay-details')).backgroundColor,headerBackground:getComputedStyle(stage.querySelector('.replay-race-details')).backgroundColor};
    });
    assert.equal(geometry.full,true);assert.equal(geometry.filter,'none');assert.equal(geometry.background,'rgba(0, 0, 0, 0)');
    assert.equal(geometry.headerBackground,'rgba(0, 0, 0, 0)');
    await expect(desk.locator('#preview .replay-details')).toBeVisible();
    await expect(audience.locator('.replay-details .broadcast-origin')).toHaveCount(0);
    await audience.screenshot({path:path.join(__dirname,'../test-results/race-replay-details.png')});
    // Enabling the sponsor footer during a paused race must preserve the
    // recording and keep both the video and runner overlays above the footer.
    const pausedTime=await audience.locator('video').evaluate(v=>v.currentTime);
    const sponsor=state.meeting.items.find(item=>item.kind==='ad');
    await desk.evaluate(async id=>{await window.replay.patchItem(id,{enabled:true});await window.replay.patchSettings({sponsorRail:true});},sponsor.id);
    await expect(audience.locator('.stage-rail')).toBeVisible();
    await expect(desk.locator('#preview .stage-rail')).toBeVisible();
    const footerLayout=await audience.locator('.stage').evaluate(stage=>{
      const video=stage.querySelector('video').getBoundingClientRect(),rail=stage.querySelector('.stage-rail').getBoundingClientRect(),runners=stage.querySelector('.replay-details').getBoundingClientRect(),header=stage.querySelector('.replay-race-details').getBoundingClientRect();
      return {videoAbove:video.bottom<=rail.top+1,runnersAbove:runners.bottom<=rail.top,headerAbove:header.bottom<=rail.top,paused:stage.querySelector('video').paused,time:stage.querySelector('video').currentTime};
    });
    assert.deepEqual(footerLayout,{videoAbove:true,runnersAbove:true,headerAbove:true,paused:true,time:pausedTime});
    await audience.screenshot({path:path.join(__dirname,'../test-results/race-replay-sponsor-footer.png')});
    await desk.evaluate(()=>window.replay.patchSettings({sponsorRail:false}));
    await expect(audience.locator('.stage-rail')).toBeHidden();
    assert.equal(await audience.locator('.stage').evaluate(stage=>stage.querySelector('video').getBoundingClientRect().height===stage.getBoundingClientRect().height),true);
    await desk.evaluate(async id=>{await window.replay.patchItem(id,{enabled:false});await window.replay.patchSettings({sponsorRail:true});},sponsor.id);
    await expect(audience.locator('.stage-rail')).toBeHidden();
    await desk.evaluate(()=>window.replay.patchSettings({sponsorRail:false}));
    // The saved card shortcut selects the right editor, and edits refresh the
    // broadcast while retaining the current video time and pause state.
    const before=await audience.locator('video').evaluate(v=>v.currentTime);
    await row.locator('[data-edit-race]').click();
    await expect(desk.locator('#race-registration-form [name="number"]')).toHaveValue('1');
    const badgeStyles=badges=>badges.map(badge=>{
      const style=getComputedStyle(badge),size=parseFloat(style.width);
      return {width:style.width,height:style.height,font:style.fontFamily,weight:style.fontWeight,fontRatio:Number((parseFloat(style.fontSize)/size).toFixed(3)),cornerRatio:Number((parseFloat(style.borderRadius)/size).toFixed(3)),background:style.background,color:style.color};
    });
    const formBadges=await desk.locator('#race-registration-form .trap-badge').evaluateAll(badgeStyles);
    const replayBadges=await audience.locator('.replay-details .trap-badge').evaluateAll(badgeStyles);
    assert.equal(formBadges.length,6);assert.equal(replayBadges.length,6);
    for(let index=0;index<6;index++){
      assert.equal(formBadges[index].width,formBadges[index].height,'Form traps are square');
      assert.equal(formBadges[index].width,formBadges[0].width,'All form traps have the same size');
      const {width:formWidth,height:formHeight,...formStyle}=formBadges[index];
      const {width:replayWidth,height:replayHeight,...replayStyle}=replayBadges[index];
      assert.deepEqual(replayStyle,formStyle,'Registration and broadcast share trap styling and proportions');
    }
    await desk.locator('#race-registration-form [name="title"]').fill('CGRC Trophy Final');
    await desk.locator('#race-registration-form [data-reg-save]').click();
    await expect(audience.locator('.racecard-details h2')).toHaveText('CGRC Trophy Final');
    await expect(audience.locator('.replay-race-details h3')).toHaveText('CGRC Trophy Final');
    await expect.poll(()=>audience.locator('.replay-race-details').evaluate(header=>getComputedStyle(header).opacity)).toBe('1');
    await expect.poll(()=>audience.locator('.replay-entry').last().evaluate(entry=>getComputedStyle(entry).opacity)).toBe('1');
    assert.equal(await audience.locator('video').evaluate(v=>v.currentTime),before);
    await desk.locator('[data-reg-tab="dogs"]').click();
    await expect(desk.locator('.reg-country .country-flag').first()).toBeVisible();
    await desk.locator('[data-reg-dog]').first().click();
    await desk.locator('.reg-dog-dialog [name="country"]').selectOption('RO');
    await expect(desk.locator('.reg-dog-dialog .country-picker').first().locator('img')).toHaveAttribute('alt','Romania');
    await desk.locator('[data-dog-cancel]').first().click();
    await desk.locator('[data-page="desk"]').click();
    await desk.locator('[data-jump="results"]').click();await expect(audience.locator('.results-mode')).toHaveCount(1);
    await desk.locator('[data-jump="racecard"]').click();await expect(audience.locator('.racecard-mode')).toHaveCount(1);
    await desk.locator('[data-jump="replay"]').click();await expect(audience.locator('.replay-mode')).toHaveCount(1);
    assert.equal(await audience.locator('video').evaluate(video=>video.currentTime),0);
    const timedEntries=await desk.evaluate(async()=>{
      const registration=structuredClone((await window.replay.init()).meeting.registration),race=registration.races.find(race=>race.id==='source-1'),entries=structuredClone(race.entries);
      for(const entry of race.entries){entry.time='';entry.estimatedTime='';}
      await window.replay.saveRegistration(registration);return entries;
    });
    await expect(desk.locator('[data-jump="results"]')).toBeDisabled();
    await desk.evaluate(async entries=>{const registration=structuredClone((await window.replay.init()).meeting.registration);registration.races.find(race=>race.id==='source-1').entries=entries;await window.replay.saveRegistration(registration);},timedEntries);
    await expect(desk.locator('[data-jump="results"]')).toBeEnabled();
    // A real media ending reveals places sequentially, then the other runners.
    await desk.evaluate(async()=>{
      const state=await window.replay.init(),registration=structuredClone(state.meeting.registration);
      const race=registration.races.find(race=>race.id==='source-1');
      const results={1:['NR','',''],2:['2','16.80','6.13'],3:['DNF','',''],4:['3','17.00',''],5:['1','16.76','6.01'],6:['DQ','15.99','5.99']};
      for(const entry of race.entries){const [finish,time,split]=results[entry.trap];Object.assign(entry,{status:['NR','DNF','DQ'].includes(finish)?finish:'FIN',time,estimatedTime:time,split});}
      await window.replay.saveRegistration(registration);
    });
    await desk.locator('[data-jump="racecard"]').click();await desk.locator('#play-pause').click();
    await expect.poll(()=>audience.locator('.broadcast-entry').last().evaluate(row=>getComputedStyle(row).opacity)).toBe('1');
    await desk.locator('#play-pause').click();
    for(const trap of [1,6]){
      const inactive=audience.locator(`.racecard-details .broadcast-entry[data-trap="${trap}"]`);
      await expect(inactive).toHaveClass(/broadcast-inactive/);
      assert.equal(await inactive.locator('.trap-badge').evaluate(badge=>getComputedStyle(badge).filter),'grayscale(1)','Inactive traps stay grey after the reveal animation');
      assert.equal(await inactive.locator('.broadcast-dog').evaluate(dog=>getComputedStyle(dog).opacity),'0.45');
    }
    await expect(audience.locator('.racecard-details')).not.toContainText('15.99');
    await audience.screenshot({path:path.join(__dirname,'../test-results/racecard-inactive.png')});
    await desk.locator('[data-jump="replay"]').click();
    for(const page of [audience,desk]){
      await expect(page.locator('.replay-details .trap-1')).toHaveCount(0);
      await expect(page.locator('.replay-details .trap-6')).toHaveCount(1);
    }
    await audience.locator('video').evaluate(video=>{video.currentTime=video.duration-.15;});
    await desk.locator('#play-pause').click();
    await expect(audience.locator('.results-mode')).toHaveCount(1);
    await expect(desk.locator('#media-kind')).toHaveText('RACE RESULTS');
    await expect(desk.locator('#seek')).toBeDisabled();
    assert.equal(await audience.locator('video').evaluate(video=>video.paused),true);
    const finishers=audience.locator('.results-finishers .result-entry');
    assert.deepEqual(await finishers.evaluateAll(rows=>rows.map(row=>Number(row.dataset.trap))),[5,2,4]);
    await expect.poll(()=>finishers.first().evaluate(row=>getComputedStyle(row).opacity),{intervals:[50]}).toBe('1');
    assert.equal(await finishers.last().evaluate(row=>getComputedStyle(row).opacity),'0');
    assert.equal(await audience.locator('.results-others-label').evaluate(row=>getComputedStyle(row).opacity),'0');
    await audience.screenshot({path:path.join(__dirname,'../test-results/race-results-winner.png')});
    await expect.poll(()=>finishers.last().evaluate(row=>getComputedStyle(row).opacity),{intervals:[50]}).toBe('1');
    await desk.locator('#play-pause').click();
    assert.equal(await audience.locator('.result-other').first().evaluate(row=>getComputedStyle(row).opacity),'0');
    await audience.waitForTimeout(300);
    const frozen=await audience.locator('.stage').evaluate(stage=>({clock:stage.style.getPropertyValue('--results-clock'),time:stage.querySelector('video').currentTime}));
    await audience.waitForTimeout(450);
    assert.deepEqual(await audience.locator('.stage').evaluate(stage=>({clock:stage.style.getPropertyValue('--results-clock'),time:stage.querySelector('video').currentTime})),frozen);
    await expect(desk.locator('#preview .results-card')).toBeVisible();
    const mirrorTime=await desk.locator('#preview video').evaluate(video=>({time:video.currentTime,duration:video.duration,paused:video.paused}));
    assert.equal(mirrorTime.paused,true);assert.ok(mirrorTime.time>mirrorTime.duration-.3,'Preview retains final frame, not the outro clock');
    await desk.locator('#play-pause').click();
    await expect.poll(()=>audience.locator('.result-other').last().evaluate(row=>getComputedStyle(row).opacity),{intervals:[50]}).toBe('1');
    await desk.locator('#play-pause').click();
    for(const text of ['Non-runner','Did not finish','Disqualified','6.01','6.13','16.76'])await expect(audience.locator('.results-card')).toContainText(text);
    for(const time of ['15.99','5.99'])await expect(audience.locator('.results-card')).not.toContainText(time);
    await expect(audience.locator('.replay-details')).toBeHidden();
    await expect(audience.locator('.racecard-details')).toBeHidden();
    await audience.screenshot({path:path.join(__dirname,'../test-results/race-results-complete.png')});
    await desk.screenshot({path:path.join(__dirname,'../test-results/race-results-desk.png'),fullPage:true});
    await desk.evaluate(async id=>{await window.replay.patchItem(id,{enabled:true});await window.replay.patchSettings({sponsorRail:true});},sponsor.id);
    await expect(audience.locator('.stage-rail')).toBeVisible();
    assert.equal(await audience.locator('.stage').evaluate(stage=>stage.querySelector('.results-footer').getBoundingClientRect().bottom<stage.querySelector('.stage-rail').getBoundingClientRect().top),true);
    await audience.screenshot({path:path.join(__dirname,'../test-results/race-results-sponsor-footer.png')});
    await desk.evaluate(async id=>{await window.replay.patchItem(id,{enabled:false});await window.replay.patchSettings({sponsorRail:false});},sponsor.id);
    await desk.locator('#play-pause').click();
    await expect(audience.locator('.results-mode')).toHaveCount(0,{timeout:8000});
    await expect(desk.locator('#now-title')).toHaveText('Welcome to Isaszeg Park');
    await row.locator('.icon-button[data-edit]').click();await desk.locator('#edit-race').selectOption('');await desk.locator('#edit-form button[type="submit"]').click();
    await expect(row).toContainText('No linked race');
    await row.locator('.race-link').click();await desk.locator('#edit-race').selectOption('source-2');await desk.locator('#edit-form button[type="submit"]').click();
    await expect(row).toContainText('Linked race 02');
    await row.locator('[data-play]').first().click();
    await expect(desk.locator('#playing-mode')).toContainText('RACE CARD');
    await expect.poll(()=>audience.locator('video').evaluate(v=>!v.hidden&&!v.paused&&v.currentTime>0),{timeout:10000}).toBe(true);
    await desk.reload();await expect(row).toContainText('Linked race 02');
    state=await desk.evaluate(()=>window.replay.init());assert.equal(state.meeting.items.find(i=>i.id===item.id).raceId,'source-2');
    // All programme cards must fit at audience size in both presentation modes.
    const overflows=await audience.evaluate(async()=>{
      const {StageView}=await import('./player.mjs');
      const meeting=(await window.replay.init()).meeting;
      const stage=document.createElement('div');stage.className='stage full-stage';
      stage.style.position='fixed';stage.style.inset='0';
      stage.innerHTML='<video></video><img><div class="stage-race-label"><span></span><strong></strong></div><div class="stage-rail"></div><div class="stage-blackout"></div>';
      document.body.append(stage);const view=new StageView(stage),issues=[];
      let badgeSize;
      const frames=new Map();
      const clip=meeting.items.find(item=>item.kind==='race');
      meeting.items.find(item=>item.kind==='ad').enabled=true;
      const {raceResults}=await import('../shared/race-results.mjs');
      for(const rail of [false,true])for(const race of meeting.registration.races)for(const phase of ['racecard','media','results']){
        if(phase==='results'&&!raceResults(race).hasTimes)continue;
        meeting.settings.sponsorRail=rail;
        view.show({...clip,raceId:race.id},meeting,{phase,position:phase==='results'?raceResults(race).completeAt:phase==='racecard'?4:0,paused:true});
        if(view.rail.hidden===rail)issues.push(`Race ${race.number} ${phase}: sponsor footer visibility does not match setting`);
        if(rail&&view.racePanel.getBoundingClientRect().bottom>view.rail.getBoundingClientRect().top+1)issues.push(`Race ${race.number} ${phase}: graphics overlap sponsor footer`);
        for(const entry of stage.querySelectorAll('.broadcast-entry')){
          const parent=entry.getBoundingClientRect(),child=entry.querySelector('.broadcast-dog').getBoundingClientRect();
          if(child.bottom>parent.bottom+1||child.right>parent.right+1)issues.push(`Race ${race.number} ${phase} rail=${rail}: runner overflows ${Math.ceil(child.bottom-parent.bottom)}px (row ${Math.round(parent.height)}px, copy ${Math.round(child.height)}px)`);
        }
        const prefix=phase==='results'?'.results-card ':'.racecard-details ';
        const header=stage.querySelector(`${prefix}.race-broadcast-header`).getBoundingClientRect();
        const heading=stage.querySelector(`${prefix}.race-broadcast-heading`).getBoundingClientRect();
        if(heading.bottom>header.bottom+1)issues.push(`Race ${race.number} ${phase}: header overflows`);
        if(phase!=='media'){
          const card=stage.querySelector(phase==='racecard'?'.racecard-details':'.results-card');
          const label=card.querySelector('.broadcast-card-eyebrow').getBoundingClientRect(),footer=card.querySelector('.broadcast-card-footer').getBoundingClientRect();
          const frame=[label.left,label.top,footer.left,footer.top,footer.bottom];
          const reference=frames.get(rail);
          if(!reference)frames.set(rail,frame);
          else if(frame.some((value,index)=>Math.abs(value-reference[index])>1))issues.push(`Race ${race.number} ${phase}: opening and closing card frame differs`);
          const board=card.querySelector(phase==='racecard'?'.race-broadcast-entries':'.results-board').getBoundingClientRect();
          if(board.bottom>footer.top+1)issues.push(`Race ${race.number} ${phase}: entries overlap the progress footer`);
        }
        const badgeRoot=phase==='racecard'?'.racecard-details':phase==='results'?'.results-card':'.replay-details';
        for(const badge of stage.querySelectorAll(`${badgeRoot} .trap-badge`)){
          const style=getComputedStyle(badge),width=parseFloat(style.width),height=parseFloat(style.height);
          badgeSize??=width;
          if(Math.abs(width-height)>.1||Math.abs(width-badgeSize)>.1)issues.push(`Race ${race.number} ${phase}: inconsistent trap badge size`);
        }
        if(phase==='results'){
          const board=stage.querySelector('.results-board').getBoundingClientRect();
          for(const row of stage.querySelectorAll('.result-entry')){
            const bounds=row.getBoundingClientRect(),copy=row.querySelector('.result-runner').getBoundingClientRect();
            if(bounds.bottom>board.bottom+1||copy.bottom>bounds.bottom+1||copy.top<bounds.top-1)issues.push(`Race ${race.number} results rail=${rail}: result row overflows (row ${Math.round(bounds.height)}, copy ${Math.round(copy.height)}, bottom ${Math.round(copy.bottom-bounds.bottom)})`);
            for(const value of row.querySelectorAll('.result-time strong,.result-split')){
              const valueBounds=value.getBoundingClientRect();
              if(Math.abs((valueBounds.top+valueBounds.bottom-bounds.top-bounds.bottom)/2)>1)issues.push(`Race ${race.number} results: time is not vertically centered`);
            }
          }
        }
      }
      view.destroy();if(!issues.length)stage.remove();return issues;
    });
    if(overflows.length)await audience.screenshot({path:path.join(__dirname,'../test-results/race-layout-debug.png')});
    assert.deepEqual(overflows,[]);
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
    assert.deepEqual(await audience.evaluate(()=>window.cspViolations),[]);
    console.log('Race broadcast smoke passed: reverse prelude, replay, sequential results with split times and delayed statuses, frozen final frame, pause, audience/preview sync, sponsor footer, live edits, relinking, persistence and every programme card layout.');
  } finally {
    await app.close();
    if(path.dirname(root)!==tempBase)throw new Error('Unexpected smoke-test cleanup path');
    await fs.rm(root,{recursive:true,force:true});
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
