const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const tempBase=path.resolve(__dirname,'../tmp');await fs.mkdir(tempBase,{recursive:true});
  const root=await fs.mkdtemp(path.join(tempBase,'media-editor-')),files=[];
  const fixture=await fs.readFile(path.resolve(__dirname,'../test/fixtures/sample.mp4'));
  for(let i=0;i<3;i++){const file=path.join(root,`camera-${i+1}.mp4`);await fs.writeFile(file,Buffer.concat([fixture,Buffer.from([i])]));files.push(file);}
  const app=await electron.launch({args:[path.join(__dirname,'smoke-entry.cjs'),'--no-sandbox'],env:{...process.env,ISASZEG_SMOKE_HOME:root}});
  const errors=[],violations=[];
  try {
    const desk=await app.firstWindow();desk.on('pageerror',error=>errors.push(error.message));
    desk.on('console',message=>{if(message.type()==='error' && message.text().includes('Content Security Policy'))violations.push(message.text());});
    await desk.waitForSelector('.queue-item');
    await expect(desk.locator('[data-jump="instant-replay"]')).toBeVisible();
    await expect(desk.locator('[data-jump="instant-replay"]')).toBeDisabled();
    await expect(desk.locator('#instant-replay-toggles')).toContainText('No replay moments marked');
    const emptyHeight=await desk.locator('#instant-replay-toggles').evaluate(row=>row.offsetHeight);
    const {referenceMeeting}=await import('../src/shared/reference-219.mjs');
    await desk.evaluate(registration=>window.replay.saveRegistration(registration),referenceMeeting);
    await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});},files);
    await desk.locator('#import-button').click();await desk.locator('#choose-files').click();await desk.locator('#confirm-import').click();
    await expect(desk.locator('#edit-dialog')).toBeVisible();await expect(desk.locator('#edit-progress')).toHaveText('1 of 3');
    await expect(desk.locator('#edit-race')).toHaveValue('source-1');
    await expect.poll(()=>desk.locator('#edit-video').evaluate(video=>video.duration)).toBeGreaterThan(1);
    const duration=await desk.locator('#edit-video').evaluate(video=>video.duration),timeline=await desk.locator('#moment-timeline').boundingBox();
    await desk.mouse.move(timeline.x+timeline.width*.15,timeline.y+40);await desk.mouse.down();await desk.mouse.move(timeline.x+timeline.width*.32,timeline.y+40,{steps:12});await desk.mouse.up();
    await expect(desk.locator('.moment-range')).toHaveCount(1);await desk.locator('#moment-name').fill('First bend');await desk.locator('#moment-rate').selectOption('0.25');
    await desk.locator('#edit-video-seek').fill('600');await desk.locator('#edit-video-seek').dispatchEvent('input');await desk.locator('#add-moment').click();
    await desk.locator('#moment-end').fill(String(Math.round(duration*.85*100)/100));await desk.locator('#moment-end').dispatchEvent('change');
    await desk.locator('#moment-name').fill('The finish');await desk.locator('#moment-rate').selectOption('0.5');
    await expect(desk.locator('.moment-range')).toHaveCount(2);
    assert.match(await desk.locator('#edit-video-seek').evaluate(input=>input.style.getPropertyValue('--replay-track')),/#d6b47b/);
    // Trim an edge with the keyboard; it remains focused for repeated adjustments.
    const handle=desk.locator('.moment-range.selected [data-edge="end"]');await handle.focus();await expect(handle).toBeFocused();const endBefore=Number(await desk.locator('#moment-end').inputValue());await desk.keyboard.press('ArrowLeft');assert.ok(Number(await desk.locator('#moment-end').inputValue())<endBefore);await expect(handle).toBeFocused();
    await desk.locator('#preview-moment').click();await expect.poll(()=>desk.locator('#edit-video').evaluate(video=>video.playbackRate)).toBe(.5);await desk.locator('#preview-moment').click();
    const runners=desk.locator('#media-runners [data-runner]');await expect(runners).toHaveCount(referenceMeeting.races[0].entries.length);
    await runners.first().locator('[name^="time-"]').fill('20.12');await runners.first().getByRole('combobox').click();await runners.first().locator('[data-status-value="FIN"]').click();
    if(await runners.count()>1){await runners.nth(1).getByRole('combobox').click();await runners.nth(1).locator('[data-status-value="DNF"]').click();}
    await fs.mkdir(path.resolve(__dirname,'../test-results'),{recursive:true});
    await desk.screenshot({path:path.resolve(__dirname,'../test-results/media-editor.png'),fullPage:true});
    await desk.locator('#edit-save').click();await expect(desk.locator('#edit-progress')).toHaveText('2 of 3');
    await expect(desk.locator('#edit-race')).toHaveValue('source-2');await desk.locator('#edit-skip').click();
    await expect(desk.locator('#edit-progress')).toHaveText('3 of 3');await desk.locator('#edit-save').click();await expect(desk.locator('#edit-dialog')).toBeHidden();
    const state=await desk.evaluate(()=>window.replay.init()),item=state.meeting.items.find(item=>item.raceNumber===1);
    assert.equal(item.replaySections.length,2);assert.equal(item.replaySections[0].label,'First bend');assert.equal(item.replaySections[0].rate,.25);
    assert.equal(state.meeting.registration.races[0].entries.find(entry=>entry.trap===1).time,'20.12');assert.equal(state.meeting.registration.races[0].entries.find(entry=>entry.trap===2).status,'DNF');
    const row=desk.locator(`#playlist [data-item="${item.id}"]`);await row.locator('[data-edit]').click();
    await expect(desk.locator('.moment-range')).toHaveCount(2);await expect(desk.locator('#media-runners [name^="time-"]').first()).toHaveValue('20.12');
    // Responsive editor has no horizontal overflow at narrow and desktop sizes.
    for(const width of [600,1100]){await desk.setViewportSize({width,height:900});await expect.poll(()=>desk.locator('#edit-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}
    await desk.locator('#edit-dialog .close-dialog').click();
    await row.locator('[data-play]').first().click();
    const audience=app.windows().find(window=>window.url().endsWith('display.html'));assert.ok(audience);audience.on('pageerror',error=>errors.push(error.message));
    await expect(desk.locator('[data-jump="instant-replay"]')).toBeEnabled();await expect(desk.locator('#instant-replay-toggles button')).toHaveCount(2);
    assert.equal(await desk.locator('#instant-replay-toggles').evaluate(row=>row.offsetHeight),emptyHeight);
    await desk.locator('[data-jump="replay"]').click();
    await expect.poll(()=>desk.locator('#seek').evaluate(input=>input.style.getPropertyValue('--replay-track'))).toContain('#d6b47b');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('display.html')).show());
    await audience.bringToFront();
    await audience.locator('video').evaluate(video=>{
      window.wipeFrames=[];
      const sample=(now,metadata)=>{
        const wipe=document.querySelector('.replay-wipe'),x=parseFloat(wipe.style.getPropertyValue('--replay-wipe-x'));
        if(!wipe.hidden)window.wipeFrames.push({direction:x<0?'out':'in',time:metadata.mediaTime,paused:video.paused});
        video.requestVideoFrameCallback(sample);
      };
      video.requestVideoFrameCallback(sample);video.currentTime=video.duration-.8;
    });
    await expect(audience.locator('.instant-replay-mode')).toHaveCount(1);await expect(desk.locator('#playing-mode')).toContainText('INSTANT REPLAY');
    await expect.poll(()=>audience.locator('video').evaluate(video=>!video.paused&&video.playbackRate===.25)).toBe(true);
    await expect(audience.locator('.replay-wipe')).toBeHidden();
    const frames=await audience.evaluate(()=>window.wipeFrames);
    await fs.writeFile(path.join(root,'transition-frames.json'),JSON.stringify(frames));
    for(const direction of ['out','in']){
      // Include the first decoded incoming frame while the panel still fully covers it.
      const moving=frames.filter(frame=>frame.direction===direction && (direction==='out' ? frame.time>duration-1 : frame.time>=item.replaySections[0].start-.1 && frame.time<item.replaySections[0].end));
      assert.ok(new Set(moving.map(frame=>frame.time)).size>=2,`${direction} wipe presents moving video frames: ${JSON.stringify(frames)}`);
      assert.ok(moving.every(frame=>!frame.paused),'Footage keeps playing during the wipe');
    }
    await expect(desk.locator('[data-instant-replay]').first()).toHaveAttribute('aria-pressed','true');
    const savedRate=()=>desk.evaluate(id=>window.replay.init().then(state=>state.meeting.items.find(item=>item.id===id).replaySections[0].rate),item.id);
    const timeBeforeRate=await audience.locator('video').evaluate(video=>video.currentTime);
    await expect(desk.locator('[data-rate="0.75"]')).toBeEnabled();await desk.locator('[data-rate="0.75"]').click();
    await expect.poll(()=>audience.locator('video').evaluate(video=>video.playbackRate)).toBe(.75);await expect.poll(savedRate).toBe(.75);
    assert.ok(await audience.locator('video').evaluate((video,before)=>!video.paused&&video.currentTime>=before,timeBeforeRate));
    await desk.locator('#play-pause').click();await desk.keyboard.press('4');await expect.poll(savedRate).toBe(1);
    assert.equal(await audience.locator('video').evaluate(video=>video.paused),true);
    await desk.keyboard.press('3');await expect.poll(savedRate).toBe(.75);
    await desk.locator('[data-instant-replay]').nth(1).click();await expect(desk.locator('[data-instant-replay]').nth(1)).toHaveAttribute('aria-pressed','true');
    assert.equal(await audience.locator('video').evaluate(video=>video.paused),true);
    await desk.locator('#play-pause').click();
    await expect.poll(()=>audience.locator('.replay-wipe').evaluate(wipe=>{const x=parseFloat(wipe.style.getPropertyValue('--replay-wipe-x'));return !wipe.hidden && x>-85 && x<-25;}),{intervals:[10]}).toBe(true);
    await desk.locator('#play-pause').click();
    const mask=audience.locator('.replay-wipe-panel'), transform=await mask.evaluate(panel=>getComputedStyle(panel).transform);
    assert.notEqual(transform,'none');assert.equal(await mask.evaluate(panel=>getComputedStyle(panel).opacity),'1');assert.match(await mask.evaluate(panel=>getComputedStyle(panel).backgroundImage),/linear-gradient/);
    await audience.screenshot({path:path.resolve(__dirname,'../test-results/replay-wipe.png')});
    assert.equal(await mask.evaluate(panel=>getComputedStyle(panel).transform),transform,'Pausing freezes the diagonal mask');
    await desk.locator('#play-pause').click();await expect.poll(()=>audience.locator('video').evaluate(video=>!video.paused&&video.playbackRate===.5)).toBe(true);
    await fs.writeFile(path.join(root,'saved-moments.json'),JSON.stringify(item.replaySections));
    await audience.screenshot({path:path.resolve(__dirname,'../test-results/instant-replay.png')});
    const last=item.replaySections[1];await audience.locator('video').evaluate((video,end)=>{video.currentTime=end;},last.end);
    await expect(audience.locator('.replay-wipe')).toBeVisible();
    await expect(audience.locator('.results-mode')).toHaveCount(1);await expect(desk.locator('#media-kind')).toHaveText('RACE RESULTS');
    await desk.locator('[data-jump="replay"]').click();await expect.poll(()=>audience.locator('video').evaluate(video=>video.playbackRate)).toBe(1);
    await row.locator('[data-edit]').click();await expect.poll(()=>desk.locator('#edit-video').evaluate(video=>video.duration)).toBeGreaterThan(1);
    await expect(desk.locator('#moment-rate')).toHaveValue('0.75');
    for(let i=0;i<2;i++)await desk.locator('#delete-moment').click();await desk.locator('#edit-save').click();
    await expect(desk.locator('[data-jump="instant-replay"]')).toBeDisabled();await expect(desk.locator('#instant-replay-toggles')).toContainText('No replay moments marked');
    assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
    console.log('Media editor smoke passed: sequential imports, timeline editing, gold replay tracks, moving frames during both wipe halves, saved per-moment speeds via buttons and keys, pause, results, normal-speed restoration and responsive layout.');
  } catch(error) {await app.windows()[0]?.screenshot({path:path.resolve(__dirname,'../test-results/media-editor-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally {await app.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
