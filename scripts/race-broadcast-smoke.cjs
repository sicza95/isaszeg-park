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
    await expect.poll(()=>app.windows().some(window=>window.url().endsWith('display.html')),{timeout:15000}).toBe(true);
    const audience=app.windows().find(window=>window.url().endsWith('display.html'));
    assert.ok(audience); audience.on('pageerror',error=>errors.push(error.message));
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
    await expect(audience.locator('.race-broadcast h2')).toHaveText('CGRC Trophy');
    await expect(audience.locator('.race-broadcast')).toContainText('275 m');
    await expect(audience.locator('.race-broadcast')).toContainText('S3');
    assert.equal(await audience.locator('video').evaluate(v=>v.paused),true);
    await expect(desk.locator('#seek')).toBeDisabled();
    await expect.poll(()=>audience.locator('.country-flag').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
    await expect(audience.locator('video')).toBeVisible();
    await expect.poll(()=>audience.locator('video').evaluate(v=>v.readyState>=2&&!v.seeking&&v.currentTime>.5)).toBe(true);
    const reverseStart=await audience.locator('video').evaluate(v=>v.currentTime);
    assert.equal(await audience.locator('video').evaluate(v=>v.muted),true);
    await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});
    await audience.screenshot({path:path.join(__dirname,'../test-results/racecard.png')});
    await desk.screenshot({path:path.join(__dirname,'../test-results/linked-race-desk.png'),fullPage:true});
    await desk.locator('#play-pause').click();
    await expect.poll(()=>audience.locator('video').evaluate(v=>v.currentTime)).toBeLessThan(reverseStart-.25);
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
    await desk.locator('#race-registration-form [name="title"]').fill('CGRC Trophy Final');
    await desk.locator('#race-registration-form [data-reg-save]').click();
    await expect(audience.locator('.race-broadcast h2')).toHaveText('CGRC Trophy Final');
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
      const clip=meeting.items.find(item=>item.kind==='race');
      meeting.items.find(item=>item.kind==='ad').enabled=true;
      for(const rail of [false,true])for(const race of meeting.registration.races)for(const phase of ['racecard','media']){
        meeting.settings.sponsorRail=rail;
        view.show({...clip,raceId:race.id},meeting,{phase,position:0});
        if(view.rail.hidden===rail)issues.push(`Race ${race.number} ${phase}: sponsor footer visibility does not match setting`);
        if(rail&&view.racePanel.getBoundingClientRect().bottom>view.rail.getBoundingClientRect().top+1)issues.push(`Race ${race.number} ${phase}: graphics overlap sponsor footer`);
        for(const entry of stage.querySelectorAll('.broadcast-entry')){
          const parent=entry.getBoundingClientRect(),child=entry.querySelector('.broadcast-dog').getBoundingClientRect();
          if(child.bottom>parent.bottom+1||child.right>parent.right+1)issues.push(`Race ${race.number} ${phase} rail=${rail}: runner overflows ${Math.ceil(child.bottom-parent.bottom)}px (row ${Math.round(parent.height)}px, copy ${Math.round(child.height)}px)`);
        }
        const header=stage.querySelector('.race-broadcast-header').getBoundingClientRect();
        const heading=stage.querySelector('.race-broadcast-heading').getBoundingClientRect();
        if(heading.bottom>header.bottom+1)issues.push(`Race ${race.number} ${phase}: header overflows`);
      }
      view.video.pause();if(!issues.length)stage.remove();return issues;
    });
    if(overflows.length)await audience.screenshot({path:path.join(__dirname,'../test-results/race-layout-debug.png')});
    assert.deepEqual(overflows,[]);
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
    console.log('Race broadcast smoke passed: reverse footage, one-second slide / unblur, Enter shortcut, full-stage video, transparent runner overlays, offline flags, pause, audience/preview sync, live edits, relinking and persistence.');
  } finally {
    await app.close();
    if(path.dirname(root)!==tempBase)throw new Error('Unexpected smoke-test cleanup path');
    await fs.rm(root,{recursive:true,force:true});
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
